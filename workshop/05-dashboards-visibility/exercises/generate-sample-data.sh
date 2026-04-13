#!/usr/bin/env bash
# PRISM D1 Velocity -- Sample Metric Data Generator
# Generates 7 days of realistic team commit and PR data
# and sends it to EventBridge for dashboard population.
#
# Usage: ./generate-sample-data.sh [event-bus-name]

set -euo pipefail

EVENT_BUS="${1:-prism-metrics}"
REGION="${AWS_REGION:-us-east-1}"

echo "=== PRISM D1 Sample Data Generator ==="
echo "Event bus: $EVENT_BUS"
echo "Region: $REGION"
echo ""

# Team configuration
ENGINEERS=("alice@startup.com" "bob@startup.com" "carol@startup.com" "dave@startup.com" "eve@startup.com")
REPOS=("prism-d1-sample-app" "frontend-web")
BRANCHES=("main" "feat/auth" "feat/dashboard" "fix/perf" "refactor/db")
AI_ORIGINS=("human" "claude-code" "claude-code" "claude-code")  # 75% AI probability
AI_CONFIDENCES=("implementation" "implementation" "assisted")
SPECS=("specs/health-check.md" "specs/user-auth.md" "specs/analytics.md" "")

TOTAL_EVENTS=0

emit_event() {
  local DETAIL_TYPE="$1"
  local DETAIL="$2"

  aws events put-events \
    --region "$REGION" \
    --entries "[{
      \"Source\": \"prism.d1.velocity\",
      \"DetailType\": \"$DETAIL_TYPE\",
      \"EventBusName\": \"$EVENT_BUS\",
      \"Detail\": $(echo "$DETAIL" | jq -Rs .)
    }]" > /dev/null 2>&1

  ((TOTAL_EVENTS++))
}

