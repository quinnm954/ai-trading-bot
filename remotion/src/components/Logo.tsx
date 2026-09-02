import { useCurrentFrame, useVideoConfig, interpolate } from "remotion";

export const Logo: React.FC<{ variant?: "full" | "icon" }> = ({ variant = "full" }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const opacity = interpolate(frame, [0, fps * 0.5], [0, 1], {
    extrapolateRight: "clamp",
  });
  const scale = interpolate(frame, [0, fps * 0.6], [0.9, 1], {
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        opacity,
        transform: `scale(${scale})`,
        display: "flex",
        alignItems: "center",
        gap: 14,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 800,
        letterSpacing: -1,
        color: "#f8fafc",
        fontSize: variant === "full" ? 48 : 32,
      }}
    >
      <svg
        width={variant === "full" ? 48 : 32}
        height={variant === "full" ? 48 : 32}
        viewBox="0 0 48 48"
        fill="none"
      >
        <path d="M24 4L44 40H4L24 4Z" fill="#3b82f6" />
        <path d="M24 14L36 38H12L24 14Z" fill="#0ea5e9" />
      </svg>
      <span>Titan<span style={{ color: "#38bdf8" }}>AI</span></span>
    </div>
  );
};
