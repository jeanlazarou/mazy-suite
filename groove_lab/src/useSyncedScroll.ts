import { useEffect } from "react";

const GRID_SELECTOR = ".drum-grid, .roll-grid, .tab-grid";

/**
 * Keep the editor grids' horizontal scroll positions in lockstep. They share
 * the same column template (label + steps), so equal scrollLeft = aligned
 * columns. Echo events are harmless: a mirrored grid re-syncs to values that
 * already match, and the >1px guard stops rounding ping-pong.
 */
export function useSyncedScroll(deps: unknown[]): void {
  useEffect(() => {
    const els = Array.from(
      document.querySelectorAll<HTMLElement>(GRID_SELECTOR),
    );
    if (els.length < 2) return;
    // A freshly mounted grid (view toggle, section switch) starts at 0 —
    // align everyone to the first grid before listening.
    for (const el of els) el.scrollLeft = els[0].scrollLeft;
    const onScroll = (e: Event) => {
      const src = e.target as HTMLElement;
      for (const el of els) {
        if (el !== src && Math.abs(el.scrollLeft - src.scrollLeft) > 1) {
          el.scrollLeft = src.scrollLeft;
        }
      }
    };
    for (const el of els) {
      el.addEventListener("scroll", onScroll, { passive: true });
    }
    return () => {
      for (const el of els) el.removeEventListener("scroll", onScroll);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * When the playhead leaves the visible window, scroll it back to just right
 * of the lane labels (the synced grids follow). Scrolls only on exit, not
 * every step, so hand-scrolling elsewhere mid-playback isn't fought over.
 */
export function usePlayheadFollow(viewStep: number): void {
  useEffect(() => {
    if (viewStep < 0) return;
    const grid = document.querySelector<HTMLElement>(".drum-grid");
    const cell = grid?.querySelector<HTMLElement>(".step-header.playing");
    if (!grid || !cell || grid.scrollWidth <= grid.clientWidth) return;
    const gridRect = grid.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const labelEdge = 96 + 14; // label column + grid padding
    const left = cellRect.left - gridRect.left;
    if (left < labelEdge || cellRect.right > gridRect.right - 8) {
      grid.scrollLeft += left - labelEdge - 4;
    }
  }, [viewStep]);
}
