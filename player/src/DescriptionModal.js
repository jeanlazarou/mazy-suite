import React, { useCallback, useLayoutEffect, useMemo, useRef } from "react";
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

// `orbit` puts the titles on a ring around the cover, where the authors, links
// and origin notes have nowhere to go. The songs are copied under the ring so
// the full information is still on the page: the ring rules only match the
// list that is a direct child of the body, so the copy falls back to an
// ordinary stacked list.
const THEMES_WITH_DETAILS_COPY = ["orbit"];

function copySongDetails(body, theme) {
  // the effect re-runs, and StrictMode invokes it twice in development
  body.querySelectorAll(".description-details").forEach((old) => old.remove());

  if (!THEMES_WITH_DETAILS_COPY.includes(theme)) return;

  const list = body.querySelector(":scope > .description-list");

  if (!list) return;

  const details = document.createElement("div");

  details.className = "description-details";
  details.appendChild(list.cloneNode(true));

  body.appendChild(details);
}

// Where a song sits in its list, and how many there are, as custom properties
// on the rendered markup. CSS cannot count siblings, and themes that lay the
// songs out by position (`orbit` puts them on a ring, `prism` gives each one
// its own hue) need both numbers.
function numberSongs(body) {
  let count = null;

  body.querySelectorAll(".description-list").forEach((list) => {
    const songs = list.querySelectorAll(":scope > li");

    list.style.setProperty("--song-count", songs.length);

    songs.forEach((song, index) => song.style.setProperty("--song-index", index));

    if (count === null) count = songs.length;
  });

  // the cover image is not inside the list, and `orbit` sizes its ring from it
  if (count !== null) body.style.setProperty("--song-count", count);
}

function decorateBody(body, theme) {
  if (!body) return;

  copySongDetails(body, theme);
  numberSongs(body);
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

  const { content, isHtml, theme } = safeDescription;

  const themeClasses = themeClassNames(theme);

  // an HTML description owns its whole iframe, there is nowhere to put it
  const timelineShown = withTimeline && !isHtml;

  // Memoised for its *identity*, not for the cost of building it: React
  // re-applies dangerouslySetInnerHTML whenever the prop object changes, so a
  // fresh `{ __html }` literal each render re-parses the whole description and
  // throws away everything `decorateBody` added to it.
  const markup = useMemo(
    () => ({ __html: formatDescription(content) }),
    [content]
  );

  const bodyRef = useRef(null);

  // Two triggers, because there are two ways the markup goes stale: the node
  // is replaced (mount, or a remount caused by the layout around it changing),
  // which the ref catches, and the content is swapped into the same node,
  // which the effect catches. Both do the same idempotent work.
  const attachBody = useCallback(
    (node) => {
      bodyRef.current = node;
      decorateBody(node, theme);
    },
    [theme]
  );

  useLayoutEffect(() => {
    decorateBody(bodyRef.current, theme);
  }, [markup, theme]);

  const renderDescription = () => {
    if (isHtml) {
      return (
        <iframe
          srcDoc={content}
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
        ref={attachBody}
        className="description-body"
        style={{ width: "100%" }}
        dangerouslySetInnerHTML={markup}
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
        padding: isHtml ? 0 : "20px 20px 3rem",
        minHeight: "100%",
        // an HTML description fills the panel and scrolls inside its iframe, so
        // it needs a definite height; a markdown one grows with its content
        // instead, which is what keeps its background under the whole list
        height: isHtml ? "100%" : undefined,
        animation: "fade-in-up 800ms cubic-bezier(0.19, 1, 0.22, 1) forwards",
      }}
    >
      {/* One shape, whether or not the timeline is showing: turning it on must
          not remount the description, or the markup `decorateBody` added to it
          is thrown away. Side by side vs stacked is a class, and the timeline
          is a conditional child in a fixed slot. */}
      <div
        className={`description-layout${
          timelineShown && !isMobileDevice ? " description-layout-split" : ""
        }`}
      >
        {timelineShown ? (
          <div className="description-timeline">
            <Timeline />
          </div>
        ) : null}
        <div className="description-pane">{renderDescription()}</div>
      </div>
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
