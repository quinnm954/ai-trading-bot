import { useVideoConfig } from "remotion";

export type FormatKind = "vertical" | "square" | "wide";

export interface Ads15Layout {
  kind: FormatKind;
  /** true = text over the device, false = text beside the device */
  overlay: boolean;
  phoneScale: number;
  phoneShiftX: number;
  phoneShiftY: number;
  headline: number;
  hookHeadline: number;
  kickerScale: number;
  sub: number;
  chip: number;
  caption: number;
  captionBottom: number;
  padX: number;
  padTop: number;
  textWidth: number;
  ctaButton: number;
  logo: number;
}

/** One shared layout contract so every aspect ratio is a real composition, never a crop. */
export const useAds15Layout = (): Ads15Layout => {
  const { width, height } = useVideoConfig();
  const ratio = width / height;

  if (ratio < 0.8) {
    return {
      kind: "vertical",
      overlay: true,
      phoneScale: 0.84,
      phoneShiftX: 0,
      phoneShiftY: -60,
      headline: 86,
      hookHeadline: 104,
      kickerScale: 1,
      sub: 42,
      chip: 32,
      caption: 56,
      captionBottom: 210,
      padX: 78,
      padTop: 140,
      textWidth: 900,
      ctaButton: 54,
      logo: 78,
    };
  }

  if (ratio < 1.35) {
    return {
      kind: "square",
      overlay: false,
      phoneScale: 0.5,
      phoneShiftX: 268,
      phoneShiftY: 10,
      headline: 66,
      hookHeadline: 88,
      kickerScale: 0.82,
      sub: 34,
      chip: 26,
      caption: 44,
      captionBottom: 78,
      padX: 66,
      padTop: 96,
      textWidth: 520,
      ctaButton: 44,
      logo: 62,
    };
  }

  return {
    kind: "wide",
    overlay: false,
    phoneScale: 0.64,
    phoneShiftX: 450,
    phoneShiftY: 10,
    headline: 76,
    hookHeadline: 104,
    kickerScale: 0.9,
    sub: 38,
    chip: 28,
    caption: 48,
    captionBottom: 74,
    padX: 110,
    padTop: 130,
    textWidth: 760,
    ctaButton: 48,
    logo: 70,
  };
};
