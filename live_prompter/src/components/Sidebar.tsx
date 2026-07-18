import { useState, useMemo } from 'react';
import { Album, AlbumData, Track, CustomPlaylistTrack } from '../types';
import { CustomPlaylistView } from './CustomPlaylistView';
import { usePlaylistDuration, formatDuration } from '../hooks/usePlaylistDuration';
import {
  Music,
  ChevronRight,
  ArrowLeft,
  Play,
  Star,
  Users,
  Menu,
  X,
  ListMusic,
  Plus,
  Clock
} from 'lucide-react';

interface AlbumWithTitle extends Album {
  title?: string;
}

interface SidebarProps {
  albums: AlbumWithTitle[];
  selectedAlbum: string | null;
  albumData: AlbumData | null;
  currentTrack: Track | null;
  onAlbumSelect: (albumName: string) => void;
  onTrackSelect: (track: Track) => void;
  onBackToAlbums: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
  loading: boolean;
  customPlaylist: CustomPlaylistTrack[];
  customPlaylistVisible: boolean;
  onToggleCustomPlaylist: () => void;
  onAddToCustomPlaylist: (track: Track, albumName: string) => void;
  onRemoveFromCustomPlaylist: (id: string) => void;
  onReorderCustomPlaylist: (activeId: string, overId: string) => void;
  onSelectCustomPlaylist: () => void;
  onCustomPlaylistTrackSelect: (track: Track, index: number) => void;
  isPlayingFromCustomPlaylist: boolean;
}

