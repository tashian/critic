import React from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, Easing } from "remotion";
import data from "./data.json";
import { at, C, MONO, MOOD, MOOD_ORDER, type Mood } from "./theme";
import { Appear, Bg, Chip, clip, HistoryStrip, sentences, Stat, StatusLine, Type, useIn, Window, type Tone } from "./ui";

type Session = (typeof data.sessions)["peak"];
const S = data.sessions as unknown as Record<string, Session>;

const Center: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
  <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", ...style }}>{children}</AbsoluteFill>
);

const Wordmark: React.FC<{ size: number }> = ({ size }) => (
  <div style={{ display: "flex", alignItems: "center", gap: size * 0.22 }}>
    <span style={{ color: C.accent, fontSize: size * 0.8, lineHeight: 1 }}>✻</span>
    <span style={{ fontSize: size, fontWeight: 800, letterSpacing: -size * 0.03, lineHeight: 1 }}>Critic</span>
  </div>
);

// ---------- 1. intro ----------

export const Intro: React.FC = () => {
  const p = useIn(4, 14);
  return (
    <Bg>
      <Center>
        <div style={{ transform: `scale(${0.85 + 0.15 * p})`, opacity: p }}>
          <Wordmark size={200} />
        </div>
        <Appear at={at("intro", "A session coach")} style={{ marginTop: 36 }}>
          <div style={{ fontSize: 64, color: C.sub, fontWeight: 500 }}>
            A session coach for <span style={{ color: C.text }}>Claude Code</span>
          </div>
        </Appear>
        <div style={{ marginTop: 90 }}>
          <StatusLine mood="peak" status={S.peak!.verdict.status} at={at("intro", "A session coach", 0.9)} size={38} />
        </div>
      </Center>
    </Bg>
  );
};

// ---------- 2. problem ----------

const Draw: React.FC<{ d: string; color: string; at: number; len?: number; width?: number }> = ({ d, color, at: start, len = 2000, width = 10 }) => {
  const frame = useCurrentFrame();
  const t = interpolate(frame, [start, start + 40], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.cubic) });
  return (
    <path d={d} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={len} strokeDashoffset={len * (1 - t)} />
  );
};

export const Problem: React.FC = () => {
  const fly = at("problem", "Some sessions fly");
  const circles = at("problem", "Others go");
  const tell = at("problem", "And while");
  return (
    <Bg>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 120, paddingBottom: 140 }}>
        <Appear at={fly} style={{ width: 640 }}>
          <svg width={640} height={300} viewBox="0 0 640 300">
            <Draw d="M20 270 C 140 260, 200 220, 280 170 S 440 60, 620 30" color={C.good} at={fly} />
          </svg>
          <div style={{ fontSize: 84, fontWeight: 800, marginTop: 20 }}>Some sessions fly.</div>
        </Appear>
        <Appear at={circles} style={{ width: 640 }}>
          <svg width={640} height={300} viewBox="0 0 640 300">
            <Draw
              d="M40 150 C 90 40, 220 40, 230 150 C 240 260, 110 260, 130 150 C 150 40, 300 40, 320 150 C 340 260, 200 260, 220 150 C 240 40, 400 40, 420 150 C 440 260, 300 260, 320 150 C 340 40, 520 40, 600 150"
              color={C.bad}
              at={circles}
              len={3000}
            />
          </svg>
          <div style={{ fontSize: 84, fontWeight: 800, marginTop: 20 }}>Others go in circles.</div>
        </Appear>
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 150 }}>
        <Appear at={tell}>
          <div style={{ fontSize: 56, color: C.sub }}>
            From inside a session, it's <span style={{ color: C.text, fontWeight: 700 }}>hard to tell which</span>.
          </div>
        </Appear>
      </AbsoluteFill>
    </Bg>
  );
};

// ---------- 3. how it works ----------

