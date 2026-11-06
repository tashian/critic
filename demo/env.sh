# Sourced by demo/critic.tape. Points Critic at the synthetic data from demo/gen.ts, never at ~/.claude.
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export DEMO_DIR="${DEMO_DIR:-${TMPDIR:-/tmp}/critic-demo}"
export CRITIC_DIR="$DEMO_DIR/state"
export CRITIC_PROJECTS_DIR="$DEMO_DIR/history"
export PS1=$'\[\e[38;5;209m\]❯\[\e[0m\] '
replay() { clear; bun "$ROOT/demo/replay.ts" "$@"; }
critic() { "$ROOT/bin/critic" "$@"; }
report() { critic show --transcript "$(ls "$DEMO_DIR"/live/*/demo-"$1".jsonl)" | sed 's/</\\</g' | glow -s dark -w 110 -; }
