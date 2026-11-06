#!/usr/bin/env bun
/**
 * Replay one synthetic session for the demo video: the last few prompts with their
 * heuristic signals, then Critic's real status line and Stop-hook message for it.
 *
 *   bun demo/replay.ts <peak|flowing|steady|grinding|take_a_break> [--fast]
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { parseTranscript, type Exchange } from "../src/transcript";

const DEMO_DIR = process.env.DEMO_DIR ?? join(process.env.TMPDIR ?? "/tmp", "critic-demo");
const CRITIC = join(import.meta.dir, "..", "bin", "critic");
const name = process.argv[2] ?? "peak";
const fast = process.argv.includes("--fast");
const SHOW = 5;

const C = {
  dim: "\x1b[2m",
  bold: "\x1b[1m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  gray: "\x1b[90m",
  orange: "\x1b[38;5;209m",
  reset: "\x1b[0m",
};

const sleep = (ms: number) => (fast ? undefined : Bun.sleepSync(ms));
const out = (s = "") => process.stdout.write(s + "\n");
function type(s: string, cps = 140) {
  if (fast) return process.stdout.write(s);
  for (const ch of s) {
    process.stdout.write(ch);
    Bun.sleepSync(1000 / cps);
  }
}

function findTranscript(): string {
  const live = join(DEMO_DIR, "live");
  for (const d of readdirSync(live)) {
    const f = join(live, d, `demo-${name}.jsonl`);
    if (existsSync(f)) return f;
  }
  throw new Error(`No scenario "${name}" in ${live}. Run bun demo/gen.ts first.`);
}

function tags(e: Exchange): string {
  const t: string[] = [];
  if (e.correction) t.push(`${C.red}correction${C.reset}`);
  if (e.repeat) t.push(`${C.red}repeated prompt${C.reset}`);
  if (e.interrupted) t.push(`${C.red}interrupted${C.reset}`);
  if (e.rejections) t.push(`${C.red}rejected tool call${C.reset}`);
  if (e.toolErrors) t.push(`${C.yellow}${e.toolErrors} tool error${e.toolErrors > 1 ? "s" : ""}${C.reset}`);
  if (e.praise) t.push(`${C.green}praise${C.reset}`);
  if (e.testRuns) t.push(`${C.cyan}tests${C.reset}`);
  if (e.commits) t.push(`${C.green}commit${C.reset}`);
  return t.join(`${C.gray} · ${C.reset}`);
}

const file = findTranscript();
const s = parseTranscript(file);
const sessionId = s.sessionId;
const project = s.project;

out(`${C.orange}✻${C.reset} ${C.bold}${s.title}${C.reset}  ${C.gray}${project} · ${s.exchanges.length} prompts · ${s.activeMin}m active${C.reset}`);
const hidden = s.exchanges.length - SHOW;
if (hidden > 0) out(`${C.gray}  … ${hidden} earlier prompts${C.reset}`);
out();
sleep(400);

for (const e of s.exchanges.slice(-SHOW)) {
  const first = e.prompt.split("\n")[0]!;
  const p = first.length > 96 ? first.slice(0, 95) + "…" : first;
  process.stdout.write(`${C.bold}❯${C.reset} `);
  type(p);
  out();
  const actions = e.actions.filter((a) => a.startsWith("  ·")).slice(0, 3);
  for (const a of actions) out(`${C.gray}  ⏺ ${a.slice(4, 90)}${C.reset}`);
  const tg = tags(e);
  if (tg) out(`  ${C.gray}↳${C.reset} ${tg}`);
  out();
  sleep(350);
}

// Real status line from Critic, inside a mock Claude Code footer.
const status = spawnSync(CRITIC, ["statusline"], {
  input: JSON.stringify({ session_id: sessionId, transcript_path: file }),
  encoding: "utf8",
  env: process.env,
}).stdout.trim();
const width = Math.min(process.stdout.columns || 110, 110);
out(`${C.gray}${"─".repeat(width)}${C.reset}`);
out(`${C.bold}>${C.reset} ${C.gray}▌${C.reset}`);
out(`${C.gray}${"─".repeat(width)}${C.reset}`);
out(`  ${C.gray}~/code/${project} · Opus 5.5${C.reset}`);
// Extra space after the icon: some emoji render wider than one cell in the recording font.
out(`  ${status.replace(/^(\S+) /, "$1  ")}`);
sleep(900);

// The Stop hook announces peak / take_a_break once per verdict. Reset that so the demo can replay it.
const runFile = join(process.env.CRITIC_DIR!, "sessions", sessionId, "run.json");
if (existsSync(runFile)) {
  const run = JSON.parse(readFileSync(runFile, "utf8"));
  delete run.notifiedId;
  writeFileSync(runFile, JSON.stringify(run));
}
const hook = spawnSync(CRITIC, ["hook-stop"], {
  input: JSON.stringify({ session_id: sessionId, transcript_path: file }),
  encoding: "utf8",
  env: process.env,
}).stdout.trim();
if (hook) {
  const msg: string = JSON.parse(hook).systemMessage;
  out();
  out(`${C.gray}  Stop hook says:${C.reset}`);
  const words = msg.split(" ");
  let line = "  ";
  for (const w of words) {
    if (line.length + w.length > width - 4) {
      out(`${C.yellow}${line}${C.reset}`);
      line = "  ";
    }
    line += w + " ";
  }
  out(`${C.yellow}${line}${C.reset}`);
}
out();
