import React from "react";
import { Composition } from "remotion";
import { Engine } from "./engine/Engine.js";

export const Root = () => (
  <Composition
    id="Engine"
    component={Engine}
    width={1080}
    height={1920}
    fps={30}
    durationInFrames={150}
    defaultProps={{ scenes: [], theme: { accent: "#00e676", bg1: "#0d1024", bg2: "#3a1c6e" }, channel: "", durationSec: 5, hasVoice: false, hasScore: false, overlap: 0.4 }}
    calculateMetadata={({ props }) => ({ durationInFrames: Math.max(60, Math.ceil(props.durationSec * 30)) })}
  />
);
