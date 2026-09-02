import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { theme } from "../theme";
import { Reveal } from "../components/Type";
import type { PlacedBeat } from "../timeline";

const Panel: React.FC<{
  title: string;
  items: string[];
  color: string;
  side: "left" | "right";
  delay: number;
}> = ({ title, items, color, side, delay }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay * fps;
  const x = interpolate(f, [0, fps * 0.55], [side === "left" ? -260 : 260, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(f, [0, fps * 0.35], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        opacity,
        transform: `translateX(${x}px)`,
        flex: 1,
        padding: 44,
        borderRadius: 32,
        border: `1px solid ${color}55`,
        background: `linear-gradient(160deg, ${color}14, rgba(11,16,32,0.9))`,
        display: "flex",
        flexDirection: "column",
        gap: 22,
      }}
    >
      <div
        style={{
          fontFamily: theme.font,
          fontWeight: 800,
          fontSize: 40,
          letterSpacing: 4,
          textTransform: "uppercase",
          color,
        }}
      >
        {title}
      </div>
      {items.map((it) => (
        <div
          key={it}
          style={{
            fontFamily: theme.font,
            fontWeight: 700,
            fontSize: 46,
            color: theme.text,
            display: "flex",
            gap: 16,
            alignItems: "center",
          }}
        >
          <span style={{ color, fontSize: 40 }}>{side === "left" ? "✕" : "✓"}</span>
          {it}
        </div>
      ))}
    </div>
  );
};

export const TransformScene: React.FC<{ beat: PlacedBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const wipe = interpolate(frame, [fps * 0.9, fps * 1.7], [0, 100], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 60px", gap: 40 }}>
      <Reveal delay={0}>
        <div
          style={{
            textAlign: "center",
            fontFamily: theme.font,
            fontWeight: 800,
            fontSize: 76,
            letterSpacing: -2,
            color: theme.text,
          }}
        >
          Same market. Different you.
        </div>
      </Reveal>
      <div style={{ display: "flex", gap: 26, alignItems: "stretch" }}>
        <Panel
          title="Before"
          color={theme.loss}
          side="left"
          delay={0.2}
          items={["Manual", "Emotional", "Missed exits"]}
        />
        <Panel
          title="With TitanAI"
          color={theme.profit}
          side="right"
          delay={0.75}
          items={["Automated", "Rule-bound", "Exits enforced"]}
        />
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 999,
          background: `linear-gradient(90deg, ${theme.profit} ${wipe}%, ${theme.loss}55 ${wipe}%)`,
        }}
      />
    </AbsoluteFill>
  );
};
