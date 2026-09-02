import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { theme } from "../theme";
import { Headline, Logo, Reveal } from "../components/Type";
import { PhoneMockup } from "../components/PhoneMockup";
import type { PlacedBeat } from "../timeline";

export const BrandScene: React.FC<{ beat: PlacedBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const spin = interpolate(frame, [0, beat.durationFrames], [12, -6], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const rise = interpolate(frame, [0, fps * 1.2], [90, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", top: rise }}>
        <div style={{ transform: "scale(0.82)" }}>
          <PhoneMockup screen={beat.screen!} focusY={0.2} zoom={1.02} tilt={spin} sweep />
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(2,3,8,0.95) 0%, rgba(2,3,8,0.3) 30%, rgba(2,3,8,0.3) 60%, rgba(2,3,8,0.97) 100%)",
        }}
      />
      <AbsoluteFill style={{ alignItems: "center", paddingTop: 150 }}>
        <Logo size={84} />
      </AbsoluteFill>
      <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "center", padding: "0 70px 170px", gap: 20 }}>
        <Headline size={96} align="center" delay={0.3}>
          {beat.headline}
        </Headline>
        <Reveal delay={0.7} from={18}>
          <div
            style={{
              fontFamily: theme.font,
              fontSize: 40,
              color: theme.muted,
              textAlign: "center",
              letterSpacing: 1,
            }}
          >
            Non-custodial. Your keys, your exchange account.
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