const Card: React.FC<{ n: number; title: string; at: number; children?: React.ReactNode; width?: number }> = ({ n, title, at: start, children, width = 540 }) => (
  <Appear at={start} y={50} style={{ width }}>
    <div style={{ background: C.panel, border: `2px solid ${C.line}`, borderRadius: 28, padding: 44, minHeight: 720, boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
        <span style={{ width: 64, height: 64, borderRadius: 99, background: `${C.accent}26`, color: C.accent, fontSize: 36, fontWeight: 800, display: "grid", placeItems: "center" }}>{n}</span>
      </div>
      <div style={{ fontSize: 48, fontWeight: 800, marginTop: 26, lineHeight: 1.15 }}>{title}</div>
      <div style={{ marginTop: 36 }}>{children}</div>
    </div>
  </Appear>
);

export const How: React.FC = () => {
  const bad: [string, string][] = [["corrections", "corrections"], ["interrupts", "interrupts"], ["repeated prompts", "repeated prompts"], ["tool errors", "tool errors"]];
  const good: [string, string][] = [["commits", "commits"], ["passing tests", "passing tests"], ["praise", "praise"]];
  const cmp = at("how", "Then it compares");
  const peak = S.peak!;
  return (
    <Bg>
      <AbsoluteFill style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 48 }}>
        <Card n={1} title="Reads your live session" at={at("how", "Critic reads")} width={600}>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {bad.map(([label, word]) => (
              <Chip key={label} tone="bad" at={at("how", word)} size={30}>{label}</Chip>
            ))}
          </div>
          <div style={{ fontSize: 30, color: C.faint, margin: "26px 0 18px" }}>weighed against</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
            {good.map(([label, word]) => (
              <Chip key={label} tone="good" at={at("how", word)} size={30}>{label}</Chip>
            ))}
          </div>
        </Card>
        <Card n={2} title="Compares it with every past session" at={cmp} width={600}>
          <HistoryStrip history={data.history} value={peak.flow} pct={peak.flowPct} color={MOOD.peak.color} at={cmp + 10} width={510} label="28 past sessions" />
          <div style={{ fontSize: 28, color: C.sub, marginTop: 18, lineHeight: 1.35 }}>Ranks are against <i>your</i> sessions, not anyone else's.</div>
        </Card>
        <Card n={3} title="One verdict and one habit" at={at("how", "you have run before", 0.8)} width={500}>
          <div style={{ display: "flex", flexDirection: "column", gap: 20, fontSize: 40 }}>
            {MOOD_ORDER.slice().reverse().map((m, i) => (
              <Appear key={m} at={at("how", "you have run before", 1.0) + i * 4} x={-20} y={0}>
                <span style={{ fontSize: 40 }}>{MOOD[m].icon}</span>
                <span style={{ marginLeft: 18, color: MOOD[m].color, fontWeight: 700 }}>{MOOD[m].label}</span>
              </Appear>
            ))}
          </div>
        </Card>
      </AbsoluteFill>
    </Bg>
  );
};

// ---------- 4. the scale ----------

export const Scale: React.FC = () => {
  const frame = useCurrentFrame();
  const hiPeak = at("scale", "from peak");
  const hiBreak = at("scale", "to take a break");
  const habit = at("scale", "plus one prompting habit");
  const h = S.peak!.verdict.habit;
  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <Appear at={0}>
          <div style={{ fontSize: 56, fontWeight: 700, color: C.sub }}>Five verdicts, measured against <span style={{ color: C.text }}>your own history</span></div>
        </Appear>
        <div style={{ display: "flex", gap: 56, marginTop: 90, alignItems: "flex-end" }}>
          {MOOD_ORDER.map((m, i) => {
            const lit = (m === "peak" && frame >= hiPeak && frame < hiBreak + 20) || (m === "take_a_break" && frame >= hiBreak);
            const s = useIn(8 + i * 5);
            const glow = lit ? 1 : 0;
            return (
              <div key={m} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 26, opacity: s, transform: `translateY(${(1 - s) * 40}px) scale(${1 + glow * 0.08})` }}>
                <div
                  style={{
                    width: 200,
                    height: 200,
                    borderRadius: 999,
                    display: "grid",
                    placeItems: "center",
                    fontSize: 104,
                    background: `${MOOD[m].color}${lit ? "33" : "14"}`,
                    border: `4px solid ${MOOD[m].color}${lit ? "" : "55"}`,
                    boxShadow: lit ? `0 0 80px ${MOOD[m].color}66` : "none",
                  }}
                >
                  {MOOD[m].icon}
                </div>
                <div style={{ fontSize: 42, fontWeight: 700, color: MOOD[m].color }}>{MOOD[m].label}</div>
              </div>
            );
          })}
        </div>
        <Appear at={habit} style={{ marginTop: 90 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 28, background: C.panel, border: `2px solid ${C.line}`, borderRadius: 24, padding: "28px 44px" }}>
            <span style={{ fontSize: 34, color: C.accent, fontWeight: 800, letterSpacing: 2 }}>+ HABIT</span>
            <span style={{ fontSize: 44, fontWeight: 700 }}>{h.name}</span>
          </div>
        </Appear>
      </AbsoluteFill>
    </Bg>
  );
};

