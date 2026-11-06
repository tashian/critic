import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import { baselineProfile, flowScore, loadBaseline, percentile, type SessionSummary } from "./baseline";
import type { Config } from "./config";
import { computeStats, parseTranscript, renderExchanges, type Session } from "./transcript";
import { readHistory, type Verdict } from "./state";

export const MOODS = ["peak", "flowing", "steady", "grinding", "take_a_break"] as const;

const VerdictInput = z.object({
  mood: z
    .enum(MOODS)
    .describe(
      "peak = among the user's best stretches, celebrate it; flowing = clearly above their norm; steady = normal; grinding = friction is building but recoverable; take_a_break = stuck in a loop or fatigued, stepping away will help more than another prompt.",
    ),
  status: z
    .string()
    .describe("Status-line text, at most 48 characters, no emoji, no trailing period. Specific to this session, e.g. '3 commits, zero corrections in 40m' or '4 retries on the same auth bug'."),
  message: z
    .string()
    .describe("2-3 plain sentences to the user, second person. Cite what happened and how it compares to their own history. No hedging, no therapy-speak."),
  habit: z.object({
    name: z.string().describe("Short name of the habit, e.g. 'Paste the error, not a summary'."),
    observed: z.string().describe("The concrete moment in this session (cite the prompt #) that shows it, or the absence of it."),
    try_next: z.string().describe("One concrete, actionable thing to do in the next prompt or the next session."),
  }),
  evidence: z.array(z.string()).describe("2-5 short, specific observations with prompt numbers."),
  report_markdown: z
    .string()
    .describe("Report mode: the full retro-style markdown report. Otherwise an empty string."),
});

export type VerdictInput = z.infer<typeof VerdictInput>;

const SYSTEM = `You are Critic, a coach that watches a developer's live Claude Code session and compares it to every session they have run before. You decide one thing: how is this session going for this person, measured against their own history, and what one habit would help most right now.

Your two jobs:
1. Tell them to take a break when the session is not going well: repeated corrections, interrupts, rejected tool calls, the same prompt rephrased, tool errors piling up, long active time with falling momentum, late hours. Name the loop they are in. A good break call says what to do when they come back (for example: write down the one-sentence goal, /clear and restate it with the failing output pasted in).
2. Celebrate when they are at their peak: commits landing, few corrections, crisp prompts, praise for the assistant, momentum above their usual. Say specifically what they are doing right so they can repeat it. Celebration should feel earned, not generic.

Most of the time the answer is "steady" and that is fine. Do not manufacture drama. Use take_a_break only when the evidence is clear, and peak only when the recent stretch beats most of their history.

How to work:
- Start with get_session_snapshot. It has the heuristic signals and the percentile ranks against the user's past sessions.
- Then read get_recent_exchanges to see what actually happened. The heuristics are noisy: a "no" can be a plain answer to a question, a tool error can be routine exploration. Judge from the real exchanges.
- Use get_baseline_profile when you need to know how this user normally does (for example, whether their friction rises after two hours).
- Use get_peak_sessions and get_session_prompts when you want to show the user what their own best sessions looked like. "In your best sessions you open with X" is the strongest kind of advice.
- Check get_previous_verdicts so you do not repeat the same habit tip, and so your mood changes reflect real changes.
- Finish by calling submit_verdict exactly once. Do not write anything after it.

The habit lens. These are the four retro dimensions, applied to the user's prompting habits, plus what high-performing engineers do with coding agents:
- Prompts misread by the assistant: what context was missing?
- Prompts with too many degrees of freedom that led to rework.
- Moments the user had to correct direction: what could the first prompt have said?
- Patterns across the session: what does the user consistently under-specify?
Habits that separate great sessions from bad ones:
- State the goal and the definition of done up front (a test to pass, a command to run, what the output should look like).
- Paste the exact error, log, or file path instead of describing it.
- Work in small, verifiable steps and commit at each green state.
- After two failed attempts at the same thing, stop and re-plan rather than retry; reset context (/clear) when switching tasks or when the context is polluted with failed attempts.
- Review diffs and ask for the plan before large changes.
- Capture lessons into AGENTS.md, skills, or memory so the next session starts ahead.
- Step away when stuck: a break beats the fifth rephrase of the same prompt.

Every claim must cite a prompt number or a number from the data. If something is uncertain, leave it out rather than hedge. Write plainly, in short sentences.`;

