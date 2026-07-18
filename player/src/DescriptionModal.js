import React, { useLayoutEffect } from "react";
import { useAtom, useAtomValue } from "jotai";
import { showTimeline, songsMetadata, viewingDescription } from "./atoms";

import { SHOW_PLAYLIST, commands$ } from "./CommandsStream";
import {
  FILTER,
  REORDER,
  SHOW_DESCRIPTION,
  SHOW_MOBILE_TRANSPORT,
  TOGGLE_VOLUMES,
} from "./CommandsStream";

import { PlayerModal } from "./PlayerModal";
import { mobileHeight } from "./MobileToolbar";
import { useIsMobile } from "./utils";
import { Timeline } from "./Timeline";

const descriptionCommands$ = commands$.stream.filter(({ action }) =>
    [
      FILTER,
      REORDER,
      SHOW_DESCRIPTION,
      SHOW_PLAYLIST,
      SHOW_MOBILE_TRANSPORT,
      TOGGLE_VOLUMES,
    ].includes(action)
);

function formatDescription(html) {
  return html
    .replaceAll("\n", "")
    .replace(/<li><p>/g, "<li>")
    .replace(
      /<ol>/g,
      "<ol style='list-style-position: inside; padding-left: 0;'>"
    )
    .replace(
      /<\/p><ul>/g,
      "<ul style='list-style-type: none;margin-left: -2.2rem;'>"
    );
}

function Content() {
  const isMobileDevice = useIsMobile();
  const { description } = useAtomValue(songsMetadata);
  const withTimeline = useAtomValue(showTimeline);

  // Ensure description has the expected structure
  const safeDescription = {
    content: description?.content ?? "",
    isHtml: description?.isHtml ?? false
  };

  const renderDescription = () => {
    if (safeDescription.isHtml) {
      return (
        <iframe
          srcDoc={safeDescription.content}
          style={{
            width: "100%",
            height: "100%",
            border: "none",
            minHeight: "80vh",
          }}
          title="Album Description"
        />
      );
    }

    return (
      <div style={{ width: "100%" }}>
        <div
          dangerouslySetInnerHTML={{ __html: formatDescription(safeDescription.content) }}
        />
      </div>
    );
  };

  return (
    <div
      id="playlist-description"
      style={{
        padding: safeDescription.isHtml ? 0 : 20,
        minHeight: "100%",
        marginBottom: safeDescription.isHtml ? 0 : "3rem",
        height: isMobileDevice ? "100%" : undefined,
        animation: "fade-in-up 800ms cubic-bezier(0.19, 1, 0.22, 1) forwards",
      }}
    >
      {withTimeline && !isMobileDevice && !safeDescription.isHtml ? (
        <div style={{ display: "flex", gap: "2rem", height: "100%" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <Timeline />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {renderDescription()}
          </div>
        </div>
      ) : (
        <>
          {renderDescription()}
          {withTimeline && !safeDescription.isHtml && <Timeline />}
        </>
      )}
    </div>
  );
}

export function DescriptionModal() {
  const isMobileDevice = useIsMobile();
  const [open, setOpen] = useAtom(viewingDescription);

  useLayoutEffect(() => {
    const subscription = descriptionCommands$.subscribe(({ action }) => {
      if (action === SHOW_DESCRIPTION) {
        setOpen(!open);
      } else {
        setOpen(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [open, setOpen]);

  const styles = isMobileDevice
    ? {
        top: 0,
        height: mobileHeight,
      }
    : undefined;

  return (
    <PlayerModal
      open={open}
      toolbar={false}
      visibleHeight="100%"
      style={styles}
    >
      <React.Suspense fallback={<div>Loading playlist description...</div>}>
        <Content />
      </React.Suspense>
    </PlayerModal>
  );
}
