// Two audio files off the disk: an unclassified twin, no document needed.

import { adHocTwinDoc, serializeTwinDoc } from '../model/twin.js';
import { openTwinDoc } from './open_twin.js';

const stem = (name) => name.replace(/\.[^.]+$/, '');

export async function openLocalFiles(fileA, fileB) {
  const doc = adHocTwinDoc({
    title: `${stem(fileA.name)} vs ${stem(fileB.name)}`,
    a: { url: fileA.name, label: stem(fileA.name) },
    b: { url: fileB.name, label: stem(fileB.name) },
  });
  const files = { a: fileA, b: fileB };
  return openTwinDoc(serializeTwinDoc(doc), {
    fetchAudio: (_side, which) => files[which].arrayBuffer(),
  });
}
