import { useLayoutEffect, useRef } from "react";
import { spring } from "motion";
import { animate } from "motion/mini";

const transition = { type: spring, stiffness: 300, damping: 30 };

// a capture not followed by a reorder (an undo with nothing to undo) expires
const MAX_WAIT = 1000;

function cardPlaces(container) {
  const places = new Map();

  for (const card of container.querySelectorAll(".card[id^='card-']"))
    places.set(card.id, { card, rect: card.getBoundingClientRect() });

  return places;
}

function reducedMotion() {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

// FLIP: the cards' places are taken when a reorder command is sent, before
// React renders the new order; once it is rendered, each moved card springs
// from its old place to the new one.
export function useAnimatedReorder(containerRef, commands, order) {
  const before = useRef(null);

  useLayoutEffect(() => {
    const subscription = commands.subscribe(() => {
      if (!containerRef.current || reducedMotion()) return;

      before.current = {
        places: cardPlaces(containerRef.current),
        at: performance.now(),
      };
    });

    return () => subscription.unsubscribe();
  }, [containerRef, commands]);

  useLayoutEffect(() => {
    const captured = before.current;

    before.current = null;

    if (!captured || !containerRef.current) return;
    if (performance.now() - captured.at > MAX_WAIT) return;

    for (const [id, { card, rect }] of cardPlaces(containerRef.current)) {
      const from = captured.places.get(id)?.rect;

      if (!from) continue;

      const dx = from.left - rect.left;
      const dy = from.top - rect.top;

      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;

      // the inline transform left at the end would cancel the :hover lift
      animate(
        card,
        { transform: [`translate(${dx}px, ${dy}px)`, "none"] },
        transition
      ).then(() => card.style.removeProperty("transform"));
    }
  }, [containerRef, order]);
}
