import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { Headline, Kicker, Reveal } from "../components/Type";
import { PhoneMockup } from "../components/PhoneMockup";
import type { PlacedBeat } from "../timeline";

const AGENT_COLORS = [theme.accent, theme.primaryGlow, theme.warn, theme.profit, "#f472b6"];

export const SolutionScene: React.FC<{ beat: PlacedBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chips = beat.chips ?? [];

  return (
    <AbsoluteFill>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "flex-end", top: 300 }}>
        <div style={{ transform: "scale(0.86)" }}>
          <PhoneMockup screen={beat.screen!} focusY={beat.focusY} zoom={beat.zoom} delay={0.35} sweep />
        </div>
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background: `linear-gradient(180deg, ${theme.bgDeep} 8%, rgba(5,7,15,0.55) 34%, transparent 60%)`,
        }}
      />

      <AbsoluteFill style={{ padding: "150px 80px", gap: 26, alignItems: "flex-start" }}>
        {beat.kicker ? <Kicker label={beat.kicker} delay={0} /> : null}
        <Headline size={88} delay={0.16}>
          {beat.headline}
        </Headline>
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "flex-end", padding: "0 60px 150px" }}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
          {chips.map((c, i) => {
            const s = spring({
              frame: frame - Math.round(fps * (0.9 + i * 0.16)),
              fps,
              config: { damping: 14, stiffness: 200 },
            });
            const glow = 0.5 + 0.5 * Math.sin((frame / fps) * 3 + i);
            return (
              <div
                key={c}
                style={{
                  opacity: s,
                  transform: `translateY(${interpolate(s, [0, 1], [40, 0])}px) scale(${interpolate(
                    s,
                    [0, 1],
                    [0.8, 1]
                  )})`,
                  padding: "18px 28px",
                  borderRadius: 20,
                  backgroundColor: "rgba(11,16,32,0.9)",
                  border: `1px solid ${AGENT_COLORS[i % AGENT_COLORS.length]}88`,
                  boxShadow: `0 0 ${18 + 20 * glow}px ${AGENT_COLORS[i % AGENT_COLORS.length]}44`,
                  color: theme.text,
                  fontFamily: theme.font,
                  fontWeight: 700,
                  fontSize: 38,
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                }}
              >
                <span
                  style={{
                    width: 14,
                    height: 14,
                    borderRadius: 999,
                    background: AGENT_COLORS[i % AGENT_COLORS.length],
                  }}
                />
                {c}
              </div>
            );
          })}
        </div>
        <Reveal delay={1.9} from={16}>
          <div
            style={{
              marginTop: 26,
              textAlign: "center",
              fontFamily: theme.font,
              fontSize: 34,
              color: theme.muted,
              letterSpacing: 2,
            }}
          >
            They share one plan every cycle.
          </div>
        </Reveal>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
