import { loadFont as loadInter } from "@remotion/google-fonts/Inter";
import { loadFont as loadMono } from "@remotion/google-fonts/JetBrainsMono";
import { NARRATION } from "./narration";
import vo from "./vo.json";

export const { fontFamily: SANS } = loadInter("normal", { weights: ["400", "500", "600", "700", "800"], subsets: ["latin"] });
export const { fontFamily: MONO } = loadMono("normal", { weights: ["400", "500", "700"], subsets: ["latin"] });

export const FPS = 30;
export const W = 1920;
export const H = 1080;

export const C = {
  bg: "#0D0E12",
  panel: "#16181F",
  panel2: "#1D2029",
  line: "#2A2E3A",
  text: "#F4F1EA",
  sub: "#A3A8B8",
  faint: "#5F6578",
  accent: "#D97757",
  bad: "#F87171",
  warn: "#FBBF24",
  good: "#4ADE80",
  info: "#60A5FA",
};

export type Mood = "peak" | "flowing" | "steady" | "grinding" | "take_a_break";
export const MOOD: Record<Mood, { icon: string; label: string; color: string }> = {
  peak: { icon: "🔥", label: "Peak", color: "#4ADE80" },
  flowing: { icon: "🌊", label: "Flowing", color: "#2DD4BF" },
  steady: { icon: "🧭", label: "Steady", color: "#60A5FA" },
  grinding: { icon: "🪨", label: "Grinding", color: "#FBBF24" },
  take_a_break: { icon: "☕", label: "Take a break", color: "#F87171" },
};
export const MOOD_ORDER: Mood[] = ["take_a_break", "grinding", "steady", "flowing", "peak"];

/** Seconds of silence before the narration starts in each scene, and after it ends. */
export const LEAD = 0.6;
export const TAIL = 1.0;

export type SceneId = (typeof NARRATION)[number]["id"];
/** Extra hold time (seconds) after the narration, for scenes with a lot to read. */
const EXTRA: Partial<Record<SceneId, number>> = { peak: 2.5, break: 4, report: 2.5, how: 0.5, outro: 1.5, middle: 1 };

export function sceneSeconds(id: SceneId): number {
  return LEAD + (vo as Record<string, number>)[id]! + TAIL + (EXTRA[id] ?? 0);
}

/**
 * Approximate time (in frames, relative to the scene start) at which `phrase` is spoken.
 * Assumes an even speaking rate through the clip, which is close enough to sync visuals.
 */
export function at(id: SceneId, phrase: string, offset = 0): number {
  const text = NARRATION.find((n) => n.id === id)!.text;
  const i = text.indexOf(phrase);
  if (i < 0) throw new Error(`"${phrase}" not in narration for ${id}`);
  const dur = (vo as Record<string, number>)[id]!;
  return Math.round((LEAD + (i / text.length) * dur + offset) * FPS);
}
