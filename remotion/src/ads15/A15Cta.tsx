import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { Headline, Logo, Reveal } from "../components/Type";
import { useAds15Layout } from "./layout";

/** 11.4 - 15.0s: brand + offer + one clear action. */
export const A15Cta: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const layout = useAds15Layout();

  const btn = spring({ frame: frame - Math.round(fps * 0.55), fps, config: { damping: 12, stiffness: 220 } });
  const pulse = 1 + 0.03 * Math.sin((frame / fps) * 6);
  const glow = 0.5 + 0.5 * Math.sin((frame / fps) * 4.6);
  const rays = interpolate(frame, [0, durationInFrames], [0, 30], { extrapolateRight: "clamp" });

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `conic-gradient(from ${rays}deg at 50% 45%, ${theme.primary}26, transparent 25%, ${theme.accent}22 50%, transparent 75%, ${theme.primary}26)`,
          opacity: 0.75,
        }}
      />
      <AbsoluteFill
        style={{
          justifyContent: "center",
          alignItems: "center",
          padding: `0 ${layout.padX}px`,
          gap: layout.kind === "vertical" ? 28 : 20,
        }}
      >
        <Logo size={layout.logo} />
        <Headline size={layout.headline * 1.05} align="center" delay={0.15}>
          Set it. Forget it.
        </Headline>
        <div
          style={{
            opacity: btn,
            transform: `scale(${interpolate(btn, [0, 1], [0.86, 1]) * pulse})`,
            marginTop: 8,
            padding: `${layout.ctaButton * 0.6}px ${layout.ctaButton * 1.3}px`,
            borderRadius: 999,
            background: `linear-gradient(120deg, ${theme.primary}, ${theme.accent})`,
            color: "#04060d",
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: layout.ctaButton,
            letterSpacing: -1,
            boxShadow: `0 0 ${34 + 44 * glow}px ${theme.primary}88`,
          }}
        >
          Start Free in Paper Mode
        </div>
        <Reveal delay={0.95} from={14}>
          <div
            style={{
              fontFamily: theme.font,
              fontWeight: 700,
              fontSize: layout.ctaButton * 0.82,
              color: theme.text,
              letterSpacing: 1,
              textAlign: "center",
            }}
          >
            titanaitrader.app
          </div>
        </Reveal>
        <Reveal delay={1.15} from={10}>
          <div
            style={{
              fontFamily: theme.font,
              fontSize: layout.sub * 0.62,
              color: theme.muted,
              textAlign: "center",
              maxWidth: layout.textWidth * 1.1,
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
