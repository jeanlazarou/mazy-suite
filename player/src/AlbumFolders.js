import React, { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";

import { AlbumTiles } from "./AlbumTiles";
import { ColorFill } from "./ColorFill";
import { albumsLabel, groupByColor } from "./albumGroups";

import "./AlbumFolders.css";

// covers shown inside a closed folder (a 3×3 grid)
const PREVIEW = 9;

const spring = { type: "spring", stiffness: 380, damping: 34 };

const fade = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
};

export function AlbumFolders({ list, onClick }) {
  const [openColor, setOpenColor] = useState();

  const groups = groupByColor(list);

  // a single color (the list is filtered on it): a folder would be a detour
  if (groups.length < 2) return <AlbumTiles list={list} onClick={onClick} />;

  const open = groups.find((group) => group.color === openColor);

  return (
    <>
      <div className="album-folders">
        {groups.map((group) => (
          <div key={group.color} className="album-folder-slot">
            <div className="album-folder-box">
              {group !== open && (
                <Folder group={group} onOpen={() => setOpenColor(group.color)} />
              )}
            </div>
            <span className="album-folder-label">
              {albumsLabel(group.albums.length)}
            </span>
          </div>
        ))}
      </div>

      {createPortal(
        <AnimatePresence>
          {open && (
            <OpenFolder
              key={open.color}
              group={open}
              onClick={onClick}
              onClose={() => setOpenColor(undefined)}
            />
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
}

function Folder({ group, onOpen }) {
  return (
    <motion.div
      layoutId={`folder-${group.color}`}
      className="album-folder"
      style={{ borderRadius: 24 }}
      transition={spring}
      onClick={onOpen}
    >
      <ColorFill color={group.color} opacity={0.85} over="white" />
      {group.albums.slice(0, PREVIEW).map(({ album }) => (
        <motion.img
          key={album.id}
          layoutId={`album-${album.id}`}
          src={album.image}
          alt=""
          style={{ borderRadius: 5 }}
          transition={spring}
        />
      ))}
    </motion.div>
  );
}

function OpenFolder({ group, onClick, onClose }) {
  // closing the album summary is a tap outside it, which lands on this
  // backdrop once the summary is gone: only a tap that started here closes
  const pressed = useRef(false);

  const columns = group.albums.length > PREVIEW ? 4 : 3;

  return (
    <div className="album-folder-overlay">
      <motion.div
        className="album-folder-backdrop"
        {...fade}
        onPointerDown={() => {
          pressed.current = true;
        }}
        onClick={() => {
          if (pressed.current) onClose();

          pressed.current = false;
        }}
      />

      <div className="album-folder-open">
        <motion.p className="album-folder-title" {...fade}>
          {albumsLabel(group.albums.length)}
        </motion.p>

        <motion.div
          layoutId={`folder-${group.color}`}
          className="album-folder-panel"
          style={{ borderRadius: 32 }}
          transition={spring}
        >
          <ColorFill color={group.color} opacity={0.6} />
          <motion.div
            layoutScroll
            className="album-folder-grid"
            style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}
          >
            {group.albums.map(({ album, index }, i) => (
              <motion.img
                key={album.id}
                src={album.image}
                alt=""
                style={{ borderRadius: 12 }}
                transition={spring}
                onClick={() => onClick(index)}
                {...(i < PREVIEW
                  ? { layoutId: `album-${album.id}` }
                  : {
                      initial: { opacity: 0, scale: 0.6 },
                      animate: { opacity: 1, scale: 1 },
                      exit: { opacity: 0, scale: 0.6 },
                    })}
              />
            ))}
          </motion.div>
        </motion.div>
      </div>
    </div>
  );
}
