import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Lyric, Theme, Album } from '../types';

interface CarouselAnimationProps {
    lyrics: Lyric[];
    theme: Theme;
    album: Album;
}

export const CarouselAnimation: React.FC<CarouselAnimationProps> = ({ lyrics, theme, album }) => {
    const [currentIndex, setCurrentIndex] = useState(0);
    const [coverPosition, setCoverPosition] = useState({ x: '50%', y: '50%' });

    const colors = Array.isArray(theme.textColors)
        ? theme.textColors
        : ['#ffffff', '#cccccc', '#999999', '#666666', '#333333'];

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentIndex(prevIndex =>
                prevIndex < lyrics.length - 1 ? prevIndex + 1 : 0
            );
        }, 5000); // Change lyric every 5 seconds

        return () => clearInterval(interval);
    }, [lyrics.length]);

    useEffect(() => {
        const moveCover = () => {
            setCoverPosition({
                x: `${Math.random() * 100}%`,
                y: `${Math.random() * 100}%`
            });
        };

        const interval = setInterval(moveCover, 3000); // Move cover every 3 seconds
        moveCover(); // Initial movement

        return () => clearInterval(interval);
    }, []);

    return (
        <div style={{
            position: 'relative',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            backgroundColor: theme.backgroundColor,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
        }}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentIndex}
                    initial={{ y: 50, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    exit={{ y: -50, opacity: 0 }}
                    transition={{ duration: 0.5 }}
                    style={{
                        position: 'absolute',
                        textAlign: 'center',
                        color: colors[currentIndex % colors.length],
                        fontSize: '2rem',
                        maxWidth: '80%',
                        padding: '20px',
                        zIndex: 2,
                        textShadow: '2px 2px 4px rgba(0,0,0,0.5)'
                    }}
                >
                    {lyrics[currentIndex].text}
                </motion.div>
            </AnimatePresence>
            <motion.img
                src={`/data/${album.coverImage}`}
                alt="Album Cover"
                animate={coverPosition}
                transition={{ duration: 3, ease: "easeInOut" }}
                style={{
                    position: 'absolute',
                    width: '200px',
                    height: '200px',
                    objectFit: 'cover',
                    borderRadius: '10%',
                    boxShadow: '0 0 10px rgba(0,0,0,0.3)',
                    zIndex: 1
                }}
            />
        </div>
    );
};