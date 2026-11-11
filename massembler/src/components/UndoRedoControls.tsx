import { useEffect } from 'react';
import { useStoreFields } from '../store';
import { isTextEntry, shortcutLabel } from '../utils/keyboard';

export function UndoRedoControls() {
  const { undo, redo, undoAvailable, redoAvailable } = useStoreFields(
    'undo',
    'redo',
    'undoAvailable',
    'redoAvailable'
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isTextEntry(e.target)) return;
      if (!(e.ctrlKey || e.metaKey)) return;

      // Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z and Ctrl/Cmd+Y redo.
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((key === 'z' && e.shiftKey) || key === 'y') {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  return (
    <div className="flex items-center gap-2" data-tour="undo">
      <button
        onClick={undo}
        disabled={!undoAvailable}
        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded text-sm transition-colors"
        title={`Undo (${shortcutLabel('Z')})`}
      >
        ↶ Undo
      </button>
      <button
        onClick={redo}
        disabled={!redoAvailable}
        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded text-sm transition-colors"
        title={`Redo (${shortcutLabel('Z', true)})`}
      >
        ↷ Redo
      </button>
    </div>
  );
}
