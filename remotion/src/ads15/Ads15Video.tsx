import { AbsoluteFill, Audio, Sequence, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import manifest from "../../public/audio-manifest.json";
import { theme } from "../theme";
import { Backdrop } from "../components/Backdrop";
import { ADS15_BEATS, type Ads15Clip } from "./beats";
import { A15Hook } from "./A15Hook";
import { A15System } from "./A15System";
import { A15Rules } from "./A15Rules";
import { A15Cta } from "./A15Cta";
import { CaptionTrack } from "./CaptionTrack";
import { useAds15Layout } from "./layout";

const clips = ((manifest as unknown as { ads15?: Ads15Clip[] }).ads15 ?? []) as Ads15Clip[];
const clipOf = (id: string) => clips.find((c) => c.id === id);

const SCENES = {
  hook: A15Hook,
  system: A15System,
  rules: A15Rules,
  cta: A15Cta,
} as const;

/** Music bed ducks under every VO line so the narration always reads. */
const bedVolume = (frame: number, fps: number) => {
  const t = frame / fps;
  let duck = 1;
  for (const beat of ADS15_BEATS) {
    const clip = clipOf(beat.vo);
    if (!clip) continue;
    const start = beat.voStart;
    const end = start + clip.durationSeconds;
    if (t > start - 0.28 && t < end + 0.34) {
      const inRamp = Math.min(1, Math.max(0, (t - (start - 0.28)) / 0.28));
      const outRamp = Math.min(1, Math.max(0, (end + 0.34 - t) / 0.34));
      duck = Math.min(duck, 1 - 0.56 * Math.min(inRamp, outRamp));
    }
  }
  return 0.9 * duck;
};

const Watermark: React.FC = () => {
  const layout = useAds15Layout();
  return (
    <div
      style={{
        position: "absolute",
        top: layout.kind === "vertical" ? 54 : 40,
        right: layout.padX * 0.6,
        fontFamily: theme.font,
        fontWeight: 800,
        fontSize: layout.chip * 0.92,
        letterSpacing: -0.5,
        color: "rgba(248,250,252,0.72)",
      }}
    >
      Titan<span style={{ color: theme.accent }}>AI</span>
    </div>
  );
};

export const Ads15Video: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
      <Backdrop />

      {ADS15_BEATS.map((beat) => {
        const Scene = SCENES[beat.id];
        return (
          <Sequence
            key={beat.id}
            from={Math.round(beat.start * fps)}
            durationInFrames={Math.round(beat.duration * fps)}
            layout="none"
          >
            <Scene />
          </Sequence>
        );
      })}

      <Watermark />

      {/* voiceover + burned-in captions */}
      {ADS15_BEATS.map((beat) => {
        const clip = clipOf(beat.vo);
        if (!clip) return null;
        const from = Math.round(beat.voStart * fps);
        return (
          <Sequence
            key={`vo-${beat.id}`}
            from={from}
            durationInFrames={Math.ceil(clip.durationSeconds * fps) + 2}
            layout="none"
          >
            <Audio src={staticFile(clip.audio)} volume={1} />
            {clip.words ? <CaptionTrack words={clip.words} offset={0} /> : null}
          </Sequence>
        );
      })}

      <Audio
        src={staticFile("audio/ads-bed-15.mp3")}
        volume={(f) => bedVolume(f, fps)}
      />

      {/* opening / closing polish */}
      <AbsoluteFill
        style={{
          background: "#000",
          opacity: frame < fps * 0.12 ? 1 - frame / (fps * 0.12) : 0,
        }}
      />
    </AbsoluteFill>
  );
};
