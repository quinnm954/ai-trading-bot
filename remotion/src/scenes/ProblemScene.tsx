import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { theme } from "../theme";
import type { PlacedBeat } from "../timeline";

/** Three hard-cut stamped statements over a falling chart. */
const FallingChart: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = interpolate(frame, [0, fps * 3], [0, 1], { extrapolateRight: "clamp" });
  const pts = Array.from({ length: 40 }).map((_, i) => {
    const x = 60 + i * 25;
    const y = 900 + i * 12 + Math.sin(i * 0.9) * 60;
    return [x, y] as const;
  });
  const shown = Math.max(2, Math.floor(pts.length * progress));
  const d = pts
    .slice(0, shown)
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x} ${y}`)
    .join(" ");
  return (
    <svg width={1080} height={1920} style={{ position: "absolute", inset: 0, opacity: 0.5 }}>
      <path d={d} stroke={theme.loss} strokeWidth={6} fill="none" strokeLinecap="round" />
      <path d={`${d} L ${60 + shown * 25} 1920 L 60 1920 Z`} fill={`${theme.loss}18`} />
    </svg>
  );
};

export const ProblemScene: React.FC<{ beat: PlacedBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chips = beat.chips ?? [];
  const slot = beat.durationFrames / Math.max(1, chips.length);

  return (
    <AbsoluteFill>
      <FallingChart />
      <AbsoluteFill style={{ backgroundColor: "rgba(2,3,8,0.45)" }} />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 84px" }}>
        {chips.map((c, i) => {
          const start = i * slot;
          const local = frame - start;
          if (local < 0 || local > slot) return null;
          const scale = interpolate(local, [0, 6], [1.22, 1], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          const opacity = interpolate(local, [0, 4, slot - 5, slot], [0, 1, 1, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
          });
          const kick = interpolate(local, [0, 8], [i % 2 === 0 ? -26 : 26, 0], {
            extrapolateLeft: "clamp",
            extrapolateRight: "clamp",
            easing: Easing.out(Easing.cubic),
          });
          return (
            <div
              key={c}
              style={{
                position: "absolute",
                opacity,
                transform: `scale(${scale}) translateX(${kick}px)`,
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: 96,
                letterSpacing: -3,
                color: theme.text,
                textAlign: "center",
                lineHeight: 1.02,
              }}
            >
              {c}
              <div
                style={{
                  marginTop: 26,
                  height: 8,
                  borderRadius: 999,
                  background: `linear-gradient(90deg, ${theme.loss}, transparent)`,
                }}
              />
            </div>
          );
        })}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
