# Critic

Critic is a session coach for Claude Code. It compares your live session with all of your past sessions. It tells you when to take a break, celebrates your peak stretches, and gives you one prompting habit to work on.

https://github.com/user-attachments/assets/3b81098a-2ecd-4b88-98a2-2ababf916fdf

## What you see

- **Status line.** One line under your prompt with the current verdict: 🔥 Peak, 🌊 Flowing, 🧭 Steady, 🪨 Grinding, or ☕ Take a break.
- **Stop hook.** When a verdict is Peak or Take a break, Critic tells you one time, with what to do next.
- **`/critic`.** A full retro of the session on demand: what went well, where it dragged, your prompting habits, and what your best sessions did differently.

## How it works

1. Critic reads the session transcript. It counts corrections, interrupts, repeated prompts, rejected tool calls, and tool errors. It also counts commits, test runs, and praise.
2. It compares these signals with every transcript in `~/.claude/projects/`. You get percentile ranks against your own history.
3. A Claude agent reads the signals and the real exchanges, and then gives a verdict and one habit.

The analysis runs in a background process. The status line stays fast.

## Setup

You need [Bun](https://bun.sh) and an Anthropic API key.

```bash
git clone https://github.com/tashian/critic ~/code/critic
cd ~/code/critic && bun install
```

1. Give Critic your API key. Set `ANTHROPIC_API_KEY`, or put the name of a [tsm](https://github.com/tashian/tsm) entry in `~/.claude/critic/config.json` as `tsmSecret`.
2. Add the status line. In your status-line script, send the status-line JSON to `~/code/critic/bin/critic statusline`.
3. Add the Stop hook in `~/.claude/settings.json`:

   ```json
   { "hooks": { "Stop": [{ "hooks": [{ "type": "command", "command": "~/code/critic/bin/critic hook-stop" }] }] } }
   ```

4. Add the skill: `ln -s ~/code/critic/skill ~/.claude/skills/critic`.

See [AGENTS.md](AGENTS.md) for the cadence, the configuration, and how to make the demo video again.
