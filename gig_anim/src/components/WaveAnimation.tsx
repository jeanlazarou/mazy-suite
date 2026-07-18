import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme } from '../types';

interface WaveAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface WaveLetter {
  id: number;
  letter: string;
  baseX: number;
  baseY: number;
  offset: number;
  lineIndex: number;
}

const WaveAnimation: React.FC<WaveAnimationProps> = ({ lyrics, theme }) => {
  const [letters, setLetters] = useState<WaveLetter[]>([]);
  const [time, setTime] = useState(0);
  const [setId, setSetId] = useState(1);
  const [isVisible, setIsVisible] = useState(true);

  const colors = Array.isArray(theme.textColors) 
    ? theme.textColors 
    : ['#ffffff', '#cccccc', '#999999', '#666666'];

  const createNewSet = useCallback(() => {
    const newLetters: WaveLetter[] = [];
    const usedIndexes = new Set();
    
    for (let lineIndex = 0; lineIndex < 3; lineIndex++) {
      let lyricIndex;
      do {
        lyricIndex = Math.floor(Math.random() * lyrics.length);
      } while (usedIndexes.has(lyricIndex));
      usedIndexes.add(lyricIndex);
      
      const text = lyrics[lyricIndex].text;
      const letterSpacing = window.innerWidth / (text.length + 2);
      const baseY = (window.innerHeight * (lineIndex + 1)) / 4;
      
      text.split('').forEach((letter, index) => {
        newLetters.push({
          id: Date.now() + (lineIndex * 1000) + index,
          letter,
          baseX: letterSpacing * (index + 1),
          baseY,
          offset: index * 0.2,
          lineIndex
        });
      });
    }
    return newLetters;
  }, [lyrics]);

  // Wave animation loop
  useEffect(() => {
    const interval = setInterval(() => {
      setTime(t => t + 0.02);
    }, 16);
    return () => clearInterval(interval);
  }, []);

  // Set change timer with continuous motion
  useEffect(() => {
    const changeSet = async () => {
      setIsVisible(false); // Start fade out
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for fade
      setSetId(id => id + 1);
      setLetters(createNewSet());
      setIsVisible(true); // Start fade in
    };

    // Initial set
    setLetters(createNewSet());
    
    const interval = setInterval(changeSet, 15000);
    return () => clearInterval(interval);
  }, [createNewSet]);

  return (
    <div style={{ 
      background: theme.backgroundColor,
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      position: 'relative'
    }}>
      <AnimatePresence>
        <motion.div
          key={setId}
          initial={{ opacity: 0 }}
          animate={{ opacity: isVisible ? 1 : 0 }}
          transition={{ duration: 2 }}
          style={{
            width: '100%',
            height: '100%',
            position: 'absolute'
          }}
        >
          {letters.map((letter) => {
            const waveAmplitude = 60 + (letter.lineIndex * 20);
            const waveFrequency = 1 + (letter.lineIndex * 0.2);
            const waveY = Math.sin(time * waveFrequency + letter.offset) * waveAmplitude;
            const secondaryWave = Math.sin(time * 0.5 + letter.offset) * (30 + letter.lineIndex * 10);
            const finalY = letter.baseY + waveY + secondaryWave;

            const scale = 1 + (Math.sin(time * waveFrequency + letter.offset) * 0.3);
            const colorIndex = Math.floor(time * 0.3 + letter.offset) % colors.length;

            return (
              <motion.div
                key={letter.id}
                style={{
                  position: 'absolute',
                  x: letter.baseX,
                  y: finalY,
                  scale,
                  fontSize: '2.5rem',
                  fontWeight: 'bold',
                  color: colors[colorIndex],
                  textShadow: '2px 2px 4px rgba(0,0,0,0.3)',
                  transformOrigin: 'center'
                }}
              >
                {letter.letter}
              </motion.div>
            );
          })}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default WaveAnimation;