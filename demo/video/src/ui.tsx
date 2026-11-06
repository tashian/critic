import React from "react";
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig, Easing } from "remotion";
import { C, MONO, MOOD, SANS, type Mood } from "./theme";

/** Spring progress 0→1 starting at `delay` frames. */
export function useIn(delay: number, damping = 18) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.7 } });
}

export const Bg: React.FC<{ tint?: string; children: React.ReactNode }> = ({ tint = C.accent, children }) => (
  <AbsoluteFill style={{ background: C.bg, fontFamily: SANS, color: C.text }}>
    <AbsoluteFill
      style={{
        background: `radial-gradient(1200px 700px at 85% -10%, ${tint}22, transparent 60%), radial-gradient(900px 600px at -10% 110%, ${C.accent}14, transparent 60%)`,
      }}
    />
    {children}
  </AbsoluteFill>
);

/** Fade the whole scene in and out at its edges. */
export const SceneFade: React.FC<{ dur: number; children: React.ReactNode }> = ({ dur, children }) => {
  const frame = useCurrentFrame();
  const o = interpolate(frame, [0, 10, dur - 10, dur], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
  return <AbsoluteFill style={{ opacity: o }}>{children}</AbsoluteFill>;
};

export const Appear: React.FC<{ at: number; y?: number; x?: number; style?: React.CSSProperties; children: React.ReactNode }> = ({
  at,
  y = 30,
  x = 0,
  style,
  children,
}) => {
  const p = useIn(at);
  return (
    <div style={{ opacity: p, transform: `translate(${(1 - p) * x}px, ${(1 - p) * y}px)`, ...style }}>{children}</div>
  );
};

const TONE = { bad: C.bad, warn: C.warn, good: C.good, info: C.info } as const;
export type Tone = keyof typeof TONE;

export const Chip: React.FC<{ tone: Tone; at: number; size?: number; children: React.ReactNode }> = ({ tone, at, size = 28, children }) => {
  const p = useIn(at, 14);
  const col = TONE[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        padding: `${size * 0.28}px ${size * 0.62}px`,
        borderRadius: 999,
        background: `${col}1F`,
        border: `2px solid ${col}66`,
        color: col,
        fontSize: size,
        fontWeight: 600,
        transform: `scale(${0.6 + 0.4 * p})`,
        opacity: p,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ width: size * 0.36, height: size * 0.36, borderRadius: 99, background: col }} />
      {children}
    </span>
  );
};

/** Reveal text character by character from frame `at`. */
export const Type: React.FC<{ text: string; at: number; cps?: number; style?: React.CSSProperties; caret?: boolean }> = ({
  text,
  at,
  cps = 55,
  style,
  caret,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const n = Math.max(0, Math.min(text.length, Math.floor(((frame - at) / fps) * cps)));
  const typing = n < text.length && frame >= at;
  return (
    <span style={style}>
      {text.slice(0, n)}
      {(typing || caret) && frame >= at ? <span style={{ color: C.accent }}>▍</span> : null}
    </span>
  );
};

export const Window: React.FC<{ title: string; style?: React.CSSProperties; children: React.ReactNode }> = ({ title, style, children }) => (
  <div
    style={{
      background: C.panel,
      border: `2px solid ${C.line}`,
      borderRadius: 24,
      boxShadow: "0 40px 120px rgba(0,0,0,0.55)",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      ...style,
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "18px 24px", borderBottom: `2px solid ${C.line}`, background: C.panel2 }}>
      {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => (
        <span key={c} style={{ width: 16, height: 16, borderRadius: 99, background: c }} />
      ))}
      <span style={{ marginLeft: 16, fontFamily: MONO, fontSize: 24, color: C.sub }}>{title}</span>
    </div>
    {children}
  </div>
);

