import { useEffect, useRef } from "react";
import { useAtomValue } from "jotai";

import { commands$ } from "./CommandsStream";
import { currentTitle, currentPlaylistUrl, currentPlaylist } from "./atoms";
import { playingTrack } from "./Sequencer";

export function MediaSessionHandler() {
  const albumTitle = useAtomValue(currentTitle);
  const playlistUrl = useAtomValue(currentPlaylistUrl);
  const playlist = useAtomValue(currentPlaylist);
  const currentTrack = useAtomValue(playingTrack);

  // Extract album slug from playlist URL for artwork paths
  // e.g., "/data/confusing-revenge.json" → "confusing-revenge"
  const albumSlug = playlistUrl
    ? playlistUrl.replace(/^.*\//, "").replace(/\.json$/, "")
    : null;

  // Refs so event handlers registered once always read the latest values
  const playlistRef = useRef(playlist);
  const currentTrackRef = useRef(currentTrack);
  const albumTitleRef = useRef(albumTitle);
  const albumSlugRef = useRef(albumSlug);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);
  useEffect(() => { currentTrackRef.current = currentTrack; }, [currentTrack]);
  useEffect(() => { albumTitleRef.current = albumTitle; }, [albumTitle]);
  useEffect(() => { albumSlugRef.current = albumSlug; }, [albumSlug]);

  // Action handlers — registered once
  useEffect(() => {
    if (!("mediaSession" in navigator)) {
      console.warn("Media Session API not supported");
      return;
    }

    navigator.mediaSession.setActionHandler("play", () => commands$.play());
    navigator.mediaSession.setActionHandler("pause", () => commands$.pause());
    navigator.mediaSession.setActionHandler("previoustrack", () => commands$.playPrevious());
    navigator.mediaSession.setActionHandler("nexttrack", () => commands$.playNext());

    return () => {
      navigator.mediaSession.setActionHandler("play", null);
      navigator.mediaSession.setActionHandler("pause", null);
      navigator.mediaSession.setActionHandler("previoustrack", null);
      navigator.mediaSession.setActionHandler("nexttrack", null);
    };
  }, []);

  // All sequencer event handlers in one effect — registered once, reads via refs.
  // Keeping all media session state updates synchronous within each event avoids
  // race conditions with React's async render/effect cycle.
  useEffect(() => {
    if (!("mediaSession" in navigator)) return;

    const notifyTrack = (track) => {
            if (!track) return;

      const artist = track.authors?.length > 0
        ? track.authors.join(", ")
        : "Unknown Artist";

      const slug = albumSlugRef.current;
      const artwork = slug
        ? [
            { src: `/data/${slug}.jpg`, sizes: "250x250", type: "image/jpeg" },
            { src: `/data/${slug}-500.jpg`, sizes: "500x500", type: "image/jpeg" },
          ]
        : [];

      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: artist,
        album: albumTitleRef.current || "Music Player",
        artwork: artwork,
      });

      if (track.duration) {
        navigator.mediaSession.setPositionState({
          duration: track.duration,
          position: 0,
          playbackRate: 1,
        });
      }

      navigator.mediaSession.playbackState = "playing";
    }

    const handlePlaying = ({ detail }) => {
      const { url } = detail;

      if (!url) {
        navigator.mediaSession.playbackState = "paused";
        return;
      }

      const track = playlistRef.current.find((t) => t.url === url);

      notifyTrack(track);
    };

    const handlePaused = () => {
      navigator.mediaSession.playbackState = "paused";
    };

    const handleResume = () => {
      const { url, position } = currentTrackRef.current;
      const track = playlistRef.current.find((t) => t.url === url);

      if (track?.duration) {
        navigator.mediaSession.setPositionState({
          duration: track.duration,
          position: position,
          playbackRate: 1,
        });
      }

      navigator.mediaSession.playbackState = "playing";
    };

    const handleStopped = () => {
      console.log("set playbackState = paused")
      navigator.mediaSession.playbackState = "paused";
    };

    document.addEventListener("sequencer:playing", handlePlaying);
    document.addEventListener("sequencer:paused", handlePaused);
    document.addEventListener("sequencer:continue", handleResume);
    document.addEventListener("sequencer:ended", handleStopped);
    document.addEventListener("sequencer:stopped", handleStopped);

    return () => {
      document.removeEventListener("sequencer:playing", handlePlaying);
      document.removeEventListener("sequencer:paused", handlePaused);
      document.removeEventListener("sequencer:continue", handleResume);
      document.removeEventListener("sequencer:ended", handleStopped);
      document.removeEventListener("sequencer:stopped", handleStopped);
    };
  }, []);

  return null;
}
