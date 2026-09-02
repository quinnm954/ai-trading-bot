import { useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";

export const Caption: React.FC<{ text: string; startFrame: number; endFrame: number; size?: "lg" | "md" | "sm" }> = ({
  text,
  startFrame,
  endFrame,
  size = "lg",
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fadeIn = 0.25 * fps;
  const fadeOut = 0.25 * fps;
  const opacity = interpolate(
    frame,
    [startFrame, startFrame + fadeIn, endFrame - fadeOut, endFrame],
    [0, 1, 1, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.inOut(Easing.ease) }
  );
  const y = interpolate(
    frame,
    [startFrame, startFrame + fadeIn],
    [12, 0],
    { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) }
  );

  const sizes = { lg: 68, md: 56, sm: 42 };

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${y}px)`,
        fontFamily: "Inter, system-ui, sans-serif",
        fontWeight: 800,
        fontSize: sizes[size],
        lineHeight: 1.1,
        color: "#f8fafc",
        textAlign: "center",
        maxWidth: 900,
        textShadow: "0 2px 24px rgba(0,0,0,0.35)",
      }}
    >
      {text}
    </div>
  );
};
