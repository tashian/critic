import { existsSync, readFileSync, readdirSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { BASELINE_CACHE, CRITIC_DIR, PROJECTS_DIR } from "./config";
import { computeStats, parseTranscript, round2, type Stats } from "./transcript";

/** Compact per-session record kept in the baseline cache. */
export interface SessionSummary {
  sessionId: string;
  project: string;
  file: string;
  title?: string;
  startTs: number;
  activeMin: number;
  startHour: number;
  compactions: number;
  costUSD?: number;
  linesAdded?: number;
  stats: Stats;
  /** Friction/momentum of each rolling window of prompts, with the active minute it ended at. */
  windows: { endMin: number; friction: number; momentum: number }[];
  /** First few prompts, for learning from peak sessions. */
  openingPrompts: string[];
  flow: number;
}

interface CacheFile {
  version: number;
  windowPrompts: number;
  entries: Record<string, { mtimeMs: number; size: number; summary: SessionSummary | null }>;
}

const CACHE_VERSION = 2;
const MIN_PROMPTS = 3;

export function flowScore(s: Stats): number {
  return round2(s.momentum - s.friction);
}

export function listTranscripts(): string[] {
  if (!existsSync(PROJECTS_DIR)) return [];
  const out: string[] = [];
  for (const dir of readdirSync(PROJECTS_DIR)) {
    const p = join(PROJECTS_DIR, dir);
    let entries: string[];
    try {
      entries = readdirSync(p);
    } catch {
      continue;
    }
    for (const f of entries) if (f.endsWith(".jsonl")) out.push(join(p, f));
  }
  return out;
}

export function summarize(file: string, windowPrompts: number): SessionSummary | null {
  const s = parseTranscript(file, { keepActions: false });
  if (s.stats.prompts < MIN_PROMPTS) return null;
  const windows: SessionSummary["windows"] = [];
  for (let end = windowPrompts; end <= s.exchanges.length; end += Math.max(1, Math.floor(windowPrompts / 2))) {
    const slice = s.exchanges.slice(end - windowPrompts, end);
    const st = computeStats(slice);
    windows.push({ endMin: slice.at(-1)!.activeMin, friction: st.friction, momentum: st.momentum });
  }
  return {
    sessionId: s.sessionId,
    project: s.project,
    file,
    title: s.title,
    startTs: s.startTs,
    activeMin: s.activeMin,
    startHour: s.startHour,
    compactions: s.compactions,
    costUSD: s.costUSD,
    linesAdded: s.linesAdded,
    stats: s.stats,
    windows,
    openingPrompts: s.exchanges
      .filter((e) => e.kind === "prompt")
      .slice(0, 3)
      .map((e) => e.prompt.replace(/\s+/g, " ").slice(0, 400)),
    flow: flowScore(s.stats),
  };
}

/** Load summaries for every past session, re-parsing only files that changed. */
export function loadBaseline(windowPrompts: number, excludeSessionId?: string): SessionSummary[] {
  let cache: CacheFile = { version: CACHE_VERSION, windowPrompts, entries: {} };
  if (existsSync(BASELINE_CACHE)) {
    try {
      const c = JSON.parse(readFileSync(BASELINE_CACHE, "utf8")) as CacheFile;
      if (c.version === CACHE_VERSION && c.windowPrompts === windowPrompts) cache = c;
    } catch {}
  }
  const seen = new Set<string>();
  let dirty = false;
  for (const file of listTranscripts()) {
    seen.add(file);
    let st;
    try {
      st = statSync(file);
    } catch {
      continue;
    }
    const hit = cache.entries[file];
    if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) continue;
    let summary: SessionSummary | null = null;
    try {
      summary = summarize(file, windowPrompts);
    } catch {}
    cache.entries[file] = { mtimeMs: st.mtimeMs, size: st.size, summary };
    dirty = true;
  }
  for (const f of Object.keys(cache.entries)) {
    if (!seen.has(f)) {
      delete cache.entries[f];
      dirty = true;
    }
  }
  if (dirty) {
    mkdirSync(CRITIC_DIR, { recursive: true });
    writeFileSync(BASELINE_CACHE, JSON.stringify(cache));
  }
  return Object.values(cache.entries)
    .map((e) => e.summary)
    .filter((s): s is SessionSummary => !!s && s.sessionId !== excludeSessionId);
}

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const i = (sorted.length - 1) * q;
  const lo = Math.floor(i);
  const hi = Math.ceil(i);
  return round2(sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo));
}

/** Percent of baseline values strictly below x (0–100). */
export function percentile(values: number[], x: number): number {
  if (!values.length) return 50;
  let below = 0;
  let equal = 0;
  for (const v of values) {
    if (v < x) below++;
    else if (v === x) equal++;
  }
  return Math.round(((below + equal / 2) / values.length) * 100);
}

function dist(values: number[]) {
  const s = [...values].sort((a, b) => a - b);
  return { p25: quantile(s, 0.25), median: quantile(s, 0.5), p75: quantile(s, 0.75), p90: quantile(s, 0.9) };
}

const HOUR_BUCKETS: [string, number, number][] = [
  ["0-60m", 0, 60],
  ["60-120m", 60, 120],
  ["120-180m", 120, 180],
  ["180-240m", 180, 240],
  ["240m+", 240, Infinity],
];

const DAYPARTS: [string, number, number][] = [
  ["night 00-06", 0, 6],
  ["morning 06-12", 6, 12],
  ["afternoon 12-18", 12, 18],
  ["evening 18-24", 18, 24],
];

export function baselineProfile(all: SessionSummary[]) {
  const windows = all.flatMap((s) => s.windows);
  const byActive = HOUR_BUCKETS.map(([label, lo, hi]) => {
    const w = windows.filter((x) => x.endMin >= lo && x.endMin < hi);
    return {
      activeTime: label,
      windows: w.length,
      medianFriction: dist(w.map((x) => x.friction)).median,
      medianMomentum: dist(w.map((x) => x.momentum)).median,
    };
  });
  const byDaypart = DAYPARTS.map(([label, lo, hi]) => {
    const ss = all.filter((s) => s.startHour >= lo && s.startHour < hi);
    return {
      startedIn: label,
      sessions: ss.length,
      medianFriction: dist(ss.map((s) => s.stats.friction)).median,
      medianFlow: dist(ss.map((s) => s.flow)).median,
    };
  });
  const pick = (k: keyof Stats) => dist(all.map((s) => s.stats[k] / Math.max(1, s.stats.prompts)));
  return {
    sessions: all.length,
    windowsObserved: windows.length,
    sessionActiveMinutes: dist(all.map((s) => s.activeMin)),
    sessionPrompts: dist(all.map((s) => s.stats.prompts)),
    sessionFriction: dist(all.map((s) => s.stats.friction)),
    sessionMomentum: dist(all.map((s) => s.stats.momentum)),
    sessionFlow: dist(all.map((s) => s.flow)),
    windowFriction: dist(windows.map((w) => w.friction)),
    windowMomentum: dist(windows.map((w) => w.momentum)),
    perPromptRates: {
      corrections: pick("corrections"),
      interrupts: pick("interrupts"),
      rejections: pick("rejections"),
      toolErrors: pick("toolErrors"),
      commits: pick("commits"),
      praise: pick("praise"),
    },
    avgPromptChars: dist(all.map((s) => s.stats.avgPromptChars)),
    frictionByActiveTime: byActive,
    byTimeOfDayStarted: byDaypart,
  };
}
