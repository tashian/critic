import React from "react";
import { AbsoluteFill, Audio, interpolate, Sequence, Series, staticFile } from "remotion";
import { Break, How, Intro, Middle, Outro, Peak, Problem, Report, Scale } from "./scenes";
import { FPS, LEAD, sceneSeconds, type SceneId } from "./theme";
import { SceneFade } from "./ui";

const SCENES: { id: SceneId; C: React.FC }[] = [
  { id: "intro", C: Intro },
  { id: "problem", C: Problem },
  { id: "how", C: How },
  { id: "scale", C: Scale },
  { id: "peak", C: Peak },
  { id: "middle", C: Middle },
  { id: "break", C: Break },
  { id: "report", C: Report },
  { id: "outro", C: Outro },
];

const frames = (id: SceneId) => Math.round(sceneSeconds(id) * FPS);
export const totalFrames = () => SCENES.reduce((n, s) => n + frames(s.id), 0);

export const CriticDemo: React.FC = () => {
  const total = totalFrames();
  return (
    <AbsoluteFill>
      <Series>
        {SCENES.map(({ id, C }) => (
          <Series.Sequence key={id} durationInFrames={frames(id)}>
            <SceneFade dur={frames(id)}>
              <C />
            </SceneFade>
            <Sequence from={Math.round(LEAD * FPS)}>
              <Audio src={staticFile(`vo/${id}.wav`)} />
            </Sequence>
          </Series.Sequence>
        ))}
      </Series>
      <Audio
        src={staticFile("music.mp3")}
        volume={(f) => interpolate(f, [0, 30, total - 75, total], [0, 0.13, 0.13, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })}
      />
    </AbsoluteFill>
  );
};
