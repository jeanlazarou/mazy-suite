import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import Button from "@mui/material/Button";

import { commands$ } from "./CommandsStream";

import { formatTime } from "./utils";
import { OptionsStore } from "./OptionsStore";
import { atom, useAtom, useAtomValue } from "jotai";
import { DarkThemes, TimerFace } from "./TimerFace";

export const snoozeRemain = atom(OptionsStore.restore().snoozeDuration);

export const snoozeRunning = atom(false);

let timerId = null

function startBlackScreenTimer() {
  timerId = setTimeout(() => {
    timerId = null

    const div = document.querySelector(".snooze-black");

    if (!div) return;

    div.classList.add("snooze-black-enabled");
  }, 5000);
}

export function Snooze({ onStop }) {
  const [remain, setRemain] = useAtom(snoozeRemain);
  const [running, setRunning] = useAtom(snoozeRunning);

  const body = document.querySelector("body");

  useEffect(() => {
    if (running) setRemain(OptionsStore.restore().snoozeDuration);

    running ? commands$.play() : commands$.stop();
  }, [running, setRemain]);

  useEffect(() => {
    if (!running) return;

    startBlackScreenTimer();

    return () => clearTimeout(timerId);
  }, [running]);

  const revealTimer = () => {
    clearTimeout(timerId)

    startBlackScreenTimer()

    const div = document.querySelector(".snooze-black");

    if (!div) return;

    div.classList.remove("snooze-black-enabled");
  };

  return ReactDOM.createPortal(
    <>
      <div className="snooze">
        <Timer />
        <div className="snooze-commands">
          <Button
            variant="contained"
            color="inherit"
            size="large"
            onClick={() => {
              setRemain(OptionsStore.restore().snoozeDuration);
              commands$.stop();
              onStop();
            }}
          >
            Close
          </Button>

          <Button
            variant="contained"
            color="inherit"
            size="large"
            onClick={() => setRunning((f) => !f)}
          >
            {running ? "Stop" : "Start"}
          </Button>
        </div>

        {!running && (
          <div className="snooze-ui-timer">
            <TimerFace
              active
              value={remain / 60}
              theme={DarkThemes.black}
              onValue={(value) => {
                setRemain(value * 60);
                OptionsStore.save({ snoozeDuration: value * 60 });
              }}
            />
          </div>
        )}
      </div>
      <div
        className="snooze-black"
        onClick={() => revealTimer()}
        onMouseMove={() => revealTimer()}
      ></div>
    </>,
    body
  );
}

function Timer() {
  const running = useAtomValue(snoozeRunning);
  const [remain, setRemain] = useAtom(snoozeRemain);

  useEffect(() => {
    if (!running) return;

    if (remain <= 0) {
      commands$.stop();
      return;
    }

    const timerId = setTimeout(() => {
      setRemain((remain) => remain - 1);
    }, 1000);

    return () => {
      clearTimeout(timerId);
    };
  }, [remain, running, setRemain]);

  return (
    <div className="snooze-timer">
      <span>{formatTime(remain)}</span>
    </div>
  );
}
