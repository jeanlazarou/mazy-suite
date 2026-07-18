import React, { useState, useLayoutEffect, useRef, useEffect } from 'react';
import { motion, AnimatePresence, useAnimation } from 'framer-motion';
import { Lyric, Theme, Album } from '../types';

interface TeletypeAnimationProps {
    lyrics: Lyric[];
    theme: Theme;
    album: Album;
}

interface CurrentLyric {
    text: string;
    index: number;
}

export const TeletypeAnimation: React.FC<TeletypeAnimationProps> = ({ lyrics, theme, album }) => {
    const [lines, setLines] = useState<string[]>([]);
    const [currentLyricIndex, setCurrentLyricIndex] = useState(0);
    const [currentText, setCurrentText] = useState<CurrentLyric>({ text: '', index: 0 });
    const [maxVisibleLines, setMaxVisibleLines] = useState(13);
    const containerRef = useRef<HTMLDivElement>(null);
    const albumControls = useAnimation();

    const colors = Array.isArray(theme.textColors)
        ? theme.textColors
        : ['#ffffff', '#cccccc', '#999999', '#666666', '#333333'];

    const runCoverAnimation = async () => {
        const startPos = {
            x: Math.random() * 800 - 400,
            y: Math.random() * 400 + 200,
            scale: 0.1 + Math.random() * 0.15,
            rotate: Math.random() * 40 - 20,
            opacity: 0.2,
            z: -200,
        };

        // Set initial position
        await albumControls.set(startPos);

        // Move to center
        await albumControls.start({
            x: 0,
            y: 0,
            scale: 1,
            rotate: 0,
            opacity: 1,
            z: 100,
            transition: {
                duration: 4,
                ease: "easeOut",
            }
        });

        // Brief pause
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Fade out while moving back
        await albumControls.start({
            scale: 0.5,
            opacity: 0,
            z: -300,
            transition: {
                duration: 2,
                ease: "easeIn",
            }
        });

        // Start next cycle
        runCoverAnimation();
    };

    useEffect(() => {
        runCoverAnimation();
    }, []);

    // Handle teletype text animation cycles
    useLayoutEffect(() => {
        if (currentLyricIndex >= lyrics.length) {
            setCurrentLyricIndex(0);
            setCurrentText({ text: '', index: 0 });
            setLines([]);
            return;
        }

        const currentLyric = lyrics[currentLyricIndex].text;

        const interval = setInterval(() => {
            setCurrentText(prev => {
                if (prev.index < currentLyric.length) {
                    return { text: prev.text + currentLyric[prev.index], index: prev.index + 1 }
                } else {
                    setCurrentLyricIndex(prevIndex => prevIndex + 1);

                    setLines(prev => {
                        const newLines = [currentLyric, ...prev];
                        return newLines.slice(0, maxVisibleLines);
                    });

                    return { text: '', index: 0 }
                }
            });
        }, 150);

        return () => clearInterval(interval);
    }, [currentLyricIndex, lyrics, maxVisibleLines]);

    useEffect(() => {
        const updateMaxLines = () => {
            if (containerRef.current) {
                const lineHeight = 40;
                const containerHeight = containerRef.current.clientHeight - 6 * lineHeight;
                const newMaxLines = Math.floor((containerHeight - 100) / lineHeight);
                setMaxVisibleLines(newMaxLines);
            }
        };

        updateMaxLines();
        window.addEventListener('resize', updateMaxLines);
        return () => window.removeEventListener('resize', updateMaxLines);
    }, []);

    return (
        <div ref={containerRef} style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'flex-start',
            height: '100vh',
            padding: '20px',
            paddingTop: '120px',
            boxSizing: 'border-box',
            overflow: 'hidden',
            position: 'relative',
            perspective: '1500px'
        }}>
            <motion.div
                animate={albumControls}
                style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    zIndex: 0,
                    transformStyle: 'preserve-3d'
                }}
            >
                <img
                    src={`/data/${album.coverImage}`}
                    alt={album.title}
                    style={{
                        width: '300px',
                        height: '300px',
                        objectFit: 'cover',
                        borderRadius: '8px',
                        boxShadow: '0 8px 16px rgba(0, 0, 0, 0.2)'
                    }}
                />
            </motion.div>

            <motion.div
                key="current-text"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                style={{
                    color: colors[0],
                    fontSize: '2rem',
                    marginBottom: '20px',
                    textAlign: 'center',
                    minHeight: '60px',
                    zIndex: 1,
                    textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
                }}
            >
                {currentText.text}
            </motion.div>

            <AnimatePresence>
                {lines.map((line, index) => (
                    <motion.div
                        key={index}
                        initial={{ opacity: 0, y: -50 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 20 }}
                        transition={{ duration: 0.5 }}
                        style={{
                            color: colors[(index + 1) % colors.length],
                            fontSize: '1.5rem',
                            marginBottom: '10px',
                            textAlign: 'center',
                            zIndex: 1,
                            textShadow: '2px 2px 4px rgba(0, 0, 0, 0.5)'
                        }}
                    >
                        {line}
                    </motion.div>
                ))}
            </AnimatePresence>
        </div>
    );
};