export function Sidebar({
  albums,
  selectedAlbum,
  albumData,
  currentTrack,
  onAlbumSelect,
  onTrackSelect,
  onBackToAlbums,
  collapsed,
  onToggleCollapse,
  loading,
  customPlaylist,
  customPlaylistVisible,
  onToggleCustomPlaylist,
  onAddToCustomPlaylist,
  onRemoveFromCustomPlaylist,
  onReorderCustomPlaylist,
  onSelectCustomPlaylist,
  onCustomPlaylistTrackSelect
}: SidebarProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Memoize track arrays to prevent endless loops in duration calculation
  const currentPlaylistTracks = useMemo(() => albumData?.playlist || [], [albumData?.playlist]);
  const customPlaylistTracks = useMemo(() => customPlaylist.map(item => item.track), [customPlaylist]);

  // Calculate total duration of current playlist
  const { totalDuration, loading: durationLoading } = usePlaylistDuration(currentPlaylistTracks);

  // Calculate total duration of custom playlist
  const { totalDuration: customPlaylistDuration, loading: customPlaylistDurationLoading } = usePlaylistDuration(customPlaylistTracks);

  const handleImageError = (albumName: string) => {
    setImageErrors(prev => new Set(prev).add(albumName));
  };

  const getAlbumCoverUrl = (albumName: string) => {
    return `/data/${albumName}.jpg`;
  };

  const handleAlbumSelect = (albumName: string) => {
    setIsTransitioning(true);
    setTimeout(() => {
      onAlbumSelect(albumName);
      setIsTransitioning(false);
    }, 150);
  };

  const handleBackToAlbums = () => {
    setIsTransitioning(true);
    setTimeout(() => {
      onBackToAlbums();
      setIsTransitioning(false);
    }, 150);
  };

  const handleTrackSelect = (track: Track) => {
    onTrackSelect(track);
  };

  if (loading) {
    return (
      <div className="h-screen bg-white shadow-xl flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="h-screen bg-white shadow-xl flex flex-col">
      {/* Header with toggle button - Fixed */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200 flex-shrink-0">
        {!collapsed && (
          <div className="flex items-center gap-2">
            <div className="text-lg font-semibold text-gray-900">
              Music Library
            </div>
            <button
              onClick={onToggleCustomPlaylist}
              className={`p-1.5 rounded-lg transition-colors ${
                customPlaylistVisible
                  ? 'bg-indigo-100 text-indigo-600 hover:bg-indigo-200'
                  : 'hover:bg-gray-100 text-gray-400 hover:text-gray-600'
              }`}
              title={customPlaylistVisible ? 'Hide custom playlist' : 'Show custom playlist'}
            >
              <ListMusic className="w-4 h-4" />
            </button>
            {customPlaylist.length > 0 && (
              <span className="text-xs bg-indigo-100 text-indigo-600 px-1.5 py-0.5 rounded-full font-medium">
                {customPlaylist.length}
              </span>
            )}
          </div>
        )}
        <button
          onClick={onToggleCollapse}
          className="p-2 rounded-lg hover:bg-gray-100 transition-colors ml-auto"
        >
          {collapsed ? (
            <Menu className="w-5 h-5 text-gray-600" />
          ) : (
            <X className="w-5 h-5 text-gray-600" />
          )}
        </button>
      </div>

      {/* Content - Scrollable */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {collapsed ? (
          // Collapsed state - show minimal info
          <div className="p-4">
            {currentTrack && (
              <div className="text-center">
                <div className="w-8 h-8 mx-auto mb-2 bg-indigo-600 rounded-full flex items-center justify-center">
                  <Play className="w-4 h-4 text-white" />
                </div>
                <div className="w-2 h-2 bg-green-500 rounded-full mx-auto animate-pulse"></div>
              </div>
            )}
          </div>
        ) : (
          // Expanded state - show full content
          <div className="h-full flex flex-col">
            {selectedAlbum && albumData ? (
              selectedAlbum === '__custom_playlist__' ? (
                // Custom playlist view with drag-and-drop
                <CustomPlaylistView
                  customPlaylist={customPlaylist}
                  currentTrack={currentTrack}
                  onTrackSelect={onCustomPlaylistTrackSelect}
                  onRemove={onRemoveFromCustomPlaylist}
                  onReorder={onReorderCustomPlaylist}
                  onBack={handleBackToAlbums}
                  isTransitioning={isTransitioning}
                  totalDuration={customPlaylistDuration}
                  durationLoading={customPlaylistDurationLoading}
                  formatDuration={formatDuration}
                />
              ) : (
              // Track list view
              <>
                {/* Album header - Fixed at top */}
                <div className="flex items-center gap-3 p-6 pb-4 border-b border-gray-100 flex-shrink-0 bg-white">
                  <button
                    onClick={handleBackToAlbums}
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                  </button>
                  <div className="flex-1 min-w-0">
                    <h2 className="text-lg font-semibold text-gray-900 truncate">{albumData.title}</h2>
                    <div className="flex items-center gap-2 text-sm text-gray-600">
                      <span>{albumData.playlist.length} tracks</span>
                      {!durationLoading && totalDuration > 0 && (
                        <>
                          <span>•</span>
                          <div className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>{formatDuration(totalDuration)}</span>
                          </div>
                        </>
                      )}
                    </div>
                    {currentTrack && (
                      <p className="text-sm text-indigo-600 font-medium mt-1 truncate">
                        Now playing: {currentTrack.title}
                      </p>
                    )}
                  </div>
                  {currentTrack && (
                    <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse flex-shrink-0"></div>
                  )}
                </div>

                {/* Track list - Scrollable area */}
                <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                  <div className={`transform transition-all duration-300 ease-in-out ${isTransitioning
                    ? 'translate-x-full opacity-0'
                    : 'translate-x-0 opacity-100'
                    }`}>
                    <div className="p-6 pt-4">
                      <div className="space-y-2">
                        {albumData.playlist.map((track, index) => (
                          <div
                            key={`${track.url}-${index}`}
                            className={`w-full flex items-center gap-3 p-3 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-[1.02] ${currentTrack?.url === track.url
                              ? 'bg-indigo-50 border-2 border-indigo-200 shadow-md'
                              : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                              }`}
                          >
                            <button
                              onClick={() => handleTrackSelect(track)}
                              className="flex-1 flex items-center gap-3 min-w-0 text-left"
                            >
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 flex-shrink-0 ${currentTrack?.url === track.url
                                ? 'bg-indigo-600 text-white shadow-lg'
                                : 'bg-gray-200 text-gray-600'
                                }`}>
                                <Play className="w-3 h-3 ml-0.5" />
                              </div>

                              <div className="flex-1 text-left min-w-0">
                                <h3 className="font-medium text-gray-900 text-sm truncate">{track.title}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                  <div className="flex items-center gap-1 text-xs text-gray-600 min-w-0">
                                    <Users className="w-3 h-3 flex-shrink-0" />
                                    <span className="truncate">{track.authors.join(', ')}</span>
                                  </div>
                                  {track.rating && (
                                    <div className="flex items-center gap-1 flex-shrink-0">
                                      {Array.from({ length: track.rating }).map((_, i) => (
                                        <Star key={i} className="w-2 h-2 fill-yellow-400 text-yellow-400" />
                                      ))}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </button>

                            {customPlaylistVisible && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onAddToCustomPlaylist(track, selectedAlbum);
                                }}
                                className="p-1.5 rounded-full hover:bg-indigo-100 text-gray-400 hover:text-indigo-600 transition-colors flex-shrink-0"
                                title="Add to custom playlist"
                              >
                                <Plus className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </>
              )
            ) : (
              // Album list view - Scrollable
              <div className="h-full overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
                <div className="p-6">
                  <div className={`space-y-3 transform transition-all duration-300 ease-in-out ${isTransitioning
                    ? '-translate-x-full opacity-0'
                    : 'translate-x-0 opacity-100'
                    }`}>
                    {customPlaylistVisible && (
                      <button
                        key="__custom_playlist__"
                        onClick={onSelectCustomPlaylist}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border-2 transition-all duration-200 hover:shadow-md transform hover:scale-[1.02] ${
                          selectedAlbum === '__custom_playlist__'
                            ? 'border-indigo-400 bg-gradient-to-r from-indigo-50 to-purple-50 shadow-md'
                            : 'border-indigo-200 hover:border-indigo-300 bg-gradient-to-r from-indigo-50/50 to-purple-50/50 hover:from-indigo-50 hover:to-purple-50'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-400 to-purple-500 shadow-md flex-shrink-0">
                            <ListMusic className="w-5 h-5 text-white" />
                          </div>
                          <div className="text-left min-w-0">
                            <span className="font-medium text-sm truncate block">Custom Playlist</span>
                            <div className="flex items-center gap-1.5 text-xs text-gray-500">
                              <span>{customPlaylist.length} tracks</span>
                              {!customPlaylistDurationLoading && customPlaylistDuration > 0 && (
                                <>
                                  <span>•</span>
                                  <Clock className="w-3 h-3" />
                                  <span>{formatDuration(customPlaylistDuration)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                        <ChevronRight className="w-4 h-4 flex-shrink-0" />
                      </button>
                    )}

                    {albums.map((album) => {
                      const displayName = album.title || album.name.charAt(0).toUpperCase() + album.name.slice(1);
                      const hasImageError = imageErrors.has(album.name);

                      return (
                        <button
                          key={album.name}
                          onClick={() => handleAlbumSelect(album.name)}
                          className="w-full flex items-center justify-between p-3 rounded-lg border-2 border-gray-200 hover:border-indigo-300 text-gray-700 transition-all duration-200 hover:shadow-md transform hover:scale-[1.02] hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50"
                        >
                          <div className="flex items-center gap-3 min-w-0">
                            <div className="w-10 h-10 rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md flex-shrink-0">
                              {!hasImageError ? (
                                <img
                                  src={getAlbumCoverUrl(album.name)}
                                  alt={`${displayName} album cover`}
                                  className="w-full h-full object-cover transition-transform duration-200 hover:scale-110"
                                  onError={() => handleImageError(album.name)}
                                />
                              ) : (
                                <Music className="w-5 h-5 text-white" />
                              )}
                            </div>
                            <div className="text-left min-w-0">
                              <span className="font-medium text-sm truncate block">{displayName}</span>
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 transition-transform duration-200 group-hover:translate-x-1 flex-shrink-0" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}