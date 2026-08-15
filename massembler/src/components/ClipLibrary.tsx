import { useState } from 'react';
import { useStore } from '../store';
import { AudioClip } from '../types';
import { Waveform, WaveformSelection } from './Waveform';
import { WaveformEditorModal } from './WaveformEditorModal';

/**
 * Unique clip id. Includes a random suffix rather than the timestamp alone:
 * duplicating twice in quick succession lands in the same millisecond.
 */
function createClipId(): string {
  return `clip-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface ClipLibraryProps {
  /** Omitted when the library cannot be hidden. */
  onCollapse?: () => void;
}

export function ClipLibrary({ onCollapse }: ClipLibraryProps) {
  const { audioFiles, clips, tracks, addClip, updateClip, removeClip, showToast } =
    useStore();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [clipName, setClipName] = useState('');
  const [selection, setSelection] = useState<WaveformSelection | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingClip, setEditingClip] = useState<AudioClip | null>(null);
  const [isQuickClipExpanded, setIsQuickClipExpanded] = useState(true);

  const selectedFile = audioFiles.find((f) => f.id === selectedFileId);

  /** A clip placed on any track cannot have its region changed. */
  const clipUsageCount = (clipId: string) =>
    tracks.reduce(
      (count, track) => count + track.clips.filter((tc) => tc.clipId === clipId).length,
      0
    );

  const handleCreateClip = () => {
    if (!selectedFileId || !selection) return;

    if (!clipName.trim()) {
      showToast('Please enter a clip name', 'warning');
      return;
    }

    addClip({
      id: createClipId(),
      name: clipName,
      audioFileId: selectedFileId,
      startTime: selection.start,
      endTime: selection.end,
      duration: selection.end - selection.start,
    });

    setClipName('');
    setSelection(null);
    showToast('Clip created!', 'success');
  };

  // The modal is used both to define a new clip and to edit an existing one.
  const handleModalSubmit = (start: number, end: number, name: string) => {
    if (editingClip) {
      updateClip(editingClip.id, {
        name,
        startTime: start,
        endTime: end,
        duration: end - start,
      });
      showToast('Clip updated', 'success');
      return;
    }

    if (!selectedFileId) return;

    addClip({
      id: createClipId(),
      name,
      audioFileId: selectedFileId,
      startTime: start,
      endTime: end,
      duration: end - start,
    });
  };

  const handleEditClip = (clip: AudioClip) => {
    setEditingClip(clip);
    setShowModal(true);
  };

  /** "name copy", then "name copy 2" and so on, so names stay distinguishable. */
  const copyNameFor = (name: string) => {
    const taken = new Set(clips.map((c) => c.name));
    let candidate = `${name} copy`;
    let suffix = 2;
    while (taken.has(candidate)) {
      candidate = `${name} copy ${suffix}`;
      suffix += 1;
    }
    return candidate;
  };

  // Copies the definition only: track placements belong to the original.
  const handleDuplicateClip = (clip: AudioClip) => {
    const name = copyNameFor(clip.name);
    addClip({ ...clip, id: createClipId(), name });
    // Names the copy rather than the original: the list scrolls, so this is
    // what tells you which row to look for.
    showToast(`Created "${name}"`, 'success');
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingClip(null);
  };

  // Editing works on the clip's own audio file, which need not be the one
  // currently selected for defining new clips.
  const modalAudioFile = editingClip
    ? audioFiles.find((f) => f.id === editingClip.audioFileId)
    : selectedFile;

  const handleDragStart = (e: React.DragEvent, clipId: string) => {
    e.dataTransfer.setData('clipId', clipId);
    e.dataTransfer.effectAllowed = 'copy';

    // Create a custom drag image that looks like a track clip
    const clip = clips.find(c => c.id === clipId);
    if (clip) {
      // Use the current timeline zoom level from the store
      const { pixelsPerSecond } = useStore.getState();
      const width = clip.duration * pixelsPerSecond;

      // Create a temporary element styled like a track clip
      const dragPreview = document.createElement('div');
      dragPreview.style.position = 'absolute';
      dragPreview.style.top = '-1000px'; // Position off-screen
      dragPreview.style.width = `${width}px`;
      dragPreview.style.height = '72px'; // Height of track clip
      dragPreview.style.backgroundColor = '#2563eb'; // blue-600
      dragPreview.style.border = '1px solid #60a5fa'; // blue-400
      dragPreview.style.borderRadius = '4px';
      dragPreview.style.padding = '4px';
      dragPreview.style.color = 'white';
      dragPreview.style.fontSize = '12px';
      dragPreview.style.fontWeight = '500';
      dragPreview.style.display = 'flex';
      dragPreview.style.flexDirection = 'column';
      dragPreview.style.justifyContent = 'space-between';
      dragPreview.style.opacity = '0.75';

      // Add clip info
      const nameDiv = document.createElement('div');
      nameDiv.textContent = clip.name;
      nameDiv.style.overflow = 'hidden';
      nameDiv.style.textOverflow = 'ellipsis';
      nameDiv.style.whiteSpace = 'nowrap';

      const infoDiv = document.createElement('div');
      infoDiv.textContent = `${clip.duration.toFixed(2)}s`;
      infoDiv.style.fontSize = '10px';
      infoDiv.style.color = '#bfdbfe'; // blue-100

      dragPreview.appendChild(nameDiv);
      dragPreview.appendChild(infoDiv);

      document.body.appendChild(dragPreview);

      // Set the custom drag image - position cursor at left edge
      e.dataTransfer.setDragImage(dragPreview, 0, 36); // Left edge at cursor

      // Clean up after drag starts
      setTimeout(() => {
        document.body.removeChild(dragPreview);
      }, 0);
    }
  };

  return (
    <div className="flex flex-col h-full border-r border-gray-700 bg-gray-900">
      <div className="border-b border-gray-700">
        <div className="p-4 flex items-center justify-between gap-2">
          <h2 className="text-lg font-bold">Clip Library</h2>
          {onCollapse && (
            <button
              onClick={onCollapse}
              className="text-gray-400 hover:text-white p-1 rounded hover:bg-gray-800"
              title="Hide the clip library"
            >
              <svg
                className="w-5 h-5"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7M18 19l-7-7 7-7" />
              </svg>
            </button>
          )}
        </div>

        {/* Quick Clip Definition - Collapsible */}
        <div className="border-t border-gray-700">
          <button
            onClick={() => setIsQuickClipExpanded(!isQuickClipExpanded)}
            className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-800 transition-colors"
          >
            <span className="text-sm font-semibold">Quick Clip Definition</span>
            <svg
              className={`w-5 h-5 transition-transform ${isQuickClipExpanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>

          {isQuickClipExpanded && (
            <div className="p-4 pt-0">
              {/* Audio file selector */}
              <div className="mb-4">
                <label className="block text-sm mb-2">Select Audio File:</label>
                <select
                  value={selectedFileId || ''}
                  onChange={(e) => setSelectedFileId(e.target.value || null)}
                  className="w-full bg-gray-800 border border-gray-700 rounded px-2 py-1"
                >
                  <option value="">-- Select File --</option>
                  {audioFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Waveform for selection */}
              {selectedFile && (
                <div className="mb-4">
                  <button
                    onClick={() => setShowModal(true)}
                    className="w-full mb-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 rounded font-semibold"
                  >
                    Open Waveform Editor
                  </button>
                  <Waveform
                    audioFile={selectedFile}
                    selection={selection}
                    onSelectionChange={setSelection}
                  />
                  <input
                    type="text"
                    value={clipName}
                    onChange={(e) => setClipName(e.target.value)}
                    placeholder="Clip name..."
                    className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-2 py-1"
                  />
                  <button
                    onClick={handleCreateClip}
                    disabled={!selection || selection.end - selection.start < 0.01}
                    className="w-full mt-2 px-4 py-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-700 disabled:text-gray-500 rounded font-semibold"
                  >
                    Create Clip
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Clip list */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold mb-2">Clips ({clips.length})</h3>
        <div className="space-y-2">
          {clips.map((clip) => {
            const file = audioFiles.find((f) => f.id === clip.audioFileId);
            const usage = clipUsageCount(clip.id);
            return (
              <div
                key={clip.id}
                draggable
                onDragStart={(e) => handleDragStart(e, clip.id)}
                className="p-2 bg-gray-800 rounded border border-gray-700 cursor-move hover:bg-gray-750 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-sm">{clip.name}</div>
                    <div className="text-xs text-gray-400">
                      {file?.name || 'Unknown file'}
                    </div>
                    <div className="text-xs text-gray-500">
                      {clip.startTime.toFixed(2)}s - {clip.endTime.toFixed(2)}s
                      ({clip.duration.toFixed(2)}s)
                    </div>
                    {usage > 0 && (
                      <div className="text-xs text-gray-500 mt-0.5">
                        used on {usage} track clip{usage === 1 ? '' : 's'} - name only
                      </div>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 ml-2">
                    <button
                      onClick={() => handleEditClip(clip)}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDuplicateClip(clip)}
                      className="text-blue-400 hover:text-blue-300 text-xs"
                      title="Create another clip with the same region"
                    >
                      Duplicate
                    </button>
                    <button
                      onClick={() => removeClip(clip.id)}
                      className="text-red-500 hover:text-red-400 text-xs"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Waveform Editor Modal - defines a new clip, or edits an existing one */}
      {showModal && modalAudioFile && (
        <WaveformEditorModal
          audioFile={modalAudioFile}
          onClose={closeModal}
          onCreateClip={handleModalSubmit}
          initialStart={editingClip?.startTime}
          initialEnd={editingClip?.endTime}
          initialName={editingClip?.name}
          regionLocked={!!editingClip && clipUsageCount(editingClip.id) > 0}
          title={editingClip ? 'Edit Clip' : 'Waveform Editor'}
          submitLabel={editingClip ? 'Save Changes' : 'Create Clip'}
        />
      )}
    </div>
  );
}
