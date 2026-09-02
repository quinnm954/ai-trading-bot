import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { useAds15Layout } from "./layout";
import type { Ads15Word } from "./beats";

/** Groups words into short readable phrases (kinetic, one pop per group). */
const group = (words: Ads15Word[], max = 3) => {
  const out: { words: Ads15Word[]; start: number; end: number }[] = [];
  for (let i = 0; i < words.length; i += max) {
    const slice = words.slice(i, i + max);
    out.push({ words: slice, start: slice[0].start, end: slice[slice.length - 1].end });
  }
  return out;
};

/**
 * Burned-in captions for silent autoplay feeds. Timed against the VO clip's own
 * word timings and offset by where the clip starts in the edit.
 */
export const CaptionTrack: React.FC<{ words: Ads15Word[]; offset: number }> = ({ words, offset }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useAds15Layout();
  const time = frame / fps - offset;
  const groups = group(words);
  const active = groups.find((g) => time >= g.start - 0.08 && time <= g.end + 0.16);
  if (!active) return null;

  const local = Math.round((time - (active.start - 0.08)) * fps);
  const pop = spring({ frame: local, fps, config: { damping: 15, stiffness: 240 } });
  const out = interpolate(time, [active.end, active.end + 0.16], [1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: layout.captionBottom,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity: out,
      }}
    >
      <div
        style={{
          display: "flex",
          gap: layout.caption * 0.28,
          alignItems: "baseline",
          padding: `${layout.caption * 0.28}px ${layout.caption * 0.6}px`,
          borderRadius: 22,
          background: "rgba(2,3,8,0.72)",
          border: "1px solid rgba(148,163,184,0.22)",
          transform: `translateY(${interpolate(pop, [0, 1], [26, 0])}px) scale(${interpolate(
            pop,
            [0, 1],
            [0.92, 1]
          )})`,
          maxWidth: "86%",
          flexWrap: "wrap",
          justifyContent: "center",
        }}
      >
        {active.words.map((w, i) => {
          const on = time >= w.start - 0.02;
          return (
            <span
              key={`${w.word}-${i}`}
              style={{
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: layout.caption,
                letterSpacing: -1,
                textTransform: "uppercase",
                color: on ? theme.text : "rgba(148,163,184,0.55)",
                textShadow: on ? `0 0 26px ${theme.accent}55` : undefined,
              }}
            >
              {w.word}
            </span>
          );
        })}
      </div>
    </div>
  );
};
