import { useState, useRef } from 'react';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import { useStore } from '../store';
import { exportMix, saveProject, loadProject, downloadBlob } from '../utils/projectManager';
import { AudioFile } from '../types';

export function ProjectActions() {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const {
    tracks,
    clips,
    audioFiles,
    pixelsPerSecond,
    projectName,
    addAudioFile,
    loadProjectState,
    audioContext,
    setAudioContext,
  } = useStore();

  const handleUploadAudio = () => {
    fileInputRef.current?.click();
    setOpen(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // Initialize audio context if it doesn't exist
    let ctx = audioContext;
    if (!ctx) {
      ctx = new AudioContext();
      setAudioContext(ctx);
    }

    for (const file of Array.from(files)) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const audioFile: AudioFile = {
          id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
        };

        addAudioFile(audioFile);
      } catch (error) {
        console.error('Error loading audio file:', error);
        alert(`Failed to load ${file.name}`);
      }
    }

    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleExportMix = async () => {
    setOpen(false);
    setIsProcessing(true);
    setStatusMessage('Exporting mix...');
    setProgress(0);

    try {
      const blob = await exportMix(tracks, clips, audioFiles, (p) => {
        setProgress(Math.round(p * 100));
      });

      downloadBlob(blob, `${projectName}-mix.wav`);
      setStatusMessage('Export complete!');

      setTimeout(() => {
        setIsProcessing(false);
        setStatusMessage('');
      }, 2000);
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleSaveProject = async () => {
    setOpen(false);
    setIsProcessing(true);
    setStatusMessage('Saving project...');
    setProgress(0);

    try {
      const blob = await saveProject(
        projectName,
        tracks,
        clips,
        audioFiles,
        pixelsPerSecond,
        (p) => {
          setProgress(Math.round(p * 100));
        }
      );

      downloadBlob(blob, `${projectName}.mass`);
      setStatusMessage('Project saved!');

      setTimeout(() => {
        setIsProcessing(false);
        setStatusMessage('');
      }, 2000);
    } catch (error) {
      console.error('Save error:', error);
      alert(`Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleLoadProject = () => {
    projectInputRef.current?.click();
    setOpen(false);
  };

  const handleProjectFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessing(true);
    setStatusMessage('Loading project...');
    setProgress(0);

    try {
      const { projectData, audioFiles: loadedAudioFiles } = await loadProject(
        file,
        (p) => {
          setProgress(Math.round(p * 100));
        }
      );

      // Load the project state
      loadProjectState(
        projectData.tracks,
        projectData.clips,
        loadedAudioFiles,
        projectData.pixelsPerSecond,
        projectData.name
      );

      setStatusMessage('Project loaded!');

      setTimeout(() => {
        setIsProcessing(false);
        setStatusMessage('');
      }, 2000);
    } catch (error) {
      console.error('Load error:', error);
      alert(`Load failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setIsProcessing(false);
      setStatusMessage('');
    }

    // Reset input
    if (projectInputRef.current) {
      projectInputRef.current.value = '';
    }
  };

  const actions = [
    { icon: <CloudUploadIcon />, name: 'Upload Audio', onClick: handleUploadAudio },
    { icon: <FolderOpenIcon />, name: 'Load Project', onClick: handleLoadProject },
    { icon: <SaveIcon />, name: 'Save Project', onClick: handleSaveProject },
    { icon: <MusicNoteIcon />, name: 'Export Mix', onClick: handleExportMix },
  ];

  return (
    <>
      <SpeedDial
        ariaLabel="Project actions"
        sx={{ position: 'fixed', bottom: 24, right: 24 }}
        icon={<SpeedDialIcon />}
        onClose={() => setOpen(false)}
        onOpen={() => setOpen(true)}
        open={open}
      >
        {actions.map((action) => (
          <SpeedDialAction
            key={action.name}
            icon={action.icon}
            slotProps={{
              tooltip: {
                title: action.name,
              }
            }}
            onClick={action.onClick}
          />
        ))}
      </SpeedDial>

      {/* Hidden file inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        multiple
        style={{ display: 'none' }}
        onChange={handleFileSelect}
      />
      <input
        ref={projectInputRef}
        type="file"
        accept=".mass"
        style={{ display: 'none' }}
        onChange={handleProjectFileSelect}
      />

      {/* Progress overlay */}
      {isProcessing && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-gray-800 p-6 rounded-lg shadow-xl max-w-md w-full">
            <h3 className="text-xl font-semibold mb-4 text-white">{statusMessage}</h3>
            <div className="w-full bg-gray-700 rounded-full h-4 mb-2">
              <div
                className="bg-blue-600 h-4 rounded-full transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-center text-gray-300">{progress}%</p>
          </div>
        </div>
      )}
    </>
  );
}
