import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { Logo } from "../components/Logo";
import { Caption } from "../components/Caption";
import type { AudioManifest } from "../types";

export const Scene1: React.FC<{ manifest: AudioManifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round(manifest.introSeconds * fps);
  const duration = Math.round(manifest.scenes[0].durationSeconds * fps) + Math.round(manifest.gapSeconds * fps);
  const end = start + duration;

  const bgShake = interpolate(frame, [start, end], [0, 4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineOpacity = interpolate(frame, [start + fps * 0.3, start + fps * 0.6], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  const lineScale = interpolate(frame, [start + fps * 0.3, start + fps * 0.8], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  if (frame < start - 5 || frame > end) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 24,
      }}
    >
      <div style={{ transform: `translateX(${Math.sin(frame * 0.15) * bgShake}px)` }}>
        <Logo variant="full" />
      </div>
      <Caption
        text="Most traders lose money to fees and emotion."
        startFrame={start + fps * 0.2}
        endFrame={end}
      />
      <div
        style={{
          opacity: lineOpacity,
          transform: `scaleX(${lineScale})`,
          width: 220,
          height: 4,
          borderRadius: 4,
          background: "linear-gradient(90deg, #ef4444, #f97316)",
          marginTop: 18,
        }}
      />
    </AbsoluteFill>
  );
};
