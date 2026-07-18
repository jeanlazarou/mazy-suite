import { useAtomValue } from "jotai";
import React, { useEffect } from "react";

import { MenuBar, MenuBarItem, SIcon } from "./ui";
import { useIsMobile } from "./utils";
import { changeTheme, darkMode } from "./DarkModeToggle";

function Toolbar({ height, onSave, onCancel, tools, isDarkMode }) {
  const toolbarHeight = height || 60; // Fallback to 60px if height is undefined

  return (
    <div
      style={{
        width: "100vw",
        height: toolbarHeight,
        left: 0,
        top: 0,
        zIndex: 150, // Higher than main toolbar (100) to overlay it
        position: "fixed",
        pointerEvents: "auto",
        visibility: "visible",
        display: "block",
      }}
    >
      <MenuBar style={{
        height: toolbarHeight,
        zIndex: 151,
        margin: 0,
        display: "flex",
        backgroundColor: isDarkMode ? "#1b1c1d" : "white",
      }}>
        {onSave ? (
          <MenuBarItem onClick={onSave}>
            <SIcon name="check" />
          </MenuBarItem>
        ) : null}
        {onCancel ? (
          <MenuBarItem onClick={onCancel}>
            <SIcon name="cancel" />
          </MenuBarItem>
        ) : null}

        <div style={{ margin: "auto" }}>{tools}</div>
      </MenuBar>
    </div>
  );
}

function PlayerModalComponent({ children, isDarkMode, open, toolbar, color, transparent, style, visibleHeight, clip }) {
  const isMobileDevice = useIsMobile();
  const parentRef = React.createRef();

  const parent = parentRef.current;

  useEffect(() => {
    if (parent == null) return;

    const tracksList = document.querySelector("#tracks").parentElement;

    const scrollListener = () => {
      tracksList.scrollTop = parent.scrollTop;
    };

    parent.addEventListener("scroll", scrollListener, false);

    return () => {
      parent.removeEventListener("scroll", scrollListener);
    }
  }, [parent])

  if (!open) return null;

  // Use a fixed toolbar height since the main toolbar is hidden when modal is open
  const topHeight = isMobileDevice ? undefined : 60;

  let saveHandler = null;
  let cancelHandler = null;

  let tools = null;

  const content = React.Children.map(children, (child) => {
    if (!child) return;

    if (child.type === PlayerModal.Save) {
      saveHandler = child.props.onClick;
      return null;
    } else if (child.type === PlayerModal.Cancel) {
      cancelHandler = child.props.onClick;
      return null;
    } else if (child.type === PlayerModal.Tools) {
      tools = child;
      return null;
    }

    return React.cloneElement(child, { offset: topHeight });
  });

  const showToolbar = toolbar !== false;

  return (
    <div
      className={`player-modal ${isDarkMode ? "player-modal-dark" : ""} ${transparent ? "player-modal-transparent" : ""} ${showToolbar ? "player-modal-with-toolbar" : ""
        }`}
      style={{
        display: open ? "block" : "none",
        top: showToolbar || isMobileDevice ? 0 : topHeight,
        backgroundColor: color,
        height: transparent
          ? 0
          : showToolbar || isMobileDevice
            ? "100%"
            : `calc(100% - ${topHeight}px)`,
        width: transparent ? 0 : "100%",
        pointerEvents: transparent ? "none" : "auto",
        ...style,
      }}
      ref={parentRef}
    >
      {showToolbar ? (
        <Toolbar
          tools={tools}
          onSave={saveHandler}
          onCancel={cancelHandler}
          height={topHeight}
          isDarkMode={isDarkMode}
        />
      ) : null}

      <div
        className="modal-content"
        style={{
          width: transparent ? 0 : "100%",
          height: transparent
            ? 0
            : showToolbar
              ? `calc(100% - ${topHeight}px)`
              : "100%",
          left: 0,
          top: showToolbar ? topHeight : 0,
          position: "absolute",
          overflow: clip ? "hidden" : "auto",
        }}
      >
        {content}
      </div>
    </div>
  );
}

function PlayerModal(props) {
  const isDarkMode = useAtomValue(darkMode);

  useEffect(() => {
    changeTheme(isDarkMode);
  }, [isDarkMode]);

  return <PlayerModalComponent {...props} isDarkMode={isDarkMode} />;
}

PlayerModal.Save = ({ children }) => {
  return children;
};

PlayerModal.Cancel = ({ children }) => {
  return children;
};

PlayerModal.Tools = ({ children }) => {
  return children;
};

export { PlayerModal };
