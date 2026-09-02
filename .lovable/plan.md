# TitanAI Reel v2 — 42s Premium Vertical Commercial

Rebuild the promo reel as a real product commercial: actual app screens in device mockups, a 7-scene story, new voiceover, and a separate paid-ads cut. Output 1080x1920, 30fps, H.264.

## The 5 features to showcase (all real, verified in the app)

1. **Five AI agents that work together** — Watcher, Analyst, Risk, Trader, Healer (`/agents` console).
2. **Runs server-side 24/7** — cron-driven cycles every 30 min; nothing to keep open.
3. **Risk rules you set, the bot cannot break** — size/leverage caps, hard stop at -0.8%, drawdown kill switch (`/risk`).
4. **Expectancy-first exits** — every trade must clear 1.6:1 reward-to-risk net of the 0.8% round-trip fee (Dashboard/Trades).
5. **Non-custodial + free paper mode** — your exchange keys, $100k paper balance, $29/mo when you go live.

## Scene-by-scene storyboard (42s, 1260 frames)

| Time | Scene | On-screen text | Visual |
|---|---|---|---|
| 0.0–3.0 | Hook | "Crypto never sleeps." / "You do." → "Meet TitanAI." | Dark ticker field, red candles, logo slams in with bass hit |
| 3.0–7.5 | Problem | "Missed entries." "Emotional exits." "Fees eat the rest." | 3 hard cuts, each a stamped line over dimmed chart, shake on cut |
| 7.5–12.5 | Solution | "One system. Five AI agents." | Phone mockup rises, Dashboard screen, 5 agent chips orbit in |
| 12.5–29.0 | Features (4 beats, ~4s each) | "Agents that talk to each other" / "Your risk rules, enforced" / "1.6:1 net of fees" / "Runs on our servers, not your laptop" | Zoom into the real screen region per beat, animated glow outline, benefit line under mockup |
| 29.0–34.5 | Transformation | BEFORE "Manual. Emotional. Slow." → AFTER "Automated. Disciplined. 24/7." | Split wipe, left desaturated, right brand-blue, tools collapse into one app icon |
| 34.5–39.0 | Brand moment | "TitanAI" / "Set it. Forget it." | Hero phone mockup, 3D tilt, light sweep across glass |
| 39.0–42.0 | CTA | "Start free in paper mode." / "Get Started" / "titanaitrader.app" | Logo lockup, animated button, URL underline wipe |

## Voiceover script (new TTS, "onyx", ~1.05x)

1. "Crypto never sleeps. You do."
2. "Missed entries. Emotional exits. And fees eating whatever's left."
3. "TitanAI is one trading system run by five AI agents that work together."
4. "They read the market, rank every setup, and enforce the risk limits you set."
5. "Nothing executes unless it clears one-point-six to one, net of fees."
6. "And it all runs on our servers — twenty-four seven, laptop closed."
7. "Manual and emotional, or automated and disciplined."
8. "TitanAI. Set it, and forget it."
9. "Start free in paper mode. titanaitrader.app."

## Real UI capture

Capture the actual app at 393x852 via headless browser using an authenticated session, then place each PNG inside an iPhone-style mockup frame in Remotion:
`/dashboard`, `/agents`, `/risk`, `/trades`, `/wallet`. If a screen can't be captured authenticated, fall back to a mockup built from the app's own components rather than inventing UI.

## Audio direction (delivered as written recommendations + placeholder music bed)

- Music: modern minimal tech-house / cinematic trailer hybrid, 120–126 BPM, filtered intro, drop on the Solution cut at 7.5s, breakdown at the Transformation, final impact on CTA.
- SFX: sub bass hit on logo slam and each hard cut; short whoosh on wipes; soft UI tick on each feature highlight; riser under the before/after; tail reverb on the final logo.
- Mix: VO -3 dB dominant, music -14 dB under VO, SFX -10 dB.

## Deliverables

- `/mnt/documents/titanai-reel-42s.mp4` — main organic cut (42s).
- `/mnt/documents/titanai-reel-ads-15s.mp4` — paid cut: hook in 1.5s, 3 feature beats, CTA at 12s, text-heavy for sound-off viewing, no "watch to the end" pacing.
- `/mnt/documents/titanai-reel-brief.md` — storyboard, exact timings, VO script, on-screen text, transitions, audio direction, IG/TikTok caption + hashtags, and the ads-cut variations.
- Updated `PromoReel.tsx` to serve the new main cut on Landing and Pricing.

## Technical notes

- New Remotion scenes under `remotion/src/scenes/` (replacing Scene1–5), plus reusable `PhoneMockup`, `ScreenZoom` (pan/scale on a captured PNG), `HighlightBox`, `SplitCompare`, and `CTACard` components.
- Two compositions registered in `Root.tsx`: `TitanAIReel` (1260 frames) and `TitanAIReelAds` (450 frames) sharing the same scene library.
- Timing driven by a fixed frame map, with per-scene VO wrapped in its own `Sequence` so tracks never overlap (fixes the merged-voice bug).
- All motion via `useCurrentFrame()` + `interpolate`/`spring`; no `backdropFilter` (sandbox Chromium crashes on it).
- No performance, profit, or return claims anywhere in copy — compliance with the app's existing no-guarantees rule.
