/**
 * Export the demo sessions and Critic's real verdicts into src/data.json for the video.
 * Run with the same env as demo/run.sh (source ../env.sh), after demo/run.sh.
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parseTranscript, type Exchange } from "../../../src/transcript";
import { flowScore, loadBaseline, percentile } from "../../../src/baseline";

const DEMO_DIR = process.env.DEMO_DIR!;
const CRITIC_DIR = process.env.CRITIC_DIR!;
const base = loadBaseline(8);

/** Which prompts each scene shows (indexes into the session's exchanges). */
const PICK: Record<string, number[]> = {
  peak: [0, 3, 5, 9],
  flowing: [2, 6],
  steady: [1, 4],
  grinding: [7, 9],
  take_a_break: [2, 6, 14, 15],
};

function tags(e: Exchange) {
  const t: { label: string; tone: "bad" | "warn" | "good" | "info" }[] = [];
  if (e.correction) t.push({ label: "correction", tone: "bad" });
  if (e.repeat) t.push({ label: "repeated prompt", tone: "bad" });
  if (e.interrupted) t.push({ label: "interrupted", tone: "bad" });
  if (e.rejections) t.push({ label: "rejected tool call", tone: "bad" });
  if (e.toolErrors) t.push({ label: e.toolErrors > 1 ? `${e.toolErrors} tool errors` : "tool error", tone: "warn" });
  if (e.praise) t.push({ label: "praise", tone: "good" });
  if (e.testRuns) t.push({ label: "tests", tone: "info" });
  if (e.commits) t.push({ label: "commit", tone: "good" });
  return t;
}

const out: Record<string, unknown> = {
  history: base.map((b) => b.flow).sort((a, b) => a - b),
  sessions: {},
};
for (const dir of readdirSync(join(DEMO_DIR, "live"))) {
  for (const f of readdirSync(join(DEMO_DIR, "live", dir))) {
    const s = parseTranscript(join(DEMO_DIR, "live", dir, f));
    const name = s.sessionId.replace(/^demo-/, "");
    const vfile = join(CRITIC_DIR, "sessions", s.sessionId, "verdict.json");
    const hist = join(CRITIC_DIR, "sessions", s.sessionId, "history.jsonl");
    if (!existsSync(vfile)) throw new Error(`No verdict for ${name}. Run demo/run.sh first.`);
    const verdicts = readFileSync(hist, "utf8").trim().split("\n").map((l) => JSON.parse(l));
    const cadence = verdicts.filter((v) => v.mode === "cadence").at(-1);
    const report = verdicts.filter((v) => v.mode === "report").at(-1);
    const flow = flowScore(s.stats);
    (out.sessions as any)[name] = {
      title: s.title,
      project: s.project,
      prompts: s.exchanges.length,
      activeMin: s.activeMin,
      stats: s.stats,
      flow,
      flowPct: percentile(base.map((b) => b.flow), flow),
      frictionPct: percentile(base.map((b) => b.stats.friction), s.stats.friction),
      activePct: percentile(base.map((b) => b.activeMin), s.activeMin),
      exchanges: (PICK[name] ?? []).map((i) => ({ index: i, prompt: s.exchanges[i]!.prompt, tags: tags(s.exchanges[i]!) })),
      verdict: { mood: cadence.mood, status: cadence.status, message: cadence.message, habit: cadence.habit },
      report: report?.report_markdown ?? null,
    };
  }
}
await Bun.write(join(import.meta.dir, "..", "src", "data.json"), JSON.stringify(out, null, 1));
for (const [k, v] of Object.entries(out.sessions as any)) console.log(k, (v as any).flowPct, (v as any).frictionPct, (v as any).verdict.status);
