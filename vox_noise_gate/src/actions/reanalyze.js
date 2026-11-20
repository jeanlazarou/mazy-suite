import { currentRecording, loadingState } from "../Editor";
import { gateParams, levelAnalysis } from "../GateSettings";
import { nextFrame } from "../utils";

import { analyzeLevels, levelStats } from "../core/gate";
import { levelPeaks } from "../core/peaks";

export function analyzeRecording(recording, lowCut) {
  const analysis = analyzeLevels(recording.channels, recording.sampleRate, { lowCut });

  return {
    ...analysis,
    lowCut,
    stats: levelStats(analysis.levels),
    peaks: levelPeaks(analysis.levels),
  };
}

// The detector listens through a different low cut
export const reanalyze = async (get, set) => {
  const recording = get(currentRecording);

  if (!recording) return;

  set(loadingState, "Analysing…");
  await nextFrame();

  try {
    set(levelAnalysis, analyzeRecording(recording, get(gateParams).lowCut));
  } finally {
    set(loadingState, null);
  }
};
