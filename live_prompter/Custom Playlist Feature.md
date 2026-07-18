# Custom Playlist Feature

## Context

The app currently only plays tracks from pre-defined album JSON files. The user wants to build ad-hoc playlists by picking tracks from any loaded album and reordering them via drag-and-drop — useful for assembling a setlist before a live performance.

## Approach

A toggle button next to "Music Library" in the sidebar header reveals a special "Custom Playlist" entry at the top of the album list. When browsing regular albums, each track gets a "+" button to add it. The custom playlist view uses `@dnd-kit` for drag-and-drop reordering. When playing from the custom playlist, prev/next navigation stays within it by reusing the existing `albumData`/`currentTrackIndex` mechanism.

## Install

```
pnpm add @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
```

## File Changes

### 1. `src/types/index.ts` — Add type

```typescript
export interface CustomPlaylistTrack {
  id: string;            // Unique ID for DnD (crypto.randomUUID())
  track: Track;
  sourceAlbum: string;   // Album name for display context
}
```

### 2. `src/App.tsx` — State & callbacks

**New state:**
- `customPlaylist: CustomPlaylistTrack[]`
- `customPlaylistVisible: boolean`
- `isPlayingFromCustomPlaylist: boolean`

**New callbacks:**
- `handleToggleCustomPlaylist` — toggle visibility
- `handleAddToCustomPlaylist(track, albumName)` — append track, auto-show playlist
- `handleRemoveFromCustomPlaylist(id)` — remove by unique id
- `handleReorderCustomPlaylist(activeId, overId)` — uses `arrayMove` from `@dnd-kit/sortable`
- `handleSelectCustomPlaylist` — sets `selectedAlbum='__custom_playlist__'` and builds `albumData` from custom playlist
- `handleCustomPlaylistTrackSelect(track, index)` — sets `albumData` to custom playlist, sets index, calls `loadTrack`

**Modifications:**
- `handleTrackSelect`: add `setIsPlayingFromCustomPlaylist(false)`
- `handleBackToAlbums`: add `setIsPlayingFromCustomPlaylist(false)`
- Album-loading `useEffect` (line 99): skip fetch when `selectedAlbum === '__custom_playlist__'`
- `handlePrevious`/`handleNext`: set `currentTrackIndex` and call `loadTrack` directly (instead of going through `handleTrackSelect` which does `findIndex` and would break with duplicate tracks)
- Add sync `useEffect`: when `isPlayingFromCustomPlaylist` is true and `customPlaylist` changes (reorder/remove), update `albumData` and `currentTrackIndex` to stay in sync
- Pass ~8 new props to `<Sidebar>`

### 3. `src/components/Sidebar.tsx` — UI additions

- **Header**: Add `ListMusic` icon button next to "Music Library" text + badge showing track count
- **Album list**: When `customPlaylistVisible`, render a special "Custom Playlist" entry at the top (gradient icon, track count)
- **Track list**: When `customPlaylistVisible` and viewing a regular album, show a `Plus` button on each track row (with `e.stopPropagation()` to avoid triggering track play)
- **Custom playlist view**: When `selectedAlbum === '__custom_playlist__'`, render `<CustomPlaylistView>` instead of the regular track list

### 4. `src/components/CustomPlaylistView.tsx` — New file

DnD-enabled track list with:
- Header with back button, playlist icon, track count
- Empty state message ("Browse albums and tap + to add tracks")
- `DndContext` + `SortableContext` wrapping the track list
- `PointerSensor` with 5px activation distance (prevents accidental drags during scroll)

### 5. `src/components/SortableTrackItem.tsx` — New file

Individual sortable track row with:
- `GripVertical` drag handle (left)
- Play icon + track title/authors/source album (center, clickable)
- `X` remove button (right)
- Visual feedback: opacity change while dragging, active track highlight

## Prev/Next Navigation

Key design insight: when a track is selected from the custom playlist, `albumData` is set to `{ title: 'Custom Playlist', playlist: customPlaylist.map(item => item.track) }`. This means the existing `handlePrevious`/`handleNext` logic operates on the custom playlist automatically — no branching needed.

## Verification

1. `pnpm dev` — app starts without errors
2. Toggle the playlist button next to "Music Library" — custom playlist entry appears at top of album list
3. Browse an album — "+" buttons appear on each track
4. Click "+" on several tracks — badge count updates, tracks appear in custom playlist
5. Open custom playlist — tracks are listed with drag handles
6. Drag a track to reorder — order updates visually
7. Click a track — audio plays, waveform + lyrics work
8. Press Arrow Right/Left — navigates within the custom playlist
9. Click "x" on a track — removed from playlist
10. `pnpm build` — builds without errors
