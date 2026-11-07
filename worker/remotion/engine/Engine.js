import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { h, FONT, clamp, prog, easeOut, lerp } from "./util.js";
import { Background, SceneBody } from "./scenes.js";

// Entry animation of a scene while the previous one is still underneath.
function transitionStyle(kind, p) {
  const e = easeOut(p);
  if (p >= 1 || !kind) return {};
  if (kind === "slide") return { transform: `translateX(${(1 - e) * 1080}px)` };
  if (kind === "slideUp") return { transform: `translateY(${(1 - e) * 1920}px)` };
  if (kind === "zoom") return { opacity: e, transform: `scale(${lerp(1.3, 1, e)})` };
  if (kind === "wipe") return { clipPath: `inset(0 ${(1 - e) * 100}% 0 0)` };
  if (kind === "swing") return { transformOrigin: "0% 50%", transform: `perspective(1800px) rotateY(${(1 - e) * -95}deg)` };
  if (kind === "flip") return { transformOrigin: "50% 0%", transform: `perspective(1800px) rotateX(${(1 - e) * 90}deg)` };
  if (kind === "circle") return { clipPath: `circle(${e * 160}% at 50% 50%)` };
  return { opacity: e };
}

function SceneFrame({ s, theme, channel, overlap }) {
  const frame = useCurrentFrame(), { fps } = useVideoConfig();
  const lead = s.i === 0 ? 0 : overlap * fps, t = (frame - lead) / fps;
  const p = s.i === 0 ? 1 : clamp(frame / (overlap * fps));
  return h(AbsoluteFill, { style: transitionStyle(s.transition, p) },
    h(Background, { frame, theme, idx: s.i, image: s.image }),
    // slow camera move: a gentle 3D sway and push-in over the whole scene
    h("div", { style: { position: "absolute", inset: 0, transform: `perspective(2200px) rotateY(${2.2 * Math.sin(t * 0.5 + s.i)}deg) rotateX(${-1.4 * Math.cos(t * 0.4)}deg) scale(${1 + 0.035 * clamp(t / s.dur)})` } },
      h(SceneBody, { s, t, theme, channel })));
}

export const Engine = ({ scenes = [], theme, channel, durationSec = 5, hasVoice, hasScore, overlap = 0.4 }) => {
  const frame = useCurrentFrame(), { fps, durationInFrames } = useVideoConfig();
  return h(AbsoluteFill, { style: { fontFamily: FONT, color: "white", background: theme.bg1 } },
    hasVoice ? h(Audio, { src: staticFile("voice.wav") }) : null,
    hasScore ? h(Audio, { src: staticFile("score.wav") }) : null,
    ...scenes.map((s, i) => {
      const from = i === 0 ? 0 : Math.round((s.start - overlap) * fps);
      const end = i < scenes.length - 1 ? Math.round(scenes[i + 1].start * fps) : durationInFrames;
      return h(Sequence, { key: i, from, durationInFrames: Math.max(1, end - from) }, h(SceneFrame, { s, theme, channel, overlap }));
    }),
    h("div", { style: { position: "absolute", top: 0, left: 0, height: 10, width: `${(frame / durationInFrames) * 100}%`, background: theme.accent } }),
    channel ? h("div", { style: { position: "absolute", top: 90, width: "100%", textAlign: "center", fontSize: 36, fontWeight: 700, letterSpacing: 2, opacity: 0.8 } }, channel) : null);
};
