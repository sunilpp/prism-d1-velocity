import {
  TimestreamWriteClient,
  WriteRecordsCommand,
  RejectedRecordsException,
  MeasureValueType,
} from '@aws-sdk/client-timestream-write';
import {
  DynamoDBClient,
  PutItemCommand,
} from '@aws-sdk/client-dynamodb';
import {
  CloudWatchClient,
  PutMetricDataCommand,
  MetricDatum,
  StandardUnit,
} from '@aws-sdk/client-cloudwatch';

// ---- Types ----

interface AiContext {
  tool: string;
  model: string;
  origin: string;
}

interface DoraMetrics {
  deployment_frequency: number | null;
  lead_time_seconds: number | null;
  change_failure_rate: number | null;
  mttr_seconds: number | null;
}

interface AiDoraMetrics {
  ai_acceptance_rate: number | null;
  ai_to_merge_ratio: number | null;
  spec_to_code_hours: number | null;
  post_merge_defect_rate: number | null;
  eval_gate_pass_rate: number | null;
  ai_test_coverage_delta: number | null;
}

interface MetricDetail {
  team_id: string;
  repo: string;
  timestamp: string;
  prism_level: string;
  metric: { name: string; value: number; unit: string };
  ai_context?: AiContext;
  dora?: DoraMetrics;
  ai_dora?: AiDoraMetrics;
}

interface EventBridgeEvent {
  source: string;
  'detail-type': string;
  detail: MetricDetail;
}

// ---- Clients (reused across invocations) ----

const timestreamClient = new TimestreamWriteClient({});
const dynamoClient = new DynamoDBClient({});
const cloudwatchClient = new CloudWatchClient({});

const TIMESTREAM_DB = process.env.TIMESTREAM_DATABASE!;
const TIMESTREAM_TABLE = process.env.TIMESTREAM_TABLE!;
const METADATA_TABLE = process.env.METADATA_TABLE!;
const METRIC_NAMESPACE = process.env.METRIC_NAMESPACE ?? 'PRISM/D1/Velocity';

// ---- Handler ----

export async function handler(event: EventBridgeEvent): Promise<void> {
  console.log('Received event:', JSON.stringify(event, null, 2));

  const detailType = event['detail-type'];
  const detail = event.detail;

  if (!detail.team_id || !detail.repo || !detail.timestamp) {
    console.error('Missing required fields: team_id, repo, or timestamp');
    throw new Error('Event missing required fields');
  }

  const eventTimeMs = new Date(detail.timestamp).getTime().toString();

  await Promise.all([
    writeToTimestream(detailType, detail, eventTimeMs),
    writeMetadataToDynamo(detailType, detail),
    publishCloudWatchMetrics(detailType, detail),
  ]);

  console.log(`Successfully processed ${detailType} for ${detail.team_id}/${detail.repo}`);
}

// ---- Timestream ----

async function writeToTimestream(
  detailType: string,
  detail: MetricDetail,
  timeMs: string,
): Promise<void> {
  const dimensions = [
    { Name: 'team_id', Value: detail.team_id },
    { Name: 'repo', Value: detail.repo },
    { Name: 'detail_type', Value: detailType },
    { Name: 'prism_level', Value: detail.prism_level ?? '1' },
  ];

  if (detail.ai_context?.tool) {
    dimensions.push({ Name: 'ai_tool', Value: detail.ai_context.tool });
  }
  if (detail.ai_context?.origin) {
    dimensions.push({ Name: 'ai_origin', Value: detail.ai_context.origin });
  }

  // Build multi-measure values from all available numeric fields
  const measureValues: Array<{ Name: string; Value: string; Type: MeasureValueType }> = [];

  // Primary metric
  if (detail.metric?.value != null) {
    measureValues.push({
      Name: detail.metric.name ?? 'value',
      Value: detail.metric.value.toString(),
      Type: MeasureValueType.DOUBLE,
    });
  }

  // DORA metrics
  if (detail.dora) {
    for (const [key, val] of Object.entries(detail.dora)) {
      if (val != null) {
        measureValues.push({
          Name: `dora_${key}`,
          Value: val.toString(),
          Type: MeasureValueType.DOUBLE,
        });
      }
    }
  }

  // AI-DORA metrics
  if (detail.ai_dora) {
    for (const [key, val] of Object.entries(detail.ai_dora)) {
      if (val != null) {
        measureValues.push({
          Name: `ai_dora_${key}`,
          Value: val.toString(),
          Type: MeasureValueType.DOUBLE,
        });
      }
    }
  }

  if (measureValues.length === 0) {
    console.warn('No numeric measures to write to Timestream, skipping.');
    return;
  }

  try {
    await timestreamClient.send(
      new WriteRecordsCommand({
        DatabaseName: TIMESTREAM_DB,
        TableName: TIMESTREAM_TABLE,
        Records: [
          {
            Dimensions: dimensions,
            MeasureName: detailType,
            MeasureValueType: MeasureValueType.MULTI,
            MeasureValues: measureValues,
            Time: timeMs,
            TimeUnit: 'MILLISECONDS',
          },
        ],
      }),
    );
  } catch (err) {
    if (err instanceof RejectedRecordsException) {
      console.error('Timestream rejected records:', JSON.stringify(err.RejectedRecords));
    }
    throw err;
  }
}

// ---- DynamoDB metadata ----

