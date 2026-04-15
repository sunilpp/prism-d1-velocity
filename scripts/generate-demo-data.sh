#!/usr/bin/env bash
# Fast sample data generator — batches events for speed.
# Usage: ./scripts/generate-demo-data.sh

set -euo pipefail

REGION="${AWS_REGION:-us-west-2}"
BUS="prism-d1-metrics"
TEAM="demo-team"
REPO="prism-d1-sample-app"
NS="PRISM/D1/Velocity"

echo "=== Fast Demo Data Generator ==="
echo "Region: $REGION | Bus: $BUS | Team: $TEAM"
echo ""

# Build batch entries (EventBridge accepts up to 10 per call)
BATCH="[]"
COUNT=0
TOTAL=0

flush() {
  if [ "$COUNT" -gt 0 ]; then
    aws events put-events --region "$REGION" --entries "$BATCH" > /dev/null 2>&1
    TOTAL=$((TOTAL + COUNT))
    BATCH="[]"
    COUNT=0
  fi
}

add_event() {
  local DT="$1"
  local DETAIL="$2"
  BATCH=$(echo "$BATCH" | jq --arg src "prism.d1.velocity" --arg dt "$DT" --arg bus "$BUS" --arg detail "$DETAIL" \
    '. + [{"Source":$src,"DetailType":$dt,"EventBusName":$bus,"Detail":$detail}]')
  COUNT=$((COUNT + 1))
  if [ "$COUNT" -ge 10 ]; then
    flush
    printf "."
  fi
}

ORIGINS=("human" "ai-assisted" "ai-generated" "ai-assisted" "ai-assisted")
TOOLS=("n/a" "claude-code" "claude-code" "kiro" "claude-code")

for DAY in $(seq 7 -1 0); do
  if [[ "$OSTYPE" == "darwin"* ]]; then
    DATE=$(date -v-"${DAY}d" +%Y-%m-%d)
  else
    DATE=$(date -d "$DAY days ago" +%Y-%m-%d)
  fi

  # 8-15 commits per day
  COMMITS=$((RANDOM % 8 + 8))

  for i in $(seq 1 $COMMITS); do
    IDX=$((RANDOM % 5))
    ORIGIN="${ORIGINS[$IDX]}"
    TOOL="${TOOLS[$IDX]}"
    H=$((RANDOM % 10 + 8))
    M=$((RANDOM % 60))
    TS="${DATE}T$(printf '%02d' $H):$(printf '%02d' $M):00Z"
    LINES=$((RANDOM % 120 + 10))

    DETAIL=$(jq -nc \
      --arg t "$TEAM" --arg r "$REPO" --arg ts "$TS" \
      --arg o "$ORIGIN" --arg tl "$TOOL" --argjson l "$LINES" \
      '{team_id:$t,repo:$r,timestamp:$ts,prism_level:2,
        metric:{name:"commit",value:1,unit:"count"},
        ai_context:{tool:$tl,model:"us.anthropic.claude-haiku-4-5-20251001-v1:0",origin:$o},
        ai_dora:{ai_to_merge_ratio:(if $o!="human" then 1 else 0 end)}}')
    add_event "prism.d1.commit" "$DETAIL"
  done

  # 2-4 PRs per day
  PRS=$((RANDOM % 3 + 2))
  for i in $(seq 1 $PRS); do
    TC=$((RANDOM % 5 + 2))
    AC=$((RANDOM % (TC + 1)))
    RATIO=$(echo "scale=4; $AC / $TC" | bc -l | sed 's/^\./0./')
    LT=$((3600 * (DAY + 1) + RANDOM % 3600))
    LTH=$(echo "scale=2; $LT / 3600" | bc -l | sed 's/^\./0./')
    TS="${DATE}T$(printf '%02d' $((RANDOM % 10 + 8))):30:00Z"
    PR=$((100 + DAY * 10 + i))

    DETAIL=$(jq -nc \
      --arg t "$TEAM" --arg r "$REPO" --arg ts "$TS" \
      --argjson ratio "$RATIO" --argjson tc "$TC" --argjson ac "$AC" \
      --argjson lt "$LT" --argjson lth "$LTH" --argjson pr "$PR" \
      '{team_id:$t,repo:$r,timestamp:$ts,prism_level:2,
        metric:{name:"ai_to_merge_ratio",value:$ratio,unit:"ratio"},
        ai_context:{tool:"github-actions",model:"n/a",origin:(if $ac>0 then "ai-assisted" else "human" end)},
        dora:{deployment_frequency:1,lead_time_seconds:$lt},
        ai_dora:{ai_to_merge_ratio:$ratio,total_commits:$tc,ai_commits:$ac},
        pr:{number:$pr,author:"engineer"}}')
    add_event "prism.d1.pr" "$DETAIL"

    # Deploy event
    DDTL=$(jq -nc \
      --arg t "$TEAM" --arg r "$REPO" --arg ts "$TS" --argjson lth "$LTH" \
      '{team_id:$t,repo:$r,timestamp:$ts,prism_level:2,
        metric:{name:"deployment",value:1,unit:"count"},
        dora:{deployment_frequency:1}}')
    add_event "prism.d1.deploy" "$DDTL"
  done

  # Eval results
  for i in $(seq 1 $PRS); do
    SCORE="0.88"
    RES="PASS"
    if [ "$DAY" -eq 4 ] && [ $((RANDOM % 2)) -eq 0 ]; then SCORE="0.62"; RES="FAIL"; fi
    if [ $((RANDOM % 8)) -eq 0 ]; then SCORE="0.71"; RES="FAIL"; fi
    TS="${DATE}T$(printf '%02d' $((RANDOM % 10 + 8))):45:00Z"

    DETAIL=$(jq -nc \
      --arg t "$TEAM" --arg r "$REPO" --arg ts "$TS" \
      --argjson s "$SCORE" --arg res "$RES" --argjson pr "$((100 + DAY * 10 + i))" \
      '{team_id:$t,repo:$r,timestamp:$ts,prism_level:2,
        metric:{name:"eval_score",value:$s,unit:"score"},
        ai_context:{tool:"bedrock-eval",model:"us.anthropic.claude-haiku-4-5-20251001-v1:0",origin:"ai-generated"},
        ai_dora:{eval_gate_pass_rate:(if $res=="PASS" then 1 else 0 end)},
        eval:{result:$res,pr_number:$pr}}')
    add_event "prism.d1.eval" "$DETAIL"
  done
done

flush
echo ""
echo ""
echo "=== Done! $TOTAL events emitted ==="
echo "Open CloudWatch → Dashboards → PRISM-D1-Team-Velocity (us-west-2)"
echo "Set time range to 'Last 1 week'"
