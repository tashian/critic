#!/bin/bash
# Generate the synthetic sessions and run Critic on each (calls the Claude API).
# The API key comes from the tsm entry named in ~/.claude/critic/config.json, or from ANTHROPIC_API_KEY.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source "$ROOT/demo/env.sh"
bun "$ROOT/demo/gen.ts"
mkdir -p "$CRITIC_DIR"
[ -f "$HOME/.claude/critic/config.json" ] && jq '{tsmSecret}' "$HOME/.claude/critic/config.json" > "$CRITIC_DIR/config.json"
bun "$ROOT/src/cli.ts" baseline > /dev/null   # warm the baseline cache before the parallel runs

run_all() {
  for s in peak flowing steady grinding take_a_break; do
    bun "$ROOT/src/cli.ts" analyze --session "demo-$s" --transcript "$(ls "$DEMO_DIR"/live/*/demo-"$s".jsonl)" &
  done
  wait
  bun "$ROOT/src/cli.ts" analyze --mode report --session demo-take_a_break \
    --transcript "$(ls "$DEMO_DIR"/live/*/demo-take_a_break.jsonl)" > /dev/null
}
export -f run_all; export ROOT
SECRET=$(jq -r '.tsmSecret // empty' "$CRITIC_DIR/config.json" 2>/dev/null || true)
if [ -z "${ANTHROPIC_API_KEY:-}" ] && [ -n "$SECRET" ]; then
  tsm run --env "ANTHROPIC_API_KEY=$SECRET" -- bash -c run_all
else
  run_all
fi
for s in peak flowing steady grinding take_a_break; do
  printf '%-13s ' "$s"; jq -r '"\(.mood)  \(.status)"' "$CRITIC_DIR/sessions/demo-$s/verdict.json"
done
