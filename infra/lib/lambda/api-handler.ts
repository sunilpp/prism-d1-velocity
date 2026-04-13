import {
  EventBridgeClient,
  PutEventsCommand,
} from '@aws-sdk/client-eventbridge';
import {
  TimestreamQueryClient,
  QueryCommand,
} from '@aws-sdk/client-timestream-query';
import {
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';

// ---- Types ----

interface ApiGatewayEvent {
  httpMethod: string;
  path: string;
  pathParameters?: Record<string, string> | null;
  queryStringParameters?: Record<string, string> | null;
  body?: string | null;
  headers?: Record<string, string>;
}

interface ApiGatewayResponse {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

interface MetricPayload {
  'detail-type': string;
  detail: {
    team_id: string;
    repo: string;
    timestamp: string;
    prism_level?: string;
    metric?: { name: string; value: number; unit: string };
    ai_context?: {
      tool: string;
      model: string;
      origin: string;
    };
    dora?: Record<string, number | null>;
    ai_dora?: Record<string, number | null>;
  };
}

// ---- Clients ----

const eventBridgeClient = new EventBridgeClient({});
const timestreamQueryClient = new TimestreamQueryClient({});
const dynamoClient = new DynamoDBClient({});

const EVENT_BUS_NAME = process.env.EVENT_BUS_NAME!;
const TIMESTREAM_DB = process.env.TIMESTREAM_DATABASE!;
const TIMESTREAM_TABLE = process.env.TIMESTREAM_TABLE!;
const METADATA_TABLE = process.env.METADATA_TABLE!;

const CORS_HEADERS: Record<string, string> = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,X-Api-Key,Authorization',
};

// ---- Handler ----

export async function handler(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  console.log('API request:', JSON.stringify(event, null, 2));

  try {
    // OPTIONS preflight
    if (event.httpMethod === 'OPTIONS') {
      return respond(200, { message: 'OK' });
    }

    // Route requests
    if (event.httpMethod === 'POST' && event.path === '/metrics') {
      return await handlePostMetrics(event);
    }

    if (event.httpMethod === 'POST' && event.path === '/assessment') {
      return await handlePostAssessment(event);
    }

    if (event.httpMethod === 'GET' && event.path.startsWith('/metrics/')) {
      return await handleGetMetrics(event);
    }

    return respond(404, { error: 'Not Found', message: `No route for ${event.httpMethod} ${event.path}` });
  } catch (err) {
    console.error('Unhandled error:', err);
    return respond(500, { error: 'Internal Server Error', message: (err as Error).message });
  }
}

// ---- POST /metrics ----

async function handlePostMetrics(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  if (!event.body) {
    return respond(400, { error: 'Bad Request', message: 'Request body is required' });
  }

  let payload: MetricPayload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, { error: 'Bad Request', message: 'Invalid JSON body' });
  }

  const validationError = validateMetricPayload(payload);
  if (validationError) {
    return respond(400, { error: 'Bad Request', message: validationError });
  }

  await eventBridgeClient.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: 'prism.d1.velocity',
          DetailType: payload['detail-type'],
          Detail: JSON.stringify(payload.detail),
          EventBusName: EVENT_BUS_NAME,
        },
      ],
    }),
  );

  return respond(202, {
    message: 'Event accepted',
    detail_type: payload['detail-type'],
    team_id: payload.detail.team_id,
    repo: payload.detail.repo,
  });
}

// ---- POST /assessment ----

