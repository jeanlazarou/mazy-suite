// ← / →: the previous / next twin of the set the open twin belongs to (as
// ↑ / ↓ step through the bands of one twin).

import { useTwinStore } from '../state/store.js';
import { placeInSet } from '../model/sets.js';
import { openTwinFromIndex } from './open_twin.js';
import { mayLeaveTwin } from './guard_unsaved.js';
import { showToast } from './show_toast.js';

export async function stepTwin(delta) {
  const { twins, file } = useTwinStore.getState();
  const place = placeInSet(twins, file);
  if (!place) {
    showToast('this twin belongs to no set — nothing to step through');
    return;
  }
  const target = delta > 0 ? place.next : place.previous;
  if (!target) {
    showToast(`${delta > 0 ? 'last' : 'first'} twin of “${place.set}”`);
    return;
  }
  const key = delta > 0 ? '→' : '←';
  if (!mayLeaveTwin(`step:${target.file}`, `${key} again`)) return;
  await openTwinFromIndex(target.file);
  const now = placeInSet(useTwinStore.getState().twins, target.file);
  if (now) showToast(`${now.index + 1} of ${now.count} — ${useTwinStore.getState().doc?.sides.b.label ?? ''}`);
}
