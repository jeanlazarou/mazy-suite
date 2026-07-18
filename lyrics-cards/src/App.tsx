import { useState } from 'react';
import './index.css';
import AlbumTracksViewer from './AlbumTracksViewer';
import AlbumSelectionPage from './AlbumSelectionPage';
import { useDataPath } from './DataPathHelper';

function App() {
  const [selectedAlbum, setSelectedAlbum] = useState<string>("");
  const { dataPath, isLoading, error, useFilteredAlbums } = useDataPath();

  // Function to handle album selection
  const handleAlbumSelect = (albumName: string) => {
    setSelectedAlbum(albumName);
  };

  // Function to go back to album selection
  const handleBackToSelection = () => {
    setSelectedAlbum("");
  };

  // Show loading state while detecting the data path
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <p className="text-gray-600">Loading application...</p>
      </div>
    );
  }

  // Show error state if data path detection failed
  if (error) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center flex-col">
        <div className="bg-red-100 text-red-700 p-4 rounded-md mb-4 max-w-md">
          <p className="font-semibold mb-2">Error Loading Application</p>
          <p>{error}</p>
        </div>
        <p className="text-gray-600">
          Please ensure the data folder is properly configured.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {selectedAlbum ? (
        <AlbumTracksViewer
          albumName={selectedAlbum}
          onBack={handleBackToSelection}
          dataPath={dataPath}
        />
      ) : (
        <AlbumSelectionPage
          onSelectAlbum={handleAlbumSelect}
          dataPath={dataPath}
          useFilteredAlbums={useFilteredAlbums}
        />
      )}
    </div>
  );
}

export default App;
