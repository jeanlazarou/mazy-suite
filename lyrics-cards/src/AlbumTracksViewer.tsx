import { useState, useEffect, useCallback } from 'react';
import { resolveDataPath, resolveLyricsPath } from './DataPathHelper';

// Define TypeScript interfaces
interface Album {
    name: string;
    color?: string;
    image?: string;
    displayColor?: string;
}

interface Track {
    url: string;
    title: string;
    creationDate: string;
    authors: string[];
    volume: number;
    lyrics?: string[]; // Added lyrics property
}

interface AlbumData {
    title: string;
    period: {
        from: string;
        to: string;
    };
    playlist: Track[];
}

interface TrackWithLyrics extends Track {
    lyrics: string[];
    id: string;
}

interface AlbumTracksViewerProps {
    albumName: string;
    onBack: () => void;
    dataPath: string;
}

// Main component
const AlbumTracksViewer = ({ albumName, onBack, dataPath }: AlbumTracksViewerProps) => {
    const [album, setAlbum] = useState<AlbumData | null>(null);
    const [tracks, setTracks] = useState<TrackWithLyrics[]>([]);
    const [fontSize, setFontSize] = useState<number>(10); // Default small size
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [draggedItem, setDraggedItem] = useState<TrackWithLyrics | null>(null);
    const [dragOverItem, setDragOverItem] = useState<TrackWithLyrics | null>(null);
    const [albumImageUrl, setAlbumImageUrl] = useState<string | null>(null);
    const [albumInfo, setAlbumInfo] = useState<Album | null>(null);

    // Function to open player for the current album
    const openAlbumInPlayer = () => {
        window.open(`../player/?list=${albumName}`, '_blank');
    };

    // Fetch data from JSON files using fetch API
    const fetchData = async (url: string) => {
        try {
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const text = await response.text();
            // Verify it's not returning HTML (index.html)
            if (text.includes('<!DOCTYPE html>') || text.includes('<html>')) {
                throw new Error(`Invalid JSON response from ${url}. Received HTML instead.`);
            }

            try {
                return JSON.parse(text);
            } catch (parseErr) {
                throw new Error(`Error parsing JSON from ${url}: ${parseErr instanceof Error ? parseErr.message : 'Unknown error'}`);
            }
        } catch (err) {
            if (err instanceof Error) {
                throw new Error(`Error fetching data: ${err.message}`);
            }
            throw new Error('Unknown error occurred');
        }
    };

    // Fetch SRT file content using fetch API
    const fetchSrtContent = async (srtFileName: string) => {
        try {
            const response = await fetch(resolveLyricsPath(dataPath, srtFileName));
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }

            const text = await response.text();
            // Verify it's not returning HTML (index.html)
            if (text.includes('<!DOCTYPE html>') || text.includes('<html>')) {
                throw new Error(`Invalid SRT response. Received HTML instead.`);
            }

            return text;
        } catch (err) {
            if (err instanceof Error) {
                throw new Error(`Error fetching SRT: ${err.message}`);
            }
            throw new Error('Unknown error occurred');
        }
    };

    // Check if image exists
    const checkImageExists = async (url: string) => {
        try {
            const response = await fetch(url, { method: 'HEAD' });
            if (!response.ok) return false;

            // Additional check for development environments that might return index.html
            // for non-existent files - if content type is text/html, it's likely not an image
            const contentType = response.headers.get('content-type');
            if (contentType && contentType.startsWith('text/html')) {
                return false;
            }

            return true;
        } catch {
            return false;
        }
    };

    // Load album data on component mount
    useEffect(() => {
        const loadAlbumData = async () => {
            try {
                setLoading(true);
                setTracks([]);

                // Fetch album info from albums.json
                const albumsList = await fetchData(resolveDataPath(dataPath, 'albums.json'));
                const selectedAlbumInfo = albumsList.find((a: Album) => a.name === albumName);
                setAlbumInfo(selectedAlbumInfo);

                // Fetch album data
                const albumData = await fetchData(resolveDataPath(dataPath, `${albumName}.json`));
                setAlbum(albumData);

                // Try to get album image
                const imageExtension = selectedAlbumInfo?.image || 'jpg';

                // Check if 500px version exists
                const largeImageUrl = resolveDataPath(dataPath, `${albumName}-500.${imageExtension}`);
                const smallImageUrl = resolveDataPath(dataPath, `${albumName}.${imageExtension}`);

                const largeExists = await checkImageExists(largeImageUrl);
                const smallExists = await checkImageExists(smallImageUrl);

                if (largeExists) {
                    setAlbumImageUrl(largeImageUrl);
                } else if (smallExists) {
                    setAlbumImageUrl(smallImageUrl);
                } else {
                    setAlbumImageUrl(null);
                }

                // Load all tracks with lyrics
                await loadTracksWithLyrics(albumData.playlist);

                setLoading(false);
            } catch (err) {
                setError(`Error loading album: ${err instanceof Error ? err.message : 'Unknown error'}`);
                setLoading(false);
            }
        };

        if (albumName) {
            loadAlbumData();
        }
    }, [albumName, dataPath]);

    // Load all tracks with their lyrics
    const loadTracksWithLyrics = async (tracksList: Track[]) => {
        const tracksWithLyrics: TrackWithLyrics[] = [];

        for (const track of tracksList) {
            try {
                // Remove * or + from track title to get SRT filename
                const srtFileName = track.title.replace(/[*+]$/, '');

                try {
                    const srtContent = await fetchSrtContent(srtFileName);
                    const parsedLyrics = parseSrt(srtContent);

                    tracksWithLyrics.push({
                        ...track,
                        lyrics: parsedLyrics,
                        id: `track-${tracksWithLyrics.length}`
                    });
                } catch (err) {
                    // If SRT file not found, add track with empty lyrics
                    tracksWithLyrics.push({
                        ...track,
                        lyrics: [`No lyrics found for "${track.title}"`],
                        id: `track-${tracksWithLyrics.length}`
                    });
                }
            } catch (err) {
                console.error(`Error loading lyrics for ${track.title}:`, err);
            }
        }

        setTracks(tracksWithLyrics);
    };

    // Parse SRT file and extract lyrics
    const parseSrt = (srtContent: string) => {
        const lines = srtContent.split('\n');
        const lyricsLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();

            // Skip empty lines, timestamps and indices
            if (line === '' || line.match(/^\d+$/) || line.match(/^\d{2}:\d{2}:\d{2},\d{3}\s-->\s\d{2}:\d{2}:\d{2},\d{3}$/)) {
                continue;
            }

            // If we find a lyric line
            if (!line.match(/^\d+$/) && !line.match(/-->/)) {
                lyricsLines.push(line);
            }
        }

        // Remove consecutive duplicates
        const uniqueLyrics = lyricsLines.filter((line, index, arr) => {
            return index === 0 || line !== arr[index - 1];
        });

        return uniqueLyrics;
    };

    // Handle font size change
    const handleFontSizeChange = (newSize: number) => {
        setFontSize(newSize);
    };

    // Drag and drop functionality
    const handleDragStart = (item: TrackWithLyrics) => {
        setDraggedItem(item);
    };

    const handleDragOver = (e: React.DragEvent, item: TrackWithLyrics) => {
        e.preventDefault();
        setDragOverItem(item);
    };

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();

        if (draggedItem && dragOverItem && draggedItem.id !== dragOverItem.id) {
            const newTracks = [...tracks];
            const draggedIndex = newTracks.findIndex(item => item.id === draggedItem.id);
            const dropIndex = newTracks.findIndex(item => item.id === dragOverItem.id);

            // Remove the dragged item
            const [removedItem] = newTracks.splice(draggedIndex, 1);

            // Add it at the new position
            newTracks.splice(dropIndex, 0, removedItem);

            setTracks(newTracks);
        }

        // Reset drag state
        setDraggedItem(null);
        setDragOverItem(null);
    }, [draggedItem, dragOverItem, tracks]);

    // Get shortened lyrics preview
    const getLyricsPreview = (lyrics: string[]) => {
        if (lyrics.length === 0) return "No lyrics available";

        // Get first few lines depending on font size
        const maxLines = fontSize <= 10 ? 5 : fontSize <= 15 ? 3 : 2;
        const previewLines = lyrics.slice(0, maxLines);

        return previewLines.join(" • ") + (lyrics.length > maxLines ? " ..." : "");
    };

    return (
        <div className="flex flex-col min-h-screen bg-gray-100 p-4">
            <header className="mb-4 flex items-center justify-between">
                <button
                    onClick={onBack}
                    className="flex items-center text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <span className="mr-1">←</span> Back to Albums
                </button>

                {/* Font Size Control - Moved to center */}
                <div className="flex items-center space-x-2 text-sm">
                    <span className="text-gray-500">Text:</span>
                    <button
                        onClick={() => handleFontSizeChange(Math.max(8, fontSize - 2))}
                        className="w-6 h-6 flex items-center justify-center bg-white rounded border border-gray-300 hover:bg-gray-100"
                        disabled={fontSize <= 8}
                        title="Decrease font size"
                    >
                        -
                    </button>
                    <span className="text-gray-700">{fontSize}</span>
                    <button
                        onClick={() => handleFontSizeChange(Math.min(24, fontSize + 2))}
                        className="w-6 h-6 flex items-center justify-center bg-white rounded border border-gray-300 hover:bg-gray-100"
                        disabled={fontSize >= 24}
                        title="Increase font size"
                    >
                        +
                    </button>
                </div>

                {/* Play album button */}
                <button
                    onClick={openAlbumInPlayer}
                    className="flex items-center px-3 py-1 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="mr-1">
                        <path d="M8 5v14l11-7z" />
                    </svg>
                    Play Album
                </button>
            </header>

            {error && (
                <div className="mb-4 p-3 bg-red-100 text-red-700 rounded-md">
                    {error}
                    <button
                        className="ml-2 text-red-500 hover:text-red-700"
                        onClick={() => setError(null)}
                    >
                        ×
                    </button>
                </div>
            )}

            {loading ? (
                <div className="flex justify-center items-center h-64">
                    <p className="text-gray-500">Loading...</p>
                </div>
            ) : (
                <>
                    {album && (
                        <div className="mb-4 flex items-center bg-white p-4 rounded-lg shadow-sm">
                            {albumImageUrl && (
                                <img
                                    src={albumImageUrl}
                                    alt={album.title}
                                    className="w-20 h-20 object-cover rounded-md mr-4"
                                />
                            )}
                            <div>
                                <h2 className="text-xl font-semibold">{album.title}</h2>
                                {album.period && (
                                    <p className="text-gray-600 text-sm">
                                        {album.period.from} - {album.period.to}
                                    </p>
                                )}
                                <p className="text-gray-500 text-sm mt-1">
                                    {tracks.length} tracks {albumInfo?.color &&
                                        <span className="inline-block w-3 h-3 rounded-full ml-2"
                                            style={{ backgroundColor: albumInfo.displayColor || albumInfo.color }}></span>}
                                </p>
                            </div>
                        </div>
                    )}

                    <div className="flex-1 overflow-auto">
                        {/* Changed to grid layout with responsive columns */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {tracks.length > 0 ? (
                                tracks.map((track) => (
                                    <div
                                        key={track.id}
                                        draggable
                                        onDragStart={() => handleDragStart(track)}
                                        onDragOver={(e) => handleDragOver(e, track)}
                                        onDrop={handleDrop}
                                        className={`bg-white p-3 rounded-md shadow border cursor-move hover:shadow-md flex flex-col h-full relative ${dragOverItem && dragOverItem.id === track.id
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200'
                                            }`}
                                    >
                                        <div className="mb-2 pr-6">
                                            <h3 className="font-semibold truncate" title={track.title}>
                                                {track.title.endsWith('*') ?
                                                    <span>{track.title.slice(0, -1)}<span className="text-blue-500">*</span></span> :
                                                    track.title}
                                            </h3>
                                            <p className="text-gray-600 text-xs truncate">
                                                By: {track.authors.join(', ')} • {track.creationDate}
                                            </p>
                                        </div>

                                        {/* Handle icon to indicate draggable */}
                                        <div className="absolute top-3 right-3 text-gray-300 hover:text-gray-500">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M8 9h8M8 15h8" strokeLinecap="round" />
                                            </svg>
                                        </div>

                                        <div className="overflow-y-auto flex-1" style={{
                                            maxHeight: fontSize > 12 ? '300px' : '200px',
                                            fontSize: `${fontSize}px`
                                        }}>
                                            {fontSize <= 12 ? (
                                                <p className="text-gray-800">
                                                    {getLyricsPreview(track.lyrics)}
                                                </p>
                                            ) : (
                                                <div className="text-gray-800 space-y-2">
                                                    {track.lyrics.map((line, idx) => (
                                                        <p key={idx}>{line}</p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="col-span-full text-center text-gray-500 py-8">
                                    No tracks found for this album.
                                </div>
                            )}
                        </div>
                    </div>

                    {tracks.length > 0 && (
                        <div className="mt-4 text-xs text-gray-500">
                            <p>Drag and drop cards to reorder. Use the text controls to adjust font size.</p>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};

export default AlbumTracksViewer;