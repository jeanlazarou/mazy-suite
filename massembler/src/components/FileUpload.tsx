import { useRef } from 'react';
import { useStore } from '../store';
import { loadAudioFile } from '../utils/audioEngine';

export function FileUpload() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { addAudioFile, audioContext, setAudioContext } = useStore();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    // Initialize audio context if not already done
    let ctx = audioContext;
    if (!ctx) {
      ctx = new AudioContext();
      setAudioContext(ctx);
    }

    // Process all selected files
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      // Check if file is audio
      if (!file.type.startsWith('audio/')) {
        alert(`${file.name} is not an audio file`);
        continue;
      }

      try {
        const buffer = await loadAudioFile(file, ctx);

        addAudioFile({
          id: `audio-${Date.now()}-${i}`,
          name: file.name,
          buffer,
          duration: buffer.duration,
        });
      } catch (error) {
        console.error(`Error loading ${file.name}:`, error);
        alert(`Failed to load ${file.name}`);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="p-4 border-b border-gray-700">
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/wav,audio/mp3,audio/mpeg"
        multiple
        onChange={handleFileChange}
        className="hidden"
        id="audio-file-input"
      />
      <label
        htmlFor="audio-file-input"
        className="inline-block px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded cursor-pointer transition-colors"
      >
        Upload Audio Files (WAV/MP3)
      </label>
    </div>
  );
}
