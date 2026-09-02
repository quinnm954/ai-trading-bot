import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, spring } from "remotion";

export const useReveal = (delaySeconds = 0) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delaySeconds * fps;
  const opacity = interpolate(f, [0, 0.35 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const y = interpolate(f, [0, 0.45 * fps], [26, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const pop = spring({ frame: Math.max(0, f), fps, config: { damping: 18, stiffness: 160 } });
  return { opacity, y, pop };
};

export const Reveal: React.FC<{ delay?: number; children: React.ReactNode; style?: React.CSSProperties }> = ({
  delay = 0,
  children,
  style,
}) => {
  const { opacity, y } = useReveal(delay);
  return <div style={{ opacity, transform: `translateY(${y}px)`, ...style }}>{children}</div>;
};

export const Chapter: React.FC<{
  kicker?: string;
  headline: string;
  sub?: string;
  accent?: string;
  align?: "left" | "center";
  children?: React.ReactNode;
}> = ({ kicker, headline, sub, accent = "#38bdf8", align = "left", children }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const drift = Math.sin((frame / fps) * 0.6) * 8;

  return (
    <AbsoluteFill
      style={{
        justifyContent: "center",
        alignItems: align === "center" ? "center" : "flex-start",
        padding: "0 96px",
        gap: 30,
        fontFamily: "Inter, system-ui, sans-serif",
        transform: `translateY(${drift}px)`,
      }}
    >
      {kicker ? (
        <Reveal delay={0}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 12,
              padding: "10px 20px",
              borderRadius: 999,
              border: `1px solid ${accent}55`,
              background: `${accent}18`,
              color: accent,
              fontWeight: 700,
              fontSize: 26,
              letterSpacing: 2,
              textTransform: "uppercase",
            }}
          >
            <span style={{ width: 10, height: 10, borderRadius: 999, background: accent }} />
            {kicker}
          </div>
        </Reveal>
      ) : null}

      <Reveal delay={0.15}>
        <div
          style={{
            fontWeight: 800,
            fontSize: 84,
            lineHeight: 1.02,
            letterSpacing: -2.5,
            color: "#f8fafc",
            textAlign: align,
            maxWidth: 880,
            textShadow: "0 4px 40px rgba(0,0,0,0.45)",
          }}
        >
          {headline}
        </div>
      </Reveal>

      {sub ? (
        <Reveal delay={0.35}>
          <div
            style={{
              fontWeight: 500,
              fontSize: 40,
              lineHeight: 1.28,
              color: "#94a3b8",
              textAlign: align,
              maxWidth: 840,
            }}
          >
            {sub}
          </div>
        </Reveal>
      ) : null}

      {children ? <div style={{ width: "100%", marginTop: 12 }}>{children}</div> : null}
    </AbsoluteFill>
  );
};
