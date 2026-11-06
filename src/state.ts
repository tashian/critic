import { appendFileSync, existsSync, readFileSync, rmSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { sessionDir } from "./config";
import type { VerdictInput } from "./agent";

export interface Verdict extends VerdictInput {
  id: string;
  sessionId: string;
  createdAt: number;
  atPrompt: number;
  model: string;
  mode: "cadence" | "report";
  usage?: { input: number; output: number; cacheRead: number; cacheWrite: number };
}

export interface RunState {
  /** Prompt count at the last analysis start. */
  lastPrompts: number;
  lastRunAt: number;
  lastError?: string;
  lastErrorAt?: number;
  /** Verdict id already announced through the Stop hook. */
  notifiedId?: string;
}

const LOCK_STALE_MS = 5 * 60_000;

function readJson<T>(file: string): T | null {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function writeJsonAtomic(file: string, data: unknown) {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 1));
  renameSync(tmp, file);
}

export function readVerdict(sessionId: string): Verdict | null {
  return readJson<Verdict>(join(sessionDir(sessionId), "verdict.json"));
}

export function writeVerdict(v: Verdict) {
  const dir = sessionDir(v.sessionId);
  writeJsonAtomic(join(dir, "verdict.json"), v);
  appendFileSync(join(dir, "history.jsonl"), JSON.stringify(v) + "\n");
}

export function readHistory(sessionId: string): Verdict[] {
  const file = join(sessionDir(sessionId), "history.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .flatMap((l) => {
      try {
        return [JSON.parse(l) as Verdict];
      } catch {
        return [];
      }
    });
}

export function readRunState(sessionId: string): RunState {
  return readJson<RunState>(join(sessionDir(sessionId), "run.json")) ?? { lastPrompts: 0, lastRunAt: 0 };
}

export function writeRunState(sessionId: string, s: RunState) {
  writeJsonAtomic(join(sessionDir(sessionId), "run.json"), s);
}

/** True while an analysis for this session is in flight (and not stale). */
export function isLocked(sessionId: string): boolean {
  const lock = readJson<{ pid: number; at: number }>(join(sessionDir(sessionId), "lock.json"));
  if (!lock) return false;
  if (Date.now() - lock.at > LOCK_STALE_MS) return false;
  try {
    process.kill(lock.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function takeLock(sessionId: string): boolean {
  if (isLocked(sessionId)) return false;
  writeJsonAtomic(join(sessionDir(sessionId), "lock.json"), { pid: process.pid, at: Date.now() });
  return true;
}

export function releaseLock(sessionId: string) {
  rmSync(join(sessionDir(sessionId), "lock.json"), { force: true });
}

export function logLine(sessionId: string, msg: string) {
  appendFileSync(join(sessionDir(sessionId), "critic.log"), `${new Date().toISOString()} ${msg}\n`);
}
