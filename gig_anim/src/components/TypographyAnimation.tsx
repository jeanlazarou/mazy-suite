import React, { useState, useEffect, useCallback } from 'react';
import { Lyric, Theme } from '../types';

interface TypographyAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface Word {
  text: string;
  size: string;
  isAccent: boolean;
}

const SIZES = ['2.5rem', '2rem', '1.8rem', '1.5rem'];
const WORDS_PER_LINE = 8;
const VERSE_COUNT = 8;      // Increased to 8 total verses
const ACCENT_VERSE_INDEX = 7;  // Last verse is accent

const TypographyAnimation: React.FC<TypographyAnimationProps> = ({ lyrics, theme }) => {
  const [words, setWords] = useState<Word[]>([]);
  const [accentColorIndex, setAccentColorIndex] = useState(0);
  const [setId, setSetId] = useState(0);

  const colors = Array.isArray(theme.textColors) 
    ? theme.textColors 
    : ['#ffffff', '#cccccc', '#999999', '#666666'];

  const getBaseColor = useCallback(() => {
    const bg = theme.backgroundColor;
    const isLight = bg.toLowerCase() === '#ffffff' || bg.toLowerCase() === 'white';
    return isLight ? '#000000' : '#ffffff';
  }, [theme.backgroundColor]);

  const baseColor = getBaseColor();

  const createNewWordSet = useCallback(() => {
    if (lyrics.length < VERSE_COUNT) return [];

    const indices = new Set<number>();
    while (indices.size < VERSE_COUNT) {
      indices.add(Math.floor(Math.random() * lyrics.length));
    }
    const selectedIndices = Array.from(indices);

    let allWords: Word[] = [];
    selectedIndices.forEach((lyricIndex, verseIndex) => {
      const words = lyrics[lyricIndex].text.split(' ');
      const isAccentVerse = verseIndex === ACCENT_VERSE_INDEX;

      words.forEach(text => {
        allWords.push({
          text,
          size: SIZES[Math.floor(Math.random() * SIZES.length)],
          isAccent: isAccentVerse
        });
      });
    });

    return allWords.sort(() => Math.random() - 0.5);
  }, [lyrics]);

  useEffect(() => {
    if (lyrics.length >= VERSE_COUNT) {
      setWords(createNewWordSet());
    }
  }, [lyrics, createNewWordSet]);

  useEffect(() => {
    const colorInterval = setInterval(() => {
      setAccentColorIndex(prev => (prev + 1) % colors.length);
    }, 3000);
    return () => clearInterval(colorInterval);
  }, [colors.length]);

  useEffect(() => {
    const verseInterval = setInterval(() => {
      setWords(createNewWordSet());
      setSetId(prev => prev + 1);
      setAccentColorIndex(0);
    }, 15000);
    return () => clearInterval(verseInterval);
  }, [createNewWordSet]);

  const lines = words.reduce((acc: Word[][], word: Word, i: number) => {
    const lineIndex = Math.floor(i / WORDS_PER_LINE);
    if (!acc[lineIndex]) acc[lineIndex] = [];
    acc[lineIndex].push(word);
    return acc;
  }, []);

  return (
    <div style={{ 
      background: theme.backgroundColor,
      width: '100vw',
      height: '100vh',
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center'
    }}>
      <div style={{
        border: `4px solid ${colors[accentColorIndex]}`,
        borderRadius: '15px',
        padding: '2.5rem',
        transition: 'border-color 1s ease',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: '0.8rem',  // Slightly reduced gap for more content
        maxWidth: '92%',  // Slightly increased max width
        minHeight: '60vh'  // Increased minimum height
      }}>
        {lines.map((line, lineIndex) => (
          <div 
            key={`${setId}-${lineIndex}`}
            style={{
              display: 'flex',
              flexWrap: 'wrap',
              justifyContent: 'center',
              gap: '0.8rem',
              padding: '0 1rem',
              lineHeight: '1.15'  // Slightly reduced for more compact text
            }}
          >
            {line.map((word, wordIndex) => (
              <span
                key={`${word.text}-${wordIndex}`}
                style={{
                  fontSize: word.size,
                  color: word.isAccent ? colors[accentColorIndex] : baseColor,
                  transition: 'color 1s ease',
                  fontWeight: word.size === SIZES[0] ? 'bold' : 'normal'
                }}
              >
                {word.text}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

export default TypographyAnimation;