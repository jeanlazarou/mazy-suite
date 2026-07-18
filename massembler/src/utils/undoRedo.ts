export type UndoAction =
  | {
      type: 'REMOVE_CLIP';
      clipId: string;
      clip: any;
    }
  | {
      type: 'REMOVE_TRACK_CLIP';
      trackId: string;
      trackClipId: string;
      trackClip: any;
    }
  | {
      type: 'MOVE_TRACK_CLIP';
      trackId: string;
      trackClipId: string;
      oldPosition: number;
      newPosition: number;
    }
  | {
      type: 'DELETE_TRACK';
      track: any;
      trackIndex: number;
    }
  | {
      type: 'RESIZE_CLIP';
      trackId: string;
      trackClipId: string;
      oldTrimStart: number;
      oldTrimEnd: number;
      newTrimStart: number;
      newTrimEnd: number;
      oldPosition: number;
      newPosition: number;
    }
  | {
      type: 'ADD_TRACK_CLIP';
      trackId: string;
      trackClipId: string;
      trackClip: any;
    }
  | {
      type: 'MOVE_CLIP_BETWEEN_TRACKS';
      sourceTrackId: string;
      targetTrackId: string;
      trackClipId: string;
      oldPosition: number;
      newPosition: number;
    }
  | {
      type: 'UPDATE_TRACK_CLIP_OPTIONS';
      trackId: string;
      trackClipId: string;
      oldValues: any;
      newValues: any;
    };

export class UndoRedoManager {
  private undoStack: UndoAction[] = [];
  private redoStack: UndoAction[] = [];
  private maxStackSize = 50;

  addAction(action: UndoAction) {
    this.undoStack.push(action);
    if (this.undoStack.length > this.maxStackSize) {
      this.undoStack.shift();
    }
    // Clear redo stack when a new action is performed
    this.redoStack = [];
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  undo(): UndoAction | null {
    const action = this.undoStack.pop();
    if (action) {
      this.redoStack.push(action);
    }
    return action || null;
  }

  redo(): UndoAction | null {
    const action = this.redoStack.pop();
    if (action) {
      this.undoStack.push(action);
    }
    return action || null;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  getUndoStackSize(): number {
    return this.undoStack.length;
  }

  getRedoStackSize(): number {
    return this.redoStack.length;
  }
}
