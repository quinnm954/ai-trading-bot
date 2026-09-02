export interface AudioManifest {
  introSeconds: number;
  outroSeconds: number;
  gapSeconds: number;
  scenes: {
    id: string;
    audio: string;
    durationSeconds: number;
  }[];
}

export interface SceneProps {
  manifest: AudioManifest;
}
