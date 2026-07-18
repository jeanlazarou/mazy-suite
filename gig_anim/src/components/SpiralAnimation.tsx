import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme, Album } from '../types';
import FloatingCover from './FloatingCover';

interface SpiralAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  album: Album;
}

const SpiralAnimation: React.FC<SpiralAnimationProps> = ({ lyrics, theme, album }) => {
  const [visibleItems, setVisibleItems] = useState<Array<{
    id: number;
    content: string;
    angle: number;
    radius: number;
  }>>([]);
  const [nextId, setNextId] = useState(0);

  // Get theme colors or use defaults
  const colors = useMemo(() =>
    Array.isArray(theme.textColors)
      ? theme.textColors
      : ['#ffffff', '#cccccc', '#999999', '#666666'],
    [theme.textColors]
  );

  // Calculate center point
  const center = {
    x: window.innerWidth / 2,
    y: window.innerHeight / 2,
  };

  // Function to calculate position on spiral
  const getPositionOnSpiral = (angle: number, radius: number) => {
    const x = center.x + radius * Math.cos(angle);
    const y = center.y + radius * Math.sin(angle);
    return { x, y };
  };

  useEffect(() => {
    // Add new items periodically
    const addInterval = setInterval(() => {
      const lyricIndex = Math.floor(Math.random() * lyrics.length);

      // Calculate spiral parameters
      const angle = (nextId * Math.PI / 6) % (2 * Math.PI); // Rotate by 30 degrees
      const radius = 50 + (nextId * 15) % Math.min(window.innerWidth / 3, window.innerHeight / 3);

      const newItem = {
        id: nextId,
        content: lyrics[lyricIndex].text,
        angle,
        radius,
      };

      setVisibleItems(prev => [...prev.slice(-20), newItem]); // Keep last 20 items
      setNextId(prev => prev + 1);
    }, 2000);

    // Rotate existing items
    const rotateInterval = setInterval(() => {
      setVisibleItems(prev =>
        prev.map(item => ({
          ...item,
          angle: item.angle + 0.02, // Slow rotation
          radius: Math.max(50, item.radius - 0.5), // Slowly decrease radius
        }))
      );
    }, 50);

    return () => {
      clearInterval(addInterval);
      clearInterval(rotateInterval);
    };
  }, [lyrics, album, nextId]);

  return (
    <>
      <div style={{ position: "absolute", top: 0, left: 0, width: "100%", height: "100%" }}>
        <FloatingCover album={album} />
      </div>
      <div className="w-full h-screen overflow-hidden" style={{ background: theme.backgroundColor }}>
        <AnimatePresence>
          {visibleItems.map((item) => {
            const position = getPositionOnSpiral(item.angle, item.radius);

            return (
              <motion.div
                key={item.id}
                initial={{
                  opacity: 0,
                  scale: 0,
                  x: position.x,
                  y: position.y,
                }}
                animate={{
                  opacity: 1,
                  scale: 1,
                  x: position.x,
                  y: position.y,
                }}
                exit={{ opacity: 0, scale: 0 }}
                transition={{
                  duration: 1,
                  type: "spring",
                  stiffness: 50
                }}
                style={{
                  position: 'absolute',
                  transform: 'translate(-50%, -50%)',
                  color: colors[item.id % colors.length],
                  maxWidth: '200px',
                  textAlign: 'center'
                }}
              >
                <div className="text-lg font-semibold whitespace-pre-wrap">
                  {item.content}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div></>
  );
};

export default SpiralAnimation;
