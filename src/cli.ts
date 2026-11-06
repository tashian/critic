#!/usr/bin/env bun
import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { analyze, type VerdictInput } from "./agent";
import { baselineProfile, loadBaseline } from "./baseline";
import { HOME, loadConfig, PROJECTS_DIR, sessionDir, type Config } from "./config";
import {
  isLocked,
  logLine,
  readRunState,
  readVerdict,
  releaseLock,
  takeLock,
  writeRunState,
  writeVerdict,
  type Verdict,
} from "./state";
import { computeStats, parseTranscript } from "./transcript";

const CLI = fileURLToPath(import.meta.url);
const ERROR_BACKOFF_MS = 10 * 60_000;
const URGENT_MIN_GAP_MS = 2 * 60_000;

const MOOD_STYLE: Record<VerdictInput["mood"], { icon: string; label: string; color: string }> = {
  peak: { icon: "🔥", label: "Peak", color: "\x1b[1;32m" },
  flowing: { icon: "🌊", label: "Flowing", color: "\x1b[32m" },
  steady: { icon: "🧭", label: "Steady", color: "\x1b[36m" },
  grinding: { icon: "🪨", label: "Grinding", color: "\x1b[33m" },
  take_a_break: { icon: "☕", label: "Take a break", color: "\x1b[1;31m" },
};
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";

// ---------- helpers ----------

function readStdinJson(): any {
  try {
    const text = readFileSync(0, "utf8");
    return text.trim() ? JSON.parse(text) : {};
  } catch {
    return {};
  }
}

function args(argv: string[]): Record<string, string | true> {
  const out: Record<string, string | true> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) continue;
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      out[a.slice(2)] = next;
      i++;
    } else out[a.slice(2)] = true;
  }
  return out;
}

interface Quick {
  size: number;
  prompts: number;
  /** Friction over the last 4 prompts. */
  recentFriction: number;
}

/** Cheap prompt count + recent friction, cached by transcript size so status-line refreshes stay fast. */
function quickStats(sessionId: string, transcript: string): Quick {
  const file = join(sessionDir(sessionId), "quick.json");
  const size = statSync(transcript).size;
  if (existsSync(file)) {
    try {
      const q = JSON.parse(readFileSync(file, "utf8")) as Quick;
      if (q.size === size) return q;
    } catch {}
  }
  const s = parseTranscript(transcript, { keepActions: false });
  const q: Quick = {
    size,
    prompts: s.exchanges.length,
    recentFriction: computeStats(s.exchanges.slice(-4)).friction,
  };
  writeFileSync(file, JSON.stringify(q));
  return q;
}

function dueReason(cfg: Config, sessionId: string, q: Quick): string | null {
  if (q.prompts < cfg.minPrompts) return null;
  if (isLocked(sessionId)) return null;
  const run = readRunState(sessionId);
  const now = Date.now();
  if (run.lastErrorAt && now - run.lastErrorAt < ERROR_BACKOFF_MS) return null;
  const newPrompts = q.prompts - run.lastPrompts;
  if (!run.lastRunAt) return "first";
  if (newPrompts <= 0) return null;
  if (newPrompts >= cfg.minNewPrompts && now - run.lastRunAt >= cfg.intervalSec * 1000) return "cadence";
  if (q.recentFriction >= 1.0 && newPrompts >= 2 && now - run.lastRunAt >= URGENT_MIN_GAP_MS) return "friction-spike";
  return null;
}

function spawnAnalysis(cfg: Config, sessionId: string, transcript: string, reason: string) {
  const run = readRunState(sessionId);
  const bunArgs = [CLI, "analyze", "--transcript", transcript, "--session", sessionId];
  const tsm = Bun.which("tsm") ?? join(HOME, ".bun", "bin", "tsm");
  const [cmd, cmdArgs] = cfg.tsmSecret
    ? [tsm, ["run", "--env", `ANTHROPIC_API_KEY=${cfg.tsmSecret}`, "--", process.execPath, ...bunArgs]]
    : [process.execPath, bunArgs];
  // Mark the run before spawning so concurrent status-line refreshes do not double-fire.
  writeRunState(sessionId, { ...run, lastRunAt: Date.now() });
  logLine(sessionId, `spawn (${reason})`);
  const child = spawn(cmd as string, cmdArgs as string[], { detached: true, stdio: "ignore", env: process.env });
  child.unref();
}

