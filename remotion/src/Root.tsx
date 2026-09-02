import { Composition } from "remotion";
import { MainVideo, getTimeline } from "./MainVideo";

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
    </>
  );
};
