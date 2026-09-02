import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

export const Badge: React.FC<{ label: string; startFrame: number; endFrame: number; delay?: number; color?: string }> = ({
  label,
  startFrame,
  endFrame,
  delay = 0,
  color = "#3b82f6",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = startFrame + delay * fps;
  const opacity = interpolate(frame, [s, s + 0.25 * fps, endFrame - 0.25 * fps, endFrame], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const y = interpolate(frame, [s, s + 0.25 * fps], [20, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        padding: "12px 22px",
        borderRadius: 999,
        backgroundColor: `${color}22`,
        border: `1px solid ${color}66`,
        color: "#f8fafc",
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 700,
        fontSize: 26,
        backdropFilter: "blur(6px)",
      }}
    >
      {label}
    </div>
  );
};
