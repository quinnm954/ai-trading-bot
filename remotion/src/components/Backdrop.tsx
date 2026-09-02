import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate } from "remotion";
import { theme } from "../theme";

/** Persistent premium backdrop: deep gradient, slow drifting glows, subtle grid. */
export const Backdrop: React.FC<{ intensity?: number }> = ({ intensity = 1 }) => {
  const frame = useCurrentFrame();
  const { fps, width, height } = useVideoConfig();
  const t = frame / fps;

  const glowA = {
    x: width * 0.5 + Math.sin(t * 0.22) * 220,
    y: height * 0.3 + Math.cos(t * 0.17) * 180,
  };
  const glowB = {
    x: width * 0.4 + Math.cos(t * 0.13) * 260,
    y: height * 0.72 + Math.sin(t * 0.19) * 200,
  };

  return (
    <AbsoluteFill style={{ backgroundColor: theme.bgDeep }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${theme.bg} 0%, #070b18 45%, ${theme.bgDeep} 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(620px 620px at ${glowA.x}px ${glowA.y}px, ${theme.primary}${Math.round(
            30 * intensity
          )
            .toString(16)
            .padStart(2, "0")} 0%, transparent 70%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background: `radial-gradient(720px 720px at ${glowB.x}px ${glowB.y}px, ${theme.accent}1f 0%, transparent 72%)`,
        }}
      />
      <AbsoluteFill
        style={{
          opacity: 0.16,
          backgroundImage: `linear-gradient(${theme.primaryGlow}22 1px, transparent 1px), linear-gradient(90deg, ${theme.primaryGlow}22 1px, transparent 1px)`,
          backgroundSize: "120px 120px",
          transform: `translateY(${interpolate(t % 8, [0, 8], [0, 120])}px)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(120% 90% at 50% 50%, transparent 45%, rgba(2,3,8,0.85) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};
