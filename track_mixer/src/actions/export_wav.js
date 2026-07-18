import { engine } from '../audio/engine';
import { downloadBlob } from '../utils';

// Render the mix through an OfflineAudioContext and download it as
// 16-bit stereo WAV — the input for mix-mastering.
export const exportWav = async () => {
  const blob = await engine.exportWav();
  if (blob) downloadBlob(blob, 'mix.wav');
};
