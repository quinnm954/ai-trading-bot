import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";

export const PersistentAccents: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const progress = frame / durationInFrames;

  return (
    <AbsoluteFill
      style={{
        opacity: 0.35,
        background: `radial-gradient(circle at ${20 + progress * 60}% ${30 + Math.sin(progress * Math.PI * 2) * 20}%, rgba(59,130,246,0.18) 0%, transparent 45%),
                       radial-gradient(circle at ${80 - progress * 40}% ${70 + Math.cos(progress * Math.PI * 2) * 15}%, rgba(14,165,233,0.14) 0%, transparent 45%)`,
      }}
    />
  );
};
