import { useTwinStore } from '../state/store.js';

let timer = 0;

export function showToast(text) {
  clearTimeout(timer);
  useTwinStore.setState({ toast: text });
  timer = setTimeout(() => useTwinStore.setState({ toast: null }), 3200);
}
