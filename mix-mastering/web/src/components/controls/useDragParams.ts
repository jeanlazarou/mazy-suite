import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAudioEngine } from '../../hooks/useAudioEngine';
import { useStore } from '../../store/store';
import { EMPTY_PARAMS } from '../../store/constants';

/** A processor's params for direct-manipulation views. Drag edits show
 *  immediately from a local overlay; the engine round trip (setParam ->
 *  getParams -> store) is throttled to one per frame, and the overlay is
 *  dropped once the store has caught up and the drag has ended. */
export function useDragParams(processor: string) {
  const { setParam } = useAudioEngine();
  const stored = useStore((s) => s.params[processor] ?? EMPTY_PARAMS);
  const [local, setLocal] = useState<Record<string, number>>({});
  const pending = useRef(new Map<string, number>());
  const inFlight = useRef(0);
  const frame = useRef(0);
  const dragging = useRef(false);

  const params = useMemo(() => ({ ...stored, ...local }), [stored, local]);

  const settle = useCallback(() => {
    if (inFlight.current === 0 && pending.current.size === 0 && !dragging.current) setLocal({});
  }, []);

  const flush = useCallback(() => {
    frame.current = 0;
    const batch = [...pending.current];
    pending.current.clear();
    for (const [param, value] of batch) {
      inFlight.current++;
      setParam(processor, param, value).finally(() => {
        inFlight.current--;
        settle();
      });
    }
  }, [processor, setParam, settle]);

  const edit = useCallback((patch: Record<string, number>) => {
    setLocal((prev) => ({ ...prev, ...patch }));
    for (const [k, v] of Object.entries(patch)) pending.current.set(k, v);
    if (!frame.current) frame.current = requestAnimationFrame(flush);
  }, [flush]);

  const setDragging = useCallback((on: boolean) => {
    dragging.current = on;
    if (!on) settle();
  }, [settle]);

  useEffect(() => () => { if (frame.current) cancelAnimationFrame(frame.current); }, []);

  return { params, edit, setDragging };
}
