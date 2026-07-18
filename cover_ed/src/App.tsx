import { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Box, Loader, Text } from '@mantine/core';
import { DirectorySelector } from './components/DirectorySelector';
import { SearchAndSort } from './components/SearchAndSort';
import { FileList } from './components/FileList';
import { EditModal } from './components/EditModal';
import { AudioPlayer } from './components/AudioPlayer';
import { Mp3File } from './types';
import { Footer } from './components/Footer';

function App() {
  const [currentDir, setCurrentDir] = useState('');
  const [files, setFiles] = useState<Mp3File[]>([]);
  const [filteredFiles, setFilteredFiles] = useState<Mp3File[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingFile, setEditingFile] = useState(false);
  const [currentFile, setCurrentFile] = useState<Mp3File | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [bulkEditing, setBulkEditing] = useState(false);
  const [playingFile, setPlayingFile] = useState<Mp3File | null>(null);
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [version, setVersion] = useState<string>('');

  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    const getVersion = async () => {
      try {
        const ver = await invoke<string>('get_version');
        setVersion(ver);
      } catch (err) {
        console.error('Failed to get version:', err);
      }
    };
    getVersion();
  }, []);

  const loadFiles = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const loadedFiles = await invoke<Mp3File[]>('read_directory', { path });
      setFiles(loadedFiles);
      setFilteredFiles(loadedFiles);
    } catch (err) {
      setError('Failed to load files. Please try again.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentDir) {
      loadFiles(currentDir);
    }
  }, [currentDir]);

  return (
    <>
      <Box mx="auto" p="md">
        <DirectorySelector currentDir={currentDir} setCurrentDir={setCurrentDir} />
        <SearchAndSort
          files={files}
          setFilteredFiles={setFilteredFiles}
          selectedFiles={selectedFiles}
          setBulkEditing={setBulkEditing}
        />

        {loading && <Loader />}
        {error && <Text color="red">{error}</Text>}

        <FileList
          files={filteredFiles}
          selectedFiles={selectedFiles}
          setSelectedFiles={setSelectedFiles}
          setEditingFile={(file) => { setEditingFile(true); setCurrentFile(file) }}
          playingFile={playingFile}
          setPlayingFile={setPlayingFile}
          audioRef={audioRef}
        />

        {(editingFile || bulkEditing) &&
          <>
            <EditModal
              editingFile={editingFile}
              currentFile={currentFile}
              endFileEditing={() => { setEditingFile(false); setCurrentFile(null) }}
              bulkEditing={bulkEditing}
              setBulkEditing={setBulkEditing}
              selectedFiles={selectedFiles}
              originalImage={originalImage}
              setOriginalImage={setOriginalImage}
              loadFiles={loadFiles}
              currentDir={currentDir}
            />
          </>
        }

        <AudioPlayer audioRef={audioRef} />

        <Footer version={version} />
      </Box>
    </>
  );
}

export default App;