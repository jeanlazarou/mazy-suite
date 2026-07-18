# Massembler - Multi-Track Audio Sequencer

A web-based multi-track audio sequencer that allows you to upload audio files, create clips from selected portions, and arrange them across multiple tracks with full playback control, project management, and audio export capabilities.

## 🎉 Major Features

### Core Editing Features
- **Audio File Upload**: Support for WAV and MP3 files via Material UI Speed Dial
- **Waveform Visualization**: Visual representation of audio with interactive selection
- **Advanced Waveform Editor**:
  - Large popup modal for precise waveform editing
  - Audio preview playback for selected regions
  - Better visualization for creating clips
- **Clip Library**: Create and manage audio clips from uploaded files (collapsible sidebar)
- **Multi-Track Timeline**: Arrange clips across multiple tracks
- **Drag & Drop**:
  - Easy placement of clips from library to tracks
  - Drag to reposition clips within tracks
  - Drag clips between different tracks
  - Custom drag preview showing clip appearance

### Advanced Editing
- **Clip Resizing**: Adjust clip length by dragging left or right edges
  - Each clip instance can be trimmed independently
  - Left edge resize moves the clip position for intuitive editing
- **Repeat Functionality**: Mark clips to repeat with configurable repeat count
  - Visual phantom clips show where repetitions will play
  - Can be disabled by setting count to 1
- **Undo/Redo**: Comprehensive history system supporting:
  - Adding/removing clips from library
  - Adding/removing clips from tracks
  - Moving clips within tracks
  - Moving clips between tracks
  - Resizing clips
  - Deleting tracks
  - Keyboard shortcuts (Ctrl+Z / Cmd+Z for undo, Ctrl+Shift+Z / Cmd+Shift+Z for redo)

### Track Controls
- **Volume Knob**: Rotary volume control with centered value display
- **Mute/Unmute**: Toggle with visual icons (speaker with/without X)
- **Add/Remove Tracks**: Flexible track management
- **Rename Tracks**: Click track name to edit

### Playback
- **Play, Pause, Stop**: Full playback controls
- **Timeline Scrubbing**: Jump to any position
- **Real-time Progress**: Visual playback position display
- **Timeline Zoom**: Adjust scale for precision editing

### Project Management
- **Export Mix** 🎵: Render all tracks to a single WAV file
  - Uses `OfflineAudioContext` for offline rendering
  - Respects track volumes and mute states
  - Handles clip trimming and repeats correctly
  - Shows real-time progress during export
  - Downloads as `[ProjectName]-mix.wav`

- **Save Project** 💾: Save complete project as `.mass` file (ZIP format)
  - Contains `project.json` with all state (tracks, clips, positions, trim values, volumes, etc.)
  - Includes `audio/` folder with all audio files as WAV format
  - Progress indicator during save
  - Downloads as `[ProjectName].mass`

- **Load Project** 📂: Load `.mass` files and completely restore state
  - Extracts and decodes all audio files
  - Restores tracks, clips, trim values, positions, repeats, etc.
  - Progress indicator during load
  - Everything works exactly as it did before save

### UI/UX Features
- **Material UI Speed Dial**: Beautiful floating action button (bottom-right) with:
  - 📁 Upload Audio
  - 📂 Load Project
  - 💾 Save Project
  - 🎵 Export Mix
- **Collapsible Quick Clip Definition**: Save space in sidebar when not needed
- **Editable Project Name**: Click title in header to rename project
- **Progress Indicators**: All long-running operations show progress bars with percentages

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm or yarn

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd massembler
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to `http://localhost:5173`

## 🎮 How to Use

### 1. Upload Audio Files

Click the **Speed Dial** button (bottom-right) → **Upload Audio** → Select one or more WAV/MP3 files.

### 2. Create Clips

**Option A: Quick Selection (in sidebar)**
1. Expand "Quick Clip Definition" section if collapsed
2. Select an audio file from the dropdown
3. Click and drag on the waveform to select a region
4. Enter a name for your clip
5. The clip will be created and appear in the library

**Option B: Advanced Editor (recommended)**
1. Select an audio file from the dropdown
2. Click "Open Waveform Editor" button
3. Use the large waveform display to precisely select a region
4. Click "Play Selection" to preview your selection
5. Enter a name for your clip
6. Click "Create Clip"

### 3. Arrange Clips on Tracks

1. Drag a clip from the library onto a track
2. Drop it at the desired position on the timeline
3. **Reposition**: Drag clip blocks left or right to move them
4. **Move Between Tracks**: Drag clips up or down to different tracks
5. **Resize Clips**: Hover over clip edges and drag left/right edge to adjust trim
   - Each instance can be resized independently
   - Left edge resize moves the clip position for intuitive editing
6. Hover over a clip block to access controls:
   - Toggle repeat on/off
   - Adjust repeat count (set to 1 to disable)
   - Remove from track

