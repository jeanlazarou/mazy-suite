import { useEffect, useState } from 'react';
import { ClipLibrary } from './components/ClipLibrary';
import { Timeline } from './components/Timeline';
import { PlaybackControls } from './components/PlaybackControls';
import { UndoRedoControls } from './components/UndoRedoControls';
import { ProjectActions } from './components/ProjectActions';
import { ToastContainer } from './components/ToastContainer';
import { ClipPropertiesPanel } from './components/ClipPropertiesPanel';
import { RestoreSessionDialog } from './components/RestoreSessionDialog';
import { TourButton } from './components/AppTour';
import { useTour } from '@reactour/tour';
import { useStoreFields } from './store';
import { SavedSession, findSavedSession, startAutosave } from './utils/autosave';
import { markTourSeen, tourSeen } from './utils/tourState';

function App() {
  const { projectName, setProjectName, selectedTrackClip, clips } = useStoreFields(
    'projectName',
    'setProjectName',
    'selectedTrackClip',
    'clips'
  );
  const [isLibraryOpen, setIsLibraryOpen] = useState(true);
  const [savedSession, setSavedSession] = useState<SavedSession | null>(null);
  const { setIsOpen: setTourOpen, setCurrentStep: setTourStep } = useTour();

  // Autosave waits until the last session has been offered back, so the empty
  // project the app opens with cannot overwrite it first. With nothing to
  // offer, a first visit gets the tour instead.
  useEffect(() => {
    let cancelled = false;
    findSavedSession().then((session) => {
      if (cancelled) return;
      if (session) {
        setSavedSession(session);
        return;
      }
      startAutosave();
      if (!tourSeen()) {
        markTourSeen();
        setTourStep(0);
        setTourOpen(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [setTourOpen, setTourStep]);

  const handleSessionDecided = () => {
    setSavedSession(null);
    startAutosave();
  };

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 p-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1">
            <input
              type="text"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              className="text-2xl font-bold bg-transparent border-b border-transparent hover:border-gray-600 focus:border-blue-500 focus:outline-none transition-colors mb-1"
              placeholder="Project Name"
            />
            <p className="text-sm text-gray-400">
              Multi-Track Audio Sequencer{' '}
              <span className="text-gray-500" title="Application version">
                v{__APP_VERSION__}
              </span>{' '}
              • Use Speed Dial (bottom-right) for upload, save, load, and export
            </p>
          </div>
          <div className="flex items-center gap-2">
            <UndoRedoControls />
            <TourButton />
          </div>
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Clip library, collapsible to a rail to give the timeline room */}
          {isLibraryOpen ? (
            <div className="w-96 flex-shrink-0">
              <ClipLibrary onCollapse={() => setIsLibraryOpen(false)} />
            </div>
          ) : (
            <button
              onClick={() => setIsLibraryOpen(true)}
              className="w-9 flex-shrink-0 border-r border-gray-700 bg-gray-900 hover:bg-gray-800 text-gray-400 hover:text-white flex flex-col items-center gap-3 py-3 transition-colors"
              title="Show the clip library"
            >
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M6 5l7 7-7 7" />
              </svg>
              <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl]">
                Clip Library ({clips.length})
              </span>
            </button>
          )}

          {/* Timeline */}
          <Timeline />
        </div>

        {/* Clip Properties Panel - shown below timeline when a clip is selected */}
        {selectedTrackClip && <ClipPropertiesPanel />}
      </div>

      {/* Playback controls */}
      <PlaybackControls />

      {/* Project Actions Speed Dial */}
      <ProjectActions />

      {savedSession && (
        <RestoreSessionDialog session={savedSession} onDone={handleSessionDecided} />
      )}

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}

export default App;
