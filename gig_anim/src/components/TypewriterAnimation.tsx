import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme } from '../types';

interface TypewriterAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface TypewriterLine {
  id: number;
  text: string;
  position: number;
  speed: number;
  color: string;
  completed: boolean;
}

const TypewriterAnimation: React.FC<TypewriterAnimationProps> = ({ lyrics, theme }) => {
  const [activeLines, setActiveLines] = useState<TypewriterLine[]>([]);
  const [nextId, setNextId] = useState(0);

  const colors = Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'];

  // Function to start typing a new line
  const addNewLine = useCallback(() => {
    const lyricIndex = Math.floor(Math.random() * lyrics.length);
    const newLine: TypewriterLine = {
      id: nextId,
      text: lyrics[lyricIndex].text,
      position: 0,
      speed: 30 + Math.random() * 30, // Random speed between 30-60ms per character
      color: colors[nextId % colors.length],
      completed: false
    };

    setActiveLines(prev => {
      // Keep only last 8 lines
      const updated = [...prev, newLine].slice(-8);
      return updated;
    });
    setNextId(prev => prev + 1);
  }, [lyrics, nextId, colors]);

  // Effect to advance typing of active lines
  useEffect(() => {
    const interval = setInterval(() => {
      setActiveLines(prev =>
        prev.map(line => {
          if (line.completed) return line;

          const newPosition = line.position + 1;
          return {
            ...line,
            position: newPosition,
            completed: newPosition >= line.text.length
          };
        })
      );
    }, 30); // Base typing speed

    return () => clearInterval(interval);
  }, []);

  // Effect to add new lines periodically
  useEffect(() => {
    const interval = setInterval(addNewLine, 2000);
    return () => clearInterval(interval);
  }, [addNewLine]);

  return (
    <>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          background: theme.backgroundColor,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '2rem',
        }}
      >

        <div
          style={{
            maxWidth: '800px',
            width: '100%',
            position: 'relative',
            zIndex: 2
          }}
        >
          <AnimatePresence>
            {activeLines.map((line) => (
              <motion.div
                key={line.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.5 }}
                style={{
                  fontSize: '1.5rem',
                  marginBottom: '1.5rem',
                  color: line.color,
                  fontFamily: 'monospace',
                  whiteSpace: 'pre-wrap',
                  lineHeight: '1.4',
                  textShadow: '2px 2px 4px rgba(0,0,0,0.3)'
                }}
              >
                <motion.span
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2 }}
                >
                  {/* Current typed text */}
                  {line.text.substring(0, line.position)}
                  {/* Cursor blinker */}
                  {!line.completed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: [0, 1] }}
                      transition={{ duration: 0.8, repeat: Infinity }}
                    >
                      ▌
                    </motion.span>
                  )}
                </motion.span>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div></>
  );
};

export default TypewriterAnimation;
