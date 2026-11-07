import React, { useEffect, useMemo, useRef } from 'react';
import { useAnimationFrame, useSpring } from 'framer-motion';
import { Lyric, Theme, Album } from '../types';
import { API_BASE_URL } from '../api/endpoints';
import { useSongTimeline } from '../hooks/useSongTimeline';

interface SpiralAnimationProps {
  lyrics: Lyric[];
  theme: Theme;
  album: Album;
  follow: boolean;
}

const PER_TURN = 8; // lines around one turn of the spiral
const STEP = (2 * Math.PI) / PER_TURN;
const PITCH = 0.1; // of the screen height, from one line down to the next
const SHOWN = PER_TURN + 1; // lines kept on each side of the one in focus
const TILT = 0.06; // looking a little down on the spiral: its far side rises
const SHARP = 0.25; // of the radius, the depth that stays in focus
const MAX_BLUR = 10; // px, on the far side
const STIFFNESS = 28; // the spring that turns the spiral to the line in focus
const DAMPING = 9.5; // a little under critical (10.6): a soft overshoot
const LEAD = 0.25; // s: the next line starts coming round before it's sung
const WINDOW = PER_TURN + SHOWN; // lines rendered each side: the spring lags a turn at most

// The lines on a spiral staircase that turns so the line in focus faces the
// audience, sharp, while the rest go round the back out of focus
const SpiralAnimation: React.FC<SpiralAnimationProps> = ({ lyrics, theme, album, follow }) => {
  const { lines, focus } = useSongTimeline(lyrics, follow, LEAD);
  const cards = useRef(new Map<number, HTMLDivElement>());
  const widths = useRef(new Map<number, number>());
  const turn = useSpring(0, { stiffness: STIFFNESS, damping: DAMPING }); // in lines
  const target = useRef<number | null>(null);

  const colors = useMemo(() => Array.isArray(theme.textColors)
    ? theme.textColors
    : ['#ffffff', '#cccccc', '#999999', '#666666'], [theme.textColors]);

  useEffect(() => {
    const remeasure = () => widths.current.clear();
    window.addEventListener('resize', remeasure);
    return () => window.removeEventListener('resize', remeasure);
  }, []);

  useAnimationFrame(time => {
    if (focus < 0) return;

    // Long lines are shrunk to fit, so every line stays on one row under the next
    cards.current.forEach((card, i) => {
      if (!widths.current.has(i)) widths.current.set(i, card.offsetWidth);
    });

    // Set only on a change: setting a spring restarts it
    if (focus !== target.current) {
      const at = turn.get();
      if (target.current === null) turn.jump(focus);
      // A jump in the song, the prompter seeking, turns one round at most
      else if (Math.abs(focus - at) > PER_TURN) turn.jump(focus - Math.sign(focus - at) * PER_TURN);
      target.current = focus;
      turn.set(focus);
    }
    const at = turn.get();

    const width = window.innerWidth;
    const height = window.innerHeight;
    const radius = Math.min(width * 0.3, height * 0.55);
    const perspective = width; // as the container's
    const sway = 0.08 * Math.sin(time / 2600); // never quite still

    cards.current.forEach((card, i) => {
      const away = i - at;
      if (Math.abs(away) > SHOWN) {
        card.style.visibility = 'hidden';
        return;
      }

      const angle = away * STEP + sway;
      const depth = radius * (1 - Math.cos(angle)); // 0 in front, twice the radius at the back
      const x = radius * Math.sin(angle);
      const y = away * PITCH * height - depth * TILT;
      const near = 1 - depth / (2 * radius);

      // Depth of field: sharp in front, more blurred the further back
      const blur = MAX_BLUR * Math.max(0, depth - SHARP * radius) / ((2 - SHARP) * radius);
      // Fade out towards the top and bottom of the screen
      const onScreen = Math.abs(y) * perspective / (perspective + depth) / (height / 2);
      const fade = 1 - Math.min(1, Math.max(0, (onScreen - 0.6) / 0.35));
      const fit = Math.min(1, (width * 0.72) / (widths.current.get(i) || 1));

      card.style.visibility = fade > 0 ? 'visible' : 'hidden';
      card.style.transform = `translate3d(calc(-50% + ${x}px), calc(-50% + ${y}px), ${-depth}px)`
        + ` rotateY(${Math.sin(angle) * 35}deg) scale(${fit})`;
      card.style.filter = blur >= 0.25 ? `blur(${Math.round(blur * 4) / 4}px)` : 'none';
      card.style.opacity = String((0.25 + 0.75 * near * near) * fade);
      card.style.zIndex = String(Math.round(near * 1000));
    });
  });

  return (
    <div style={{
      position: 'relative',
      width: '100vw',
      height: '100vh',
      overflow: 'hidden',
      background: theme.backgroundColor,
      perspective: '100vw'
    }}>
      {/* On the spiral's axis, so as blurred as the lines halfway round */}
      <img
        src={`${API_BASE_URL}/${album.coverImage}`}
        alt=""
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: '34vh',
          height: '34vh',
          objectFit: 'cover',
          borderRadius: '8px',
          transform: 'translate3d(-50%, -50%, -30vw)',
          filter: `blur(${MAX_BLUR * (1 - SHARP) / (2 - SHARP)}px) brightness(0.6)`,
          opacity: 0.3,
          zIndex: 500
        }}
      />
      {/* Only the lines around the one in focus: at random, they never end */}
      {lines.slice(Math.max(0, focus - WINDOW), focus + WINDOW + 1).map((line, k) => {
        const i = Math.max(0, focus - WINDOW) + k;
        return <div
          key={i}
          ref={card => { if (card) cards.current.set(i, card); else cards.current.delete(i); }}
          style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            visibility: 'hidden',
            whiteSpace: 'nowrap',
            fontWeight: 800,
            fontSize: 'clamp(1.5rem, 6.5vh, 5.5rem)',
            lineHeight: 1.15,
            color: colors[i % colors.length],
            textShadow: '0 0.05em 0.3em rgba(0, 0, 0, 0.45)',
            willChange: 'transform, filter, opacity'
          }}
        >
          {line.text}
        </div>;
      })}
    </div>
  );
};

export default SpiralAnimation;