### 4. Control Tracks

- **Volume**: Rotate the volume knob (shows value in center)
- **Mute**: Click the speaker icon to mute/unmute a track
- **Rename**: Click on the track name to edit it
- **Add Track**: Click the "+ Track" button to add a new track
- **Remove Track**: Click the trash icon to remove a track

### 5. Playback

- **Play**: Start playback from the current position
- **Pause**: Pause playback (can be resumed)
- **Stop**: Stop playback and return to the beginning
- **Seek**: Drag the timeline scrubber to jump to a specific position
- **Zoom**: Adjust the timeline zoom level for better precision

### 6. Undo/Redo

- **Undo**: Click the "Undo" button or press Ctrl+Z (Cmd+Z on Mac)
- **Redo**: Click the "Redo" button or press Ctrl+Shift+Z (Cmd+Shift+Z on Mac) or Ctrl+Y (Cmd+Y on Mac)
- Supports undoing all major operations:
  - Adding/removing clips
  - Adding/removing tracks
  - Moving clips within tracks
  - Moving clips between tracks
  - Resizing clips
  - Deleting tracks

### 7. Save and Export

**Save Your Work**:
- Click Speed Dial → **Save Project**
- Downloads a `.mass` file containing your complete project

**Load Saved Project**:
- Click Speed Dial → **Load Project**
- Select a `.mass` file to restore your work

**Export Final Mix**:
- Click Speed Dial → **Export Mix**
- Renders all tracks to a single WAV file
- Downloads as `[ProjectName]-mix.wav`

## 📦 Technical Stack

- **React 18**: UI framework with hooks
- **TypeScript**: Type-safe development
- **Vite**: Fast build tool and dev server
- **Zustand**: Lightweight state management with undo/redo
- **Tailwind CSS**: Utility-first styling
- **Material UI**: Modern UI components (Speed Dial, icons)
- **Web Audio API**: Audio playback and processing
- **JSZip**: Project file compression and management

### Key Technical Features
- **OfflineAudioContext**: High-quality audio rendering for export
- **AudioBuffer Management**: Efficient in-memory audio handling
- **Custom Drag & Drop**: Enhanced drag preview with visual feedback
- **ResizeObserver**: Responsive waveform rendering
- **WAV Encoding**: Client-side WAV file generation
- **ZIP Archive**: Project files packaged as `.mass` (ZIP format)

## Project Structure

```
massembler/
├── src/
│   ├── components/
│   │   ├── Waveform.tsx            # Waveform visualization
│   │   ├── ClipLibrary.tsx         # Clip management (collapsible)
│   │   ├── WaveformEditorModal.tsx # Advanced waveform editor
│   │   ├── Timeline.tsx            # Multi-track timeline
│   │   ├── Track.tsx               # Individual track component
│   │   ├── TrackClipBlock.tsx      # Clip block with resize/repeat
│   │   ├── VolumeKnob.tsx          # Rotary volume control
│   │   ├── PlaybackControls.tsx    # Playback UI
│   │   ├── UndoRedoControls.tsx    # Undo/redo UI
│   │   └── ProjectActions.tsx      # Speed Dial for save/load/export
│   ├── utils/
│   │   ├── audioEngine.ts          # Web Audio API engine
│   │   ├── undoRedo.ts             # Undo/redo manager
│   │   └── projectManager.ts       # Save/load/export logic
│   ├── types.ts                    # TypeScript interfaces
│   ├── store.ts                    # Zustand state management
│   ├── App.tsx                     # Main app component
│   ├── main.tsx                    # Entry point
│   └── index.css                   # Global styles
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
└── tailwind.config.js
```

## File Format

### .mass Project Files

Project files use the `.mass` extension and are standard ZIP archives containing:

```
project.mass (ZIP file)
├── project.json          # Project metadata and state
└── audio/
    ├── [audioId1].wav   # Audio file 1
    ├── [audioId2].wav   # Audio file 2
    └── ...
```

**project.json structure:**
```json
{
  "version": "1.0.0",
  "name": "My Project",
  "tracks": [...],           // All tracks with clips
  "clips": [...],            // All clip definitions
  "audioFiles": [...],       // Audio file metadata
  "pixelsPerSecond": 50      // Timeline zoom level
}
```

The `.mass` format is compatible with standard ZIP tools, so you can inspect or manually edit projects if needed.

## Development

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

### Preview Production Build

```bash
npm run preview
```

### Linting

```bash
npm run lint
```

## Browser Support

Modern browsers with Web Audio API support:
- Chrome/Edge 88+
- Firefox 85+
- Safari 14+

## License

MIT

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Roadmap

Future feature ideas:
- Real-time audio effects (reverb, delay, EQ)
- MIDI support
- Automation curves for volume/pan
- Collaborative editing
- More export formats (MP3, FLAC)
- Waveform caching for large files
