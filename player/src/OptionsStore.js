import { options$ } from "./OptionsStream";
import * as config from "./Config";

export const loopOptions = [
  { label: "no", value: config.NO_LOOP },
  { label: "all", value: config.LOOP_PLAYLIST },
  { label: "one", value: config.LOOP_TRACK },
];

export function initialLoopMode() {
  const mode = OptionsStore.restore().loopMode;

  const index = loopOptions.findIndex((option) => option.value === mode);

  options$.playbackMode(mode);

  return index < 0 ? 0 : index;
}

class OptionsStore {
  static key = "player-options";

  static save(values) {
    const options = OptionsStore.restore();

    if (values.cardFormat) options.cardFormat = values.cardFormat;
    if (values.loopMode && values.loopMode !== config.EDITOR)
      options.loopMode = values.loopMode;
    if (values.lyricsActive !== undefined)
      options.lyricsActive = values.lyricsActive;
    if (values.snoozeDuration !== undefined)
      options.snoozeDuration = values.snoozeDuration;
    if (values.darkMode !== undefined) options.darkMode = values.darkMode;

    localStorage.setItem(OptionsStore.key, JSON.stringify(options));
  }

  static restore() {
    const defaultValues = {
      loopMode: "no-loop",
      cardFormat: "normal",
      lyricsActive: false,
      snoozeDuration: 300,
      darkMode: true,
    };

    const values = localStorage.getItem(OptionsStore.key);

    const options = values ? JSON.parse(values) : {};

    return { ...defaultValues, ...options };
  }
}

export { OptionsStore };
