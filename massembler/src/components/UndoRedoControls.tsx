import { useEffect } from 'react';
import { useStore } from '../store';

const NON_TEXT_INPUTS = ['checkbox', 'radio', 'range', 'button', 'submit', 'reset', 'file', 'color'];

/** A field with its own text undo, which the shortcuts must be left to. */
function isTextEntry(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable || target instanceof HTMLTextAreaElement) return true;
  return target instanceof HTMLInputElement && !NON_TEXT_INPUTS.includes(target.type);
}

export function UndoRedoControls() {
  const { undo, redo, undoAvailable, redoAvailable } = useStore();

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
    <div className="flex items-center gap-2">
      <button
        onClick={undo}
        disabled={!undoAvailable}
        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded text-sm transition-colors"
        title="Undo (Ctrl+Z)"
      >
        ↶ Undo
      </button>
      <button
        onClick={redo}
        disabled={!redoAvailable}
        className="px-3 py-1 bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 disabled:text-gray-600 disabled:cursor-not-allowed rounded text-sm transition-colors"
        title="Redo (Ctrl+Shift+Z)"
      >
        ↷ Redo
      </button>
    </div>
  );
}