async function writeMetadataToDynamo(
  detailType: string,
  detail: MetricDetail,
): Promise<void> {
  const item: Record<string, { S?: string; N?: string }> = {
    team_id: { S: detail.team_id },
    repo: { S: detail.repo },
    last_event_type: { S: detailType },
    last_updated: { S: detail.timestamp },
    prism_level: { N: detail.prism_level ?? '1' },
  };

  if (detail.ai_context?.tool) {
    item.ai_tool = { S: detail.ai_context.tool };
  }
  if (detail.ai_context?.origin) {
    item.ai_origin = { S: detail.ai_context.origin };
  }

  // For assessment events, store the full PRISM level and primary metric
  if (detailType === 'prism.d1.assessment' && detail.metric) {
    item.assessment_metric = { S: detail.metric.name };
    item.assessment_value = { N: detail.metric.value.toString() };
  }

  // Store latest DORA snapshot
  if (detail.dora) {
    for (const [key, val] of Object.entries(detail.dora)) {
      if (val != null) {
        item[`dora_${key}`] = { N: val.toString() };
      }
    }
  }

  // Store latest AI-DORA snapshot
  if (detail.ai_dora) {
    for (const [key, val] of Object.entries(detail.ai_dora)) {
      if (val != null) {
        item[`ai_dora_${key}`] = { N: val.toString() };
      }
    }
  }

  await dynamoClient.send(
    new PutItemCommand({
      TableName: METADATA_TABLE,
      Item: item,
    }),
  );
}

// ---- CloudWatch custom metrics ----

async function publishCloudWatchMetrics(
  detailType: string,
  detail: MetricDetail,
): Promise<void> {
  const sharedDimensions = [
    { Name: 'TeamId', Value: detail.team_id },
    { Name: 'Repository', Value: detail.repo },
  ];

  const metricData: MetricDatum[] = [];

  // Primary metric
  if (detail.metric?.value != null) {
    metricData.push({
      MetricName: detail.metric.name,
      Value: detail.metric.value,
      Unit: mapUnit(detail.metric.unit),
      Dimensions: sharedDimensions,
      Timestamp: new Date(detail.timestamp),
    });
  }

  // DORA metrics
  if (detail.dora) {
    if (detail.dora.deployment_frequency != null) {
      metricData.push({
        MetricName: 'DeploymentFrequency',
        Value: detail.dora.deployment_frequency,
        Unit: StandardUnit.Count,
        Dimensions: sharedDimensions,
        Timestamp: new Date(detail.timestamp),
      });
    }
    if (detail.dora.lead_time_seconds != null) {
      metricData.push({
        MetricName: 'LeadTimeForChanges',
        Value: detail.dora.lead_time_seconds,
        Unit: StandardUnit.Seconds,
        Dimensions: sharedDimensions,
        Timestamp: new Date(detail.timestamp),
      });
    }
    if (detail.dora.change_failure_rate != null) {
      metricData.push({
        MetricName: 'ChangeFailureRate',
        Value: detail.dora.change_failure_rate,
        Unit: StandardUnit.Percent,
        Dimensions: sharedDimensions,
        Timestamp: new Date(detail.timestamp),
      });
    }
    if (detail.dora.mttr_seconds != null) {
      metricData.push({
        MetricName: 'MTTR',
        Value: detail.dora.mttr_seconds,
        Unit: StandardUnit.Seconds,
        Dimensions: sharedDimensions,
        Timestamp: new Date(detail.timestamp),
      });
    }
  }

  // AI-DORA metrics
  if (detail.ai_dora) {
    const aiDoraMap: Array<[string, number | null, StandardUnit]> = [
      ['AIAcceptanceRate', detail.ai_dora.ai_acceptance_rate, StandardUnit.Percent],
      ['AIToMergeRatio', detail.ai_dora.ai_to_merge_ratio, StandardUnit.Percent],
      ['SpecToCodeHours', detail.ai_dora.spec_to_code_hours, StandardUnit.Count],
      ['PostMergeDefectRate', detail.ai_dora.post_merge_defect_rate, StandardUnit.Percent],
      ['EvalGatePassRate', detail.ai_dora.eval_gate_pass_rate, StandardUnit.Percent],
      ['AITestCoverageDelta', detail.ai_dora.ai_test_coverage_delta, StandardUnit.Percent],
    ];

    for (const [name, value, unit] of aiDoraMap) {
      if (value != null) {
        metricData.push({
          MetricName: name,
          Value: value,
          Unit: unit,
          Dimensions: sharedDimensions,
          Timestamp: new Date(detail.timestamp),
        });
      }
    }
  }

  if (metricData.length === 0) {
    return;
  }

  // CloudWatch accepts max 1000 metric data points per call; batch in chunks of 25
  const batchSize = 25;
  for (let i = 0; i < metricData.length; i += batchSize) {
    await cloudwatchClient.send(
      new PutMetricDataCommand({
        Namespace: METRIC_NAMESPACE,
        MetricData: metricData.slice(i, i + batchSize),
      }),
    );
  }
}

function mapUnit(unit: string): StandardUnit {
  const unitMap: Record<string, StandardUnit> = {
    count: StandardUnit.Count,
    percent: StandardUnit.Percent,
    seconds: StandardUnit.Seconds,
    milliseconds: StandardUnit.Milliseconds,
    bytes: StandardUnit.Bytes,
    none: StandardUnit.None,
  };
  return unitMap[unit?.toLowerCase()] ?? StandardUnit.None;
}
