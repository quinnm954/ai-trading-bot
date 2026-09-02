import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { Logo } from "../components/Logo";
import { Caption } from "../components/Caption";
import { Badge } from "../components/Badge";
import type { AudioManifest } from "../types";

const agents = ["Watcher", "Analyst", "Risk", "Trader", "Healer"];

export const Scene2: React.FC<{ manifest: AudioManifest }> = ({ manifest }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const start = Math.round((manifest.introSeconds + manifest.scenes[0].durationSeconds + manifest.gapSeconds) * fps);
  const duration = Math.round(manifest.scenes[1].durationSeconds * fps) + Math.round(manifest.gapSeconds * fps);
  const end = start + duration;

  if (frame < start - 5 || frame > end) return null;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: "center",
        gap: 28,
      }}
    >
      <Logo variant="icon" />
      <Caption
        text="Five autonomous agents."
        startFrame={start + fps * 0.1}
        endFrame={end}
      />
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "center",
          gap: 14,
          maxWidth: 900,
          marginTop: 10,
        }}
      >
        {agents.map((agent, i) => (
          <Badge
            key={agent}
            label={agent}
            startFrame={start + 0.35 * fps + i * 0.22 * fps}
            endFrame={end}
            color={i === 4 ? "#22c55e" : i === 2 ? "#f59e0b" : "#3b82f6"}
          />
        ))}
      </div>
    </AbsoluteFill>
  );
};