/** Critic's status line, as it appears under the Claude Code prompt. */
export const StatusLine: React.FC<{ mood: Mood; status: string; size?: number; at: number; glow?: boolean }> = ({
  mood,
  status,
  size = 34,
  at,
  glow = true,
}) => {
  const p = useIn(at, 16);
  const m = MOOD[mood];
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: size * 0.45,
        fontFamily: MONO,
        fontSize: size,
        padding: `${size * 0.4}px ${size * 0.7}px`,
        borderRadius: size * 0.5,
        background: `${m.color}14`,
        border: `2px solid ${m.color}55`,
        boxShadow: glow ? `0 0 ${60 * p}px ${m.color}33` : undefined,
        opacity: p,
        transform: `translateY(${(1 - p) * 20}px)`,
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ fontSize: size * 1.05 }}>{m.icon}</span>
      <span style={{ color: m.color, fontWeight: 700 }}>{m.label}</span>
      <span style={{ color: C.text }}>{status}</span>
    </div>
  );
};

/** Past sessions as dots on a flow axis, with this session's marker sliding into place. */
export const HistoryStrip: React.FC<{
  history: number[];
  value: number;
  pct: number;
  color: string;
  at: number;
  width?: number;
  label?: string;
}> = ({ history, value, pct, color, at, width = 640, label }) => {
  const frame = useCurrentFrame();
  const min = Math.min(...history, value) - 0.2;
  const max = Math.max(...history, value) + 0.2;
  const x = (v: number) => ((v - min) / (max - min)) * width;
  const p = useIn(at + 12, 22);
  const counted = Math.round(interpolate(frame, [at + 12, at + 40], [0, pct], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }));
  return (
    <div style={{ width }}>
      <div style={{ position: "relative", height: 110 }}>
        <div style={{ position: "absolute", top: 70, left: 0, right: 0, height: 2, background: C.line }} />
        {history.map((h, i) => {
          const d = useIn(at + i * 0.6, 20);
          return (
            <span
              key={i}
              style={{
                position: "absolute",
                left: x(h) - 9,
                top: 62 - (i % 3) * 18 + (1 - d) * 30,
                width: 18,
                height: 18,
                borderRadius: 99,
                background: C.faint,
                opacity: d * 0.9,
              }}
            />
          );
        })}
        <div
          style={{
            position: "absolute",
            left: interpolate(p, [0, 1], [width / 2, x(value)]) - 16,
            top: 0,
            opacity: p,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            width: 32,
          }}
        >
          <span style={{ width: 4, height: 54, background: color, borderRadius: 2 }} />
          <span style={{ width: 32, height: 32, borderRadius: 99, background: color, boxShadow: `0 0 30px ${color}` }} />
        </div>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: C.faint, marginTop: 8 }}>
        <span>worse</span>
        <span>{label ?? `${history.length} past sessions`}</span>
        <span>better</span>
      </div>
      <div style={{ marginTop: 18, fontSize: 64, fontWeight: 800, color, opacity: p, letterSpacing: -1 }}>
        {counted}
        <span style={{ fontSize: 34 }}>{ordinal(counted)} percentile</span>
      </div>
    </div>
  );
};

export function ordinal(n: number) {
  const s = n % 100;
  if (s >= 11 && s <= 13) return "th";
  return ["th", "st", "nd", "rd"][n % 10] ?? "th";
}

export const Stat: React.FC<{ value: number; suffix?: string; label: string; color: string; at: number }> = ({ value, suffix, label, color, at }) => {
  const frame = useCurrentFrame();
  const p = useIn(at);
  const v = Math.round(interpolate(frame, [at, at + 24], [0, value], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }));
  return (
    <div style={{ opacity: p, transform: `translateY(${(1 - p) * 24}px)` }}>
      <div style={{ fontSize: 88, fontWeight: 800, color, lineHeight: 1, letterSpacing: -2 }}>
        {v}
        {suffix ? <span style={{ fontSize: 44, fontWeight: 700 }}>{suffix}</span> : null}
      </div>
      <div style={{ fontSize: 30, color: C.sub, marginTop: 8 }}>{label}</div>
    </div>
  );
};

/** First n sentences of a string. */
export function sentences(s: string, from: number, to: number) {
  const parts = s.match(/[^.!?]+[.!?]+(\s|$)/g) ?? [s];
  return parts.slice(from, to).join("").trim();
}

export function clip(s: string, n: number) {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length > n ? one.slice(0, n - 1) + "…" : one;
}
