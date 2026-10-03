// Stable empty object for zustand selectors to avoid infinite re-render loops.
// Using `|| {}` in a selector creates a new reference each render,
// which zustand's Object.is equality sees as changed, triggering re-renders.
export const EMPTY_PARAMS: Record<string, number> = {};
