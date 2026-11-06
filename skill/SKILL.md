---
name: critic
description: Session coach report. Compares the current Claude Code session with all of the user's past sessions and says whether to take a break, keep going, or celebrate a peak stretch, plus one prompting habit to work on. Use when the user types /critic or asks "how is this session going", "should I take a break", or "how am I doing".
user_invocable: true
---

# /critic

Run the Critic report for the current session and show it to the user.

1. Run this command. It reads the newest transcript for the current working directory, compares it with the user's history, and calls the Claude API (about 30 seconds):

   ```bash
   bash ~/code/critic/bin/critic report --cwd "$PWD"
   ```

   If the user named another session id, add `--session <id>` instead of `--cwd`.

2. Print the command's markdown output to the user as-is. Do not summarize or soften it, and do not add your own retro on top.

3. If the command fails, show the error line and point to the log at `~/.claude/critic/sessions/<session-id>/critic.log`.

`bash ~/code/critic/bin/critic show` prints the latest verdict without an API call.
