import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { Logo } from "../components/Logo";
import { Caption } from "../components/Caption";
import { Badge } from "../components/Badge";
import type { AudioManifest } from "../types";

export const Scene3: React.FC<{ manifest: AudioManifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s1 = manifest.scenes[0].durationSeconds + manifest.gapSeconds;
  const s2 = manifest.scenes[1].durationSeconds + manifest.gapSeconds;
  const start = Math.round((manifest.introSeconds + s1 + s2) * fps);
  const duration = Math.round(manifest.scenes[2].durationSeconds * fps) + Math.round(manifest.gapSeconds * fps);
  const end = start + duration;

  if (frame < start - 5 || frame > end) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 22,
      }}
    >
      <Logo variant="icon" />
      <Caption
        text="1.6 : 1 reward-to-risk, net of fees."
        startFrame={start + fps * 0.1}
        endFrame={end}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 14,
          maxWidth: 950,
          marginTop: 14,
        }}
      >
        <Badge label="Hard stops" startFrame={start + 0.4 * fps} endFrame={end} color="#ef4444" />
        <Badge label="Kill switch" startFrame={start + 0.65 * fps} endFrame={end} color="#f97316" />
        <Badge label="Non-custodial" startFrame={start + 0.9 * fps} endFrame={end} color="#22c55e" />
      </div>
    </AbsoluteFill>
  );
};
