import { DndContext, closestCenter, PointerSensor, useSensor, useSensors, DragEndEvent } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { SortableTrackItem } from './SortableTrackItem';
import { CustomPlaylistTrack, Track } from '../types';
import { ArrowLeft, ListMusic, Clock } from 'lucide-react';

interface CustomPlaylistViewProps {
  customPlaylist: CustomPlaylistTrack[];
  currentTrack: Track | null;
  onTrackSelect: (track: Track, index: number) => void;
  onRemove: (id: string) => void;
  onReorder: (activeId: string, overId: string) => void;
  onBack: () => void;
  isTransitioning: boolean;
  totalDuration?: number;
  durationLoading?: boolean;
  formatDuration?: (seconds: number) => string;
}

export function CustomPlaylistView({
  customPlaylist,
  currentTrack,
  onTrackSelect,
  onRemove,
  onReorder,
  onBack,
  isTransitioning,
  totalDuration,
  durationLoading,
  formatDuration,
}: CustomPlaylistViewProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      onReorder(String(active.id), String(over.id));
    }
  };

  return (
    <>
      <div className="flex items-center gap-3 p-6 pb-4 border-b border-gray-100 flex-shrink-0 bg-white">
        <button onClick={onBack} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ArrowLeft className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <ListMusic className="w-5 h-5 text-indigo-600" />
            <h2 className="text-lg font-semibold text-gray-900 truncate">Custom Playlist</h2>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-600">
            <span>{customPlaylist.length} tracks</span>
            {!durationLoading && totalDuration && totalDuration > 0 && formatDuration && (
              <>
                <span>•</span>
                <div className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>{formatDuration(totalDuration)}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <div className={`transform transition-all duration-300 ease-in-out ${
          isTransitioning ? 'translate-x-full opacity-0' : 'translate-x-0 opacity-100'
        }`}>
          <div className="p-6 pt-4">
            {customPlaylist.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <ListMusic className="w-8 h-8 mx-auto mb-2 text-gray-300" />
                <p className="text-sm">No tracks yet</p>
                <p className="text-xs mt-1">Browse albums and tap + to add tracks</p>
              </div>
            ) : (
              <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                <SortableContext items={customPlaylist.map(item => item.id)} strategy={verticalListSortingStrategy}>
                  <div className="space-y-2">
                    {customPlaylist.map((item, index) => (
                      <SortableTrackItem
                        key={item.id}
                        item={item}
                        isActive={currentTrack?.url === item.track.url}
                        onSelect={() => onTrackSelect(item.track, index)}
                        onRemove={() => onRemove(item.id)}
                      />
                    ))}
                  </div>
                </SortableContext>
              </DndContext>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
