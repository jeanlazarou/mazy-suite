import React, { useLayoutEffect } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";

import { viewingReorder } from "./atoms";
import { currentPlaylist } from "./atoms";

import {
  reorder,
  currentOrder,
  futureOrderChanged,
  futureOrderData,
} from "./sort_atoms";

import { commands$, REORDER } from "./CommandsStream";

import { PlayerModal } from "./PlayerModal";

const reorderCommands$ = commands$.stream.filter(({ action }) => [REORDER].includes(action)
);

export function ReorderModal({ onSave }) {
  const playlist = useAtomValue(currentPlaylist);
  const [open, setOpen] = useAtom(viewingReorder);
  const setInitialOrder = useSetAtom(currentOrder);
  const resetOrderChanged = useSetAtom(futureOrderChanged);
  const futureOrder = useAtomValue(futureOrderData);

  useLayoutEffect(() => {
    const subscription = reorderCommands$.subscribe(({ action }) => {
      setOpen(action === REORDER);

      setInitialOrder(playlist);

      resetOrderChanged(false);
    });

    return () => subscription.unsubscribe();
  }, [setOpen, playlist, setInitialOrder, resetOrderChanged]);

  const save = () => {
    onSave(reorder(playlist, futureOrder.indexes));
    setOpen(false);
  };

  const cancel = () => {
    setOpen(false);
  };

  return (
    <PlayerModal open={open} transparent>
      <PlayerModal.Save onClick={save} />
      <PlayerModal.Cancel onClick={cancel} />
    </PlayerModal>
  );
}
