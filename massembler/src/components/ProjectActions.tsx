import { useEffect, useState, useRef } from 'react';
import SpeedDial from '@mui/material/SpeedDial';
import SpeedDialAction from '@mui/material/SpeedDialAction';
import SpeedDialIcon from '@mui/material/SpeedDialIcon';
import SaveIcon from '@mui/icons-material/Save';
import FolderOpenIcon from '@mui/icons-material/FolderOpen';
import MusicNoteIcon from '@mui/icons-material/MusicNote';
import CloudUploadIcon from '@mui/icons-material/CloudUpload';
import CompressIcon from '@mui/icons-material/Compress';
import NoteAddIcon from '@mui/icons-material/NoteAdd';
import { OptimizeDialog } from './OptimizeDialog';
import { ConfirmDialog } from './ConfirmDialog';
import { sortDroppedFiles } from '../utils/droppedFiles';
import { useStoreFields } from '../store';
import { exportMix, saveProject, loadProject, downloadBlob } from '../utils/projectManager';
import { AudioFile } from '../types';
import { shortcutLabel } from '../utils/keyboard';

export function ProjectActions() {
  const [open, setOpen] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [statusMessage, setStatusMessage] = useState('');
  const [showOptimize, setShowOptimize] = useState(false);
  const [confirmingNew, setConfirmingNew] = useState(false);
  const [dropping, setDropping] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);

  const {
    tracks,
    clips,
    audioFiles,
    pixelsPerSecond,
    projectName,
    masterVolume,
    addAudioFile,
    loadProjectState,
    clearProject,
    ensureAudioContext,
    showToast,
  } = useStoreFields(
    'tracks',
    'clips',
    'audioFiles',
    'pixelsPerSecond',
    'projectName',
    'masterVolume',
    'addAudioFile',
    'loadProjectState',
    'clearProject',
    'ensureAudioContext',
    'showToast'
  );

  const handleUploadAudio = () => {
    fileInputRef.current?.click();
    setOpen(false);
  };

  /** Decode and add audio files, from the file picker or a drop. */
  const uploadFiles = async (files: File[]) => {
    const ctx = ensureAudioContext();
    const added: string[] = [];

    for (const file of files) {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer);

        const audioFile: AudioFile = {
          id: `audio-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          name: file.name,
          buffer: audioBuffer,
          duration: audioBuffer.duration,
          // Keep the upload itself: saving these bytes back out is far
          // smaller than re-encoding the decoded buffer to PCM.
          sourceBlob: file,
          sourceFileName: file.name,
        };

        addAudioFile(audioFile);
        added.push(file.name);
      } catch (error) {
        console.error('Error loading audio file:', error);
        showToast(`Failed to load ${file.name}`, 'error', 0);
      }
    }

    if (added.length > 0) {
      showToast(
        `${added.length === 1 ? `Added "${added[0]}"` : `Added ${added.length} audio files`} - click ${
          added.length === 1 ? 'it' : 'one'
        } in Audio Files to make clips`,
        'success'
      );
    }
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    await uploadFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleExportMix = async () => {
    setOpen(false);
    setIsProcessing(true);
    setStatusMessage('Exporting mix...');
    setProgress(0);

    try {
      const { blob, gain } = await exportMix(tracks, clips, audioFiles, masterVolume, (p) => {
        setProgress(Math.round(p * 100));
      });

      downloadBlob(blob, `${projectName}-mix.wav`);
      setStatusMessage('Export complete!');
      if (gain < 1) {
        const decibels = (-20 * Math.log10(gain)).toFixed(1);
        showToast(
          `The mix peaked above full scale, so the export was turned down ${decibels} dB to keep it from clipping.`,
          'info',
          8000
        );
      }

      setTimeout(() => {
        setIsProcessing(false);
        setStatusMessage('');
      }, 2000);
    } catch (error) {
      console.error('Export error:', error);
      showToast(
        `Export failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        0
      );
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
        masterVolume,
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
      showToast(
        `Save failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        0
      );
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleLoadProject = () => {
    projectInputRef.current?.click();
    setOpen(false);
  };

  /** Open a .mass project, from the file picker or a drop. */
  const openProject = async (file: File) => {
    setIsProcessing(true);
    setStatusMessage('Loading project...');
    setProgress(0);

    try {
      const { projectData, audioFiles: loadedAudioFiles } = await loadProject(
        file,
        ensureAudioContext(),
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
        projectData.name,
        projectData.masterVolume
      );

      setStatusMessage('Project loaded!');

      setTimeout(() => {
        setIsProcessing(false);
        setStatusMessage('');
      }, 2000);
    } catch (error) {
      console.error('Load error:', error);
      showToast(
        `Load failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'error',
        0
      );
      setIsProcessing(false);
      setStatusMessage('');
    }
  };

  const handleProjectFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    await openProject(file);
    if (projectInputRef.current) projectInputRef.current.value = '';
  };

  // A new project starts as a first visit does: one empty track. Asked first
  // when there is work to lose - clearing it cannot be undone.
  const hasWork = audioFiles.length > 0 || clips.length > 0 || tracks.some((t) => t.clips.length > 0);
  const startNewProject = () => {
    setConfirmingNew(false);
    clearProject();
    showToast('New project', 'info', 2000);
  };
  const handleNewProject = () => {
    setOpen(false);
    if (hasWork) setConfirmingNew(true);
    else startNewProject();
  };

  // Files dropped anywhere on the window: audio is uploaded, a .mass opens.
  // Clips dragged from the library carry no files, and pass through.
  const dropRef = useRef({ uploadFiles, openProject, busy: isProcessing });
  dropRef.current = { uploadFiles, openProject, busy: isProcessing };

  useEffect(() => {
    let depth = 0; // dragenter and dragleave fire for every element crossed
    const carriesFiles = (e: DragEvent) => !!e.dataTransfer?.types.includes('Files');

    const handleEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth++;
      setDropping(true);
    };
    const handleLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) setDropping(false);
    };
    const handleOver = (e: DragEvent) => {
      if (!carriesFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const handleDrop = (e: DragEvent) => {
      if (!carriesFiles(e) || !e.dataTransfer) return;
      e.preventDefault();
      depth = 0;
      setDropping(false);

      const { uploadFiles, openProject, busy } = dropRef.current;
      if (busy || document.querySelector('[role="dialog"]')) return;

      const { project, audio, ignored } = sortDroppedFiles(Array.from(e.dataTransfer.files));
      if (project) {
        if (ignored > 0) {
          showToast(`Opening ${project.name}; the other files dropped with it were left out`, 'info');
        }
        void openProject(project);
      } else if (audio.length > 0) {
        void uploadFiles(audio);
      }
    };

    window.addEventListener('dragenter', handleEnter);
    window.addEventListener('dragleave', handleLeave);
    window.addEventListener('dragover', handleOver);
    window.addEventListener('drop', handleDrop);
    return () => {
      window.removeEventListener('dragenter', handleEnter);
      window.removeEventListener('dragleave', handleLeave);
      window.removeEventListener('dragover', handleOver);
      window.removeEventListener('drop', handleDrop);
    };
  }, [showToast]);

  // ⌘S saves and ⌘O opens, from anywhere: the browser's own Save Page and
  // Open File are no use here. The ref keeps the listener on the latest state.
  const shortcutsRef = useRef({ save: handleSaveProject, load: handleLoadProject, busy: isProcessing });
  shortcutsRef.current = { save: handleSaveProject, load: handleLoadProject, busy: isProcessing };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey) return;
      const key = e.key.toLowerCase();
      if (key !== 's' && key !== 'o') return;

      e.preventDefault();
      const { save, load, busy } = shortcutsRef.current;
      if (busy || document.querySelector('[role="dialog"]')) return;
      if (key === 's') void save();
      else load();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const actions = [
    { icon: <NoteAddIcon />, name: 'New Project', onClick: handleNewProject },
    { icon: <CloudUploadIcon />, name: 'Upload Audio (or drop files anywhere)', onClick: handleUploadAudio },
    { icon: <FolderOpenIcon />, name: `Load Project (${shortcutLabel('O')})`, onClick: handleLoadProject },
    { icon: <SaveIcon />, name: `Save Project (${shortcutLabel('S')})`, onClick: handleSaveProject },
    {
      icon: <CompressIcon />,
      name: 'Optimize Project',
      onClick: () => {
        setOpen(false);
        setShowOptimize(true);
      },
    },
    { icon: <MusicNoteIcon />, name: 'Export Mix', onClick: handleExportMix },
  ];

  return (
    <>
      <SpeedDial
        data-tour="project-actions"
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

      {showOptimize && <OptimizeDialog onClose={() => setShowOptimize(false)} />}

      {confirmingNew && (
        <ConfirmDialog
          title="Start a new project?"
          message="The open project goes, with its undo history. Save it first (Save Project) if you want to keep it."
          confirmLabel="Start new project"
          onConfirm={startNewProject}
          onCancel={() => setConfirmingNew(false)}
        />
      )}

      {/* Shown while files are dragged over the window */}
      {dropping && (
        <div className="fixed inset-4 z-[1300] pointer-events-none rounded-xl border-4 border-dashed border-blue-400 bg-blue-500/10 flex items-center justify-center">
          <div className="bg-gray-900/90 px-6 py-4 rounded-lg text-lg font-semibold text-white">
            Drop audio files to upload them, or a .mass project to open it
          </div>
        </div>
      )}

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
