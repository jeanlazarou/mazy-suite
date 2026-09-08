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
import { DEFAULT_THEME, themeClassNames } from "./descriptionThemes";
import "./DescriptionThemes.css";
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

// Collapses the renderer's line breaks (a space, so that a hard-wrapped
// paragraph keeps the word gap), unwraps the paragraph a loose list item puts
// around the song title, and classes the lists so that themes can restyle them.
function formatDescription(html) {
  return html
    .replaceAll("\n", " ")
    .replace(/<li>\s*<p>/g, "<li>")
    .replace(/<ol>/g, "<ol class='description-list'>")
    .replace(/<\/p>\s*<ul>/g, "<ul class='description-sublist'>");
}

function Content() {
  const isMobileDevice = useIsMobile();
  const { description } = useAtomValue(songsMetadata);
  const withTimeline = useAtomValue(showTimeline);

  // Ensure description has the expected structure
  const safeDescription = {
    content: description?.content ?? "",
    isHtml: description?.isHtml ?? false,
    theme: description?.theme ?? DEFAULT_THEME
  };

  const themeClasses = themeClassNames(safeDescription.theme);

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
      <div
        className="description-body"
        style={{ width: "100%" }}
        dangerouslySetInnerHTML={{ __html: formatDescription(safeDescription.content) }}
      />
    );
  };

  return (
    <div
      id="playlist-description"
      className={themeClasses}
      style={{
        // the tail room is padding, not margin, so the background reaches the
        // bottom of the panel instead of stopping 3rem short of it
        padding: safeDescription.isHtml ? 0 : "20px 20px 3rem",
        minHeight: "100%",
        // an HTML description fills the panel and scrolls inside its iframe, so
        // it needs a definite height; a markdown one grows with its content
        // instead, which is what keeps its background under the whole list
        height: safeDescription.isHtml ? "100%" : undefined,
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
