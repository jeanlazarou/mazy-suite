import { ClipLibrary } from './components/ClipLibrary';
import { Timeline } from './components/Timeline';
import { PlaybackControls } from './components/PlaybackControls';
import { UndoRedoControls } from './components/UndoRedoControls';
import { ProjectActions } from './components/ProjectActions';
import { ToastContainer } from './components/ToastContainer';
import { ClipPropertiesPanel } from './components/ClipPropertiesPanel';
import { useStore } from './store';

function App() {
  const { projectName, setProjectName, selectedTrackClip } = useStore();

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
              Multi-Track Audio Sequencer • Use Speed Dial (bottom-right) for upload, save, load, and export
            </p>
          </div>
          <UndoRedoControls />
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="flex-1 flex overflow-hidden">
          {/* Clip library sidebar */}
          <div className="w-96">
            <ClipLibrary />
          </div>

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

      {/* Toast notifications */}
      <ToastContainer />
    </div>
  );
}

export default App;
