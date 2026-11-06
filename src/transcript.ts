import { readFileSync } from "node:fs";
import { basename, dirname } from "node:path";

/** One user prompt and a condensed view of what the assistant did in response. */
export interface Exchange {
  index: number;
  ts: number;
  prompt: string;
  kind: "prompt" | "slash";
  correction: boolean;
  praise: boolean;
  repeat: boolean;
  interrupted: boolean;
  rejections: number;
  toolCalls: number;
  toolErrors: number;
  edits: number;
  commits: number;
  testRuns: number;
  /** Short lines: assistant text snippets and tool calls. */
  actions: string[];
  /** Active minutes since session start at the time of this prompt. */
  activeMin: number;
}

export interface Stats {
  prompts: number;
  slashCommands: number;
  avgPromptChars: number;
  corrections: number;
  praise: number;
  repeats: number;
  interrupts: number;
  rejections: number;
  toolCalls: number;
  toolErrors: number;
  edits: number;
  commits: number;
  testRuns: number;
  /** Weighted bad signals per prompt. */
  friction: number;
  /** Weighted good signals per prompt. */
  momentum: number;
}

export interface Session {
  sessionId: string;
  project: string;
  file: string;
  title?: string;
  startTs: number;
  endTs: number;
  activeMin: number;
  startHour: number;
  compactions: number;
  recaps: string[];
  costUSD?: number;
  linesAdded?: number;
  linesRemoved?: number;
  exchanges: Exchange[];
  stats: Stats;
}

const CORRECTION =
  /^(no|nope|wrong|stop|wait|undo|revert|hmm+|ugh)\b|\b(that'?s not|not what i|didn'?t work|doesn'?t work|does not work|not working|still (broken|failing|not|doesn'?t|getting|seeing|wrong|there)|why did you|why are you|i said|i told you|you forgot|you missed|you broke|try again|same (error|problem|issue)|nothing changed|wtf|come on|you didn'?t|that broke|broke it|i asked)\b/i;
const PRAISE =
  /\b(perfect|great|awesome|nice|excellent|love it|love this|works( now| great)?|working now|ship it|exactly|beautiful|thanks|thank you|lgtm|nailed it|amazing|brilliant)\b/i;
const EDIT_TOOLS = new Set(["Edit", "Write", "MultiEdit", "NotebookEdit"]);
const TEST_CMD = /\b(bun test|npm test|pnpm test|yarn test|pytest|vitest|jest|cargo test|go test|xcodebuild test|swift test|rspec|uv run pytest|make test)\b/;

const ACTIVE_GAP_CAP_MS = 15 * 60_000;