const REPORT_ADDENDUM = `

REPORT MODE: The user asked for a full report. In addition to the normal verdict, fill report_markdown with a retro in this shape:

# Critic report
**Session goal:** one sentence.
**Verdict:** mood, and one line on how this compares to their history (use percentiles).
## What went well
## Where it dragged
## Prompting habits
(each bullet cites a prompt # and gives a specific fix)
## From your best sessions
(what their peak sessions did that this one did or did not)
## Next 3 moves
1. ... 2. ... 3. ...

Omit any section with no material findings. Keep bullets to 2 sentences.`;

export interface AnalyzeResult {
  verdict: VerdictInput;
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

function sessionSummaryLine(s: SessionSummary) {
  return {
    session_id: s.sessionId,
    project: s.project,
    title: s.title ?? "(untitled)",
    date: new Date(s.startTs).toISOString().slice(0, 10),
    active_min: s.activeMin,
    prompts: s.stats.prompts,
    friction: s.stats.friction,
    momentum: s.stats.momentum,
    flow: s.flow,
    commits: s.stats.commits,
    corrections: s.stats.corrections,
    interrupts: s.stats.interrupts,
    opening_prompts: s.openingPrompts,
  };
}

export async function analyze(opts: {
  transcript: string;
  config: Config;
  mode: "cadence" | "report";
  log?: (msg: string) => void;
}): Promise<AnalyzeResult> {
  const { config, mode } = opts;
  const log = opts.log ?? (() => {});
  const session: Session = parseTranscript(opts.transcript);
  const baseline = loadBaseline(config.windowPrompts, session.sessionId);
  const recent = session.exchanges.slice(-config.windowPrompts);
  const recentStats = computeStats(recent);
  let submitted: VerdictInput | null = null;

  const getSnapshot = betaZodTool({
    name: "get_session_snapshot",
    description:
      "Heuristic signals for the current session (whole session and the most recent stretch of prompts), with percentile ranks against the user's past sessions. Percentile = share of past sessions/windows with a lower value.",
    inputSchema: z.object({}),
    run: async () => {
      const windows = baseline.flatMap((b) => b.windows);
      const now = new Date();
      return JSON.stringify(
        {
          project: session.project,
          title: session.title,
          now_local: now.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }),
          started_local: new Date(session.startTs).toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" }),
          active_minutes: session.activeMin,
          minutes_since_last_prompt: Math.round((Date.now() - (session.exchanges.at(-1)?.ts ?? Date.now())) / 60_000),
          compactions: session.compactions,
          cost_usd: session.costUSD,
          lines_added: session.linesAdded,
          whole_session: session.stats,
          whole_session_flow: flowScore(session.stats),
          recent_stretch: { ...recentStats, prompts_in_window: recent.length, from_prompt: recent[0]?.index },
          percentiles_vs_history: {
            whole_session_friction: percentile(baseline.map((b) => b.stats.friction), session.stats.friction),
            whole_session_momentum: percentile(baseline.map((b) => b.stats.momentum), session.stats.momentum),
            whole_session_flow: percentile(baseline.map((b) => b.flow), flowScore(session.stats)),
            recent_stretch_friction: percentile(windows.map((w) => w.friction), recentStats.friction),
            recent_stretch_momentum: percentile(windows.map((w) => w.momentum), recentStats.momentum),
            active_minutes: percentile(baseline.map((b) => b.activeMin), session.activeMin),
            prompt_count: percentile(baseline.map((b) => b.stats.prompts), session.stats.prompts),
          },
          recaps_shown_to_user: session.recaps.slice(-2),
          baseline_sessions: baseline.length,
        },
        null,
        1,
      );
    },
  });

  const getRecent = betaZodTool({
    name: "get_recent_exchanges",
    description:
      "The user's prompts in this session with a condensed view of what the assistant did after each (text snippets, tool calls, errors, rejections). Flags in {braces} are heuristic.",
    inputSchema: z.object({
      count: z.number().int().min(1).max(60).describe("How many of the most recent prompts to return."),
    }),
    run: async ({ count }) => renderExchanges(session.exchanges.slice(-count)),
  });

  const getProfile = betaZodTool({
    name: "get_baseline_profile",
    description:
      "Distributions over all of the user's past sessions: friction/momentum/flow, per-prompt rates, prompt length, friction by active time into a session, and by time of day.",
    inputSchema: z.object({}),
    run: async () => JSON.stringify(baselineProfile(baseline), null, 1),
  });

  const getPeaks = betaZodTool({
    name: "get_peak_sessions",
    description:
      "The user's best (highest flow) or worst past sessions with at least 5 prompts, with titles, stats, and opening prompts. Use to show the user what their own peak looks like.",
    inputSchema: z.object({
      which: z.enum(["best", "worst"]),
      limit: z.number().int().min(1).max(10),
      same_project_only: z.boolean().describe("Only sessions from the current project."),
    }),
    run: async ({ which, limit, same_project_only }) => {
      const pool = baseline.filter(
        (b) => b.stats.prompts >= 5 && (!same_project_only || b.project === session.project),
      );
      pool.sort((a, b) => (which === "best" ? b.flow - a.flow : a.flow - b.flow));
      return JSON.stringify(pool.slice(0, limit).map(sessionSummaryLine), null, 1);
    },
  });

  const getPrompts = betaZodTool({
    name: "get_session_prompts",
    description: "The prompts and condensed assistant actions of one past session, by session_id.",
    inputSchema: z.object({
      session_id: z.string(),
      limit: z.number().int().min(1).max(40),
    }),
    run: async ({ session_id, limit }) => {
      const s = baseline.find((b) => b.sessionId === session_id);
      if (!s) return `No past session with id ${session_id}.`;
      const full = parseTranscript(s.file);
      return renderExchanges(full.exchanges.slice(0, limit), 6);
    },
  });

  const getPrev = betaZodTool({
    name: "get_previous_verdicts",
    description: "Earlier Critic verdicts for this session, oldest first.",
    inputSchema: z.object({}),
    run: async () => {
      const h = readHistory(session.sessionId).slice(-6);
      if (!h.length) return "No earlier verdicts for this session.";
      return JSON.stringify(
        h.map((v: Verdict) => ({ at_prompt: v.atPrompt, mood: v.mood, status: v.status, habit: v.habit.name })),
        null,
        1,
      );
    },
  });

  const submit = betaZodTool({
    name: "submit_verdict",
    description: "Record the final verdict. Call exactly once, as the last step.",
    inputSchema: VerdictInput,
    strict: true,
    run: async (input) => {
      submitted = input;
      return "Recorded.";
    },
  });

  const client = new Anthropic();
  const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

  const runner = client.beta.messages.toolRunner({
    model: config.model,
    max_tokens: mode === "report" ? 16000 : 8000,
    max_iterations: 12,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    output_config: { effort: mode === "report" ? config.reportEffort : config.effort },
    cache_control: { type: "ephemeral" },
    system: SYSTEM + (mode === "report" ? REPORT_ADDENDUM : ""),
    tools: [getSnapshot, getRecent, getProfile, getPeaks, getPrompts, getPrev, submit],
    messages: [
      {
        role: "user",
        content:
          mode === "report"
            ? `Write a full Critic report for the current session (${session.exchanges.length} prompts so far).`
            : `Check in on the current session (${session.exchanges.length} prompts so far). Submit a verdict.`,
      },
    ],
  });

  for await (const message of runner) {
    usage.input += message.usage.input_tokens;
    usage.output += message.usage.output_tokens;
    usage.cacheRead += message.usage.cache_read_input_tokens ?? 0;
    usage.cacheWrite += message.usage.cache_creation_input_tokens ?? 0;
    if (message.stop_reason === "refusal") throw new Error("Model refused the request.");
    for (const b of message.content) {
      if (b.type !== "tool_use") continue;
      log(`tool ${b.name} ${JSON.stringify(b.input).slice(0, 120)}`);
      // The runner would make one more API call just to deliver "Recorded."; stop here instead.
      if (b.name === "submit_verdict") {
        const parsed = VerdictInput.safeParse(b.input);
        // On a bad shape, keep looping: the runner returns the validation error to the model to fix.
        if (parsed.success) submitted = parsed.data;
        else log(`submit_verdict rejected: ${parsed.error.message.slice(0, 200)}`);
      }
    }
    if (submitted) break;
  }

  if (!submitted) throw new Error("Model finished without calling submit_verdict.");
  return { verdict: submitted, usage };
}
