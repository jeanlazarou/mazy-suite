import React, { useEffect, useMemo } from 'react';
import { useAnimate } from 'framer-motion';
import { Lyric, Theme } from '../types';
import { useSongTimeline } from '../hooks/useSongTimeline';

interface GridAnimationProps {
    lyrics: Lyric[];
    theme: Theme;
    follow: boolean;
}

const CELL_WIDTH = 300; // px
const CELL_HEIGHT = 100;
const RESTING = 0.3; // opacity of the cells the light isn't on
const RIPPLE_SPEED = 0.12; // s from one cell to the next

// The song's lines in a grid, in reading order, again and again to fill it.
// The line in focus lights up, everywhere it is, and the light spreads from it
// like a ripple, reaching each cell later the further away it is.
export const GridAnimation: React.FC<GridAnimationProps> = ({ lyrics, theme, follow }) => {
    const { song, lines, focus } = useSongTimeline(lyrics, follow);
    const [scope, animate] = useAnimate();

    const columns = Math.floor(window.innerWidth / CELL_WIDTH);
    const rows = Math.floor(window.innerHeight / CELL_HEIGHT);
    const cells = useMemo(() => song.length === 0 ? [] :
        Array.from({ length: columns * rows }, (_, index) => song[index % song.length].text),
        [song, columns, rows]
    );

    const colors = useMemo(() =>
        Array.isArray(theme.textColors)
            ? theme.textColors
            : ['#ffffff', '#cccccc', '#999999', '#666666'],
        [theme.textColors]
    );

    const text = lines[focus]?.text;
    useEffect(() => {
        if (text === undefined || !scope.current) return;

        const sources = cells.flatMap((cell, index) => cell === text ? [index] : []);
        const cellElements = Array.from(scope.current.children) as HTMLElement[];
        cellElements.forEach((cell, index) => {
            if (sources.includes(index)) {
                animate(cell, { opacity: 1, scale: 1.08 }, { duration: 0.4 });
                return;
            }
            // In cells, from the nearest place the line is
            const distance = Math.min(...sources.map(source => Math.hypot(
                source % columns - index % columns,
                Math.floor(source / columns) - Math.floor(index / columns))));
            animate(cell,
                { opacity: [null, 0.9, RESTING], scale: [null, 1.12, 1] },
                { duration: 0.6, times: [0, 0.25, 1], delay: distance * RIPPLE_SPEED });
        });
    }, [focus, text, cells, columns, animate, scope]);

    return (
        <div ref={scope} style={{
            display: 'grid',
            gridTemplateColumns: `repeat(${columns}, 1fr)`,
            gridTemplateRows: `repeat(${rows}, 1fr)`,
            gap: '15px',
            height: '100vh',
            width: '100vw',
            overflow: 'hidden',
            padding: '15px',
            background: theme.backgroundColor
        }}>
            {cells.map((cell, index) => (
                <div
                    key={index}
                    style={{
                        opacity: RESTING,
                        color: colors[index % colors.length],
                        padding: '5px',
                        textAlign: 'center',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.7rem',
                        overflow: 'hidden',
                        lineHeight: '0.9',
                        wordWrap: 'break-word'
                    }}
                >
                    {cell}
                </div>
            ))}
        </div>
    );
};
