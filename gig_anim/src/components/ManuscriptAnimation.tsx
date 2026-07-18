import React, { useEffect, useRef, useState } from 'react';
import { Lyric, Theme, Album } from '../types';
import { Manuscript } from '../vendor/khoshnus/khoshnus';
import { FONT_MATRIX } from '../vendor/khoshnus/initialize';
import { getRandomColor } from '../utils/colorUtils';
import { shuffleArray } from '../utils/arrayUtils';
import FloatingCover from './FloatingCover';
import "../vendor/khoshnus/style.css";

interface ManuscriptAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  album: Album;
}

function drawTextColor(theme: Theme): string {
  return theme.textColors === "random" ? getRandomColor() : theme.textColors[Math.floor(Math.random() * theme.textColors.length)];
}

const SELECTED_FONTS = [
  "BlackCherry",
  "Celtic",
  "Kingthings",
  "Parisienne",
  "Sevillana",
  "Pinyon Script"
]

export const ManuscriptAnimation: React.FC<ManuscriptAnimationProps> = ({ lyrics, theme, album }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const manuscriptRef = useRef<Manuscript | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isReady, setIsReady] = useState(false);

  // Function to clean up current animation state
  const cleanupAnimation = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    manuscriptRef.current = null;

    // Remove all SVG elements
    const container = containerRef.current;
    if (container) {
      const existingSvgs = container.querySelectorAll('svg');
      existingSvgs.forEach(svg => svg.remove());

      // Create fresh SVG element
      const newSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      newSvg.setAttribute("id", "khoshnus");
      newSvg.setAttribute("width", "100%");
      newSvg.setAttribute("height", "100%");
      newSvg.setAttribute("viewBox", "0 0 100 100");
      newSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      container.querySelector('#manuscript-container')?.appendChild(newSvg);
    }
  };
  
  const initializeSvg = () => {
    const container = containerRef.current?.querySelector('#manuscript-container');
    if (!container) return;

    // Create fresh SVG element
    const newSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    newSvg.setAttribute("id", "khoshnus");
    newSvg.setAttribute("width", "100%");
    newSvg.setAttribute("height", "100%");
    newSvg.setAttribute("viewBox", "0 0 100 100");
    newSvg.setAttribute("preserveAspectRatio", "xMidYMid meet");
    container.appendChild(newSvg);

    // Create style element if it doesn't exist
    if (!document.querySelector('style[data-manuscript]')) {
      const style = document.createElement('style');
      style.setAttribute('data-manuscript', 'true');
      document.head.appendChild(style);
    }
  };

  useEffect(() => {
    const loadFonts = async () => {
      try {
        await Promise.all(
          SELECTED_FONTS.map(async (fontName) => {
            const font = new FontFace(fontName, `url("/fonts/${fontName}.ttf")`);
            await font.load();
            document.fonts.add(font);
          })
        );
        setIsReady(true);
      } catch (error) {
        console.error('Error loading fonts:', error);
        // Fallback to allow animation even if custom fonts fail
        setIsReady(true);
      }
    };

    loadFonts();
  }, []);

  useEffect(() => {
    if (!isReady || !containerRef.current) return;

    const startAnimation = () => {
      // Clean up previous state
      cleanupAnimation();

      initializeSvg();

      // Select a random font
      const fonts = SELECTED_FONTS;
      const font = FONT_MATRIX[fonts[Math.floor(Math.random() * fonts.length)]];

      // Create new manuscript instance
      try {
        manuscriptRef.current = new Manuscript({
          svgId: "khoshnus",
          font: font.name,
          fontSize: "16px",
          start: {
            startStrokeDashoffset: font.strokeDashoffset,
            startStroke: drawTextColor(theme),
            startStrokeWidth: 0.0000000001,
            startFill: "transparent",
          },
          end: {
            endStrokeDashoffset: 0,
            endStroke: "transparent",
            endStrokeWidth: 0.3,
            endFill: drawTextColor(theme),
          },
          durations: {
            strokeDashoffsetDuration: 3500,
            strokeWidthDuration: 2500,
            strokeDuration: 2500,
            fillDuration: 4000,
          },
        });

        // Calculate spacing with more space between lines
        const viewBoxHeight = 100;
        const marginTop = 10;
        const usableHeight = viewBoxHeight - (marginTop * 2);
        const spacingBetweenLines = usableHeight / 6;

        // Shuffle lyrics and take first 7
        const shuffledLyrics = shuffleArray([...lyrics]).slice(0, 7);

        // Write each lyric with increasing delay
        const textIds = shuffledLyrics.map((lyric, index) => {
          const y = marginTop + (spacingBetweenLines * index);
          const delay = index * 3000;

          return manuscriptRef.current!.write(lyric.text, {
            textElementAttributes: {
              y: `${y}`,
              x: "50",
              textAnchor: "middle",
              fontSize: "3.2",
            },
            writeConfiguration: {
              delayOperation: delay,
              eachLetterDelay: 100,
            }
          });
        });

        // Calculate total animation duration
        const totalDuration = (textIds.length * 3000) + 5000;

        // Erase all text
        textIds.forEach(textId => {
          if (manuscriptRef.current) {
            manuscriptRef.current.erase(textId, {
              delayOperation: totalDuration - 2000
            });
          }
        });

        // Schedule next animation cycle
        timeoutRef.current = setTimeout(startAnimation, totalDuration);
      } catch (error) {
        console.error('Error initializing manuscript:', error);
        // Attempt recovery
        setTimeout(startAnimation, 1000);
        return;
      }
    };

    // Start the initial animation cycle
    startAnimation();

    // Handle window resize with debounce
    let resizeTimeout: NodeJS.Timeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        startAnimation();
      }, 250); // Debounce resize events
    };

    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      cleanupAnimation();
    };
  }, [lyrics, theme, isReady]);

  return (
    <div
      ref={containerRef}
      style={{
        width: '100vw',
        height: '100vh',
        backgroundColor: theme.backgroundColor,
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
        position: 'relative'
      }}
    >
      <div id="manuscript-container" style={{ position: 'absolute', inset: 0 }}></div>
      <FloatingCover album={album} />
    </div>
  );
};

export default ManuscriptAnimation;