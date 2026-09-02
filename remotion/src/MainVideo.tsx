import { AbsoluteFill, Audio, Sequence, staticFile, useVideoConfig } from "remotion";
import manifestJson from "../public/audio-manifest.json";
import { ADS_BEATS, MAIN_BEATS, buildTimeline, type AudioManifest } from "./timeline";
import { Backdrop } from "./components/Backdrop";
import { HookScene } from "./scenes/HookScene";
import { ProblemScene } from "./scenes/ProblemScene";
import { SolutionScene } from "./scenes/SolutionScene";
import { FeatureScene } from "./scenes/FeatureScene";
import { TransformScene } from "./scenes/TransformScene";
import { BrandScene } from "./scenes/BrandScene";
import { CtaScene } from "./scenes/CtaScene";
import { theme } from "./theme";

const manifest = manifestJson as unknown as AudioManifest;

export const getTimeline = (variant: "main" | "ads", fps: number) =>
  buildTimeline(variant === "main" ? MAIN_BEATS : ADS_BEATS, variant === "main" ? manifest.main : manifest.ads, fps);

export const MainVideo: React.FC<{ variant?: "main" | "ads" }> = ({ variant = "main" }) => {
  const { fps } = useVideoConfig();
  const { placed } = getTimeline(variant, fps);
  const clips = variant === "main" ? manifest.main : manifest.ads;
  const clipById = new Map(clips.map((c) => [c.id, c]));

  let featureIndex = -1;

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
      <Backdrop />

      {placed.map((beat) => {
        if (beat.kind === "feature") featureIndex += 1;
        const idx = featureIndex;
        const clip = beat.vo ? clipById.get(beat.vo) : undefined;
        return (
          <Sequence
            key={beat.id}
            from={beat.fromFrame}
            durationInFrames={beat.durationFrames}
            layout="none"
          >
            {clip ? <Audio src={staticFile(clip.audio)} /> : null}
            <AbsoluteFill>
              {beat.kind === "hook" ? <HookScene beat={beat} /> : null}
              {beat.kind === "problem" ? <ProblemScene beat={beat} /> : null}
              {beat.kind === "solution" ? <SolutionScene beat={beat} /> : null}
              {beat.kind === "feature" ? <FeatureScene beat={beat} index={idx} /> : null}
              {beat.kind === "transform" ? <TransformScene beat={beat} /> : null}
              {beat.kind === "brand" ? <BrandScene beat={beat} /> : null}
              {beat.kind === "cta" ? <CtaScene beat={beat} /> : null}
            </AbsoluteFill>
          </Sequence>
        );
      })}
    </AbsoluteFill>
  );
};
