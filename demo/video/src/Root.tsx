import React from "react";
import { Composition } from "remotion";
import { CriticDemo, totalFrames } from "./Video";
import { FPS, H, W } from "./theme";

export const Root: React.FC = () => (
  <Composition id="CriticDemo" component={CriticDemo} durationInFrames={totalFrames()} fps={FPS} width={W} height={H} />
);
