import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme } from '../types';

interface LetterWallAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
}

interface GridCell {
  letter: string;
  isHighlighted: boolean;
  x: number;
  y: number;
}

const GRID_ROWS = 12;
const GRID_COLS = 30;

const LetterWallAnimation: React.FC<LetterWallAnimationProps> = ({ lyrics, theme }) => {
  const [grid, setGrid] = useState<GridCell[][]>([]);
  const [highlightedCells, setHighlightedCells] = useState<{x: number, y: number}[]>([]);
  const [cellSize, setCellSize] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  // Calculate cell size based on container dimensions
  const updateCellSize = useCallback(() => {
    if (containerRef.current) {
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      // Calculate size with some padding
      const cellWidth = (containerWidth * 0.95) / GRID_COLS;
      const cellHeight = (containerHeight * 0.95) / GRID_ROWS;
      
      // Use the smaller value to maintain square cells
      const size = Math.min(cellWidth, cellHeight);
      
      setCellSize({
        width: size,
        height: size
      });
    }
  }, []);

  // Handle window resize
  useEffect(() => {
    const handleResize = () => {
      updateCellSize();
    };

    window.addEventListener('resize', handleResize);
    handleResize();

    return () => window.removeEventListener('resize', handleResize);
  }, [updateCellSize]);

  const getRandomLetter = () => {
    return String.fromCharCode(65 + Math.floor(Math.random() * 26));
  };

  const createGrid = useCallback(() => {
    const newGrid: GridCell[][] = [];
    for (let y = 0; y < GRID_ROWS; y++) {
      const row: GridCell[] = [];
      for (let x = 0; x < GRID_COLS; x++) {
        row.push({
          letter: getRandomLetter(),
          isHighlighted: false,
          x,
          y,
        });
      }
      newGrid.push(row);
    }
    return newGrid;
  }, []);

  const placeWord = (grid: GridCell[][], word: string, startX: number, startY: number) => {
    const cells: {x: number, y: number}[] = [];
    for (let i = 0; i < word.length; i++) {
      if (startX + i < GRID_COLS && grid[startY]) {
        grid[startY][startX + i].letter = word[i].toUpperCase();
        cells.push({x: startX + i, y: startY});
      }
    }
    return cells;
  };

  const updateGridWithLyric = useCallback((lyric: string) => {
    const words = lyric.split(' ');
    const newGrid = createGrid();
    const allHighlightedCells: {x: number, y: number}[] = [];
    
    let currentY = Math.floor(GRID_ROWS / 3);
    
    words.forEach(word => {
      if (word.length > 0) {
        const startX = Math.floor(Math.random() * (GRID_COLS - word.length));
        const cells = placeWord(newGrid, word, startX, currentY);
        allHighlightedCells.push(...cells);
        currentY++;
      }
    });

    setGrid(newGrid);
    setHighlightedCells(allHighlightedCells);
  }, [createGrid]);

  useEffect(() => {
    const cycleInterval = setInterval(() => {
      const randomLyric = lyrics[Math.floor(Math.random() * lyrics.length)].text;
      updateGridWithLyric(randomLyric);
    }, 5000);

    return () => clearInterval(cycleInterval);
  }, [lyrics, updateGridWithLyric]);

  useEffect(() => {
    if (lyrics.length > 0) {
      const initialLyric = lyrics[0].text;
      updateGridWithLyric(initialLyric);
    }
  }, [lyrics, updateGridWithLyric]);

  return (
    <div 
      ref={containerRef}
      style={{ 
        background: theme.backgroundColor,
        width: '100vw',
        height: '100vh',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden'
      }}
    >
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${GRID_COLS}, ${cellSize.width}px)`,
        gap: '2px',
        padding: '10px'
      }}>
        <AnimatePresence>
          {grid.flat().map((cell, index) => {
            const isHighlighted = highlightedCells.some(
              pos => pos.x === cell.x && pos.y === cell.y
            );
            
            return (
              <motion.div
                key={`${cell.x}-${cell.y}`}
                initial={{ opacity: 0 }}
                animate={{ 
                  opacity: 1,
                  color: isHighlighted ? 
                    (Array.isArray(theme.textColors) ? theme.textColors[0] : '#ffffff') : 
                    'rgba(255,255,255,0.3)',
                  scale: isHighlighted ? 1.1 : 1,
                }}
                exit={{ opacity: 0 }}
                transition={{
                  duration: 0.5,
                  delay: isHighlighted ? index * 0.01 : 0
                }}
                style={{
                  width: `${cellSize.width}px`,
                  height: `${cellSize.height}px`,
                  display: 'flex',
                  justifyContent: 'center',
                  alignItems: 'center',
                  fontFamily: 'monospace',
                  fontSize: `${cellSize.height * 0.8}px`,
                  fontWeight: isHighlighted ? 'bold' : 'normal',
                }}
              >
                {cell.letter}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
};

export default LetterWallAnimation;