# Generate 7 days of data
for DAY_OFFSET in $(seq 7 -1 1); do
  # Calculate the date
  if [[ "$OSTYPE" == "darwin"* ]]; then
    DAY_DATE=$(date -v-"${DAY_OFFSET}d" +%Y-%m-%d)
  else
    DAY_DATE=$(date -d "$DAY_OFFSET days ago" +%Y-%m-%d)
  fi

  DAY_NAME=$(date -j -f "%Y-%m-%d" "$DAY_DATE" "+%A" 2>/dev/null || date -d "$DAY_DATE" "+%A")

  # Skip weekends (lower activity)
  COMMITS_PER_DAY=$((RANDOM % 8 + 12))  # 12-19 commits per day
  if [ "$DAY_NAME" = "Saturday" ] || [ "$DAY_NAME" = "Sunday" ]; then
    COMMITS_PER_DAY=$((RANDOM % 3 + 1))
  fi

  echo "Generating $COMMITS_PER_DAY commits for $DAY_DATE ($DAY_NAME)..."

  # Day 4 is the "bad day" -- new engineer using Claude Code without specs
  IS_BAD_DAY=false
  if [ "$DAY_OFFSET" -eq 4 ]; then
    IS_BAD_DAY=true
    echo "  (This is the 'bad day' -- high AI usage, low acceptance)"
  fi

  for COMMIT_NUM in $(seq 1 "$COMMITS_PER_DAY"); do
    # Pick random engineer, repo, branch
    ENGINEER=${ENGINEERS[$((RANDOM % ${#ENGINEERS[@]}))]}
    REPO=${REPOS[$((RANDOM % ${#REPOS[@]}))]}
    BRANCH=${BRANCHES[$((RANDOM % ${#BRANCHES[@]}))]}

    # Determine AI origin
    AI_ORIGIN=${AI_ORIGINS[$((RANDOM % ${#AI_ORIGINS[@]}))]}
    AI_CONFIDENCE=""
    AI_MODEL=""

    if [ "$AI_ORIGIN" = "claude-code" ]; then
      AI_CONFIDENCE=${AI_CONFIDENCES[$((RANDOM % ${#AI_CONFIDENCES[@]}))]}
      AI_MODEL="anthropic.claude-sonnet-4-20250514"
    fi

    # On bad day, eve uses AI for everything without specs
    if [ "$IS_BAD_DAY" = true ] && [ "$ENGINEER" = "eve@startup.com" ]; then
      AI_ORIGIN="claude-code"
      AI_CONFIDENCE="implementation"
      AI_MODEL="anthropic.claude-sonnet-4-20250514"
    fi

    # Generate realistic change sizes
    LINES_ADDED=$((RANDOM % 120 + 5))
    LINES_REMOVED=$((RANDOM % 40))
    FILES_CHANGED=$((RANDOM % 6 + 1))

    # Random spec reference (more likely for AI commits)
    SPEC=""
    if [ "$AI_ORIGIN" = "claude-code" ] && [ $((RANDOM % 3)) -ne 0 ]; then
      SPEC=${SPECS[$((RANDOM % ${#SPECS[@]}))]}
    fi
    # On bad day, eve has no specs
    if [ "$IS_BAD_DAY" = true ] && [ "$ENGINEER" = "eve@startup.com" ]; then
      SPEC=""
    fi

    # Random hour during workday
    HOUR=$((RANDOM % 10 + 8))  # 8am - 6pm
    MINUTE=$((RANDOM % 60))
    COMMIT_TIME="${DAY_DATE}T$(printf '%02d' $HOUR):$(printf '%02d' $MINUTE):00Z"

    COMMIT_HASH=$(openssl rand -hex 20 2>/dev/null || head -c 40 /dev/urandom | xxd -p | tr -d '\n' | head -c 40)

    DETAIL=$(jq -n \
      --arg commit "$COMMIT_HASH" \
      --arg author "$ENGINEER" \
      --arg date "$COMMIT_TIME" \
      --arg subject "commit $COMMIT_NUM on $DAY_DATE" \
      --arg repo "$REPO" \
      --arg branch "$BRANCH" \
      --arg ai_origin "$AI_ORIGIN" \
      --arg ai_model "$AI_MODEL" \
      --arg ai_confidence "$AI_CONFIDENCE" \
      --arg spec_ref "$SPEC" \
      --argjson files_changed "$FILES_CHANGED" \
      --argjson lines_added "$LINES_ADDED" \
      --argjson lines_removed "$LINES_REMOVED" \
      '{commit: $commit, author: $author, date: $date, subject: $subject, repo: $repo, branch: $branch, ai_origin: $ai_origin, ai_model: $ai_model, ai_confidence: $ai_confidence, spec_ref: $spec_ref, files_changed: $files_changed, lines_added: $lines_added, lines_removed: $lines_removed}')

    emit_event "CommitMetric" "$DETAIL"
  done

  # Generate 2-4 PR merges per day
  PR_COUNT=$((RANDOM % 3 + 2))
  if [ "$DAY_NAME" = "Saturday" ] || [ "$DAY_NAME" = "Sunday" ]; then
    PR_COUNT=$((RANDOM % 2))
  fi

  for PR_NUM in $(seq 1 "$PR_COUNT"); do
    ENGINEER=${ENGINEERS[$((RANDOM % ${#ENGINEERS[@]}))]}
    REPO=${REPOS[$((RANDOM % ${#REPOS[@]}))]}
    TOTAL_COMMITS=$((RANDOM % 5 + 2))
    AI_COMMITS=$((RANDOM % (TOTAL_COMMITS + 1)))
    AI_RATIO=$(echo "scale=4; $AI_COMMITS / $TOTAL_COMMITS" | bc)

    # Lead time: trending down over the week (AI adoption improving)
    BASE_LEAD_TIME=$((3600 * (DAY_OFFSET + 1)))  # Higher early in the week
    LEAD_TIME=$((BASE_LEAD_TIME + RANDOM % 3600))

    PR_NUMBER=$((100 + DAY_OFFSET * 10 + PR_NUM))

    DETAIL=$(jq -n \
      --argjson pr_number "$PR_NUMBER" \
      --arg pr_title "PR $PR_NUMBER on $DAY_DATE" \
      --arg pr_author "${ENGINEER%%@*}" \
      --arg repo "$REPO" \
      --argjson lead_time_seconds "$LEAD_TIME" \
      --argjson total_commits "$TOTAL_COMMITS" \
      --argjson ai_commits "$AI_COMMITS" \
      --arg ai_ratio "$AI_RATIO" \
      '{pr_number: $pr_number, pr_title: $pr_title, pr_author: $pr_author, repo: $repo, lead_time_seconds: $lead_time_seconds, total_commits: $total_commits, ai_commits: $ai_commits, ai_contribution_ratio: ($ai_ratio | tonumber)}')

    emit_event "PRMetric" "$DETAIL"
  done

  # Generate eval gate results
  EVAL_COUNT=$((PR_COUNT))
  for EVAL_NUM in $(seq 1 "$EVAL_COUNT"); do
    REPO=${REPOS[$((RANDOM % ${#REPOS[@]}))]}
    PR_NUMBER=$((100 + DAY_OFFSET * 10 + EVAL_NUM))

    # Normal days: 85-90% pass rate. Bad day: 50% pass rate
    RESULT="success"
    if [ "$IS_BAD_DAY" = true ]; then
      if [ $((RANDOM % 2)) -eq 0 ]; then
        RESULT="failure"
      fi
    else
      if [ $((RANDOM % 8)) -eq 0 ]; then
        RESULT="failure"
      fi
    fi

    DETAIL=$(jq -n \
      --arg repo "$REPO" \
      --argjson pr_number "$PR_NUMBER" \
      --arg result "$RESULT" \
      --arg rubric "api_spec_compliance" \
      '{repo: $repo, pr_number: $pr_number, result: $result, rubric: $rubric}')

    emit_event "EvalGateResult" "$DETAIL"
  done
done

echo ""
echo "=== Generation Complete ==="
echo "Total events emitted: $TOTAL_EVENTS"
echo ""
echo "Open your CloudWatch dashboard to see the data."
echo "Set time range to 'Last 1 week' for the best view."
