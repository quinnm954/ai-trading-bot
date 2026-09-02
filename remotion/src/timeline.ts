export interface VoClip {
  id: string;
  audio: string;
  text: string;
  durationSeconds: number;
}

export interface AudioManifest {
  main: VoClip[];
  ads: VoClip[];
}

export type BeatKind =
  | "hook"
  | "problem"
  | "solution"
  | "feature"
  | "transform"
  | "brand"
  | "cta";

export interface BeatDef {
  id: string;
  kind: BeatKind;
  vo?: string;
  minSeconds: number;
  tailSeconds?: number;
  kicker?: string;
  headline?: string;
  sub?: string;
  screen?: string;
  focusY?: number;
  zoom?: number;
  highlight?: { top: number; height: number; label?: string };
  chips?: string[];
  accent?: string;
}

export const GAP_SECONDS = 0.07;
const DEFAULT_TAIL = 0.18;

export const MAIN_BEATS: BeatDef[] = [
  {
    id: "hook",
    kind: "hook",
    vo: "vo-01",
    minSeconds: 3.2,
    headline: "Crypto never sleeps.",
    sub: "You do.",
  },
  {
    id: "problem",
    kind: "problem",
    vo: "vo-02",
    minSeconds: 4.4,
    chips: ["Missed entries", "Emotional exits", "Fees eat the rest"],
  },
  {
    id: "solution",
    kind: "solution",
    vo: "vo-03",
    minSeconds: 4.6,
    kicker: "Meet TitanAI",
    headline: "One system. Five AI agents.",
    screen: "screens/dashboard.png",
    focusY: 0.28,
    zoom: 1.0,
    chips: ["Watcher", "Analyst", "Risk", "Trader", "Healer"],
  },
  {
    id: "f-agents",
    kind: "feature",
    vo: "vo-04",
    minSeconds: 4.4,
    kicker: "Agent console",
    headline: "Agents that talk to each other",
    sub: "Live prices in. Ranked setups out.",
    screen: "screens/agents.png",
    focusY: 0.42,
    zoom: 1.04,
    highlight: { top: 0.42, height: 0.2 },
    accent: "#38bdf8",
  },
  {
    id: "f-risk",
    kind: "feature",
    vo: "vo-05",
    minSeconds: 4.4,
    kicker: "Risk manager",
    headline: "Your rules. Enforced.",
    sub: "Size caps, leverage caps, daily loss limit, kill switch.",
    screen: "screens/risk.png",
    focusY: 0.52,
    zoom: 1.02,
    highlight: { top: 0.44, height: 0.24 },
    accent: "#f59e0b",
  },
  {
    id: "f-rr",
    kind: "feature",
    vo: "vo-06",
    minSeconds: 4.6,
    kicker: "Expectancy first",
    headline: "1.6 : 1, net of fees",
    sub: "No trade opens unless the math already works.",
    screen: "screens/trades.png",
    focusY: 0.34,
    zoom: 1.02,
    highlight: { top: 0.3, height: 0.26 },
    accent: "#22c55e",
  },
  {
    id: "f-always",
    kind: "feature",
    vo: "vo-07",
    minSeconds: 4.2,
    kicker: "Always on",
    headline: "Runs on our servers",
    sub: "Not your laptop. Cycles keep running while you sleep.",
    screen: "screens/dashboard-b.png",
    focusY: 0.5,
    zoom: 1.02,
    accent: "#818cf8",
  },
  {
    id: "transform",
    kind: "transform",
    vo: "vo-08",
    minSeconds: 3.6,
  },
  {
    id: "brand",
    kind: "brand",
    vo: "vo-09",
    minSeconds: 3.6,
    headline: "Set it. Forget it.",
    screen: "screens/dashboard.png",
  },
  {
    id: "cta",
    kind: "cta",
    vo: "vo-10",
    minSeconds: 3.6,
    tailSeconds: 0.9,
    headline: "Start free in paper mode.",
    sub: "$100k virtual balance. No card required.",
  },
];

export const ADS_BEATS: BeatDef[] = [
  {
    id: "hook",
    kind: "hook",
    vo: "ad-01",
    minSeconds: 2.4,
    headline: "Crypto never sleeps.",
    sub: "You do.",
  },
  {
    id: "solution",
    kind: "solution",
    vo: "ad-02",
    minSeconds: 4.4,
    kicker: "Meet TitanAI",
    headline: "Five AI agents trade for you.",
    screen: "screens/dashboard.png",
    focusY: 0.28,
    chips: ["Watcher", "Analyst", "Risk", "Trader", "Healer"],
  },
  {
    id: "f-rr",
    kind: "feature",
    vo: "ad-03",
    minSeconds: 4.0,
    kicker: "Your risk rules",
    headline: "1.6 : 1, net of fees",
    sub: "Hard stops. Kill switch. Non-custodial.",
    screen: "screens/risk.png",
    focusY: 0.52,
    zoom: 1.04,
    highlight: { top: 0.36, height: 0.24 },
    accent: "#f59e0b",
  },
  {
    id: "cta",
    kind: "cta",
    vo: "ad-04",
    minSeconds: 3.4,
    tailSeconds: 0.8,
    headline: "Start free in paper mode.",
    sub: "$100k virtual balance. No card required.",
  },
];

export interface PlacedBeat extends BeatDef {
  fromFrame: number;
  durationFrames: number;
  voDurationSeconds: number;
}

export const buildTimeline = (
  beats: BeatDef[],
  clips: VoClip[],
  fps: number
): { placed: PlacedBeat[]; totalFrames: number } => {
  const byId = new Map(clips.map((c) => [c.id, c]));
  let cursor = 0;
  const placed: PlacedBeat[] = [];
  beats.forEach((beat, i) => {
    const clip = beat.vo ? byId.get(beat.vo) : undefined;
    const tail = beat.tailSeconds ?? DEFAULT_TAIL;
    const seconds = Math.max(beat.minSeconds, (clip?.durationSeconds ?? 0) + tail);
    const durationFrames = Math.round(seconds * fps);
    placed.push({
      ...beat,
      fromFrame: cursor,
      durationFrames,
      voDurationSeconds: clip?.durationSeconds ?? 0,
    });
    cursor += durationFrames;
    if (i < beats.length - 1) cursor += Math.round(GAP_SECONDS * fps);
  });
  return { placed, totalFrames: cursor };
};