async function handlePostAssessment(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  if (!event.body) {
    return respond(400, { error: 'Bad Request', message: 'Request body is required' });
  }

  let payload: MetricPayload;
  try {
    payload = JSON.parse(event.body);
  } catch {
    return respond(400, { error: 'Bad Request', message: 'Invalid JSON body' });
  }

  if (!payload.detail?.team_id || !payload.detail?.repo) {
    return respond(400, { error: 'Bad Request', message: 'team_id and repo are required' });
  }

  // Store assessment directly in DynamoDB for fast lookups
  const item: Record<string, { S?: string; N?: string }> = {
    team_id: { S: payload.detail.team_id },
    repo: { S: payload.detail.repo },
    last_updated: { S: payload.detail.timestamp ?? new Date().toISOString() },
    prism_level: { N: payload.detail.prism_level ?? '1' },
    last_event_type: { S: 'prism.d1.assessment' },
  };

  if (payload.detail.metric) {
    item.assessment_metric = { S: payload.detail.metric.name };
    item.assessment_value = { N: payload.detail.metric.value.toString() };
  }

  await dynamoClient.send(
    new PutItemCommand({
      TableName: METADATA_TABLE,
      Item: item,
    }),
  );

  // Also publish to EventBridge for pipeline processing
  await eventBridgeClient.send(
    new PutEventsCommand({
      Entries: [
        {
          Source: 'prism.d1.velocity',
          DetailType: 'prism.d1.assessment',
          Detail: JSON.stringify(payload.detail),
          EventBusName: EVENT_BUS_NAME,
        },
      ],
    }),
  );

  return respond(202, {
    message: 'Assessment accepted',
    team_id: payload.detail.team_id,
    repo: payload.detail.repo,
    prism_level: payload.detail.prism_level,
  });
}

// ---- GET /metrics/{team_id} ----

async function handleGetMetrics(event: ApiGatewayEvent): Promise<ApiGatewayResponse> {
  const teamId = event.pathParameters?.team_id ?? extractTeamIdFromPath(event.path);

  if (!teamId) {
    return respond(400, { error: 'Bad Request', message: 'team_id path parameter is required' });
  }

  const repo = event.queryStringParameters?.repo;
  const hours = parseInt(event.queryStringParameters?.hours ?? '168', 10); // default 7 days
  const detailType = event.queryStringParameters?.detail_type;

  let whereClause = `WHERE team_id = '${escapeTimestreamValue(teamId)}'`;
  if (repo) {
    whereClause += ` AND repo = '${escapeTimestreamValue(repo)}'`;
  }
  if (detailType) {
    whereClause += ` AND detail_type = '${escapeTimestreamValue(detailType)}'`;
  }
  whereClause += ` AND time >= ago(${hours}h)`;

  const query = `
    SELECT *
    FROM "${TIMESTREAM_DB}"."${TIMESTREAM_TABLE}"
    ${whereClause}
    ORDER BY time DESC
    LIMIT 1000
  `;

  try {
    const result = await timestreamQueryClient.send(
      new QueryCommand({ QueryString: query }),
    );

    const columns = result.ColumnInfo?.map((c) => c.Name ?? '') ?? [];
    const rows = (result.Rows ?? []).map((row) => {
      const record: Record<string, string | null> = {};
      row.Data?.forEach((datum, idx) => {
        record[columns[idx]] = datum.ScalarValue ?? null;
      });
      return record;
    });

    return respond(200, {
      team_id: teamId,
      query_hours: hours,
      count: rows.length,
      records: rows,
    });
  } catch (err) {
    console.error('Timestream query error:', err);
    return respond(500, { error: 'Query Failed', message: (err as Error).message });
  }
}

// ---- Helpers ----

function extractTeamIdFromPath(path: string): string | undefined {
  const match = path.match(/^\/metrics\/([^/]+)$/);
  return match?.[1] ? decodeURIComponent(match[1]) : undefined;
}

function escapeTimestreamValue(value: string): string {
  return value.replace(/'/g, "''");
}

function validateMetricPayload(payload: MetricPayload): string | null {
  const validDetailTypes = [
    'prism.d1.commit',
    'prism.d1.pr',
    'prism.d1.deploy',
    'prism.d1.eval',
    'prism.d1.incident',
    'prism.d1.assessment',
  ];

  if (!payload['detail-type']) {
    return 'detail-type is required';
  }
  if (!validDetailTypes.includes(payload['detail-type'])) {
    return `Invalid detail-type. Must be one of: ${validDetailTypes.join(', ')}`;
  }
  if (!payload.detail) {
    return 'detail object is required';
  }
  if (!payload.detail.team_id) {
    return 'detail.team_id is required';
  }
  if (!payload.detail.repo) {
    return 'detail.repo is required';
  }
  if (!payload.detail.timestamp) {
    return 'detail.timestamp is required';
  }
  return null;
}

function respond(statusCode: number, body: Record<string, unknown>): ApiGatewayResponse {
  return {
    statusCode,
    headers: CORS_HEADERS,
    body: JSON.stringify(body),
  };
}
