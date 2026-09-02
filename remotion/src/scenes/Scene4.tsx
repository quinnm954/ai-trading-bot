import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { Logo } from "../components/Logo";
import { Caption } from "../components/Caption";
import { Badge } from "../components/Badge";
import type { AudioManifest } from "../types";

export const Scene4: React.FC<{ manifest: AudioManifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = manifest.scenes[0].durationSeconds + manifest.gapSeconds;
  const s2 = manifest.scenes[1].durationSeconds + manifest.gapSeconds;
  const s3 = manifest.scenes[2].durationSeconds + manifest.gapSeconds;
  const start = Math.round((manifest.introSeconds + s1 + s2 + s3) * fps);
  const duration = Math.round(manifest.scenes[3].durationSeconds * fps) + Math.round(manifest.gapSeconds * fps);
  const end = start + duration;

  const cloudOpacity = interpolate(frame, [start + 0.2 * fps, start + 0.6 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  if (frame < start - 5 || frame > end) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 26,
      }}
    >
      <Logo variant="icon" />
      <div style={{ opacity: cloudOpacity, fontSize: 100, filter: "drop-shadow(0 0 28px rgba(59,130,246,0.5))" }}>
        ☁️
      </div>
      <Caption
        text="Server-side. Set it and forget it."
        startFrame={start + fps * 0.1}
        endFrame={end}
      />
      <div style={{ display: "flex", gap: 14, marginTop: 10 }}>
        <Badge label="No tab open" startFrame={start + 0.35 * fps} endFrame={end} />
        <Badge label="No babysitting" startFrame={start + 0.6 * fps} endFrame={end} />
      </div>
    </AbsoluteFill>
  );
};
