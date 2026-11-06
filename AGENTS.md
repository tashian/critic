# Critic

Critic is a session coach for Claude Code. It compares the live session with all of the user's past sessions. It tells the user when to take a break, celebrates peak stretches, and gives one prompting habit to work on.

## How it works

1. **Signals** (`src/transcript.ts`). Parse a Claude Code JSONL transcript into exchanges (one user prompt plus what the assistant did). The heuristics count corrections, praise, repeated prompts, interrupts, rejected tool calls, tool errors, edits, commits, and test runs. These give a `friction` and a `momentum` score per prompt.
2. **Baseline** (`src/baseline.ts`). Summarize every transcript under `~/.claude/projects/*/*.jsonl`. The summaries are cached by mtime and size in `~/.claude/critic/baseline-cache.json`. It also computes distributions: friction by active time, by time of day, and rolling windows.
3. **Agent** (`src/agent.ts`). A Claude API Tool Runner loop (`client.beta.messages.toolRunner`). It has tools to read the snapshot, recent exchanges, the baseline profile, peak and worst sessions, any past session's prompts, and earlier verdicts. It ends with a strict `submit_verdict` tool call. The system prompt uses the `/retro` prompting-habits rubric.
4. **Surfaces** (`src/cli.ts`):
   - `statusline` prints one line and starts a background analysis when one is due.
   - `hook-stop` (Stop hook) also triggers. It announces each `peak` or `take_a_break` verdict once, as a `systemMessage`.
   - `report` gives the full retro-style report on demand (the `/critic` skill in `skill/`).

## Cadence

A background analysis runs when all of these are true:

- The session has at least `minPrompts` prompts.
- No analysis is running.
- Either there is no verdict yet, or both of these are true: there are `minNewPrompts` new prompts, and `intervalSec` has passed since the last run.

A friction spike (heavy friction in the last 4 prompts) can trigger a run after 2 minutes. After an error, Critic waits 10 minutes before it tries again.

## State

`~/.claude/critic/`:

- `config.json`: runtime config, not committed. It holds `tsmSecret` (the tsm entry name for the Anthropic API key), `model`, `effort`, `reportEffort`, `intervalSec`, `minNewPrompts`, `minPrompts`, and `windowPrompts`.
- `sessions/<id>/`: `verdict.json`, `history.jsonl`, `run.json`, `quick.json`, `lock.json`, and `critic.log`.

Set `CRITIC_DIR` to use a different state directory, for example a scratch directory when testing.

## Conventions

- Use bun, not npm. Typecheck with `bunx tsc --noEmit -p .`.
- Do not put IDs, keys, or tsm entry names in committed files. They go in `~/.claude/critic/config.json`.
- The status-line path must stay fast (target <100 ms) and must never throw. All API work runs in a detached child process.
- Default model is `claude-opus-5-5` with server-side refusal fallbacks (`fallbacks: "default"`). Cadence checks run at `low` effort and reports at `medium`.

## Demo

`demo/` makes a video of Critic. It uses synthetic sessions only and does not touch `~/.claude`.

1. `DEMO_DIR=<dir> demo/run.sh` makes 28 past sessions and 5 live sessions (one for each mood) in `<dir>`. Then it runs Critic on each live session. This step calls the Claude API.
2. In `demo/video/`, with the same `DEMO_DIR` and `source ../env.sh`, run `bun scripts/data.ts`. This exports the real verdicts to `src/data.json`.
3. Narration and music come from OpenRouter (`gpt-audio` and Lyria). Set `OPENROUTER_API_KEY` (from tsm, with `tsm run --env`), then run `bun scripts/narration.ts` and `bun scripts/music.ts`. The narration text is in `src/narration.ts`. The script keeps a clip only when its transcript matches the text.
4. `bunx remotion render src/index.ts CriticDemo out/critic-demo.mp4 --concurrency=4 --timeout=120000` renders the 1920×1080 video. Use `bunx remotion studio src/index.ts` to preview it.

`demo/critic.tape` (VHS) records the plain terminal version.

The generated audio (`demo/video/public/`) and the rendered video are not committed. The README video is a GitHub attachment.

`CRITIC_PROJECTS_DIR` sets the history that Critic compares against. The demo sets it to the synthetic history.