// ---------- 5 & 7. session close-ups ----------

const Prompt: React.FC<{ index: number; text: string; tags: { label: string; tone: string }[]; at: number; highlight?: string[]; max?: number }> = ({
  index,
  text,
  tags,
  at: start,
  highlight = [],
  max = 120,
}) => {
  const t = clip(text, max);
  return (
    <Appear at={start} y={20} style={{ marginBottom: 30 }}>
      <div style={{ display: "flex", gap: 18, fontFamily: MONO, fontSize: 32, lineHeight: 1.35 }}>
        <span style={{ color: C.faint, width: 56, flexShrink: 0, textAlign: "right" }}>#{index}</span>
        <span style={{ color: C.accent }}>❯</span>
        <span style={{ color: C.text }}>
          {highlight.length
            ? t.split(new RegExp(`(${highlight.map((h) => h.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`)).map((part, i) =>
                highlight.includes(part) ? (
                  <span key={i} style={{ color: C.good, fontWeight: 700 }}>{part}</span>
                ) : (
                  <span key={i}>{part}</span>
                ),
              )
            : t}
        </span>
      </div>
      {tags.length ? (
        <div style={{ display: "flex", gap: 12, marginTop: 14, marginLeft: 108, flexWrap: "wrap" }}>
          {tags.map((tg, i) => (
            <Chip key={tg.label} tone={tg.tone as Tone} at={start + 8 + i * 4} size={24}>{tg.label}</Chip>
          ))}
        </div>
      ) : null}
    </Appear>
  );
};

const HookCard: React.FC<{ mood: Mood; at: number; body: string; next?: string; nextLabel?: string; nextAt?: number }> = ({ mood, at: start, body, next, nextLabel = "Next", nextAt }) => {
  const p = useIn(start, 20);
  const m = MOOD[mood];
  const n = useIn(nextAt ?? start, 20);
  return (
    <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 56 }}>
      <AbsoluteFill style={{ background: `rgba(13,14,18,${0.72 * p})` }} />
      <div
        style={{
          width: 1700,
          transform: `translateY(${(1 - p) * 120}px)`,
          opacity: p,
          background: C.panel2,
          border: `3px solid ${m.color}88`,
          borderRadius: 28,
          padding: "40px 52px",
          boxShadow: `0 30px 120px rgba(0,0,0,0.6), 0 0 80px ${m.color}22`,
        }}
      >
        <div style={{ fontSize: 30, color: C.sub, fontWeight: 600, letterSpacing: 1 }}>
          <span style={{ fontSize: 34 }}>{m.icon}</span> <span style={{ color: m.color, fontWeight: 800 }}>Critic · {m.label}</span>
          <span style={{ color: C.faint }}> — shown once, by the Stop hook</span>
        </div>
        <div style={{ fontSize: 40, lineHeight: 1.4, marginTop: 20, fontWeight: 500 }}>{body}</div>
        {next ? (
          <div style={{ marginTop: 28 * n, maxHeight: 420 * n, overflow: "hidden", opacity: n, background: C.bg, borderRadius: 18, padding: `${24 * n}px 30px`, border: `2px solid ${C.line}` }}>
            <div style={{ fontSize: 26, color: C.accent, fontWeight: 800, letterSpacing: 2 }}>{nextLabel.toUpperCase()}</div>
            <div style={{ fontSize: 33, lineHeight: 1.45, marginTop: 10, color: C.text }}>{next}</div>
          </div>
        ) : null}
      </div>
    </AbsoluteFill>
  );
};

