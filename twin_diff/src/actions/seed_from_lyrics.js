// `g`: propose segments from the two lyric tracks. The proposal only ever
// fills gaps — every segment already in the document stays, because what the
// user marked is knowledge and the lyrics are a guess — and it is one undo
// step, so a proposal that reads wrong is one Ctrl+Z away.

import { useTwinStore } from '../state/store.js';
import { proposeSegments, seedInto } from '../model/lyrics_diff.js';
import { applySegments } from './apply_segments.js';
import { showToast } from './show_toast.js';

export function seedFromLyrics() {
  const { doc, lyrics } = useTwinStore.getState();
  if (!doc) return;
  if (!lyrics.a || !lyrics.b) {
    const missing = ['a', 'b'].filter((side) => !lyrics[side]).map((side) => doc.sides[side].label);
    showToast(`seeding needs lyrics on both sides — none on ${missing.join(' and ')}`);
    return;
  }

  const proposed = proposeSegments(lyrics.a.cues, lyrics.b.cues);
  const { segments, added, skipped } = seedInto(doc.segments, proposed);
  if (!added) {
    showToast(
      skipped
        ? `the lyrics propose ${skipped} segment${skipped === 1 ? '' : 's'}, all overlapping what is already marked`
        : 'the lyrics propose nothing',
    );
    return;
  }

  applySegments(segments);
  useTwinStore.setState({ doc: { ...useTwinStore.getState().doc, seededFrom: 'lyrics' } });
  showToast(
    `added ${added} segment${added === 1 ? '' : 's'} from the lyrics` +
      (skipped ? ` — ${skipped} left out, they overlapped what you marked` : '') +
      ' · Ctrl+Z undoes',
  );
}
