import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring, Easing } from "remotion";
import { theme } from "../theme";
import { Headline, Logo, Reveal, Sub } from "../components/Type";
import type { PlacedBeat } from "../timeline";

export const CtaScene: React.FC<{ beat: PlacedBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const btn = spring({ frame: frame - Math.round(fps * 0.8), fps, config: { damping: 13, stiffness: 190 } });
  const pulse = 1 + 0.03 * Math.sin((frame / fps) * 5.2);
  const glow = 0.5 + 0.5 * Math.sin((frame / fps) * 4);
  const rays = interpolate(frame, [0, beat.durationFrames], [0, 24], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `conic-gradient(from ${rays}deg at 50% 45%, ${theme.primary}22, transparent 25%, ${theme.accent}1f 50%, transparent 75%, ${theme.primary}22)`,
          opacity: 0.7,
        }}
      />
      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 80px", gap: 34 }}>
        <Logo size={78} />
        <Headline size={92} align="center" delay={0.2}>
          {beat.headline}
        </Headline>
        <Sub delay={0.45} align="center" size={42}>
          {beat.sub}
        </Sub>

        <div
          style={{
            opacity: btn,
            transform: `scale(${interpolate(btn, [0, 1], [0.85, 1]) * pulse})`,
            marginTop: 22,
            padding: "34px 70px",
            borderRadius: 999,
            background: `linear-gradient(120deg, ${theme.primary}, ${theme.accent})`,
            color: "#04060d",
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 54,
            letterSpacing: -1,
            boxShadow: `0 0 ${40 + 50 * glow}px ${theme.primary}88`,
          }}
        >
          Get Started Free
        </div>

        <Reveal delay={1.35} from={16}>
          <div
            style={{
              fontFamily: theme.font,
              fontWeight: 700,
              fontSize: 44,
              color: theme.text,
              letterSpacing: 1,
            }}
          >
            titanaitrader.app
          </div>
        </Reveal>
        <Reveal delay={1.55} from={12}>
          <div
            style={{
              fontFamily: theme.font,
              fontSize: 28,
              color: theme.muted,
              textAlign: "center",
              maxWidth: 820,
              lineHeight: 1.35,
            }}
          >
            $29 / 30 days for full access. Crypto trading involves risk. No profit guarantees.
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
