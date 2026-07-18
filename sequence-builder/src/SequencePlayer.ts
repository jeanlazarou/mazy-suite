/**
 * SequencePlayer
 *
 * Manages playback of track sequences, including transitions
 */

import AudioSegmentLoader from './AudioSegmentLoader';

class SequencePlayer {
  private loader: AudioSegmentLoader;
  private isPlayingFlag: boolean;
  private currentSessionId: number;

  constructor() {
    this.loader = new AudioSegmentLoader();
    this.isPlayingFlag = false;
    this.currentSessionId = 0;
  }

  /**
   * Register a listener for playback progress.
   * Receives the URL of the track whose segment is playing, its progress
   * (0..1) and which segment ('start' or 'end') is playing, or
   * (null, 0, null) when playback stops.
   */
  set onProgress(callback: ((trackUrl: string | null, progress: number, segment: 'start' | 'end' | null) => void) | null) {
    this.loader.onProgress = callback;
  }

  /**
   * Play the ending of a track
   * @param url - Track URL
   */
  async playEnding(url: string): Promise<void> {
    const sessionId = ++this.currentSessionId;
    const segments = await this.loader.loadSegments(url);

    if (sessionId !== this.currentSessionId) return; // Cancelled

    this.isPlayingFlag = true;
    await this.loader.play(segments.end, url, 'end');

    if (sessionId !== this.currentSessionId) return; // Cancelled

    this.isPlayingFlag = false;
  }

  /**
   * Play the beginning of a track
   * @param url - Track URL
   */
  async playBeginning(url: string): Promise<void> {
    const sessionId = ++this.currentSessionId;
    const segments = await this.loader.loadSegments(url);

    if (sessionId !== this.currentSessionId) return; // Cancelled

    this.isPlayingFlag = true;
    await this.loader.play(segments.start, url, 'start');

    if (sessionId !== this.currentSessionId) return; // Cancelled

    this.isPlayingFlag = false;
  }

  /**
   * Play a transition: end of track A -> beginning of track B
   * @param urlA - First track URL
   * @param urlB - Second track URL
   */
  async playTransition(urlA: string, urlB: string): Promise<void> {
    const sessionId = ++this.currentSessionId;

    const [segmentsA, segmentsB] = await Promise.all([
      this.loader.loadSegments(urlA),
      this.loader.loadSegments(urlB)
    ]);

    if (sessionId !== this.currentSessionId) return; // Cancelled

    this.isPlayingFlag = true;
    await this.loader.play(segmentsA.end, urlA, 'end');

    if (sessionId !== this.currentSessionId) return; // Cancelled

    await this.loader.play(segmentsB.start, urlB, 'start');

    if (sessionId !== this.currentSessionId) return; // Cancelled

    this.isPlayingFlag = false;
  }

  /**
   * Play a full sequence with transitions
   * @param urls - Array of track URLs
   * @param onTrackChange - Callback invoked when track changes (index) => void
   */
  async playSequence(urls: string[], onTrackChange: (index: number) => void): Promise<void> {
    if (urls.length === 0) return;

    const sessionId = ++this.currentSessionId;
    this.isPlayingFlag = true;

    // Play first track's ending
    onTrackChange(0);
    const segments0 = await this.loader.loadSegments(urls[0]);
    if (sessionId !== this.currentSessionId) {
      onTrackChange(-1);
      return;
    }
    await this.loader.play(segments0.end, urls[0], 'end');

    // Play transitions for remaining tracks
    for (let i = 1; i < urls.length; i++) {
      if (sessionId !== this.currentSessionId) break;

      onTrackChange(i);
      const segments = await this.loader.loadSegments(urls[i]);
      if (sessionId !== this.currentSessionId) break;

      await this.loader.play(segments.start, urls[i], 'start');
      if (sessionId !== this.currentSessionId) break;

      if (i < urls.length - 1) {
        // Play ending of current track before next
        await this.loader.play(segments.end, urls[i], 'end');
      }
    }

    if (sessionId === this.currentSessionId) {
      this.isPlayingFlag = false;
    }
    onTrackChange(-1); // Signal completion
  }

  /**
   * Pre-load all segments for a list of tracks
   * @param urls - Track URLs to pre-load
   */
  async preloadTracks(urls: string[]): Promise<void> {
    const promises = urls.map(url => this.loader.loadSegments(url));
    await Promise.all(promises);
  }

  /**
   * Stop current playback
   */
  stop(): void {
    this.currentSessionId++; // Invalidate all running sessions
    this.isPlayingFlag = false;
    this.loader.stopCurrentSource();
  }

  /**
   * Check if currently playing
   */
  get isPlaying(): boolean {
    return this.isPlayingFlag;
  }

  /**
   * Clear all cached audio data
   */
  clearCache(): void {
    this.loader.clearCache();
  }
}

export default SequencePlayer;
