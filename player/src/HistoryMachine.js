import { atom } from "jotai";
import { currentPlaylist } from "./atoms";

class HistoryMachine {
  past = [];
  future = [];

  hasPast = () => this.past.length > 0;
  hasFuture = () => this.future.length > 0;

  push = (state) => {
    this.future = [];
    this.past.push(state);
  };

  undo = (currentState) => {
    this.future.push(currentState);

    return this.past.pop();
  };

  redo = (currentState) => {
    this.past.push(currentState);

    return this.future.pop();
  };
}

const history = new HistoryMachine();

export const historyState = atom({
  key: "historyState",
  default: {
    hasFuture: false,
    hasPast: false,
  },
});

export const historyPush = atom(null, (get, set, pastList) => {
  history.push(pastList);

  set(historyState, {
    hasFuture: history.hasFuture(),
    hasPast: history.hasPast(),
  });
});

export const historyUndo = atom(null, (get, set) => {
  const current = get(currentPlaylist);
  const list = history.undo(current);

  set(currentPlaylist, list);

  set(historyState, {
    hasFuture: history.hasFuture(),
    hasPast: history.hasPast(),
  });
});

export const historyRedo = atom(null, (get, set) => {
  const current = get(currentPlaylist);
  const list = history.redo(current);

  set(currentPlaylist, list);

  set(historyState, {
    hasFuture: history.hasFuture(),
    hasPast: history.hasPast(),
  });
});
