import { Composition, calculateMetadata } from "remotion";
import { MainVideo } from "./MainVideo";
import type { AudioManifest } from "./types";
import manifest from "../public/audio-manifest.json";

const FPS = 30;

export const Root: React.FC = () => {
  return (
    <Composition
      id="TitanAIPromo"
      component={MainVideo}
      durationInFrames={900}
      fps={FPS}
      width={1080}
      height={1920}
      defaultProps={{ manifest: manifest as AudioManifest }}
      calculateMetadata={async ({ props }) => {
        const m = props.manifest as AudioManifest;
        const totalSeconds =
          m.introSeconds +
          m.outroSeconds +
          m.scenes.reduce((sum, s) => sum + s.durationSeconds + m.gapSeconds, 0) -
          m.gapSeconds;
        return {
          durationInFrames: Math.ceil(totalSeconds * FPS),
        };
      }}
    />
  );
};
