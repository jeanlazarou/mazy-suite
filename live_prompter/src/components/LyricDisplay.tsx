import { useEffect, useRef } from 'react';
import { LyricLine, Track } from '../types';

interface LyricDisplayProps {
  currentLyric: LyricLine | null;
  upcomingLyrics: LyricLine[];
  loading: boolean;
  error: string | null;
  currentTime: number;
  currentTrack: Track | null;
  nextTrack: Track | null;
}

export function LyricDisplay({
  currentLyric,
  upcomingLyrics,
  loading,
  error,
  currentTime,
  currentTrack,
  nextTrack
}: LyricDisplayProps) {
  const currentLyricRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to current lyric
  useEffect(() => {
    if (currentLyricRef.current && currentLyric) {
      currentLyricRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  }, [currentLyric]);

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 h-full flex items-center justify-center">
        <div className="flex items-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
          <span className="ml-3 text-gray-600">Loading lyrics...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6 h-full flex items-center justify-center">
        <div className="text-center text-gray-500">
          <div className="text-4xl mb-4">📝</div>
          <p className="text-lg font-medium mb-2">No lyrics available</p>
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 text-gray-400">
            The music will still play normally
          </p>
        </div>
      </div>
    );
  }

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getTimeUntilNext = (lyric: LyricLine): number => {
    return Math.max(0, lyric.startTime - currentTime);
  };

  const getTimeRemaining = (lyric: LyricLine): number => {
    return Math.max(0, lyric.endTime - currentTime);
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-4 h-full flex flex-col">
      <div className="flex-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 scrollbar-track-gray-100">
        <div className="space-y-3">
          {/* Current Lyric - Prominent display */}
          <div
            ref={currentLyricRef}
            className={`p-4 rounded-lg border-2 min-h-[120px] flex flex-col justify-center transition-all duration-300 ${
              currentLyric
                ? 'bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-300 shadow-lg'
                : 'bg-gray-50 border-gray-200'
              }`}
          >
            {currentLyric ? (
              <>
                <div className="text-4xl font-bold text-indigo-900 leading-relaxed mb-2">
                  {currentLyric.text}
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-indigo-600 font-medium">
                    ♪ NOW SINGING ♪
                  </span>
                  <div className="flex items-center gap-3 text-gray-600">
                    <span>Started: {formatTime(currentLyric.startTime)}</span>
                    <span className="text-orange-600 font-medium">
                      {getTimeRemaining(currentLyric) > 0
                        ? `${getTimeRemaining(currentLyric).toFixed(1)}s remaining`
                        : 'Ending soon'
                      }
                    </span>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex flex-col justify-center h-full">
                <div className="text-4xl font-bold text-gray-500 leading-relaxed mb-2 text-center">
                  🎤 Ready to sing!
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-gray-500 font-medium">
                    ♪ STANDBY ♪
                  </span>
                  <div className="flex-1 mx-3">
                    {upcomingLyrics.length > 0 ? (
                      <div className="space-y-1">
                        <div className="text-gray-600 text-right">
                          Next in {getTimeUntilNext(upcomingLyrics[0]).toFixed(1)}s
                        </div>
                        <div className="w-full h-1 bg-gray-200 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-gradient-to-r from-orange-400 to-red-500 rounded-full transition-all duration-100"
                            style={{ 
                              width: `${Math.max(0, Math.min(100, (1 - (getTimeUntilNext(upcomingLyrics[0]) / 10)) * 100))}%` 
                            }}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="text-gray-500 text-center">
                        Waiting for the music to begin...
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Upcoming Lyrics - Queue display */}
          {upcomingLyrics.length > 0 && (
            <div className="space-y-2">
              {upcomingLyrics.map((lyric, index) => {
                const timeUntil = getTimeUntilNext(lyric);
                const isNext = index === 0;

                return (
                  <div
                    key={lyric.id}
                    className={`p-3 rounded-lg border-2 transition-all duration-300 ${
                      isNext
                        ? 'bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-300 shadow-md'
                        : 'bg-gray-50 border-gray-200'
                      }`}
                    style={{ opacity: Math.max(0.5, 1 - (index * 0.15)) }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1">
                        <div className={`font-medium leading-relaxed ${
                          isNext ? 'text-orange-900 text-3xl' : 'text-gray-700 text-2xl'
                          }`}>
                          {lyric.text}
                        </div>

                        <div className="flex items-center gap-3 mt-1 text-xs">
                          <span className="text-gray-600">
                            Starts: {formatTime(lyric.startTime)}
                          </span>
                          <span className="text-gray-600">
                            Duration: {(lyric.endTime - lyric.startTime).toFixed(1)}s
                          </span>
                        </div>
                      </div>

                      <div className="text-right flex-shrink-0">
                        {isNext && (
                          <div className="bg-orange-100 text-orange-800 px-2 py-1 rounded text-xs font-semibold mb-1">
                            NEXT
                          </div>
                        )}
                        <div className="space-y-1">
                          <div className={`text-xs font-medium text-right ${
                            timeUntil <= 5
                            ? 'text-red-600'
                            : timeUntil <= 10
                              ? 'text-orange-600'
                              : 'text-gray-600'
                          }`}>
                          {timeUntil <= 0
                            ? 'Starting now!'
                              : `${timeUntil.toFixed(1)}s`
                          }
                        </div>
                          {timeUntil > 0 && timeUntil <= 15 && (
                            <div className="w-16 h-1 bg-gray-200 rounded-full overflow-hidden">
                              <div 
                                className={`h-full rounded-full transition-all duration-100 ${
                                  timeUntil <= 5 
                                    ? 'bg-red-500' 
                                    : timeUntil <= 10 
                                      ? 'bg-orange-500' 
                                      : 'bg-blue-500'
                                }`}
                                style={{ 
                                  width: `${Math.max(0, Math.min(100, (1 - (timeUntil / 15)) * 100))}%` 
                                }}
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* No lyrics state */}
          {!currentLyric && upcomingLyrics.length === 0 && !loading && !error && (
            <div className="text-center text-gray-500 py-8">
              <div className="text-5xl mb-3">🎵</div>
              {currentTrack ? (
                <>
                  <p className="text-xl font-medium mb-4">Ready for your performance!</p>
                  {nextTrack ? (
                    <div className="mt-6 text-left inline-block bg-gray-50 rounded-2xl px-12 py-8 border border-gray-200">
                      <p className="text-base uppercase tracking-widest text-gray-400 mb-3">Up next</p>
                      <p className="text-4xl font-semibold text-gray-700">{nextTrack.title}</p>
                      {nextTrack.authors.length > 0 && (
                        <p className="text-xl text-gray-500 mt-2">{nextTrack.authors.join(', ')}</p>
                      )}
                    </div>
                  ) : (
                    <p className="text-sm">Last track — great show!</p>
                  )}
                </>
              ) : (
                <p className="text-xs">Select a track to start the lyrics prompter</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}