const Header: React.FC<{ mood: Mood; s: Session }> = ({ mood, s }) => (
  <Appear at={0} style={{ position: "absolute", top: 64, left: 110 }}>
    <div style={{ display: "flex", alignItems: "baseline", gap: 24 }}>
      <span style={{ fontSize: 30, color: C.faint, fontWeight: 700, letterSpacing: 3 }}>SESSION</span>
      <span style={{ fontSize: 52, fontWeight: 800 }}>{s.title}</span>
      <span style={{ fontSize: 30, color: C.sub }}>
        {s.project} · {s.prompts} prompts · {s.activeMin} min
      </span>
    </div>
  </Appear>
);

export const Peak: React.FC = () => {
  const s = S.peak!;
  const ex = s.exchanges;
  const v = s.verdict;
  const goal = at("peak", "The first prompt");
  const stats = at("peak", "Four commits");
  const pct = at("peak", "That beats");
  const why = at("peak", "and Critic says why", -0.4);
  return (
    <Bg tint={MOOD.peak.color}>
      <Header mood="peak" s={s} />
      <div style={{ position: "absolute", top: 170, left: 110, display: "flex", gap: 70 }}>
        <Window title={`~/code/${s.project}  —  claude`} style={{ width: 1060, height: 780 }}>
          <div style={{ padding: "36px 36px 0", flex: 1 }}>
            <Prompt index={ex[0]!.index} text={ex[0]!.prompt} tags={ex[0]!.tags} at={goal - 10} highlight={["Goal:", "Done ="]} max={170} />
            {ex.slice(1).map((e, i) => (
              <Prompt key={e.index} index={e.index} text={e.prompt} tags={e.tags} at={goal + 30 + i * 22} max={80} />
            ))}
          </div>
          <div style={{ borderTop: `2px solid ${C.line}`, padding: "22px 30px" }}>
            <StatusLine mood="peak" status={v.status} at={stats + 20} size={30} />
          </div>
        </Window>
        <div style={{ width: 600, paddingTop: 20 }}>
          <div style={{ display: "flex", gap: 56 }}>
            <Stat value={s.stats.commits} label="commits" color={C.good} at={stats} />
            <Stat value={s.stats.corrections} label="corrections" color={C.good} at={stats + 8} />
            <Stat value={s.activeMin} suffix="m" label="to a merged PR" color={C.text} at={stats + 16} />
          </div>
          <div style={{ marginTop: 80 }}>
            <div style={{ fontSize: 30, color: C.sub, marginBottom: 10 }}>Flow vs. this developer's history</div>
            <HistoryStrip history={data.history} value={s.flow} pct={s.flowPct} color={MOOD.peak.color} at={pct - 16} width={600} />
          </div>
        </div>
      </div>
      <HookCard mood="peak" at={why} body={sentences(v.message, 2, 3)} next={v.habit.try_next} nextAt={why + 45} />
    </Bg>
  );
};

