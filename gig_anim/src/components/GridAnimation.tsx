import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Lyric, Theme } from '../types';

interface GridAnimationProps {
    lyrics: Lyric[];
    theme: Theme;
}

export const GridAnimation: React.FC<GridAnimationProps> = ({ lyrics, theme }) => {
    // Increase the cell size for larger grid items
    const cellWidth = 300; // Increased from 200
    const cellHeight = 100; // Increased from 100

    // Calculate the number of rows and columns based on screen size
    const columns = Math.floor(window.innerWidth / cellWidth);
    const rows = Math.floor(window.innerHeight / cellHeight);
    const totalCells = columns * rows;

    // Repeat lyrics if there aren't enough to fill the grid
    const gridItems = useMemo(() =>
        Array(totalCells).fill(null).map((_, index) => lyrics[index % lyrics.length]),
        [lyrics, totalCells]
    );

    // Get theme colors, or use a default if 'random' is specified
    const colors = useMemo(() =>
        Array.isArray(theme.textColors)
            ? theme.textColors
            : ['#ffffff', '#cccccc', '#999999', '#666666'], // Default color palette
        [theme.textColors]
    );

    // State to keep track of which items are lit
    const [litItems, setLitItems] = useState<boolean[]>(new Array(totalCells).fill(false));

    useEffect(() => {
        const interval = setInterval(() => {
            setLitItems(prev => {
                const newLitItems = [...prev];
                const numberOfItemsToLight = Math.floor(totalCells * 0.2); // Light up about 20% of items

                // Reset all items to unlit
                newLitItems.fill(false);

                // Randomly select items to light up
                for (let i = 0; i < numberOfItemsToLight; i++) {
                    let randomIndex;
                    do {
                        randomIndex = Math.floor(Math.random() * totalCells);
                    } while (newLitItems[randomIndex]); // Ensure we don't select the same item twice
                    newLitItems[randomIndex] = true;
                }

                return newLitItems;
            });
        }, 1000); // Update every second

        return () => clearInterval(interval);
    }, [totalCells]);

    return (
        <div style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: '15px', // Increased gap for larger cells
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            padding: '15px' // Added padding to the container
        }}>
            {gridItems.map((lyric, index) => (
                <motion.div
                    key={index}
                    animate={{
                        opacity: litItems[index] ? 1 : 0.3,
                        color: colors[index % colors.length] // Cycle through theme colors
                    }}
                    transition={{ duration: 0.5 }}
                    style={{
                        padding: '5px', // Increased padding
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.7rem', // Increased font size
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        lineHeight: '0.9', // Added line height for better readability
                        wordWrap: 'break-word' // Allow long words to break
                    }}
                >
                    {lyric ? lyric.text : ""}
                </motion.div>
            ))}
        </div>
    );
};