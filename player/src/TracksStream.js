import { ThrottleEmitter } from "./emitter";

export const RATE = "rate";
export const SELECT = "select";
export const TOGGLE = "toggle";

class TracksStream {
  constructor() {
    this.stream = new ThrottleEmitter(500);
  }

  rate = (track, rating) => {
    this.stream.next({ action: RATE, track, data: { rating } });
  };

  select = (track) => {
    this.stream.next({ action: SELECT, track });
  };

  toggle = (track) => {
    this.stream.next({ action: TOGGLE, track });
  };
}

export const tracks$ = new TracksStream();
