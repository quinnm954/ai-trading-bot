/**
 * Paid-ads cut: fixed 15.0s edit. Four beats, hard cuts on the music downbeats
 * at 0.0 / 2.6 / 7.2 / 11.4s. Timings are deliberately NOT derived from VO
 * length — the VO was written to fit these beats so the cut always lands on the
 * bed's impacts, in every aspect ratio.
 */
export const ADS15_FPS = 30;
export const ADS15_SECONDS = 15;
export const ADS15_DURATION = ADS15_FPS * ADS15_SECONDS;

export interface Ads15Beat {
  id: "hook" | "system" | "rules" | "cta";
  start: number;
  duration: number;
  vo: string;
  voStart: number;
}

export const ADS15_BEATS: Ads15Beat[] = [
  { id: "hook", start: 0, duration: 2.6, vo: "a15-01", voStart: 0.1 },
  { id: "system", start: 2.6, duration: 4.6, vo: "a15-02", voStart: 2.72 },
  { id: "rules", start: 7.2, duration: 4.2, vo: "a15-03", voStart: 7.34 },
  { id: "cta", start: 11.4, duration: 3.6, vo: "a15-04", voStart: 11.56 },
];

export interface Ads15Word {
  word: string;
  start: number;
  end: number;
}

export interface Ads15Clip {
  id: string;
  audio: string;
  text: string;
  durationSeconds: number;
  words?: Ads15Word[];
}
