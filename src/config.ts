import { homedir } from "node:os";
import { join } from "node:path";
import { existsSync, readFileSync, mkdirSync } from "node:fs";

export const HOME = homedir();
export const PROJECTS_DIR = join(HOME, ".claude", "projects");
export const CRITIC_DIR = process.env.CRITIC_DIR ?? join(HOME, ".claude", "critic");
export const SESSIONS_DIR = join(CRITIC_DIR, "sessions");
export const BASELINE_CACHE = join(CRITIC_DIR, "baseline-cache.json");
export const CONFIG_FILE = join(CRITIC_DIR, "config.json");

export interface Config {
  /** tsm entry that holds the Anthropic API key. Supplied at runtime via config.json, never committed. */
  tsmSecret?: string;
  model: string;
  /** Effort for the cadence check (cheap) and for on-demand reports (deeper). */
  effort: "low" | "medium" | "high" | "xhigh" | "max";
  reportEffort: "low" | "medium" | "high" | "xhigh" | "max";
  /** Minimum seconds between two cadence analyses of the same session. */
  intervalSec: number;
  /** Minimum new user prompts since the last analysis before re-running. */
  minNewPrompts: number;
  /** Do not analyze a session until it has this many prompts. */
  minPrompts: number;
  /** Size of the "recent stretch" window, in prompts. */
  windowPrompts: number;
}

const DEFAULTS: Config = {
  model: "claude-opus-5-5",
  effort: "low",
  reportEffort: "medium",
  intervalSec: 600,
  minNewPrompts: 3,
  minPrompts: 4,
  windowPrompts: 8,
};

export function loadConfig(): Config {
  let file: Partial<Config> = {};
  if (existsSync(CONFIG_FILE)) {
    try {
      file = JSON.parse(readFileSync(CONFIG_FILE, "utf8"));
    } catch {
      // A broken config must never break the status line.
    }
  }
  const env: Partial<Config> = {};
  if (process.env.CRITIC_MODEL) env.model = process.env.CRITIC_MODEL;
  if (process.env.CRITIC_TSM_SECRET) env.tsmSecret = process.env.CRITIC_TSM_SECRET;
  if (process.env.CRITIC_INTERVAL_SEC) env.intervalSec = Number(process.env.CRITIC_INTERVAL_SEC);
  return { ...DEFAULTS, ...file, ...env };
}

export function sessionDir(sessionId: string): string {
  const dir = join(SESSIONS_DIR, sessionId);
  mkdirSync(dir, { recursive: true });
  return dir;
}
