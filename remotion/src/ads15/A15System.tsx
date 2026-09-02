import { AbsoluteFill, Sequence, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { Headline, Kicker } from "../components/Type";
import { DeviceStage } from "./DeviceStage";
import { useAds15Layout } from "./layout";

const AGENTS = ["Watcher", "Analyst", "Risk", "Trader", "Healer"];
const AGENT_COLORS = [theme.accent, theme.primaryGlow, theme.warn, theme.profit, "#f472b6"];

const Chips: React.FC<{ start: number }> = ({ start }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useAds15Layout();
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: layout.chip * 0.42,
        justifyContent: layout.overlay ? "center" : "flex-start",
      }}
    >
      {AGENTS.map((a, i) => {
        const s = spring({
          frame: frame - Math.round(fps * (start + i * 0.1)),
          fps,
          config: { damping: 14, stiffness: 240 },
        });
        const glow = 0.5 + 0.5 * Math.sin((frame / fps) * 4 + i);
        return (
          <div
            key={a}
            style={{
              opacity: s,
              transform: `translateY(${interpolate(s, [0, 1], [30, 0])}px) scale(${interpolate(
                s,
                [0, 1],
                [0.84, 1]
              )})`,
              padding: `${layout.chip * 0.5}px ${layout.chip * 0.82}px`,
              borderRadius: 18,
              backgroundColor: "rgba(11,16,32,0.92)",
              border: `1px solid ${AGENT_COLORS[i]}88`,
              boxShadow: `0 0 ${14 + 18 * glow}px ${AGENT_COLORS[i]}44`,
              color: theme.text,
              fontFamily: theme.font,
              fontWeight: 700,
              fontSize: layout.chip,
              display: "flex",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span style={{ width: 12, height: 12, borderRadius: 999, background: AGENT_COLORS[i] }} />
            {a}
          </div>
        );
      })}
    </div>
  );
};

/** 2.6 - 7.2s: the product. Two shots — live dashboard, then the agent console. */
export const A15System: React.FC = () => {
  const { fps } = useVideoConfig();
  const layout = useAds15Layout();
  const shotA = Math.round(fps * 1.9);

  return (
    <AbsoluteFill>
      <Sequence durationInFrames={shotA} layout="none">
        <DeviceStage screen="screens/dashboard.png" focusY={0.3} zoom={1} tilt={6} push={1.05} />
      </Sequence>
      <Sequence from={shotA} layout="none">
        <DeviceStage screen="screens/agents.png" focusY={0.34} zoom={1} tilt={-6} push={1.06} />
      </Sequence>

      <AbsoluteFill
        style={{
          background: layout.overlay
            ? "linear-gradient(180deg, rgba(2,3,8,0.96) 0%, rgba(2,3,8,0.55) 22%, rgba(2,3,8,0.08) 46%, rgba(2,3,8,0.6) 80%, rgba(2,3,8,0.97) 100%)"
            : "linear-gradient(90deg, rgba(2,3,8,0.97) 0%, rgba(2,3,8,0.82) 42%, rgba(2,3,8,0.25) 70%, rgba(2,3,8,0.55) 100%)",
        }}
      />

      <AbsoluteFill
        style={{
          padding: layout.overlay
            ? `${layout.padTop}px ${layout.padX}px`
            : `${layout.padTop}px ${layout.padX}px`,
          alignItems: "flex-start",
          justifyContent: layout.overlay ? "flex-start" : "center",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: layout.textWidth }}>
          <div style={{ transform: `scale(${layout.kickerScale})`, transformOrigin: "left center" }}>
            <Kicker label="One system" delay={0} />
          </div>
          <Headline size={layout.headline} delay={0.12}>
            Five AI agents. One plan.
          </Headline>
          {layout.overlay ? null : <Chips start={0.7} />}
        </div>
      </AbsoluteFill>

      {layout.overlay ? (
        <AbsoluteFill style={{ justifyContent: "flex-end", padding: `0 ${layout.padX * 0.7}px 470px` }}>
          <Chips start={0.8} />
        </AbsoluteFill>
      ) : null}
    </AbsoluteFill>
  );
};
