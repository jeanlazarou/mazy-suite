import React, { Children, useEffect, useState } from "react";
import Dialog from "@mui/material/Dialog";
import Fade from "@mui/material/Fade";

import { SIcon } from "./ui";

import "./AlbumsMenu.css";

export function AlbumsMenu({ children, sideVisible }) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [showHandle, setShowHandle] = useState(0);

  useEffect(() => {
    if (sideVisible) {
      setShowHandle(false);
      return;
    }

    const handler = (ev) => {
      setShowHandle(ev.clientX < 30);
    };

    document.documentElement.addEventListener("mousemove", handler);

    return () =>
      document.documentElement.removeEventListener("mousemove", handler);
  }, [sideVisible]);

  const [menu, content] = elements(children);

  return (
    <>
      <div
        className={`menu-handle ${sideVisible || showHandle ? "" : "hide"}`}
        onClick={() => setMenuVisible((v) => !v)}
      >
        <SIcon size="large" name="cog" />
      </div>

      <SubMenu open={menuVisible} onClose={() => setMenuVisible(false)}>
        {menu}
      </SubMenu>

      {content}
    </>
  );
}

function elements(children) {
  const elements = Array(2);

  Children.forEach(children, (c) => {
    if (c.type === AlbumsMenu.Menu) elements[0] = c;
    if (c.type === AlbumsMenu.Content) elements[1] = c;
  });

  return elements;
}

AlbumsMenu.Content = function GenericSidebarContent({ children }) {
  return children;
};

AlbumsMenu.Menu = function GenericSidebarMenu({ children }) {
  return children;
};

function SubMenu({ children, open, onClose }) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      onClick={onClose}
      slots={{ transition: Fade }}
      slotProps={{
        transition: { timeout: 500 },
        paper: {
          className: "player-menu-paper",
          sx: { position: "fixed", top: 40, m: 0, maxWidth: "none" },
        },
      }}
    >
      <div className="player-menu">{children}</div>
    </Dialog>
  );
}
