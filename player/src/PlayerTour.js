import React, { useLayoutEffect } from "react";
import { TourProvider, useTour } from "@reactour/tour";

import { commands$, START_TOUR, STOP_TOUR } from "./CommandsStream";

const tourCommands$ = commands$.stream.filter(({ action }) => action === START_TOUR || action === STOP_TOUR);

// Bridges the command stream to the tour context provided by TourProvider.
function TourCommands() {
  const { setIsOpen, setCurrentStep } = useTour();

  useLayoutEffect(() => {
    const subscription = tourCommands$.subscribe(({ action }) => {
      if (action === START_TOUR) setCurrentStep(0);

      setIsOpen(action === START_TOUR);
    });

    return () => subscription.unsubscribe();
  }, [setIsOpen, setCurrentStep]);

  return null;
}

export function PlayerTour() {
  return global.features.includeTour ? (
    <TourProvider
      steps={steps}
      defaultOpen={global.features.tourStartsOnLoad}
      onClickMask={() => commands$.stopTour()}
      onClickClose={() => commands$.stopTour()}
      styles={{
        popover: (base) => ({
          ...base,
          borderRadius: 10,
          maxWidth: 480,
          padding: "44px 28px 20px",
        }),
        // keep the step number inside the bubble so viewport edges never clip it
        badge: (base) => ({
          ...base,
          background: "#2185d0",
          top: 10,
          left: 12,
        }),
        dot: (base, { current }) => ({
          ...base,
          background: current ? "#2185d0" : undefined,
        }),
      }}
    >
      <TourCommands />
    </TourProvider>
  ) : null;
}

const steps = [
  {
    selector: "#tracks .card:first-child",
    content:
      "After loading the playlist, the player checks for audio files updates.",
  },
  {
    selector: "#tracks .card:first-child",
    content: (
      <div>
        Each card displays
        <ul>
          <li>the track title,</li>
          <li>the track duration,</li>
          <li>and the authors.</li>
        </ul>
      </div>
    ),
  },
  {
    // .label-icon without the icon name: the icon is "info" or "headphones"
    // (recently updated track), the tour must anchor to it either way
    selector: "#tracks .card:first-child .label-icon",
    content: "Hover this icon to see update and creation times.",
  },
  {
    selector: "#play-button",
    content:
      "You can start or pause playback (you can also use the space key).",
  },
  {
    selector: ".track-enable-toggle",
    content: "You can disable or enable some tracks by clicking the checkbox.",
  },
  {
    selector: ".undo.icon",
    content:
      "If you made changes to the playlist in a previous play, the state is restored, you can undo to find the original state.",
  },
  {
    selector: "#total-duration",
    content: "Here you can see the total duration of the playlist.",
  },
  {
    selector: ".sort.icon",
    content:
      "You can re-order the tracks as you want. Enable sorting mode by clicking this button.",
  },
  {
    selector: ".shuffle.icon",
    content: "The shuffle button randomly re-orders the tracks.",
  },
  {
    selector: ".volume.up.icon",
    content:
      "Click the volume button to enter the volumes mode where you can set the volume level of each track.",
  },
  {
    selector: ".undo.icon",
    content: "You can undo any change you make.",
  },
  {
    selector: ".redo.icon",
    content: "And redo the change...",
  },
  {
    selector: ".retweet.icon",
    content: (
      <div>
        Click the loop button repeatedly to change the playback mode
        <ul>
          <li>do not loop</li>
          <li>loop the playlist</li>
          <li>loop one track</li>
        </ul>
      </div>
    ),
  },
  {
    selector: ".filter.icon",
    content: "Filters are available to reduce the number of tracks you see.",
  },
  {
    selector: ".info.icon",
    content:
      "Additional information about the playlist is available by clicking the information button.",
  },
  {
    selector: "#lyrics",
    content: "You can enable lyrics display.",
  },
  {
    selector: "#dark-mode-toggle",
    content: "Select the display mode (dark or light).",
  },
  {
    selector: ".bars.icon",
    content: (
      <div>
        More options here:
        <ul>
          <li>Snooze</li>
          <li>Display small cards</li>
          <li>Enter fullscreen mode</li>
        </ul>
      </div>
    ),
  },
];
