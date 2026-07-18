import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme } from '../types';

interface ConstellationAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface StarLetter {
  id: number;
  letter: string;
  x: number;
  y: number;
  lineIndex: number;
  wordIndex: number;
}

const VERSE_COUNT = 5;
const CONNECT_DISTANCE = 150;
const LONG_CONNECT_DISTANCE = 250;
const VERTICAL_SPREAD = 80;
const HORIZONTAL_SPREAD = 20;

const ConstellationAnimation: React.FC<ConstellationAnimationProps> = ({ lyrics, theme }) => {
  const [stars, setStars] = useState<StarLetter[]>([]);
  const [setId, setSetId] = useState(1);
  const [isVisible, setIsVisible] = useState(true);
  const [time, setTime] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  const colors = Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'];

  const getLineColor = (color: string, opacity: number) => {
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  };

  const createNewSet = useCallback(() => {
    // Check if we have enough lyrics
    if (!lyrics || lyrics.length === 0) {
      return [];
    }

    const newStars: StarLetter[] = [];
    const usedIndexes = new Set();
    const screenPadding = window.innerWidth * 0.1;

    // Determine how many verses we can use
    const versesToUse = Math.min(VERSE_COUNT, lyrics.length);

    for (let lineIndex = 0; lineIndex < versesToUse; lineIndex++) {
      let lyricIndex;
      do {
        lyricIndex = Math.floor(Math.random() * lyrics.length);
      } while (usedIndexes.has(lyricIndex));
      usedIndexes.add(lyricIndex);

      // Safety check for lyric existence
      if (!lyrics[lyricIndex] || !lyrics[lyricIndex].text) {
        continue;
      }

      const text = lyrics[lyricIndex].text;
      const words = text.split(' ');

      const usableWidth = window.innerWidth * 0.9;
      const availableWidth = window.innerWidth - (2 * screenPadding);
      const letterSpacing = usableWidth / (text.length + 1);

      const xOffset = screenPadding + (Math.random() - 0.5) * (availableWidth * 0.2);
      const verticalSection = window.innerHeight * 0.8;
      const baseY = (verticalSection * 0.1) + (Math.random() * verticalSection);

      let letterPosition = 0;
      words.forEach((word, wordIndex) => {
        word.split('').forEach((letter) => {
          const verticalOffset = (Math.random() - 0.5) * VERTICAL_SPREAD;
          const horizontalOffset = (Math.random() - 0.5) * HORIZONTAL_SPREAD;

          newStars.push({
            id: Date.now() + (lineIndex * 1000) + letterPosition,
            letter,
            x: xOffset + letterSpacing * letterPosition + horizontalOffset,
            y: baseY + verticalOffset,
            lineIndex,
            wordIndex
          });
          letterPosition++;
        });
      });
    }
    return newStars;
  }, [lyrics]);

  const getConnections = useCallback((stars: StarLetter[]) => {
    const connections: Array<{
      star1: StarLetter;
      star2: StarLetter;
      distance: number;
      strength: number;
    }> = [];

    stars.forEach((star1, i) => {
      stars.slice(i + 1).forEach(star2 => {
        const dx = star1.x - star2.x;
        const dy = star1.y - star2.y;
        const distance = Math.sqrt(dx * dx + dy * dy);

        // Different types of connections
        if (
          // Same word connections (highest priority)
          (star1.lineIndex === star2.lineIndex &&
            star1.wordIndex === star2.wordIndex &&
            distance < CONNECT_DISTANCE)
        ) {
          connections.push({ star1, star2, distance, strength: 1 });
        }
        // Adjacent words in same line (medium priority)
        else if (
          star1.lineIndex === star2.lineIndex &&
          Math.abs(star1.wordIndex - star2.wordIndex) === 1 &&
          distance < CONNECT_DISTANCE
        ) {
          connections.push({ star1, star2, distance, strength: 0.8 });
        }
        // Close letters between adjacent lines (lower priority)
        else if (
          Math.abs(star1.lineIndex - star2.lineIndex) === 1 &&
          distance < CONNECT_DISTANCE
        ) {
          connections.push({ star1, star2, distance, strength: 0.6 });
        }
        // Occasional long-distance connections (lowest priority)
        else if (
          Math.random() < 0.1 &&
          distance < LONG_CONNECT_DISTANCE
        ) {
          connections.push({ star1, star2, distance, strength: 0.4 });
        }
      });
    });

    return connections;
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTime(t => t + 0.02);

    ctx.lineWidth = 1.5;

    // Get and sort connections by priority
    const connections = getConnections(stars).sort((a, b) => b.strength - a.strength);

    // Draw connections with different phases based on type
    connections.forEach(({ star1, star2, distance, strength }) => {
      const phaseOffset = (star1.x + star2.y) * 0.01;
      const fadeEffect = (Math.sin(time + phaseOffset) + 1) / 2;

      const baseOpacity = Math.max(0.1, 1 - distance / CONNECT_DISTANCE);
      const finalOpacity = baseOpacity * fadeEffect * 0.6 * strength;

      const gradient = ctx.createLinearGradient(star1.x, star1.y, star2.x, star2.y);
      const color1 = getLineColor(colors[star1.lineIndex % colors.length], finalOpacity);
      const color2 = getLineColor(colors[star2.lineIndex % colors.length], finalOpacity);

      gradient.addColorStop(0, color1);
      gradient.addColorStop(1, color2);

      ctx.strokeStyle = gradient;
      ctx.beginPath();
      ctx.moveTo(star1.x, star1.y);
      ctx.lineTo(star2.x, star2.y);
      ctx.stroke();
    });

    animationRef.current = requestAnimationFrame(animate);
  }, [stars, colors, time, getConnections]);

  // Rest of the component remains the same...
  useEffect(() => {
    const handleResize = () => {
      if (canvasRef.current) {
        canvasRef.current.width = window.innerWidth;
        canvasRef.current.height = window.innerHeight;
      }
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    animationRef.current = requestAnimationFrame(animate);
    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [animate]);

  useEffect(() => {
    const changeSet = async () => {
      setIsVisible(false);
      await new Promise(resolve => setTimeout(resolve, 2000));
      setSetId(id => id + 1);
      setStars(createNewSet());
      setIsVisible(true);
    };

    setStars(createNewSet());

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
      <canvas
        ref={canvasRef}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 2s'
        }}
      />
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
          {stars.map((star) => (
            <motion.div
              key={star.id}
              style={{
                position: 'absolute',
                fontSize: '1.8rem',
                fontWeight: 'bold',
                color: colors[star.lineIndex % colors.length],
                textShadow: '0 0 10px rgba(255, 255, 255, 0.5)',
                left: star.x,
                top: star.y,
                transform: 'translate(-50%, -50%)'
              }}
            >
              {star.letter}
            </motion.div>
          ))}
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default ConstellationAnimation;