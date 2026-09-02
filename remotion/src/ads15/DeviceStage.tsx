import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing } from "remotion";
import { PhoneMockup } from "../components/PhoneMockup";
import { useAds15Layout } from "./layout";

const DEVICE_W = 620;
const DEVICE_H = 1300;

/**
 * Places the real-screenshot device for each aspect ratio without letterboxing:
 * overlaid + oversized on vertical, shifted to one side on square / wide.
 */
export const DeviceStage: React.FC<{
  screen: string;
  focusY?: number;
  zoom?: number;
  tilt?: number;
  delay?: number;
  push?: number;
  highlight?: { top: number; height: number; color: string; delay?: number };
}> = ({ screen, focusY, zoom, tilt = 0, delay = 0, push = 1.05, highlight }) => {
  const frame = useCurrentFrame();
  const { fps, durationInFrames } = useVideoConfig();
  const layout = useAds15Layout();

  const camera = interpolate(frame, [0, durationInFrames], [1, push], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const drift = interpolate(frame, [0, fps * 1], [tilt >= 0 ? 70 : -70, 0], {
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });

  return (
    <AbsoluteFill style={{ alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          transform: `translate(${layout.phoneShiftX + drift}px, ${layout.phoneShiftY}px) scale(${
            layout.phoneScale * camera
          })`,
        }}
      >
        <div style={{ position: "relative", width: DEVICE_W, height: DEVICE_H }}>
          <PhoneMockup screen={screen} focusY={focusY} zoom={zoom} tilt={tilt} delay={delay} sweep />
          {highlight ? <Highlight {...highlight} /> : null}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const Highlight: React.FC<{ top: number; height: number; color: string; delay?: number }> = ({
  top,
  height,
  color,
  delay = 0.6,
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = frame - delay * fps;
  const draw = interpolate(f, [0, fps * 0.45], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  });
  const pulse = 0.55 + 0.45 * Math.sin((frame / fps) * 5);
  if (draw <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 26,
        right: 26,
        top,
        height,
        borderRadius: 26,
        border: `4px solid ${color}`,
        boxShadow: `0 0 ${26 + 34 * pulse}px ${color}77, inset 0 0 60px ${color}22`,
        opacity: draw,
        transform: `scale(${interpolate(draw, [0, 1], [1.06, 1])})`,
      }}
    />
  );
};