export const Middle: React.FC = () => {
  const cols: { m: Mood; at: number }[] = [
    { m: "flowing", at: at("middle", "Flowing") },
    { m: "steady", at: at("middle", "Steady") },
    { m: "grinding", at: at("middle", "Or grinding") },
  ];
  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 100 }}>
        <Appear at={0}>
          <div style={{ fontSize: 60, fontWeight: 800 }}>Most sessions land in the middle</div>
        </Appear>
        <div style={{ display: "flex", gap: 44, marginTop: 70 }}>
          {cols.map(({ m, at: start }) => {
            const s = S[m]!;
            const e = s.exchanges.at(-1)!;
            return (
              <Appear key={m} at={start} y={50} style={{ width: 540 }}>
                <div style={{ background: C.panel, border: `3px solid ${MOOD[m].color}55`, borderRadius: 28, padding: 44, height: 640, boxSizing: "border-box", display: "flex", flexDirection: "column" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
                    <span style={{ fontSize: 84 }}>{MOOD[m].icon}</span>
                    <span style={{ fontSize: 60, fontWeight: 800, color: MOOD[m].color }}>{MOOD[m].label}</span>
                  </div>
                  <div style={{ fontSize: 26, color: C.faint, marginTop: 26, letterSpacing: 2, fontWeight: 700 }}>{s.title.toUpperCase()}</div>
                  <div style={{ fontSize: 42, fontWeight: 700, lineHeight: 1.25, marginTop: 14 }}>{s.verdict.status}</div>
                  <div style={{ flex: 1 }} />
                  <div style={{ fontFamily: MONO, fontSize: 26, color: C.sub, lineHeight: 1.45 }}>
                    <span style={{ color: C.accent }}>❯ </span>
                    {clip(e.prompt, 92)}
                  </div>
                  <div style={{ display: "flex", gap: 10, marginTop: 16, flexWrap: "wrap" }}>
                    {e.tags.map((t, i) => (
                      <Chip key={t.label} tone={t.tone as Tone} at={start + 14 + i * 4} size={24}>{t.label}</Chip>
                    ))}
                  </div>
                </div>
              </Appear>
            );
          })}
        </div>
        <Appear at={at("middle", "Critic does not")} style={{ marginTop: 50 }}>
          <div style={{ fontSize: 44, color: C.sub }}>No drama for a normal session.</div>
        </Appear>
      </AbsoluteFill>
    </Bg>
  );
};

export const Break: React.FC = () => {
  const s = S.take_a_break!;
  const ex = s.exchanges;
  const v = s.verdict;
  const loop = at("break", "And this session");
  const hours = at("break", "Nearly three hours");
  const corr = at("break", "Ten corrections");
  const same = at("break", "The same prompt");
  const step = at("break", "Critic says", 0.2);
  const type = at("break", "And it tells you");
  const frame = useCurrentFrame();
  const pulse = frame >= same && frame < step ? 0.5 + 0.5 * Math.sin((frame - same) / 4) : 0;
  return (
    <Bg tint={MOOD.take_a_break.color}>
      <Header mood="take_a_break" s={s} />
      <div style={{ position: "absolute", top: 170, left: 110, display: "flex", gap: 70 }}>
        <Window title={`~/code/${s.project}  —  claude`} style={{ width: 1060, height: 780 }}>
          <div style={{ padding: "36px 36px 0", flex: 1, position: "relative" }}>
            {ex.map((e, i) => (
              <div key={e.index} style={{ background: i !== 2 ? `rgba(248,113,113,${0.16 * pulse})` : undefined, borderRadius: 14, margin: "0 -14px", padding: "0 14px" }}>
                <Prompt index={e.index} text={e.prompt} tags={e.tags} at={loop + i * 16} max={84} />
              </div>
            ))}
          </div>
          <div style={{ borderTop: `2px solid ${C.line}`, padding: "22px 30px" }}>
            <StatusLine mood="take_a_break" status={v.status} at={corr + 20} size={30} />
          </div>
        </Window>
        <div style={{ width: 600, paddingTop: 20, display: "grid", gridTemplateColumns: "1fr 1fr", rowGap: 70, columnGap: 40, alignContent: "start" }}>
          <Stat value={s.activeMin} suffix=" min" label="longest session on record" color={C.bad} at={hours} />
          <Stat value={s.stats.corrections} label="corrections" color={C.bad} at={corr} />
          <Stat value={s.stats.commits} label="commits" color={C.bad} at={corr + 12} />
          <Stat value={s.frictionPct} suffix="th" label="percentile friction" color={C.bad} at={same} />
        </div>
      </div>
      <HookCard mood="take_a_break" at={step} body={sentences(v.message, 3, 5)} next={v.habit.try_next} nextLabel="When you come back" nextAt={type} />
    </Bg>
  );
};

