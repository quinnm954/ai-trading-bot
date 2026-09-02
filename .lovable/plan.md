# Reel fixes: replace the 404 slide, add emotion to the voiceover

## What's wrong

1. The Risk Manager slide (and its ads-cut counterpart) is a screenshot of the app's
   "404 — Oops! Page not found" screen. The capture pass hit `/risk` instead of the real
   route `/risk-management`, so the reel currently shows an error page while the voiceover
   talks about risk limits and vetoes.
2. The voiceover was generated with no delivery direction, so every line reads flat and
   even-paced.

## The fixes

**1. Real Risk Management footage**

Recapture the Risk Management page at mobile size from the running app (two framings:
one on the risk limits/kill-switch area, one lower on the page), replacing the two
404 screenshots used by the reel. Verify the new images actually show the risk page
before rendering.

**2. Voiceover with emotion**

Regenerate all voiceover lines with explicit per-line delivery direction so the read has
an arc instead of one flat tone:

- Hook: low, close, a little ominous, with a pause before "You do."
- Problem line: clipped and frustrated.
- Solution/agents lines: confident, warm, building energy.
- Risk and 1.6:1 lines: firm and precise, slowing down on the numbers.
- "Laptop closed." and the before/after line: dry, almost smug.
- Brand + CTA: bright, energetic lift, punching "Set it, and forget it."

Slight per-line pace variation replaces the single flat 1.15x speed so lines breathe
differently. Same voice throughout, so it still sounds like one narrator.

**3. Re-time and re-render**

New audio means new line durations, so the beat timings are rebuilt from the refreshed
audio manifest, then both cuts are re-rendered and spot-checked on key frames
(including the new Risk slide) before delivery: the 44s main reel and the ~19s paid-ads
cut.

## Technical notes

- Screenshots: Playwright at 393x852, dpr 3, authenticated session, route
  `/risk-management`; overwrite `remotion/public/screens/risk.png` and `risk-b.png`.
- Voiceover: `scripts/generate-voiceover.mjs` gains an `instructions` (and per-line
  `speed`) field per line on the `openai/gpt-4o-mini-tts` request; regenerates
  `public/voiceover/*.mp3` and `public/audio-manifest.json` with fresh `ffprobe`
  durations.
- `src/timeline.ts` beat durations recomputed from the manifest; composition frame
  counts follow.
- Render via `scripts/render.mjs` to `/mnt/documents/titanai-reel-44s.mp4` (new version
  file) and `/mnt/documents/titanai-reel-ads.mp4`.
- No app source files change; this is all inside `remotion/`.
