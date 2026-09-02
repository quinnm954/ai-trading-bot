import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

/** Animated glow outline that draws itself over a region of the device screen. */
export const HighlightBox: React.FC<{
  top: number;
  height: number;
  delay?: number;
  color?: string;
  width?: number;
  label?: string;
}> = ({ top, height, delay = 0.6, color = "#38bdf8", width = 560, label }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay * fps);

  const grow = interpolate(f, [0, fps * 0.5], [0.86, 1], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const opacity = interpolate(f, [0, fps * 0.3], [0, 1], { extrapolateRight: "clamp" });
  const pulse = 0.55 + 0.45 * Math.sin((f / fps) * 3.4);

  const boxH = 1300 * height;

  return (
    <div
      style={{
        position: "absolute",
        left: "50%",
        marginLeft: -width / 2,
        top: 1300 * top,
        width,
        height: boxH,
        opacity,
        transform: `scale(${grow})`,
        borderRadius: 26,
        border: `3px solid ${color}`,
        boxShadow: `0 0 ${20 + 26 * pulse}px ${color}aa, inset 0 0 ${18 + 20 * pulse}px ${color}33`,
      }}
    >
      {label ? (
        <div
          style={{
            position: "absolute",
            top: -54,
            left: 0,
            padding: "8px 16px",
            borderRadius: 12,
            backgroundColor: color,
            color: "#05070f",
            fontFamily: "Inter, system-ui, sans-serif",
            fontWeight: 800,
            fontSize: 26,
          }}
        >
          {label}
        </div>
      ) : null}
    </div>
  );
};