function maybeTrigger(sessionId: string | undefined, transcript: string | undefined): Quick | null {
  if (!sessionId || !transcript || !existsSync(transcript)) return null;
  const cfg = loadConfig();
  const q = quickStats(sessionId, transcript);
  const reason = dueReason(cfg, sessionId, q);
  if (reason) spawnAnalysis(cfg, sessionId, transcript, reason);
  return q;
}

function ago(ts: number): string {
  const m = Math.round((Date.now() - ts) / 60_000);
  if (m < 1) return "now";
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

function renderStatus(sessionId: string, q: Quick | null): string {
  const cfg = loadConfig();
  const v = readVerdict(sessionId);
  const busy = isLocked(sessionId) ? ` ${DIM}⟳${RESET}` : "";
  if (v) {
    const st = MOOD_STYLE[v.mood];
    return `${st.icon} ${st.color}${st.label}${RESET} ${v.status} ${DIM}· ${ago(v.createdAt)}${RESET}${busy}`;
  }
  const run = readRunState(sessionId);
  if (run.lastError && run.lastErrorAt && Date.now() - run.lastErrorAt < ERROR_BACKOFF_MS) {
    return `${DIM}🎯 critic: ${run.lastError.slice(0, 60)}${RESET}`;
  }
  const justSpawned = run.lastRunAt && Date.now() - run.lastRunAt < 2 * 60_000;
  if (busy || justSpawned) return `${DIM}🎯 critic: reading this session…${RESET}`;
  const n = q?.prompts ?? 0;
  return `${DIM}🎯 critic: warming up (${Math.min(n, cfg.minPrompts)}/${cfg.minPrompts} prompts)${RESET}`;
}

// ---------- commands ----------

async function cmdStatusline() {
  const input = readStdinJson();
  const sessionId: string | undefined = input.session_id;
  if (!sessionId) return;
  let q: Quick | null = null;
  try {
    q = maybeTrigger(sessionId, input.transcript_path);
  } catch (e) {
    logLine(sessionId, `statusline trigger error: ${(e as Error).message}`);
  }
  process.stdout.write(renderStatus(sessionId, q) + "\n");
}

async function cmdHookStop() {
  const input = readStdinJson();
  const sessionId: string | undefined = input.session_id;
  if (!sessionId) return;
  try {
    maybeTrigger(sessionId, input.transcript_path);
  } catch (e) {
    logLine(sessionId, `stop-hook trigger error: ${(e as Error).message}`);
  }
  const v = readVerdict(sessionId);
  const run = readRunState(sessionId);
  if (!v || run.notifiedId === v.id) return;
  if (v.mood !== "peak" && v.mood !== "take_a_break") return;
  writeRunState(sessionId, { ...run, notifiedId: v.id });
  const st = MOOD_STYLE[v.mood];
  const msg = `${st.icon} Critic — ${st.label}: ${v.message} Next: ${v.habit.try_next}`;
  process.stdout.write(JSON.stringify({ systemMessage: msg }) + "\n");
}

async function cmdAnalyze(a: Record<string, string | true>) {
  const transcript = String(a.transcript);
  const mode = a.mode === "report" ? "report" : "cadence";
  const cfg = loadConfig();
  const sessionId = typeof a.session === "string" ? a.session : parseTranscript(transcript, { keepActions: false }).sessionId;
  if (!takeLock(sessionId)) {
    if (mode === "report") console.error("Another analysis is running for this session; try again in a minute.");
    return;
  }
  const prompts = parseTranscript(transcript, { keepActions: false }).exchanges.length;
  const run = readRunState(sessionId);
  writeRunState(sessionId, { ...run, lastPrompts: prompts, lastRunAt: Date.now(), lastError: undefined, lastErrorAt: undefined });
  const started = Date.now();
  try {
    const { verdict, usage } = await analyze({
      transcript,
      config: cfg,
      mode,
      log: (m) => logLine(sessionId, m),
    });
    const v: Verdict = {
      ...verdict,
      id: crypto.randomUUID(),
      sessionId,
      createdAt: Date.now(),
      atPrompt: prompts,
      model: cfg.model,
      mode,
      usage,
    };
    writeVerdict(v);
    logLine(
      sessionId,
      `verdict ${v.mood} "${v.status}" in ${Math.round((Date.now() - started) / 1000)}s; tokens in=${usage.input} out=${usage.output} cacheRead=${usage.cacheRead} cacheWrite=${usage.cacheWrite}`,
    );
    if (mode === "report") printReport(v);
  } catch (e) {
    const msg = (e as Error).message ?? String(e);
    logLine(sessionId, `error: ${msg}`);
    writeRunState(sessionId, { ...readRunState(sessionId), lastError: msg.split("\n")[0], lastErrorAt: Date.now() });
    if (mode === "report") console.error(`Critic failed: ${msg}`);
    process.exitCode = 1;
  } finally {
    releaseLock(sessionId);
  }
}

function printReport(v: Verdict) {
  const st = MOOD_STYLE[v.mood];
  if (v.report_markdown) console.log(v.report_markdown);
  else {
    console.log(`# Critic: ${st.icon} ${st.label}\n\n${v.message}\n`);
    for (const e of v.evidence) console.log(`- ${e}`);
  }
  console.log(`\n**Habit — ${v.habit.name}.** ${v.habit.observed} Next: ${v.habit.try_next}`);
}

/** Newest top-level transcript for a working directory. */
function latestTranscript(cwd: string): string | null {
  const encoded = resolve(cwd).replace(/[^A-Za-z0-9]/g, "-");
  const dirs = [join(PROJECTS_DIR, encoded)];
  let best: { f: string; m: number } | null = null;
  for (const d of dirs) {
    if (!existsSync(d)) continue;
    for (const f of readdirSync(d)) {
      if (!f.endsWith(".jsonl")) continue;
      const p = join(d, f);
      const m = statSync(p).mtimeMs;
      if (!best || m > best.m) best = { f: p, m };
    }
  }
  return best?.f ?? null;
}

async function cmdReport(a: Record<string, string | true>) {
  let transcript = typeof a.transcript === "string" ? a.transcript : null;
  if (!transcript && typeof a.session === "string") {
    const hit = (await import("./baseline")).listTranscripts().find((f) => f.endsWith(`/${a.session}.jsonl`));
    transcript = hit ?? null;
  }
  if (!transcript) transcript = latestTranscript(typeof a.cwd === "string" ? a.cwd : process.cwd());
  if (!transcript) {
    console.error("No transcript found. Pass --transcript <path> or --session <id>.");
    process.exitCode = 1;
    return;
  }
  await cmdAnalyze({ ...a, transcript, mode: "report" });
}

async function cmdShow(a: Record<string, string | true>) {
  const transcript = typeof a.transcript === "string" ? a.transcript : latestTranscript(process.cwd());
  if (!transcript) return console.error("No transcript found.");
  const sessionId = parseTranscript(transcript, { keepActions: false }).sessionId;
  const v = readVerdict(sessionId);
  if (!v) return console.log("No verdict yet for this session.");
  printReport(v);
}

async function cmdBaseline() {
  const cfg = loadConfig();
  console.log(JSON.stringify(baselineProfile(loadBaseline(cfg.windowPrompts)), null, 2));
}

const [cmd, ...rest] = process.argv.slice(2);
const a = args(rest);
switch (cmd) {
  case "statusline":
    await cmdStatusline();
    break;
  case "hook-stop":
    await cmdHookStop();
    break;
  case "analyze":
    await cmdAnalyze(a);
    break;
  case "report":
    await cmdReport(a);
    break;
  case "show":
    await cmdShow(a);
    break;
  case "baseline":
    await cmdBaseline();
    break;
  default:
    console.log(`critic — session coach for Claude Code

  critic statusline            read status-line JSON on stdin, print one line, trigger analysis when due
  critic hook-stop             Stop hook: trigger when due, announce peak / take-a-break verdicts once
  critic analyze --transcript <path> [--mode cadence|report]
  critic report [--transcript <path> | --session <id> | --cwd <dir>]   full retro-style report now
  critic show [--transcript <path>]   print the latest verdict without calling the API
  critic baseline              print your historical profile`);
}
