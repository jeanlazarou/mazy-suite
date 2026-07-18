import React, { useEffect } from "react";
import { useAtomValue, useAtom } from "jotai";
import { SIcon } from "./ui";

import { currentPlaylist, playlistFilter, loadingStatus } from "./atoms";
import { applyFilter } from "./filter";

import { formatTime } from "./utils";

function Info() {
  const playlist = useAtomValue(currentPlaylist);
  const filter = useAtomValue(playlistFilter);
  const [retryStatus, setRetryStatus] = useAtom(loadingStatus);

  useEffect(() => {
    const handleRetrying = ({ detail: { url, attempt, delay } }) => {
      setRetryStatus({
        isRetrying: true,
        retryingUrl: url,
        retryAttempt: attempt,
        retryDelay: delay,
      });
    };

    const handleRetryFailed = () => {
      setRetryStatus({
        isRetrying: false,
        retryingUrl: null,
        retryAttempt: 0,
        retryDelay: 0,
      });
    };

    const handleLoaded = () => {
      setRetryStatus({
        isRetrying: false,
        retryingUrl: null,
        retryAttempt: 0,
        retryDelay: 0,
      });
    };

    document.addEventListener("sequencer:retrying", handleRetrying);
    document.addEventListener("sequencer:retry-failed", handleRetryFailed);
    document.addEventListener("sequencer:loaded", handleLoaded);

    return () => {
      document.removeEventListener("sequencer:retrying", handleRetrying);
      document.removeEventListener("sequencer:retry-failed", handleRetryFailed);
      document.removeEventListener("sequencer:loaded", handleLoaded);
    };
  }, [setRetryStatus]);

  const totalDuration = () => {
    const duration = applyFilter(playlist, filter)
      .filter((track) => track.duration && track.enabled)
      .reduce((totalTime, track) => totalTime + Math.round(track.duration), 0);

    const totalTime = Math.round(duration);

    return formatTime(totalTime);
  };

  const ready = () => {
    const list = applyFilter(playlist, filter).filter((track) => track.enabled);

    return list.every((track) => track.duration);
  };

  const isLoading = !ready();
  const showSpinner = isLoading || retryStatus.isRetrying;
  const spinnerColor = retryStatus.isRetrying ? "orange" : "purple";

  return (
    <div id="total-duration">
      {totalDuration()}
      {showSpinner && (
        <SIcon
          loading
          size="small"
          name="spinner"
          color={spinnerColor}
          style={{
            position: "absolute",
            right: 5,
            top: 8,
          }}
          title={
            retryStatus.isRetrying
              ? `Retrying... (attempt ${retryStatus.retryAttempt})`
              : "Loading..."
          }
        />
      )}
    </div>
  );
}

export { Info };
