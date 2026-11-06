export const NARRATION = [
  { id: "intro", text: "This is Critic. A session coach for Claude Code." },
  { id: "problem", text: "Some sessions fly. Others go in circles. And while you're in one, it's hard to tell which." },
  {
    id: "how",
    text: "Critic reads your live session. It weighs corrections, interrupts, repeated prompts, and tool errors against commits, passing tests, and praise. Then it compares the session with every session you have run before.",
  },
  { id: "scale", text: "The result is one of five verdicts, from peak to take a break, plus one prompting habit to work on." },
  {
    id: "peak",
    text: "Here is a peak. The first prompt gave a goal and a definition of done. Four commits, zero corrections, and a pull request in fifty-three minutes. That beats ninety-six percent of this developer's past sessions, and Critic says why, so they can do it again.",
  },
  {
    id: "middle",
    text: "Most sessions land in the middle. Flowing. Steady. Or grinding: the third red CI run on the same flaky test. Critic does not make drama out of a normal session.",
  },
  {
    id: "break",
    text: "And this session is a loop. Nearly three hours on the same four-oh-one error. Ten corrections. The same prompt, rephrased again and again. Critic says: step away. And it tells you exactly what to type when you come back.",
  },
  { id: "report", text: "Type slash critic for the full retro: what went well, where it dragged, and what your own best sessions did differently." },
  { id: "outro", text: "Critic. It lives in your status line. It celebrates the peaks, and it catches the loops." },
] as const;
