import { useState, useEffect } from 'react';
import { resolveDataPath } from './DataPathHelper';

// Define TypeScript interfaces
interface Album {
  name: string;
  color?: string;
  image?: string;
  displayColor?: string;
}

interface AlbumSelectionPageProps {
  onSelectAlbum: (albumName: string) => void;
  dataPath: string;
  useFilteredAlbums: boolean;
}

const AlbumSelectionPage = ({ onSelectAlbum, dataPath, useFilteredAlbums }: AlbumSelectionPageProps) => {
  const [albums, setAlbums] = useState<Album[]>([]);
  const [albumsData, setAlbumsData] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');

  // Function to open player for all albums
  const openMainPlayer = () => {
    window.open('../player', '_blank');
  };

  // Function to open player for a specific album
  const openAlbumInPlayer = (albumName: string, event: React.MouseEvent) => {
    event.stopPropagation(); // Prevent album selection in the current app
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

  // Load albums on component mount
  useEffect(() => {
    const loadAlbumsData = async () => {
      try {
        setLoading(true);

        // Fetch the list of albums (using filtered version if available)
        const albumsList = await fetchData(resolveDataPath(dataPath, 'albums.json', useFilteredAlbums));
        setAlbums(albumsList);

        // Fetch each album's data to get the title
        const data: Record<string, any> = {};

        for (const album of albumsList) {
          try {
            const albumData = await fetchData(resolveDataPath(dataPath, `${album.name}.json`));
            data[album.name] = {
              title: albumData.title,
              period: albumData.period,
              trackCount: albumData.playlist.length
            };

            // Check for album image
            const imageExtension = album.image || 'jpg';
            const imageUrl = resolveDataPath(dataPath, `${album.name}.${imageExtension}`);
            const largeImageUrl = resolveDataPath(dataPath, `${album.name}-500.${imageExtension}`);

            const largeExists = await checkImageExists(largeImageUrl);
            const smallExists = await checkImageExists(imageUrl);

            if (largeExists) {
              data[album.name].imageUrl = largeImageUrl;
            } else if (smallExists) {
              data[album.name].imageUrl = imageUrl;
            }
          } catch (err) {
            console.error(`Error loading data for ${album.name}:`, err);
          }
        }

        setAlbumsData(data);
        setLoading(false);
      } catch (err) {
        setError(`Error loading albums: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setLoading(false);
      }
    };

    loadAlbumsData();
  }, [dataPath]);

  // Get background color style for album card
  const getBackgroundStyle = (album: Album) => {
    if (album.displayColor) {
      return { backgroundColor: album.displayColor };
    } else if (album.color) {
      return { backgroundColor: album.color };
    }
    return {};
  };

  // Filter albums based on search term
  const filteredAlbums = albums.filter(album => {
    const albumInfo = albumsData[album.name] || {};
    const albumTitle = albumInfo.title || album.name;
    return albumTitle.toLowerCase().includes(searchTerm.toLowerCase());
  });

  return (
    <div className="container mx-auto px-4 py-8">
      <header className="mb-8 text-center">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">Albums</h1>

        {/* Player access button */}
        <button
          onClick={openMainPlayer}
          className="px-4 py-2 bg-indigo-600 text-white rounded-md hover:bg-indigo-700 transition-colors mb-6"
        >
          Open Music Player
        </button>

        {/* Search input */}
        <div className="max-w-md mx-auto">
          <div className="relative">
            <input
              type="text"
              placeholder="Search albums..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full px-4 py-2 rounded-full border border-gray-300 focus:ring-2 focus:ring-blue-300 focus:border-blue-500 outline-none transition-colors"
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            )}
          </div>
        </div>
      </header>

      {error && (
        <div className="mb-6 p-4 bg-red-100 text-red-700 rounded-md">
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
          <p className="text-gray-500">Loading albums...</p>
        </div>
      ) : filteredAlbums.length === 0 ? (
        <div className="flex justify-center items-center h-64 flex-col">
          <p className="text-gray-500 mb-2">No albums found matching "{searchTerm}"</p>
          <button
            onClick={() => setSearchTerm('')}
            className="text-blue-500 hover:text-blue-700"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {filteredAlbums.map((album) => {
            const albumInfo = albumsData[album.name] || {};

            return (
              <div
                key={album.name}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer relative group"
                onClick={() => onSelectAlbum(album.name)}
              >
                {/* Play button that appears only on hover */}
                <div className="absolute bottom-3 right-3 z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                  <button
                    onClick={(e) => openAlbumInPlayer(album.name, e)}
                    className="bg-indigo-500 hover:bg-indigo-600 text-white p-2 rounded-full transition-all"
                    title="Play in music player"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  </button>
                </div>

                <div
                  className="h-40 bg-gray-200 flex items-center justify-center"
                  style={getBackgroundStyle(album)}
                >
                  {albumInfo.imageUrl ? (
                    <img
                      src={albumInfo.imageUrl}
                      alt={albumInfo.title || album.name}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="text-2xl font-bold text-white opacity-80">
                      {albumInfo.title || album.name}
                    </div>
                  )}
                </div>
                <div className="p-4">
                  <h2 className="text-lg font-semibold text-gray-800">
                    {albumInfo.title || album.name}
                  </h2>
                  {albumInfo.period && (
                    <p className="text-sm text-gray-600">
                      {albumInfo.period.from} - {albumInfo.period.to}
                    </p>
                  )}
                  {albumInfo.trackCount && (
                    <p className="text-sm text-gray-600 mt-1">
                      {albumInfo.trackCount} tracks
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default AlbumSelectionPage;
