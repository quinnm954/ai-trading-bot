import { Composition } from "remotion";
import { MainVideo, getTimeline } from "./MainVideo";
import { Ads15Video } from "./ads15/Ads15Video";
import { ADS15_DURATION } from "./ads15/beats";

const FPS = 30;

export const Root: React.FC = () => {
  return (
    <>
      <Composition
        id="TitanAIReel"
        component={MainVideo}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={getTimeline("main", FPS).totalFrames}
        defaultProps={{ variant: "main" as const }}
      />
      <Composition
        id="TitanAIReelAds"
        component={MainVideo}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={getTimeline("ads", FPS).totalFrames}
        defaultProps={{ variant: "ads" as const }}
      />

      {/* Paid-ads cut: fixed 15s, real layouts per aspect ratio (never a crop). */}
      <Composition
        id="Ads15Vertical"
        component={Ads15Video}
        fps={FPS}
        width={1080}
        height={1920}
        durationInFrames={ADS15_DURATION}
      />
      <Composition
        id="Ads15Square"
        component={Ads15Video}
        fps={FPS}
        width={1080}
        height={1080}
        durationInFrames={ADS15_DURATION}
      />
      <Composition
        id="Ads15Wide"
        component={Ads15Video}
        fps={FPS}
        width={1920}
        height={1080}
        durationInFrames={ADS15_DURATION}
      />
    </>
  );
};
