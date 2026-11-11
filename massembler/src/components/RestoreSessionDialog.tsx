import { useState } from 'react';
import { useStore } from '../store';
import { SavedSession, restoreSession } from '../utils/autosave';

interface RestoreSessionDialogProps {
  session: SavedSession;
  /** Called once the person has restored the session or chosen to start fresh. */
  onDone: () => void;
}

const plural = (count: number, word: string) => `${count} ${word}${count === 1 ? '' : 's'}`;

export function RestoreSessionDialog({ session, onDone }: RestoreSessionDialogProps) {
  const showToast = useStore((state) => state.showToast);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { project } = session;
  const placed = project.tracks.reduce((count, track) => count + track.clips.length, 0);
  const savedAt = new Date(project.savedAt).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

  const handleRestore = async () => {
    setRestoring(true);
    setError(null);
    try {
      await restoreSession(session);
      showToast(`Restored "${project.name}"`, 'success');
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error');
      setRestoring(false);
    }
  };

  return (
    // Above the Speed Dial, which MUI layers at 1050.
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-[1300] p-6">
      <div className="bg-gray-800 rounded-lg shadow-xl w-full max-w-md p-6">
        <h2 className="text-xl font-semibold text-white">Pick up where you left off?</h2>
        <p className="text-gray-300 mt-3">
          <span className="font-medium text-white">{project.name}</span> was kept in this
          browser, last changed {savedAt}.
        </p>
        <p className="text-sm text-gray-400 mt-1">
          {plural(project.audioFiles.length, 'audio file')} ·{' '}
          {plural(project.clips.length, 'clip')} · {placed} on the timeline
        </p>

        {error && (
          <p className="text-sm text-red-400 mt-3">Could not restore it: {error}</p>
        )}

        <p className="text-xs text-gray-500 mt-4">
          Starting fresh replaces it as soon as you change anything.
        </p>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onDone}
            disabled={restoring}
            className="px-4 py-2 rounded bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white"
          >
            Start fresh
          </button>
          <button
            onClick={handleRestore}
            disabled={restoring}
            className="px-4 py-2 rounded bg-blue-600 hover:bg-blue-700 disabled:bg-gray-700 text-white font-semibold"
            autoFocus
          >
            {restoring ? 'Restoring…' : 'Restore'}
          </button>
        </div>
      </div>
    </div>
  );
}