function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b: any) => (b?.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function words(s: string): Set<string> {
  return new Set(s.toLowerCase().match(/[a-z0-9_]{3,}/g) ?? []);
}

function similar(a: string, b: string): boolean {
  if (a.length < 20 || b.length < 20) return false;
  const wa = words(a);
  const wb = words(b);
  if (!wa.size || !wb.size) return false;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  return inter / (wa.size + wb.size - inter) > 0.7;
}

function clip(s: string, n: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}

/** Classify a user-role record: a real prompt, a slash command, or noise. */
function classifyUserText(text: string): { kind: "prompt" | "slash"; text: string } | null {
  const t = text.trim();
  if (!t) return null;
  if (t.startsWith("[Request interrupted")) return null;
  const cmd = t.match(/<command-name>([^<]+)<\/command-name>[\s\S]*?<command-args>([\s\S]*?)<\/command-args>/);
  if (cmd) return { kind: "slash", text: `${cmd[1]!.trim()} ${cmd[2]!.trim()}`.trim() };
  if (/^<(local-command|bash-|task-notification|system-reminder|command-message)/.test(t)) return null;
  if (t.startsWith("Caveat:")) return null;
  if (t.startsWith("This session is being continued from a previous conversation")) return null;
  return { kind: "prompt", text: t };
}

export function computeStats(ex: Exchange[], interruptsOverride?: number): Stats {
  const s: Stats = {
    prompts: 0,
    slashCommands: 0,
    avgPromptChars: 0,
    corrections: 0,
    praise: 0,
    repeats: 0,
    interrupts: 0,
    rejections: 0,
    toolCalls: 0,
    toolErrors: 0,
    edits: 0,
    commits: 0,
    testRuns: 0,
    friction: 0,
    momentum: 0,
  };
  let chars = 0;
  for (const e of ex) {
    if (e.kind === "slash") s.slashCommands++;
    else {
      s.prompts++;
      chars += e.prompt.length;
    }
    if (e.correction) s.corrections++;
    if (e.praise) s.praise++;
    if (e.repeat) s.repeats++;
    if (e.interrupted) s.interrupts++;
    s.rejections += e.rejections;
    s.toolCalls += e.toolCalls;
    s.toolErrors += e.toolErrors;
    s.edits += e.edits;
    s.commits += e.commits;
    s.testRuns += e.testRuns;
  }
  if (interruptsOverride !== undefined) s.interrupts = interruptsOverride;
  const n = Math.max(1, s.prompts + s.slashCommands);
  s.avgPromptChars = s.prompts ? Math.round(chars / s.prompts) : 0;
  s.friction = round2(
    (2 * s.corrections + 2 * s.interrupts + 1.5 * s.rejections + 1.5 * s.repeats + 0.25 * s.toolErrors) / n,
  );
  s.momentum = round2((1.5 * s.praise + 3 * s.commits + 0.5 * Math.min(s.edits, 3 * n) + 0.5 * s.testRuns) / n);
  return s;
}

export function round2(x: number): number {
  return Math.round(x * 100) / 100;
}

export function parseTranscript(file: string, opts: { keepActions?: boolean } = {}): Session {
  const keepActions = opts.keepActions ?? true;
  const raw = readFileSync(file, "utf8");
  const exchanges: Exchange[] = [];
  let cur: Exchange | null = null;
  let title: string | undefined;
  let sessionId = basename(file, ".jsonl");
  let startTs = 0;
  let endTs = 0;
  let lastTs = 0;
  let activeMs = 0;
  let compactions = 0;
  const recaps: string[] = [];
  let costUSD: number | undefined;
  let linesAdded: number | undefined;
  let linesRemoved: number | undefined;
  const pendingTools = new Map<string, Exchange>();

  for (const line of raw.split("\n")) {
    if (!line) continue;
    let r: any;
    try {
      r = JSON.parse(line);
    } catch {
      continue;
    }
    if (r.isSidechain) continue;

    if (r.timestamp) {
      const ts = Date.parse(r.timestamp);
      if (!Number.isNaN(ts)) {
        if (!startTs) startTs = ts;
        if (lastTs && ts > lastTs) activeMs += Math.min(ts - lastTs, ACTIVE_GAP_CAP_MS);
        if (ts > lastTs) lastTs = ts;
        endTs = Math.max(endTs, ts);
      }
    }

    switch (r.type) {
      case "ai-title":
        title = r.title ?? r.aiTitle ?? r.content ?? title;
        break;
      case "cost-state":
        costUSD = r.totalCostUSD;
        linesAdded = r.totalLinesAdded;
        linesRemoved = r.totalLinesRemoved;
        break;
      case "system":
        if (r.subtype === "compact_boundary") compactions++;
        if (r.subtype === "away_summary" && typeof r.content === "string") {
          recaps.push(r.content.replace(/\s*\(disable recaps in \/config\)\s*$/, ""));
        }
        break;
      case "user": {
        if (r.sessionId) sessionId = r.sessionId;
        const content = r.message?.content;
        // Tool results: errors, rejections, interruptions.
        if (Array.isArray(content) && content.some((b: any) => b?.type === "tool_result")) {
          for (const b of content) {
            if (b?.type !== "tool_result") continue;
            const owner = pendingTools.get(b.tool_use_id) ?? cur;
            if (!owner) continue;
            const body = typeof b.content === "string" ? b.content : JSON.stringify(b.content ?? "");
            if (body.includes("doesn't want to proceed with this tool use")) {
              owner.rejections++;
              if (keepActions) owner.actions.push("  ✗ user rejected tool call");
            } else if (body.includes("Request interrupted by user")) {
              owner.interrupted = true;
            } else if (b.is_error) {
              owner.toolErrors++;
              if (keepActions) owner.actions.push(`  ✗ error: ${clip(body, 140)}`);
            }
          }
          break;
        }
        const text = textOf(content);
        if (text.includes("[Request interrupted by user")) {
          if (cur) cur.interrupted = true;
          break;
        }
        if (r.isMeta) break;
        const c = classifyUserText(text);
        if (!c) break;
        const prev = exchanges.at(-1);
        const correction = c.kind === "prompt" && CORRECTION.test(c.text.slice(0, 400));
        cur = {
          index: exchanges.length,
          ts: Date.parse(r.timestamp ?? "") || lastTs,
          prompt: c.text,
          kind: c.kind,
          correction,
          praise: c.kind === "prompt" && !correction && PRAISE.test(c.text.slice(0, 400)),
          repeat: !!prev && c.kind === "prompt" && similar(prev.prompt, c.text),
          interrupted: false,
          rejections: 0,
          toolCalls: 0,
          toolErrors: 0,
          edits: 0,
          commits: 0,
          testRuns: 0,
          actions: [],
          activeMin: Math.round(activeMs / 60_000),
        };
        exchanges.push(cur);
        break;
      }
      case "assistant": {
        if (!cur) break;
        const content = r.message?.content;
        if (!Array.isArray(content)) break;
        for (const b of content) {
          if (b?.type === "text" && b.text?.trim()) {
            if (keepActions) cur.actions.push(`  » ${clip(b.text, 220)}`);
          } else if (b?.type === "tool_use") {
            cur.toolCalls++;
            pendingTools.set(b.id, cur);
            const input = b.input ?? {};
            if (EDIT_TOOLS.has(b.name)) cur.edits++;
            if (b.name === "Bash" && typeof input.command === "string") {
              if (/\bgit commit\b/.test(input.command)) cur.commits++;
              if (TEST_CMD.test(input.command)) cur.testRuns++;
            }
            if (keepActions) {
              const arg =
                input.command ?? input.file_path ?? input.pattern ?? input.skill ?? input.description ?? input.url ?? "";
              cur.actions.push(`  · ${b.name}${arg ? ` ${clip(String(arg), 90)}` : ""}`);
            }
          }
        }
        break;
      }
    }
  }

  if (!keepActions) for (const e of exchanges) e.actions = [];

  return {
    sessionId,
    project: projectName(file),
    file,
    title,
    startTs,
    endTs,
    activeMin: Math.round(activeMs / 60_000),
    startHour: startTs ? new Date(startTs).getHours() : 0,
    compactions,
    recaps,
    costUSD,
    linesAdded,
    linesRemoved,
    exchanges,
    stats: computeStats(exchanges),
  };
}

/** "-Users-carl-code-critic" -> "critic" (best effort; the encoding is lossy). */
export function projectName(file: string): string {
  const dir = basename(dirname(file));
  const home = dir.match(/^-Users-[^-]+(?:-code)?(?:-(.*))?$/);
  return home ? home[1] ?? "~" : dir;
}

/** Render exchanges for the model, newest last. */
export function renderExchanges(ex: Exchange[], maxActions = 12): string {
  return ex
    .map((e) => {
      const flags = [
        e.correction && "CORRECTION",
        e.praise && "PRAISE",
        e.repeat && "REPEATED-PROMPT",
        e.interrupted && "INTERRUPTED",
        e.rejections && `REJECTED×${e.rejections}`,
        e.toolErrors && `TOOL-ERRORS×${e.toolErrors}`,
        e.commits && `COMMITS×${e.commits}`,
      ].filter(Boolean);
      const acts = e.actions.length > maxActions
        ? [...e.actions.slice(0, maxActions / 2), `  … ${e.actions.length - maxActions} more …`, ...e.actions.slice(-maxActions / 2)]
        : e.actions;
      return [
        `#${e.index} [${new Date(e.ts).toLocaleTimeString("en-US", { hour12: false })}, ${e.activeMin}m active]${flags.length ? " {" + flags.join(", ") + "}" : ""}`,
        `USER${e.kind === "slash" ? " (slash command)" : ""}: ${clip(e.prompt, 700)}`,
        `ASSISTANT: ${e.toolCalls} tool calls, ${e.edits} edits`,
        ...acts,
      ].join("\n");
    })
    .join("\n\n");
}
