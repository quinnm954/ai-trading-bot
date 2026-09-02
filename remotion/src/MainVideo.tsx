import { AbsoluteFill, Audio, staticFile, Sequence, useVideoConfig } from "remotion";
import { PersistentBackground } from "./components/PersistentBackground";
import { PersistentAccents } from "./components/PersistentAccents";
import { Scene1 } from "./scenes/Scene1";
import { Scene2 } from "./scenes/Scene2";
import { Scene3 } from "./scenes/Scene3";
import { Scene4 } from "./scenes/Scene4";
import { Scene5 } from "./scenes/Scene5";
import type { AudioManifest } from "./types";

export const MainVideo: React.FC<{ manifest: AudioManifest }> = ({ manifest }) => {
  const { fps } = useVideoConfig();
  const introFrames = Math.round(manifest.introSeconds * fps);
  const gapFrames = Math.round(manifest.gapSeconds * fps);
  const outroFrames = Math.round(manifest.outroSeconds * fps);

  let cursor = introFrames;
  const sceneStarts: number[] = [];
  for (const scene of manifest.scenes) {
    sceneStarts.push(cursor);
    cursor += Math.round(scene.durationSeconds * fps);
    cursor += gapFrames;
  }
  const totalFrames = cursor - gapFrames + outroFrames;

  return (
    <AbsoluteFill>
      <PersistentBackground />
      <PersistentAccents />
      <Audio src={staticFile("audio/ambient.mp3")} volume={0.25} />

      {manifest.scenes.map((scene, i) => (
        <Sequence
          key={scene.id}
          from={sceneStarts[i]}
          durationInFrames={Math.round(scene.durationSeconds * fps) + 2}
        >
          <Audio src={staticFile(scene.audio)} volume={1} />
        </Sequence>
      ))}

      <Sequence from={0} durationInFrames={totalFrames}>
        <Scene1 manifest={manifest} />
      </Sequence>
      <Sequence from={sceneStarts[1] || 0} durationInFrames={totalFrames - (sceneStarts[1] || 0)}>
        <Scene2 manifest={manifest} />
      </Sequence>
      <Sequence from={sceneStarts[2] || 0} durationInFrames={totalFrames - (sceneStarts[2] || 0)}>
        <Scene3 manifest={manifest} />
      </Sequence>
      <Sequence from={sceneStarts[3] || 0} durationInFrames={totalFrames - (sceneStarts[3] || 0)}>
        <Scene4 manifest={manifest} />
      </Sequence>
      <Sequence from={sceneStarts[4] || 0} durationInFrames={totalFrames - (sceneStarts[4] || 0)}>
        <Scene5 manifest={manifest} />
      </Sequence>
    </AbsoluteFill>
  );
};
