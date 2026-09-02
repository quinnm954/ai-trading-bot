import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { theme } from "../theme";
import { Headline, Kicker, Sub } from "../components/Type";
import { PhoneMockup } from "../components/PhoneMockup";
import { HighlightBox } from "../components/HighlightBox";
import type { PlacedBeat } from "../timeline";

export const FeatureScene: React.FC<{ beat: PlacedBeat; index: number }> = ({ beat, index }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const accent = beat.accent ?? theme.accent;
  const fromLeft = index % 2 === 0;

  // camera push-in on the whole device
  const camera = interpolate(frame, [0, beat.durationFrames], [1, 1.06], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const slide = interpolate(frame, [0, fps * 0.7], [fromLeft ? 120 : -120, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          transform: `scale(${camera}) translateX(${slide}px)`,
        }}
      >
        <div style={{ position: "relative", transform: "scale(0.9)" }}>
          <PhoneMockup
            screen={beat.screen!}
            focusY={beat.focusY}
            zoom={beat.zoom}
            tilt={fromLeft ? 7 : -7}
            sweep
          />
          {beat.highlight ? (
            <HighlightBox top={beat.highlight.top} height={beat.highlight.height} color={accent} delay={0.75} />
          ) : null}
        </div>
      </AbsoluteFill>

      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(2,3,8,0.95) 0%, rgba(2,3,8,0.55) 20%, rgba(2,3,8,0.05) 46%, rgba(2,3,8,0.55) 80%, rgba(2,3,8,0.96) 100%)",
        }}
      />


      <AbsoluteFill style={{ padding: "130px 76px", gap: 24, alignItems: "flex-start" }}>
        {beat.kicker ? <Kicker label={beat.kicker} color={accent} delay={0} /> : null}
        <Headline size={84} delay={0.14}>
          {beat.headline}
        </Headline>
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 76px 150px" }}>
        {beat.sub ? <Sub delay={0.55} size={44}>{beat.sub}</Sub> : null}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
