import { useState } from "react";
import { SIcon } from "./ui";

import "./MobileToolbar.css"

import { commands$ } from "./CommandsStream";

import { PlayerSubMenu, SetsButton } from "./Toolbar";
import { useAtomValue } from "jotai";
import { viewingDescription, viewingMobileTransport } from "./atoms";
import { Waveform } from "./Waveform";
import { Info } from "./Info";

export const mobileHeight = "calc(100% - 72px)"

export function MobileToolbar() {
  const [menuShown, setMenuShown] = useState(false);

  const transportShown = useAtomValue(viewingMobileTransport);
  const descriptionShown = useAtomValue(viewingDescription);

  const listShown = !transportShown && !descriptionShown

  return <>
    <nav className="tab-bar">
      <SIcon name="bars" size="big" onClick={() => {
        setMenuShown(true);
      }} />

      <Info />

      <SIcon name="th" size="big"
        color={listShown ? "teal" : undefined}
        onClick={() => {
          commands$.showPlaylist();
        }} />
      <SIcon name="play" size="big"
        color={transportShown ? "teal" : undefined}
        onClick={() => {
          commands$.showMobileTransport();
        }} />
      <SIcon name="info" size="big"
        color={descriptionShown ? "teal" : undefined}
        onClick={() => {
          commands$.showDescription();
        }} />

      <SetsButton />

      <PlayerSubMenu
        open={menuShown}
        onClose={() => setMenuShown(false)}
      />
    </nav>

    <div style={{ display: "none" }}><Waveform id="waveform" /></div>
  </>
}