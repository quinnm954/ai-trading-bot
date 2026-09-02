import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { theme } from "../theme";

export const Reveal: React.FC<{
  delay?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
  from?: number;
  blur?: boolean;
}> = ({ delay = 0, children, style, from = 26, blur = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay * fps;
  const opacity = interpolate(f, [0, 0.32 * fps], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(f, [0, 0.5 * fps], [from, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const b = blur
    ? interpolate(f, [0, 0.4 * fps], [10, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" })
    : 0;
  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        filter: b > 0.2 ? `blur(${b}px)` : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Kicker: React.FC<{ label: string; color?: string; delay?: number }> = ({
  label,
  color = theme.accent,
  delay = 0,
}) => (
  <Reveal delay={delay} from={16}>
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 14,
        padding: "12px 24px",
        borderRadius: 999,
        border: `1px solid ${color}66`,
        background: `${color}1f`,
        color,
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: 30,
        letterSpacing: 3,
        textTransform: "uppercase",
      }}
    >
      <span style={{ width: 12, height: 12, borderRadius: 999, background: color }} />
      {label}
    </div>
  </Reveal>
);

export const Headline: React.FC<{
  children: React.ReactNode;
  delay?: number;
  size?: number;
  align?: "left" | "center";
}> = ({ children, delay = 0.12, size = 92, align = "left" }) => (
  <Reveal delay={delay} blur>
    <div
      style={{
        fontFamily: theme.font,
        fontWeight: 800,
        fontSize: size,
        lineHeight: 1.02,
        letterSpacing: -3,
        color: theme.text,
        textAlign: align,
        textShadow: "0 6px 50px rgba(2,3,8,0.7)",
      }}
    >
      {children}
    </div>
  </Reveal>
);

export const Sub: React.FC<{
  children: React.ReactNode;
  delay?: number;
  align?: "left" | "center";
  size?: number;
}> = ({ children, delay = 0.32, align = "left", size = 42 }) => (
  <Reveal delay={delay} from={18}>
    <div
      style={{
        fontFamily: theme.font,
        fontWeight: 500,
        fontSize: size,
        lineHeight: 1.26,
        color: theme.muted,
        textAlign: align,
        maxWidth: 860,
      }}
    >
      {children}
    </div>
  </Reveal>
);

export const Logo: React.FC<{ size?: number; delay?: number }> = ({ size = 72, delay = 0 }) => (
  <Reveal delay={delay} from={10}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 20,
        fontFamily: theme.font,
        fontWeight: 800,
        letterSpacing: -2,
        color: theme.text,
        fontSize: size,
      }}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
        <path d="M24 4L44 40H4L24 4Z" fill={theme.primary} />
        <path d="M24 15L35 38H13L24 15Z" fill={theme.accent} />
      </svg>
      <span>
        Titan<span style={{ color: theme.accent }}>AI</span>
      </span>
    </div>
  </Reveal>
);
