# Critic demo. Render with:  DEMO_DIR=... vhs demo/critic.tape
# Needs the verdicts from demo/run.sh first.
Output demo/critic-demo.mp4

Set Shell bash
Set FontFamily "Menlo"
Set FontSize 16
Set Width 1440
Set Height 960
Set Padding 28
Set Theme "Catppuccin Mocha"
Set TypingSpeed 35ms
Set CursorBlink false

Hide
Type "source demo/env.sh && clear" Enter
Sleep 500ms
Show

Type "# Critic watches your Claude Code session and compares it with all your past sessions." Enter
Sleep 600ms
Type "# Here are five synthetic sessions, one for each verdict." Enter
Sleep 2s

Type "replay peak" Enter
Sleep 14s
Type "replay flowing" Enter
Sleep 11s
Type "replay steady" Enter
Sleep 10s
Type "replay grinding" Enter
Sleep 12s
Type "replay take_a_break" Enter
Sleep 16s

Type "clear; # /critic gives the full retro on demand:" Enter
Sleep 800ms
Type "report take_a_break | head -34" Enter
Sleep 12s
Type "clear; report take_a_break | tail -n +34" Enter
Sleep 12s
