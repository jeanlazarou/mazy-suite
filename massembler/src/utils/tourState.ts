const TOUR_SEEN_KEY = 'massembler.tourSeen';

/**
 * Whether this browser has been shown the tour already. Without storage it
 * counts as seen: better no tour than one on every visit.
 */
export function tourSeen(): boolean {
  try {
    return localStorage.getItem(TOUR_SEEN_KEY) === 'yes';
  } catch {
    return true;
  }
}

export function markTourSeen() {
  try {
    localStorage.setItem(TOUR_SEEN_KEY, 'yes');
  } catch {
    // storage unavailable: tourSeen already answers yes
  }
}
