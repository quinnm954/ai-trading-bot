import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { Headline, Kicker, Sub } from "../components/Type";
import { DeviceStage } from "./DeviceStage";
import { useAds15Layout } from "./layout";

const Stat: React.FC<{ label: string; value: string; color: string; delay: number }> = ({
  label,
  value,
  color,
  delay,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useAds15Layout();
  const s = spring({ frame: frame - Math.round(fps * delay), fps, config: { damping: 15, stiffness: 220 } });
  return (
    <div
      style={{
        opacity: s,
        transform: `translateY(${interpolate(s, [0, 1], [26, 0])}px)`,
        padding: `${layout.chip * 0.5}px ${layout.chip * 0.9}px`,
        borderRadius: 20,
        background: "rgba(11,16,32,0.9)",
        border: `1px solid ${color}66`,
        display: "flex",
        flexDirection: "column",
        gap: 4,
        minWidth: layout.chip * 6.4,
      }}
    >
      <span
        style={{
          fontFamily: theme.font,
          fontSize: layout.chip * 0.72,
          letterSpacing: 2,
          textTransform: "uppercase",
          color: theme.muted,
        }}
      >
        {label}
      </span>
      <span style={{ fontFamily: theme.font, fontWeight: 800, fontSize: layout.chip * 1.5, color }}>
        {value}
      </span>
    </div>
  );
};

/** 7.2 - 11.4s: the rule that makes it credible, on the real Risk Management screen. */
export const A15Rules: React.FC = () => {
  const layout = useAds15Layout();

  return (
    <AbsoluteFill>
      <DeviceStage
        screen="screens/risk.png"
        focusY={0.32}
        zoom={1}
        tilt={7}
        push={1.06}
        highlight={{ top: 320, height: 300, color: theme.warn, delay: 0.55 }}
      />

      <AbsoluteFill
        style={{
          background: layout.overlay
            ? "linear-gradient(180deg, rgba(2,3,8,0.96) 0%, rgba(2,3,8,0.5) 22%, rgba(2,3,8,0.05) 44%, rgba(2,3,8,0.6) 80%, rgba(2,3,8,0.97) 100%)"
            : "linear-gradient(90deg, rgba(2,3,8,0.97) 0%, rgba(2,3,8,0.82) 42%, rgba(2,3,8,0.25) 70%, rgba(2,3,8,0.55) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          padding: `${layout.padTop}px ${layout.padX}px`,
          alignItems: "flex-start",
          justifyContent: layout.overlay ? "flex-start" : "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: layout.textWidth }}>
          <div style={{ transform: `scale(${layout.kickerScale})`, transformOrigin: "left center" }}>
            <Kicker label="Your rules" color={theme.warn} delay={0} />
          </div>
          <Headline size={layout.headline} delay={0.12}>
            1.6 : 1 or it doesn&apos;t trade.
          </Headline>
          <Sub delay={0.4} size={layout.sub}>
            Every entry is solved net of fees, with your stop and your limits.
          </Sub>
          {layout.overlay ? null : (
            <div style={{ display: "flex", gap: 16, marginTop: 6 }}>
              <Stat label="Net R:R" value="1.6:1" color={theme.profit} delay={0.9} />
              <Stat label="Max stop" value="0.8%" color={theme.warn} delay={1.05} />
            </div>
          )}
        </div>
      </AbsoluteFill>

      {layout.overlay ? (
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: `0 ${layout.padX}px 470px` }}>
          <div style={{ display: "flex", gap: 18, justifyContent: "center" }}>
            <Stat label="Net R:R" value="1.6:1" color={theme.profit} delay={0.95} />
            <Stat label="Max stop" value="0.8%" color={theme.warn} delay={1.1} />
          </div>
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
