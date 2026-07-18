import ReactDOM from "react-dom";
import React, { useEffect, useRef } from "react";

import "./Popup.css";

import { keyCodes, useKeyboardKey } from "./useKeyboardKey";

export function Popup({ children, open, onClose }) {
  const modalRef = useRef();
  const escape = useKeyboardKey({ shortcut: keyCodes.ESCAPE });

  const appRoot = document.querySelector("body");

  if (escape) onClose();

  useEffect(() => {
    const listener = (event) => {
      if (!modalRef.current || modalRef.current.contains(event.target)) {
        return;
      }

      onClose();
    };

    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener);

    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener);
    };
  }, [modalRef, onClose]);

  return open
    ? ReactDOM.createPortal(
        <div className="modal-hidden-background">
          <div ref={modalRef} className="modal-container">
            {children}
          </div>
        </div>,
        appRoot
      )
    : null;
}
