import React, { useState, useEffect, useRef } from 'react';
import { Album, AlbumData, Track } from '../types';
import { Music, ChevronRight, ArrowLeft, Play, Star, Users, ChevronDown, ChevronUp } from 'lucide-react';

interface AlbumWithTitle extends Album {
  title?: string;
}

interface AlbumTrackSelectorProps {
  albums: AlbumWithTitle[];
  selectedAlbum: string | null;
  albumData: AlbumData | null;
  currentTrack: Track | null;
  onAlbumSelect: (albumName: string) => void;
  onTrackSelect: (track: Track) => void;
  onBackToAlbums: () => void;
  loading: boolean;
}

export function AlbumTrackSelector({
  albums,
  selectedAlbum,
  albumData,
  currentTrack,
  onAlbumSelect,
  onTrackSelect,
  onBackToAlbums,
  loading
}: AlbumTrackSelectorProps) {
  const [imageErrors, setImageErrors] = useState<Set<string>>(new Set());
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const trackListRef = useRef<HTMLDivElement>(null);

  // Reset states when navigating back to albums
  useEffect(() => {
    if (!selectedAlbum) {
      setIsCollapsed(false);
    }
  }, [selectedAlbum]);

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

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
      setIsCollapsed(false);
    }, 150);
  };

  const toggleCollapse = () => {
    setIsCollapsed(!isCollapsed);
  };

  const handleTrackSelect = (track: Track) => {
    onTrackSelect(track);
    // Auto-collapse when a track is selected
    setIsCollapsed(true);
  };

  // Show track list if an album is selected and has data
  if (selectedAlbum && albumData) {
    return (
      <div className="bg-white rounded-xl shadow-lg overflow-hidden transition-all duration-300 ease-in-out">
        {/* Collapsible header */}
        <div 
          className="flex items-center gap-3 p-6 cursor-pointer hover:bg-gray-50 transition-colors"
          onClick={toggleCollapse}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleBackToAlbums();
            }}
            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
          >
            <ArrowLeft className="w-5 h-5 text-gray-600" />
          </button>
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-gray-900">{albumData.title}</h2>
            <p className="text-sm text-gray-600">{albumData.playlist.length} tracks</p>
            {currentTrack && (
              <p className="text-sm text-indigo-600 font-medium mt-1">
                Now playing: {currentTrack.title}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            {currentTrack && (
              <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            )}
            {isCollapsed ? (
              <ChevronDown className="w-5 h-5 text-gray-400" />
            ) : (
              <ChevronUp className="w-5 h-5 text-gray-400" />
            )}
          </div>
        </div>
        
        {/* Collapsible track list with scrolling */}
        <div className={`transition-all duration-300 ease-in-out overflow-hidden ${
          isCollapsed ? 'max-h-0' : 'max-h-[500px]'
        }`}>
          <div className={`transform transition-all duration-300 ease-in-out ${
            isTransitioning 
              ? 'translate-x-full opacity-0' 
              : 'translate-x-0 opacity-100'
          }`}>
            <div 
              ref={trackListRef}
              className="px-6 pb-6 max-h-[500px] overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100"
            >
              <div className="space-y-2">
                {albumData.playlist.map((track, index) => (
                  <button
                    key={`${track.url}-${index}`}
                    onClick={() => handleTrackSelect(track)}
                    className={`w-full flex items-center gap-4 p-4 rounded-lg transition-all duration-200 hover:shadow-md transform hover:scale-[1.02] ${
                      currentTrack?.url === track.url
                        ? 'bg-indigo-50 border-2 border-indigo-200 shadow-md'
                        : 'bg-gray-50 hover:bg-gray-100 border-2 border-transparent'
                    }`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-200 ${
                      currentTrack?.url === track.url
                        ? 'bg-indigo-600 text-white shadow-lg'
                        : 'bg-gray-200 text-gray-600'
                    }`}>
                      <Play className="w-4 h-4 ml-0.5" />
                    </div>
                    
                    <div className="flex-1 text-left">
                      <h3 className="font-medium text-gray-900">{track.title}</h3>
                      <div className="flex items-center gap-4 mt-1">
                        <div className="flex items-center gap-1 text-sm text-gray-600">
                          <Users className="w-3 h-3" />
                          {track.authors.join(', ')}
                        </div>
                        {track.rating && (
                          <div className="flex items-center gap-1">
                            {Array.from({ length: track.rating }).map((_, i) => (
                              <Star key={i} className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-500">
                      Vol: {track.volume}%
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Show album list
  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center gap-3 mb-6">
        <Music className="w-6 h-6 text-indigo-600" />
        <h2 className="text-xl font-semibold text-gray-900">Select Album</h2>
      </div>
      
      <div className={`space-y-3 transform transition-all duration-300 ease-in-out ${
        isTransitioning 
          ? '-translate-x-full opacity-0' 
          : 'translate-x-0 opacity-100'
      }`}>
        {albums.map((album) => {
          const displayName = album.title || album.name.charAt(0).toUpperCase() + album.name.slice(1);
          const hasImageError = imageErrors.has(album.name);
          
          return (
            <button
              key={album.name}
              onClick={() => handleAlbumSelect(album.name)}
              className="w-full flex items-center justify-between p-4 rounded-lg border-2 border-gray-200 hover:border-indigo-300 text-gray-700 transition-all duration-200 hover:shadow-md transform hover:scale-[1.02] hover:bg-gradient-to-r hover:from-indigo-50 hover:to-purple-50"
            >
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-lg overflow-hidden flex items-center justify-center bg-gradient-to-br from-indigo-500 to-purple-600 shadow-md">
                  {!hasImageError ? (
                    <img
                      src={getAlbumCoverUrl(album.name)}
                      alt={`${displayName} album cover`}
                      className="w-full h-full object-cover transition-transform duration-200 hover:scale-110"
                      onError={() => handleImageError(album.name)}
                    />
                  ) : (
                    <Music className="w-6 h-6 text-white" />
                  )}
                </div>
                <div className="text-left">
                  <span className="font-medium">{displayName}</span>
                </div>
              </div>
              <ChevronRight className="w-5 h-5 transition-transform duration-200 group-hover:translate-x-1" />
            </button>
          );
        })}
      </div>
    </div>
  );
}