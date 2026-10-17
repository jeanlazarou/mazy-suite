import { decodeAudioFile } from './context';
import { useStore, emptyTrackSettings, type AlbumTrack } from '../store/store';

const AUDIO_FILE_RE = /\.(wav|mp3|flac|ogg|aiff|aif|m4a)$/i;

let nextTrackId = 1;

// Decode audio files as tracks, in name order (like the CLI album
// command). Returns null (after reporting) when nothing could be loaded.
async function decodeTracks(files: File[]): Promise<AlbumTrack[] | null> {
  const { setError, setLoading } = useStore.getState();

  const audioFiles = files.filter(
    (f) => f.type.startsWith('audio/') || AUDIO_FILE_RE.test(f.name)
  );
  if (audioFiles.length === 0) {
    setError('Please select audio files');
    return null;
  }
  audioFiles.sort((a, b) => a.name.localeCompare(b.name));

  setLoading(true);
  try {
    const tracks: AlbumTrack[] = [];
    for (const file of audioFiles) {
      const buffer = await decodeAudioFile(file);
      tracks.push({
        id: `track-${nextTrackId++}`,
        name: file.name,
        buffer,
        info: {
          name: file.name,
          duration: buffer.duration,
          sampleRate: buffer.sampleRate,
          channels: buffer.numberOfChannels,
        },
        analysis: null,
        blocks: null,
        settings: emptyTrackSettings(),
      });
    }
    return tracks;
  } catch (err: any) {
    setError(`Failed to decode: ${err.message}`);
    return null;
  } finally {
    setLoading(false);
  }
}

/** Work on one track (replacing the current one). Several files mean an
 *  album — dropping a set of files is a clear intent. */
export async function openTrackFiles(files: File[]): Promise<void> {
  const tracks = await decodeTracks(files);
  if (!tracks) return;
  if (tracks.length > 1) useStore.getState().startAlbum(tracks);
  else useStore.getState().openTrack(tracks[0]);
}

/** Start an album with these files. */
export async function startAlbumFiles(files: File[]): Promise<void> {
  const tracks = await decodeTracks(files);
  if (tracks) useStore.getState().startAlbum(tracks);
}

/** Add files to the album (from a single track: makes it an album). */
export async function addAlbumFiles(files: File[]): Promise<void> {
  const tracks = await decodeTracks(files);
  if (tracks) useStore.getState().addTracks(tracks);
}

/** Open a file picker; calls onFiles with the selection. */
export function pickAudioFiles(multiple: boolean, onFiles: (files: File[]) => void): void {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'audio/*,.wav,.mp3,.flac,.ogg,.aiff,.aif,.m4a';
  input.multiple = multiple;
  input.onchange = () => {
    if (input.files?.length) onFiles(Array.from(input.files));
  };
  input.click();
}
