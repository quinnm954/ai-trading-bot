import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { Logo } from "../components/Logo";
import { Caption } from "../components/Caption";
import { Badge } from "../components/Badge";
import type { AudioManifest } from "../types";

export const Scene5: React.FC<{ manifest: AudioManifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = manifest.scenes[0].durationSeconds + manifest.gapSeconds;
  const s2 = manifest.scenes[1].durationSeconds + manifest.gapSeconds;
  const s3 = manifest.scenes[2].durationSeconds + manifest.gapSeconds;
  const s4 = manifest.scenes[3].durationSeconds + manifest.gapSeconds;
  const start = Math.round((manifest.introSeconds + s1 + s2 + s3 + s4) * fps);
  const duration = Math.round(manifest.scenes[4].durationSeconds * fps) + Math.round(manifest.gapSeconds * fps) + Math.round(manifest.outroSeconds * fps);
  const end = start + duration;

  const scale = interpolate(frame, [start, start + fps * 0.5], [0.9, 1], {
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
        gap: 28,
        transform: `scale(${scale})`,
      }}
    >
      <Logo variant="full" />
      <Caption
        text="Full access. $29 a month."
        startFrame={start + fps * 0.1}
        endFrame={end}
      />
      <div style={{ display: "flex", gap: 16, marginTop: 12 }}>
        <Badge label="Cancel anytime" startFrame={start + 0.4 * fps} endFrame={end} color="#22c55e" />
      </div>
      <div
        style={{
          position: "absolute",
          bottom: 90,
          opacity: interpolate(frame, [start + 0.8 * fps, start + 1.2 * fps], [0, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          }),
          fontFamily: "Inter, system-ui, sans-serif",
          fontSize: 24,
          color: "#94a3b8",
        }}
      >
        titanaitrader.app
      </div>
    </AbsoluteFill>
  );
};
