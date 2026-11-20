import { currentRecording, loadingState } from "../Editor";
import { gateEdits, gateParams, levelAnalysis } from "../GateSettings";
import { audioEngine, audioPosition, monitorMode } from "../Waveform";
import { nextFrame } from "../utils";

import { NO_EDITS } from "../core/regions";
import { decodeWav, isWav } from "../core/wav";
import { wavePeaks } from "../core/peaks";

import { activeRegion } from "./regions";
import { analyzeRecording } from "./reanalyze";

// WAV files are read sample for sample; anything else goes through the
// browser decoder, which hands it back at the sound card rate
async function decode(engine, file) {
  const data = await file.arrayBuffer();

  if (isWav(data)) {
    try {
      return { ...decodeWav(data), wav: true };
    } catch (error) {
      console.warn(`${file.name}: ${error.message}, trying the browser decoder`);
    }
  }

  const audio = await engine.player.audioContext.decodeAudioData(data);
  const channels = [];

  for (let c = 0; c < audio.numberOfChannels; c++) {
    channels.push(audio.getChannelData(c));
  }

  return { sampleRate: audio.sampleRate, channels, bitDepth: null, float: true, wav: false };
}

export const loadRecording = async (get, set, file) => {
  if (!file) return;

  const engine = get(audioEngine);

  set(loadingState, `Reading ${file.name}…`);
  await nextFrame();

  try {
    const decoded = await decode(engine, file);

    if (!decoded.channels.length || !decoded.channels[0].length) {
      throw new Error("there is no audio in it");
    }

    set(loadingState, `Analysing ${file.name}…`);
    await nextFrame();

    const recording = {
      name: file.name,
      ...decoded,
      duration: decoded.channels[0].length / decoded.sampleRate,
      peaks: wavePeaks(decoded.channels, decoded.sampleRate),
    };

    const analysis = analyzeRecording(recording, get(gateParams).lowCut);

    set(activeRegion, undefined);
    set(gateEdits, NO_EDITS);
    set(monitorMode, "gated");
    set(gateParams, { threshold: analysis.stats.threshold });
    set(levelAnalysis, analysis);
    set(currentRecording, recording);
    set(audioPosition, 0);
  } catch (error) {
    console.error(error);
    alert(`Cannot open ${file.name}: ${error.message}`);
  } finally {
    set(loadingState, null);
  }
};
