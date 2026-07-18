import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme, Album } from '../types';

interface FallingAnimationProps {
    lyrics: Lyric[];
    theme: Theme;
    album: Album;
}

interface FallingItem {
    id: number;
    content: string;
    x: number;
    isImage: boolean;
}

export const FallingAnimation: React.FC<FallingAnimationProps> = ({ lyrics, theme, album }) => {
    const [visibleItems, setVisibleItems] = useState<FallingItem[]>([]);
    const [nextId, setNextId] = useState(0);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(0);

    const colors = Array.isArray(theme.textColors)
        ? theme.textColors
        : ['#ffffff', '#cccccc', '#999999', '#666666', '#333333'];

    const addNewItem = useCallback(() => {
        const isAlbumCover = Math.random() < 0.2; // 20% chance of being an album cover
        const newItem: FallingItem = {
            id: nextId,
            content: isAlbumCover ? album.coverImage : lyrics[currentLyricIndex].text,
            x: Math.random() * (window.innerWidth - 100), // Random x position
            isImage: isAlbumCover
        };

        setVisibleItems(prev => [...prev, newItem]);
        setNextId(prev => prev + 1);
        if (!isAlbumCover) {
            setCurrentLyricIndex(prev => (prev + 1) % lyrics.length);
        }
    }, [nextId, currentLyricIndex, lyrics, album]);

    useEffect(() => {
        const interval = setInterval(() => {
            addNewItem();
        }, 2000); // Add new item every 2 seconds

        return () => clearInterval(interval);
    }, [addNewItem]);

    useEffect(() => {
        const cleanupInterval = setInterval(() => {
            setVisibleItems(prev => prev.slice(-15)); // Keep only the last 15 items
        }, 10000); // Cleanup every 10 seconds

        return () => clearInterval(cleanupInterval);
    }, []);

    return (
        <div style={{ position: 'relative', height: '100vh', overflow: 'hidden', background: theme.backgroundColor }}>
            <AnimatePresence>
                {visibleItems.map((item) => (
                    <motion.div
                        key={item.id}
                        initial={{ y: -50, x: item.x, opacity: 0 }}
                        animate={{ y: window.innerHeight, opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 10, ease: "linear" }}
                        style={{
                            position: 'absolute',
                            color: colors[item.id % colors.length],
                            fontSize: '2.2rem',
                            whiteSpace: 'nowrap'
                        }}
                    >
                        {item.isImage ? (
                            <img
                                src={`/data/${item.content}`}
                                alt="Album Cover"
                                style={{ width: '173px', objectFit: 'cover' }}
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