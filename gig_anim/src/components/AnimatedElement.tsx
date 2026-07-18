import React, { useState, useEffect } from 'react';
import { motion, useAnimation } from 'framer-motion';
import { Theme } from '../types';
import { getRandomPosition } from '../utils/positionUtils';
import { getRandomColor } from '../utils/colorUtils';
import { getRandomSize } from '../utils/sizeUtils';

interface AnimatedElementProps {
    content: React.ReactNode;
    isImage?: boolean;
    isHighlighted?: boolean;
    theme: Theme;
    delay: number;
}

export const AnimatedElement: React.FC<AnimatedElementProps> = ({ content, isImage = false, isHighlighted = false, theme, delay }) => {
    const controls = useAnimation();
    const [elementColor, setElementColor] = useState<string>('');
    const [startPosition] = useState(getRandomPosition());

    useEffect(() => {
        if (theme.textColors === 'random') {
            setElementColor(getRandomColor());
        } else {
            setElementColor(theme.textColors[Math.floor(Math.random() * theme.textColors.length)]);
        }
    }, [theme]);

    useEffect(() => {
        const animate = async () => {
            // Wait for the specified delay before starting any animation
            await new Promise(resolve => setTimeout(resolve, delay));

            // Fade in at the start position
            await controls.start({
                opacity: 1,
                transition: { duration: 0.5 }
            });

            // Start the continuous animation
            controls.start({
                ...getRandomPosition(),
                scale: getRandomSize(),
                transition: {
                    duration: 5 + Math.random() * 5,
                    repeat: Infinity,
                    repeatType: "mirror",
                    ease: "easeInOut"
                },
            });
        };

        animate();

        return () => {
            controls.stop();
        };
    }, [controls, delay]);

    return (
        <motion.div
            initial={{ ...startPosition, opacity: 0 }}
            animate={controls}
            style={{
                position: 'absolute',
                color: isImage ? undefined : elementColor,
                fontSize: isHighlighted ? '2rem' : '1rem',
                fontWeight: isHighlighted ? 'bold' : 'normal',
                zIndex: isHighlighted ? 10 : 1,
            }}
        >
            {isImage ? (
                <motion.img
                    src={content as string}
                    alt="Album cover"
                    style={{ width: '200px', height: '200px' }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 20, repeat: Infinity, ease: 'linear' }}
                />
            ) : (
                content
            )}
        </motion.div>
    );
};