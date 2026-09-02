import { Img, staticFile, useCurrentFrame, useVideoConfig, interpolate, Easing, spring } from "remotion";
import { theme } from "../theme";

const W = 620;
const H = 1300;

/**
 * Device mockup holding a real app screenshot, with slow ken-burns pan/zoom
 * plus a 3D tilt and a glass light sweep.
 */
export const PhoneMockup: React.FC<{
  screen: string;
  focusY?: number;
  zoom?: number;
  tilt?: number;
  delay?: number;
  scale?: number;
  sweep?: boolean;
}> = ({ screen, focusY = 0.35, zoom = 1.05, tilt = 0, delay = 0, scale = 1, sweep = false }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const f = Math.max(0, frame - delay * fps);

  const rise = spring({ frame: f, fps, config: { damping: 200 }, durationInFrames: Math.round(fps * 1.1) });
  const enterY = interpolate(rise, [0, 1], [140, 0]);
  const enterScale = interpolate(rise, [0, 1], [0.94, 1]);
  const opacity = interpolate(f, [0, fps * 0.35], [0, 1], { extrapolateRight: "clamp" });

  // Ken burns: slow zoom + vertical drift over the screenshot
  const z = zoom * interpolate(f, [0, fps * 6], [1, 1.07], {
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.ease),
  });
  const pan = interpolate(f, [0, fps * 6], [0, -34], { extrapolateRight: "clamp" });

  const sweepX = interpolate(f, [fps * 0.4, fps * 2.2], [-W * 1.2, W * 1.4], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut(Easing.cubic),
  });

  return (
    <div
      style={{
        opacity,
        width: W,
        height: H,
        borderRadius: 62,
        padding: 12,
        background: "linear-gradient(160deg, #2b3350 0%, #0d1120 45%, #1c2440 100%)",
        boxShadow: `0 60px 140px rgba(2,3,8,0.85), 0 0 0 1px ${theme.primary}44, 0 0 90px ${theme.primary}33`,
        transform: `perspective(1800px) rotateY(${tilt}deg) rotateX(${tilt * -0.25}deg) translateY(${enterY}px) scale(${
          enterScale * scale
        })`,
        transformStyle: "preserve-3d",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: 52,
          overflow: "hidden",
          position: "relative",
          backgroundColor: theme.bgDeep,
        }}
      >
        <Img
          src={staticFile(screen)}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: `50% ${Math.round(focusY * 100)}%`,
            transform: `scale(${z}) translateY(${pan * 0.35}px)`,
            transformOrigin: "center center",
            filter: "brightness(1.35) contrast(1.08) saturate(1.15)",
          }}
        />

        {/* screen glass gradient */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(200deg, rgba(255,255,255,0.10) 0%, transparent 38%)",
          }}
        />
        {sweep ? (
          <div
            style={{
              position: "absolute",
              top: -80,
              bottom: -80,
              left: sweepX,
              width: 220,
              transform: "rotate(12deg)",
              background:
                "linear-gradient(90deg, transparent, rgba(255,255,255,0.16), transparent)",
            }}
          />
        ) : null}
      </div>
      {/* notch */}
      <div
        style={{
          position: "absolute",
          top: 26,
          left: "50%",
          marginLeft: -68,
          width: 136,
          height: 30,
          borderRadius: 999,
          backgroundColor: "#05070f",
        }}
      />
    </div>
  );
};
