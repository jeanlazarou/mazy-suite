import React from 'react';
import { motion, useAnimation } from 'framer-motion';
import { Album } from '../types';

interface FloatingCoverProps {
  album: Album;
}

const FloatingCover: React.FC<FloatingCoverProps> = ({ album }) => {
  const albumControls = useAnimation();

  const moveAlbumCover = async () => {
    // Fade out
    await albumControls.start({ opacity: 0, transition: { duration: 1 } });

    const margin = 200; // Space for the cover size and some padding
    const newX = (Math.random() * (window.innerWidth - margin)) - (window.innerWidth - margin) / 2;
    const newY = (Math.random() * (window.innerHeight - margin)) - (window.innerHeight - margin) / 2;

    // Move to new position while invisible
    await albumControls.set({ x: newX, y: newY });

    // Fade in
    await albumControls.start({ 
      opacity: 0.3,
      transition: { duration: 1 }
    });

    // Wait before next move
    await new Promise(resolve => setTimeout(resolve, 5000 + Math.random() * 2500));
    moveAlbumCover();
  };

  React.useEffect(() => {
    moveAlbumCover();
  }, []);

  return (
    <div className="fixed inset-0 pointer-events-none">
      <motion.div
        animate={albumControls}
        initial={{ opacity: 0, x: 0, y: 0 }}
      >
        <img
          src={`/data/${album.coverImage}`}
          alt="Album Cover"
          width="35%"
          className="w-40 h-40 rounded"
          style={{ 
            filter: 'blur(3px) brightness(0.9)',
            transition: 'filter 0.5s ease'
          }}
        />
      </motion.div>
    </div>
  );
};

export default FloatingCover;