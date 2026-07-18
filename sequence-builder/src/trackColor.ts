/**
 * Generate the display color for a track based on its position in the playlist.
 * Hues are evenly distributed across the spectrum.
 */
export function trackColor(index: number, totalTracks: number): string {
  const hue = (index * 360 / totalTracks) % 360;
  return `hsl(${hue}, 70%, 60%)`;
}
