import { useState } from 'react';
import { useStore } from '../store';
import { Waveform } from './Waveform';
import { WaveformEditorModal } from './WaveformEditorModal';

export function ClipLibrary() {
  const { audioFiles, clips, addClip, removeClip, showToast } = useStore();
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [clipName, setClipName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [isQuickClipExpanded, setIsQuickClipExpanded] = useState(true);

  const selectedFile = audioFiles.find((f) => f.id === selectedFileId);

  const handleCreateClip = (start: number, end: number) => {
    if (!selectedFileId || !clipName.trim()) {
      showToast('Please enter a clip name', 'warning');
      return;
    }

    addClip({
      id: `clip-${Date.now()}`,
      name: clipName,
      audioFileId: selectedFileId,
      startTime: start,
      endTime: end,
      duration: end - start,
    });

    setClipName('');
    showToast('Clip created!', 'success');
  };

  const handleCreateClipFromModal = (start: number, end: number, name: string) => {
    if (!selectedFileId) return;

    addClip({
      id: `clip-${Date.now()}`,
      name,
      audioFileId: selectedFileId,
      startTime: start,
      endTime: end,
      duration: end - start,
    });
  };

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
        <div className="p-4">
          <h2 className="text-lg font-bold">Clip Library</h2>
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
                  <Waveform audioFile={selectedFile} onRegionSelect={handleCreateClip} />
                  <input
                    type="text"
                    value={clipName}
                    onChange={(e) => setClipName(e.target.value)}
                    placeholder="Clip name..."
                    className="w-full mt-2 bg-gray-800 border border-gray-700 rounded px-2 py-1"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Select a region on the waveform or use the editor for better precision
                  </p>
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
                  </div>
                  <button
                    onClick={() => removeClip(clip.id)}
                    className="text-red-500 hover:text-red-400 text-xs ml-2"
                  >
                    Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Waveform Editor Modal */}
      {showModal && selectedFile && (
        <WaveformEditorModal
          audioFile={selectedFile}
          onClose={() => setShowModal(false)}
          onCreateClip={handleCreateClipFromModal}
        />
      )}
    </div>
  );
}
