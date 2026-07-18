import { useEffect, useRef } from "react";
import { JogDial as JogDialJS } from "./jog_dial";

import "./JogDial.css";

export function JogDial({ onChange }) {
  const jogDial = useRef(null);
  const jog = useRef();

  useEffect(() => {
    if (jogDial.current) return;

    var options = {
      wheelSize: "90%",
    };

    jogDial.current = new JogDialJS(jog.current, options).on(
      "mousemove",
      function (event) {
        if (onChange) onChange(event, event.target.rotation);
      }
    );
  }, [onChange]);

  return <div id="dial" ref={jog}></div>;
}
