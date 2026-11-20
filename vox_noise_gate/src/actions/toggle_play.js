import { audioEngine } from "../Waveform";

export const playPause = async (get) => {
  const engine = get(audioEngine);

  engine.playPause();
};
