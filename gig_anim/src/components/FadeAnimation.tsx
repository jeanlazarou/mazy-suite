import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme, Album } from '../types';

interface FadeAnimationProps {
    lyrics: Lyric[];
    theme: Theme;
    album: Album;
}

interface PositionedItem {
    id: number;
    content: string;
    position: { x: number; y: number };
    isImage: boolean;
}

const GRID_COLS = 5;
const GRID_ROWS = 7;
const NUM_POSITIONS = GRID_COLS * GRID_ROWS;

export const FadeAnimation: React.FC<FadeAnimationProps> = ({ lyrics, theme, album }) => {
    const [visibleItems, setVisibleItems] = useState<PositionedItem[]>([]);

    const colors = Array.isArray(theme.textColors)
        ? theme.textColors
        : ['#ffffff', '#cccccc', '#999999', '#666666', '#333333'];

    // Generate grid-based positions
    const positions = useMemo(() => {
        const gridPositions = [];
        for (let row = 0; row < GRID_ROWS; row++) {
            for (let col = 0; col < GRID_COLS; col++) {
                gridPositions.push({
                    x: (col + 0.5) / GRID_COLS * 100 + (Math.random() * 10 - 5),
                    y: (row + 0.5) / GRID_ROWS * 100 + (Math.random() * 10 - 5)
                });
            }
        }
        return gridPositions;
    }, []);

    const getNextItem = (currentId: number): PositionedItem => {
        const nextId = (currentId + 1) % lyrics.length;
        const isAlbumCover = (Math.random() * 100) <= 13;
        return {
            id: nextId,
            content: isAlbumCover ? album.coverImage : lyrics[nextId].text,
            position: positions[currentId % NUM_POSITIONS],
            isImage: isAlbumCover
        };
    };

    useEffect(() => {
        // Initialize positions with lyrics and album cover
        setVisibleItems(positions.map((_pos, index) => getNextItem(index)));

        // Set up intervals for each position
        const intervals = positions.map((_, index) => {
            return setInterval(() => {
                setVisibleItems(prev => {
                    const newItems = [...prev];
                    newItems[index] = getNextItem(newItems[index].id);
                    return newItems;
                });
            }, 5000 + Math.random() * 2000); // Change every 5-7 seconds
        });

        return () => intervals.forEach(clearInterval);
    }, [lyrics, album, positions]);

    return (
        <div style={{
            position: 'relative',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            background: theme.backgroundColor
        }}>
            <AnimatePresence>
                {visibleItems.map((item, index) => (
                    <motion.div
                        key={`${index}-${item.id}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 1 }}
                        style={{
                            position: 'absolute',
                            left: `${item.position.x}%`,
                            top: `${item.position.y}%`,
                            transform: 'translate(-50%, -50%)',
                            color: colors[item.id % colors.length],
                            fontSize: '1.5rem',
                            textAlign: 'center',
                            maxWidth: `${90 / GRID_COLS}%`,
                            wordWrap: 'break-word'
                        }}
                    >
                        {item.isImage ? (
                            <img
                                src={`/data/${item.content}`}
                                alt="Album Cover"
                                style={{ width: '80px', height: '80px', objectFit: 'cover' }}
                            />
                        ) : (
                            item.content
                        )}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};