import { useTwinStore, refreshLayout, DEFAULT_PX_PER_SEC } from '../state/store.js';

const MIN = 3;
const MAX = 120;

export function setZoom(pxPerSec) {
  useTwinStore.setState({ pxPerSec: Math.min(Math.max(pxPerSec, MIN), MAX) });
  refreshLayout();
}

export function zoomBy(factor) {
  setZoom(useTwinStore.getState().pxPerSec * factor);
}

export function resetZoom() {
  setZoom(DEFAULT_PX_PER_SEC);
}

export function toggleFollow() {
  useTwinStore.setState({ follow: !useTwinStore.getState().follow });
}
