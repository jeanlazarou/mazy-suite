import React from 'react';

interface AudioPlayerProps {
  audioRef: React.RefObject<HTMLAudioElement>;
}

export const AudioPlayer: React.FC<AudioPlayerProps> = ({ audioRef }) => {
  return <audio ref={audioRef} />;
};