// ---------- 8. report ----------

function section(md: string, heading: string): string[] {
  const i = md.indexOf(`## ${heading}`);
  if (i < 0) return [];
  const rest = md.slice(i).split("\n").slice(1);
  const out: string[] = [];
  for (const l of rest) {
    if (l.startsWith("## ")) break;
    const m = l.match(/^\s*(?:[-*•]|\d+\.)\s+(.*)/);
    if (m) out.push(m[1]!.replace(/\*\*/g, "").replace(/`/g, ""));
  }
  return out;
}

export const Report: React.FC = () => {
  const md = S.take_a_break!.report ?? "";
  const blocks = [
    { h: "What went well", at: at("report", "what went well"), color: C.good, items: section(md, "What went well").slice(0, 1) },
    { h: "Where it dragged", at: at("report", "where it dragged"), color: C.warn, items: section(md, "Where it dragged").slice(0, 1) },
    { h: "From your best sessions", at: at("report", "what your own best"), color: C.accent, items: section(md, "From your best sessions").slice(0, 1) },
  ];
  return (
    <Bg>
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 80 }}>
        <div style={{ width: 1600 }}>
          <div style={{ fontFamily: MONO, fontSize: 44 }}>
            <span style={{ color: C.accent }}>❯ </span>
            <Type text="/critic" at={6} cps={12} />
          </div>
          <Appear at={at("report", "for the full retro")} style={{ marginTop: 40 }}>
            <div style={{ background: C.panel, border: `2px solid ${C.line}`, borderRadius: 28, padding: "44px 56px" }}>
              <div style={{ fontSize: 56, fontWeight: 800 }}>Critic report</div>
              {blocks.map((b) => (
                <Appear key={b.h} at={b.at} style={{ marginTop: 36 }}>
                  <div style={{ fontSize: 30, fontWeight: 800, color: b.color, letterSpacing: 2 }}>{b.h.toUpperCase()}</div>
                  {b.items.map((it) => (
                    <div key={it} style={{ fontSize: 36, lineHeight: 1.4, marginTop: 10 }}>{clip(it, 300)}</div>
                  ))}
                </Appear>
              ))}
            </div>
          </Appear>
        </div>
      </AbsoluteFill>
    </Bg>
  );
};

// ---------- 9. outro ----------

export const Outro: React.FC = () => {
  const items = [
    { k: "Status line", d: "A live verdict under every prompt", at: at("outro", "It lives") },
    { k: "Stop hook", d: "Speaks up once, at a peak or a loop", at: at("outro", "It celebrates") },
    { k: "/critic", d: "The full retro, on demand", at: at("outro", "catches the loops") },
  ];
  return (
    <Bg>
      <Center>
        <Appear at={0}>
          <Wordmark size={170} />
        </Appear>
        <div style={{ display: "flex", gap: 40, marginTop: 90 }}>
          {items.map((it) => (
            <Appear key={it.k} at={it.at} style={{ width: 480 }}>
              <div style={{ background: C.panel, border: `2px solid ${C.line}`, borderRadius: 24, padding: "34px 38px" }}>
                <div style={{ fontFamily: MONO, fontSize: 40, fontWeight: 700, color: C.accent }}>{it.k}</div>
                <div style={{ fontSize: 32, color: C.sub, marginTop: 12, lineHeight: 1.3 }}>{it.d}</div>
              </div>
            </Appear>
          ))}
        </div>
        <Appear at={at("outro", "It celebrates")} style={{ marginTop: 90 }}>
          <div style={{ fontSize: 60, fontWeight: 800 }}>
            Celebrate the <span style={{ color: C.good }}>peaks</span>. Catch the <span style={{ color: C.bad }}>loops</span>.
          </div>
        </Appear>
      </Center>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", paddingBottom: 40 }}>
        <div style={{ fontSize: 24, color: C.faint }}>Synthetic sessions and history. Verdicts and report are real Critic output.</div>
      </AbsoluteFill>
    </Bg>
  );
};
