import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CustomPlaylistTrack } from '../types';
import { GripVertical, Play, Users, X } from 'lucide-react';

interface SortableTrackItemProps {
  item: CustomPlaylistTrack;
  isActive: boolean;
  onSelect: () => void;
  onRemove: () => void;
}

export function SortableTrackItem({ item, isActive, onSelect, onRemove }: SortableTrackItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 10 : undefined,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 p-3 rounded-lg transition-all duration-200 ${
        isActive
          ? 'bg-indigo-50 border-2 border-indigo-200 shadow-md'
          : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
      }`}
    >
      <button
        {...attributes}
        {...listeners}
        className="p-1 rounded hover:bg-gray-200 cursor-grab active:cursor-grabbing flex-shrink-0 touch-none"
        title="Drag to reorder"
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </button>

      <button onClick={onSelect} className="flex-1 flex items-center gap-3 min-w-0 text-left">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
          isActive ? 'bg-indigo-600 text-white shadow-lg' : 'bg-gray-200 text-gray-600'
        }`}>
          <Play className="w-3 h-3 ml-0.5" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 text-sm truncate">{item.track.title}</h3>
          <div className="flex items-center gap-1 text-xs text-gray-600 min-w-0">
            <Users className="w-3 h-3 flex-shrink-0" />
            <span className="truncate">{item.track.authors.join(', ')}</span>
          </div>
          <span className="text-xs text-gray-400 truncate block">{item.sourceAlbum}</span>
        </div>
      </button>

      <button
        onClick={(e) => {
          e.stopPropagation();
          onRemove();
        }}
        className="p-1.5 rounded-full hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors flex-shrink-0"
        title="Remove from playlist"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}
