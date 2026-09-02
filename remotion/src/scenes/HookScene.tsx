import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, Easing, spring } from "remotion";
import { theme } from "../theme";
import { Headline, Logo, Reveal } from "../components/Type";
import type { PlacedBeat } from "../timeline";

const SYMBOLS = ["BTC", "ETH", "SOL", "DOGE", "PEPE", "WIF", "BONK", "SHIB", "AVAX", "LINK"];

const TickerRow: React.FC<{ row: number }> = ({ row }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dir = row % 2 === 0 ? -1 : 1;
  const x = ((frame / fps) * 130 * dir) % 900;
  return (
    <div
      style={{
        display: "flex",
        gap: 60,
        transform: `translateX(${x}px)`,
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: 34,
        color: "#1e293b",
        whiteSpace: "nowrap",
      }}
    >
      {SYMBOLS.concat(SYMBOLS).map((s, i) => {
        const down = (i + row) % 3 === 0;
        return (
          <span key={`${s}-${i}`} style={{ display: "flex", gap: 12 }}>
            <span>{s}</span>
            <span style={{ color: down ? "#7f1d1d" : "#14532d" }}>
              {down ? "-" : "+"}
              {(((i * 37 + row * 11) % 90) / 10 + 0.4).toFixed(1)}%
            </span>

          </span>
        );
      })}
    </div>
  );
};

export const HookScene: React.FC<{ beat: PlacedBeat }> = ({ beat }) => {
  const frame = useCurrentFrame();
  const { fps, height } = useVideoConfig();

  const slam = spring({ frame: frame - Math.round(fps * 1.5), fps, config: { damping: 12, stiffness: 220 } });
  const logoScale = interpolate(slam, [0, 1], [1.5, 1]);
  const flash = interpolate(frame, [fps * 1.5, fps * 1.62, fps * 1.9], [0, 0.5, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shake = frame > fps * 1.5 && frame < fps * 1.8 ? Math.sin(frame * 2.4) * 5 : 0;
  const tickerFade = interpolate(frame, [fps * 1.3, fps * 1.7], [0.9, 0.25], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ transform: `translateX(${shake}px)` }}>
      <AbsoluteFill style={{ justifyContent: "space-between", paddingTop: 120, paddingBottom: 120, opacity: tickerFade }}>
        {Array.from({ length: 9 }).map((_, r) => (
          <TickerRow key={r} row={r} />
        ))}
      </AbsoluteFill>

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: "0 90px", gap: 26 }}>
        {frame < fps * 1.55 ? (
          <>
            <Headline size={104} align="center" delay={0}>
              {beat.headline}
            </Headline>
            <Reveal delay={0.6} from={20}>
              <div
                style={{
                  fontFamily: theme.font,
                  fontWeight: 800,
                  fontSize: 104,
                  letterSpacing: -3,
                  color: theme.loss,
                  textAlign: "center",
                }}
              >
                {beat.sub}
              </div>
            </Reveal>
          </>
        ) : (
          <div style={{ transform: `scale(${logoScale})`, display: "flex", flexDirection: "column", alignItems: "center", gap: 24 }}>
            <Logo size={96} />
            <div
              style={{
                fontFamily: theme.font,
                fontWeight: 600,
                fontSize: 40,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: theme.muted,
              }}
            >
              Autonomous crypto trading
            </div>
          </div>
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{ backgroundColor: theme.text, opacity: flash }} />
      <AbsoluteFill
        style={{
          background: `radial-gradient(60% 40% at 50% 50%, ${theme.primary}22 0%, transparent 70%)`,
          height,
        }}
      />
    </AbsoluteFill>
  );
};
