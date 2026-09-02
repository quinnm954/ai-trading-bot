import { AbsoluteFill, useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { theme } from "../theme";
import { Headline, Logo } from "../components/Type";
import { useAds15Layout } from "./layout";

const SYMBOLS = ["BTC", "ETH", "SOL", "DOGE", "PEPE", "WIF", "BONK", "SHIB", "AVAX", "LINK"];

const TickerRow: React.FC<{ row: number; size: number }> = ({ row, size }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const dir = row % 2 === 0 ? -1 : 1;
  const x = ((frame / fps) * 200 * dir) % 900;
  return (
    <div
      style={{
        display: "flex",
        gap: 56,
        transform: `translateX(${x}px)`,
        fontFamily: theme.font,
        fontWeight: 700,
        fontSize: size,
        color: "#334155",
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

/** 0.0 - 2.6s: stop the scroll, then slam the brand in. */
export const A15Hook: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const layout = useAds15Layout();
  const rows = layout.kind === "vertical" ? 9 : 6;
  const slamAt = fps * 1.62;

  const slam = spring({ frame: frame - slamAt, fps, config: { damping: 11, stiffness: 260 } });
  const logoScale = interpolate(slam, [0, 1], [1.55, 1]);
  const flash = interpolate(frame, [slamAt, slamAt + fps * 0.1, slamAt + fps * 0.3], [0, 0.55, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const shake = frame > slamAt && frame < slamAt + fps * 0.3 ? Math.sin(frame * 2.6) * 6 : 0;
  const tickerFade = interpolate(frame, [fps * 1.2, fps * 1.62], [0.85, 0.22], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ transform: `translateX(${shake}px)` }}>
      <AbsoluteFill
        style={{
          justifyContent: "space-around",
          paddingTop: 60,
          paddingBottom: 60,
          opacity: tickerFade * 0.75,
        }}
      >
        {Array.from({ length: rows }).map((_, r) => (
          <TickerRow key={r} row={r} size={layout.kind === "vertical" ? 34 : 28} />
        ))}
      </AbsoluteFill>
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(80% 46% at 50% 50%, rgba(2,3,8,0.96) 0%, rgba(2,3,8,0.86) 55%, transparent 100%)",
        }}
      />

      <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: `0 ${layout.padX}px`, gap: 20 }}>
        {frame < slamAt ? (
          <>
            <Headline size={layout.hookHeadline} align="center" delay={0}>
              Crypto never sleeps.
            </Headline>
            <div
              style={{
                opacity: interpolate(frame, [fps * 0.55, fps * 0.85], [0, 1], {
                  extrapolateLeft: "clamp",
                  extrapolateRight: "clamp",
                }),
                fontFamily: theme.font,
                fontWeight: 800,
                fontSize: layout.hookHeadline,
                letterSpacing: -3,
                color: theme.loss,
                textAlign: "center",
              }}
            >
              You do.
            </div>
          </>
        ) : (
          <div
            style={{
              transform: `scale(${logoScale})`,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 18,
            }}
          >
            <Logo size={layout.logo * 1.15} />
            <div
              style={{
                fontFamily: theme.font,
                fontWeight: 600,
                fontSize: layout.sub * 0.86,
                letterSpacing: 6,
                textTransform: "uppercase",
                color: theme.muted,
                textAlign: "center",
              }}
            >
              Autonomous crypto trading
            </div>
          </div>
        )}
      </AbsoluteFill>

      <AbsoluteFill style={{ backgroundColor: theme.text, opacity: flash }} />
    </AbsoluteFill>
  );
};
