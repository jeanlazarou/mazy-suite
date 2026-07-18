# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Massembler is a web-based multi-track audio sequencer built with React, TypeScript, and the Web Audio API. It allows users to upload audio files, create clips, and arrange them on a multi-track timeline with mixing capabilities.

## Development Commands

```bash
# Install dependencies
pnpm install

# Start development server
pnpm dev

# Build for production
pnpm build

# Preview production build
pnpm preview

# Run linter
pnpm lint
```

## Architecture Overview

### State Management
The entire application state is managed by a single Zustand store in `src/store.ts`. This centralized store handles:
- Audio files and clips
- Tracks and timeline state
- Playback control
- Undo/redo functionality
- Project metadata

Key store actions follow patterns like `addAudioFile`, `createClip`, `updateTrackClip`, etc.

### Core Data Flow
1. **Audio Upload**: Files are processed into AudioBuffers and stored as `AudioFile` objects
2. **Clip Creation**: Users select regions to create `AudioClip` objects
3. **Track Arrangement**: Clips become `TrackClip` instances when placed on tracks
4. **Playback**: The audio engine (`src/utils/audioEngine.ts`) reads track state and renders audio

### Component Hierarchy
```
App.tsx
├── ClipLibrary.tsx (sidebar)
├── Timeline.tsx
│   └── Track.tsx
│       └── TrackClipBlock.tsx
├── PlaybackControls.tsx
└── ProjectActions.tsx (save/load/export)
```

### Key Utilities
- `src/utils/audioEngine.ts`: Web Audio API integration for playback and rendering
- `src/utils/projectManager.ts`: Project save/load (.mass files) and WAV export
- `src/utils/undoRedo.ts`: Undo/redo system that wraps store actions

## Important Patterns

### Adding New Features
When adding features that modify state:
1. Add the action to the store in `src/store.ts`
2. Wrap it with undo/redo support in `src/utils/undoRedo.ts`
3. Use the wrapped action from components

### Working with Audio
- All audio processing uses Web Audio API
- AudioBuffers are the primary audio data format
- The audio engine handles real-time playback and offline rendering

### Styling
- Uses Tailwind CSS for utility classes
- Dark theme by default (configured in `index.css`)
- Material UI components for complex UI elements

## Project File Format
`.mass` files are ZIP archives containing:
- `project.json`: Serialized application state
- `audio/`: Directory with all audio files as WAV

## Common Tasks

### Adding a new track operation
1. Define the action in the store
2. Add undo/redo wrapper
3. Create UI controls in Track component
4. Update types if needed

### Modifying audio playback
Work with `src/utils/audioEngine.ts` - it manages:
- AudioContext lifecycle
- Source node scheduling
- Gain node routing for mixing

### Changing project save/load
Modify `src/utils/projectManager.ts` - handles:
- State serialization
- File compression with JSZip
- Audio file conversion