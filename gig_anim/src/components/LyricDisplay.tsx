import React, { useState, useEffect, useMemo } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Lyric, PerformanceData, Track } from '../types';
import { AnimatedElement } from './AnimatedElement';
import { themes } from '../themes';
import { shuffleArray } from '../utils/arrayUtils';
import { fetchLyrics } from '../api/endpoints';
import { GridAnimation } from './GridAnimation';
import { TeletypeAnimation } from './TeletypeAnimation';
import { CarouselAnimation } from './CarouselAnimation';
import { FallingAnimation } from './FallingAnimation';
import { FadeAnimation } from './FadeAnimation';

import './LyricDisplay.css';
import SpiralAnimation from './SpiralAnimation';
import TypewriterAnimation from './TypewriterAnimation';
import LetterWallAnimation from './LetterWallAnimation';
import WaveAnimation from './WaveAnimation';
import ConstellationAnimation from './ConstellationAnimation';
import TypographyAnimation from './TypographyAnimation';
import ManuscriptAnimation from './ManuscriptAnimation';

import '../vendor/khoshnus/style.css'


interface LyricDisplayProps {
    performanceData: PerformanceData;
    currentTrack: Track;
}

const MAX_DISPLAYED_ELEMENTS = Math.floor(Math.random() * 11) + 20;

export const LyricDisplay: React.FC<LyricDisplayProps> = ({ performanceData, currentTrack }) => {
    const [lyrics, setLyrics] = useState<Lyric[]>([]);
    const [currentLyricIndex, setCurrentLyricIndex] = useState<number>(0);

    useEffect(() => {
        const loadLyrics = async () => {
            try {
                const fetchedLyrics = await fetchLyrics(currentTrack.title);
                setLyrics(shuffleArray(fetchedLyrics));
            } catch (error) {
                console.error("Error fetching lyrics:", error);
            }
        };

        loadLyrics();
        setCurrentLyricIndex(0); // Reset lyric index when track changes
    }, [currentTrack]);

    useEffect(() => {
        const interval = setInterval(() => {
            setCurrentLyricIndex((prevIndex) => (prevIndex + 1) % MAX_DISPLAYED_ELEMENTS);
        }, 5000);

        return () => clearInterval(interval);
    }, [lyrics]);

    const currentAlbum = performanceData.albums.find(album => album.id === currentTrack.albumId);
    const currentTheme = themes.find(theme => theme.name === currentTrack.theme) ||
        { name: 'default', backgroundColor: 'black', textColors: 'random' };

    const displayedElements = useMemo(() => {
        const allElements = [
            { content: `/data/${currentAlbum?.coverImage}`, isImage: true, isHighlighted: false },
            { content: performanceData.title },
            { content: currentTrack.title },
            { content: currentAlbum?.title || 'Unknown Album' },
            ...currentTrack.authors.map(author => ({ content: author })),
            ...lyrics
                .slice(0, MAX_DISPLAYED_ELEMENTS)
                .map((lyric, index) => ({ content: lyric.text, isHighlighted: index === currentLyricIndex }))
        ];

        return allElements;
    }, [performanceData, currentTrack, currentAlbum, lyrics, currentLyricIndex]);

    const renderAnimation = () => {
        switch (currentTrack.animationType) {
            case "none":
                return null;
            case "grid":
                return <GridAnimation lyrics={lyrics} theme={currentTheme} />;
            case "teletype":
                return <TeletypeAnimation lyrics={lyrics} theme={currentTheme} album={currentAlbum!} />;
            case 'carousel':
                return <CarouselAnimation lyrics={lyrics} theme={currentTheme} album={currentAlbum!} />;
            case 'falling':
                return <FallingAnimation lyrics={lyrics} theme={currentTheme} album={currentAlbum!} />;
            case 'fade':
                return <FadeAnimation lyrics={lyrics} theme={currentTheme} album={currentAlbum!} />;
            case 'manuscript':
                return <ManuscriptAnimation lyrics={lyrics} theme={currentTheme} album={currentAlbum!} />;
            case 'spiral':
                return <SpiralAnimation lyrics={lyrics} theme={currentTheme} album={currentAlbum!} />;
            case 'typewriter':
                return <TypewriterAnimation lyrics={lyrics} theme={currentTheme} />;
            case 'wall':
                return <LetterWallAnimation lyrics={lyrics} theme={currentTheme} />;
            case 'wave':
                return <WaveAnimation lyrics={lyrics} theme={currentTheme} />;
            case 'constellation':
                return <ConstellationAnimation lyrics={lyrics} theme={currentTheme} />;
            case 'typography':
                return <TypographyAnimation lyrics={lyrics} theme={currentTheme} />;
            default:
                return (
                    <>
                        {displayedElements.map((element, index) => (
                            <AnimatedElement
                                key={`${currentTrack.title}-${index}`}
                                content={element.content}
                                isImage={element.isImage}
                                isHighlighted={element.isHighlighted}
                                theme={currentTheme}
                                delay={currentTrack.animationDelay + index * 100}
                            />
                        ))}
                    </>
                );
        }
    };

    return (
        <div className="lyric-display" style={{ backgroundColor: currentTheme.backgroundColor }}>
            <AnimatePresence mode="wait">
                <motion.div
                    key={currentTrack.title} // Use track title as key to force remount on track change
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.5 }}
                >
                    {renderAnimation()}
                </motion.div>
            </AnimatePresence>
        </div>
    );
};