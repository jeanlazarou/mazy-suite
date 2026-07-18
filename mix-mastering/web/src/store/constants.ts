// Stable empty object for zustand selectors to avoid infinite re-render loops.
// Using `|| {}` in a selector creates a new reference each render,
// which zustand's Object.is equality sees as changed, triggering re-renders.
export const EMPTY_PARAMS: Record<string, number> = {};

// Display names for the listening targets used by Analysis & Recommendations.
// Insertion order is the chip display order; "neutral" (no device
// compensation, corrective suggestions only) comes first and is the default.
export const TARGET_LABELS: Record<string, string> = {
  neutral: 'Neutral',
  headphones: 'Headphones',
  car: 'Car Audio',
  studio: 'Studio Monitors',
  phone: 'Phone Speaker',
  bluetooth: 'Bluetooth Speaker',
};
