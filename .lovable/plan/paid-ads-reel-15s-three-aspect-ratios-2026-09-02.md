# Paid-Ads Reel — 15s, three aspect ratios

Same real app footage and visual system as the reel you approved, recut for paid placements: faster beats, burned-in captions for muted autoplay, a custom cinematic music bed, and exports at 9:16, 1:1 and 16:9.

## The 15-second cut

Four beats, hard cuts on the music downbeats (no soft fades):

```text
0.0 – 2.6s   HOOK       "Crypto never sleeps. You do."       full-bleed type, no screen
2.6 – 7.2s   SYSTEM     "Five AI agents trade for you."      Dashboard + Agents footage
7.2 – 11.4s  RULES      "1.6 : 1 net of fees. Your caps."    Risk Management footage, highlight sweep
11.4 – 15.0s CTA        "Start free in paper mode."          $100k virtual balance. No card required.
```

Screens come from the existing captures already in the project (dashboard, agents, risk, trades) — nothing re-shot, nothing invented.

## Tightening

- Beat lengths are fixed by the edit, not stretched to fit the voice: shorter VO lines are written to land inside each slot.
- Faster entrances (10–14 frame springs instead of 20+), shorter cross-beat gaps, one screen push per beat instead of a slow drift.
- One highlight sweep per feature beat so the eye lands on the number in under a second.

## Voice and captions

- Regenerate the four ad lines shorter and punchier, with the same energetic delivery direction as the cut you liked.
- Burned-in kinetic captions, word-grouped and synced to the voice, sized for phone viewing and kept inside the safe area so no platform crop clips them.

## Music bed

A bespoke cinematic bed built for this 15-second structure: low pulse under the hook, pad and arp lift on the system beat, a filtered riser into the CTA, and a downbeat hit on each cut. Voice sits on top with the bed automatically ducked under every line, then brought back up in the gaps. Last note resolves on the final frame rather than being cut off.

## Exports

| Ratio | Size | Placement |
| --- | --- | --- |
| 9:16 | 1080x1920 | Reels, TikTok, Shorts, Stories |
| 1:1 | 1080x1080 | Instagram / Facebook feed |
| 16:9 | 1920x1080 | YouTube in-stream, Meta wide feed |

Each ratio is a real re-layout, not a letterboxed crop: type scale, screen framing and caption position adapt per format. All three land in your documents folder for download.

## Technical notes

- New `ADS15_BEATS` timeline in `remotion/src/timeline.ts` with fixed frame budgets per beat; new `paidAds` variant on `MainVideo`.
- Three compositions registered in `Root.tsx` (`TitanAIAds15Vertical`, `...Square`, `...Wide`); scenes read a format token from `useVideoConfig()` to switch layout, so one scene set serves all ratios.
- New `CaptionTrack` component driven by per-line word timings in the audio manifest.
- Music bed generated to `remotion/public/audio/ads-bed-15.mp3` via the ElevenLabs Music API (needs the ElevenLabs connector linked — I'll open the connect card); if you skip that, I synthesize the bed locally with ffmpeg instead, same structure.
- VO regenerated through the existing `scripts/generate-voiceover.mjs` path with an `ads15` section; manifest gains word-level timings.
- Ducking and final mix handled at render time by an audio layer with frame-based gain, so the MP4 needs no post step.
- QA: stills at every cut point plus each beat's midpoint, per ratio, checked for clipped captions and safe-area violations before delivery.

## Out of scope

No changes to the app itself, no changes to the main 44s reel, and no new claims beyond what the app already shows.
