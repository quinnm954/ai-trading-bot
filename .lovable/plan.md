# Marketing Reel — 30s Sleek Fintech Montage

A vertical (9:16) 30-second promo reel for the $29/month Full Access plan, with AI voiceover and burned-in captions, delivered as an MP4 and embedded on the landing and pricing pages.

## Creative direction

- **Look**: dark charcoal base (#0B0F14), cool slate surfaces, single signal-green accent (#22C55E) with a muted amber for risk callouts. No purple, no neon rainbow.
- **Type**: one display sans for headlines, one clean body sans for captions. Big, tight, left-aligned — editorial, not centered slideshow.
- **Motifs**: thin grid lines, a rising equity line that carries between scenes, six agent nodes pulsing in sequence.
- **Pacing**: 5 scenes, mixed beat lengths (short punchy cuts against two slower reveals), wipe/slide transitions reused for consistency.

## Script (voiceover + captions)

1. **Hook (0-5s)** — "Most traders lose money to fees and emotion."
2. **System (5-12s)** — "Titan AI runs five agents around the clock: watcher, analyst, risk, trader, healer." Agent nodes light up in sequence.
3. **Discipline (12-19s)** — "Every trade must clear a 1.6-to-1 reward-to-risk ratio, net of fees. Hard stops. Kill switch. Non-custodial — your keys, your funds."
4. **Set and forget (19-25s)** — "It trades server-side. No app open, no tab, no babysitting."
5. **Close (25-30s)** — "Full access. Twenty-nine dollars a month. Cancel anytime." Plan card lands, ends on the logo.

Compliance: no profit claims, no dollar-return figures, no fake performance numbers on screen. A small "Not financial advice. Trading involves risk." line sits in the final beat.

## Production approach

Built with the Remotion motion-graphics pipeline (code-driven video), not AI-generated stock footage — that keeps the UI-styled visuals on-brand and the text crisp:

- Scaffold a `remotion/` project in the repo so the reel source is version-controlled and re-renderable.
- 1080x1920 at 30fps, 900 frames, 5 scene files plus persistent background/accent layers.
- Voiceover generated as an audio track, mixed under a low-key electronic bed; captions are timed text layers so the reel works muted.
- Render to `/mnt/documents/titan-ai-reel.mp4` and also drop a web-optimized copy into the app.

## App embed

- Add a `PromoReel` component (poster frame, tap-to-play, muted autoplay option, captions burned in).
- Place it in a dedicated section on `src/pages/Landing.tsx` above the feature grid, and on `src/pages/Pricing.tsx` next to the $29 plan card.
- Video file served from the app's public assets with lazy loading so it doesn't slow first paint.

## Technical notes

- New: `remotion/` project (src/Root.tsx, MainVideo.tsx, 5 scene components, render script), `src/components/marketing/PromoReel.tsx`, `public/media/titan-ai-reel.mp4` + poster JPG.
- Edited: `src/pages/Landing.tsx`, `src/pages/Pricing.tsx`.
- No backend, schema, or trading-logic changes.

## Not included here

The losing-trades fix (winners cut at +0.64% vs losers at −0.80%, oversized losers, mismatched TP stamping) is a separate change — say the word and I'll plan it next.
