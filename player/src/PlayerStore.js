class PlayerStore {
  current = {};
  order = [];

  save = ({ title, playlist }) => {
    playlist.forEach((track) => this._saveTrack(track));

    this._saveOrder(title, playlist);
  };

  restore = ({ title, playlist: list }) => {
    const updated = list.reduce((acc, track) => {
      const x = this._getItem(this.trackKey(track), {});

      acc[track.url] = { ...track, ...x };

      return acc;
    }, {});

    this.order = this._getItem(this.orderKey(title), []);

    const playlist = this.order.reduce((acc, url) => {
      const track = updated[url];

      if (track) acc.push(updated[url]);

      return acc;
    }, []);

    if (playlist.length === list.length) return { playlist, unknown: false };

    return { playlist: list, unknown: true };
  };

  orderKey = (title) => `playlist.order.${title}`;
  trackKey = ({ url }) => `playlist.track.${url}`;

  _saveOrder = (title, playlist) => {
    if (playlist.every((track, i) => track.url === this.order[i])) return;

    this.order = playlist.map((track) => track.url);

    this._setItem(this.orderKey(title), this.order);
  };

  _saveTrack = (track) => {
    if (this._equal(this.current[track.url], track)) return;

    this.current[track.url] = { enabled: track.enabled, rating: track.rating };

    this._setItem(this.trackKey(track), this.current[track.url]);
  };

  _equal = (t1, t2) => {
    if (!t1) return false;

    return t1.enabled === t2.enabled && t1.rating === t2.rating;
  };

  _getItem = (key, defaultValue) => {
    const value = localStorage.getItem(key);

    return value ? JSON.parse(value) : defaultValue;
  };

  _setItem = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
  };
}

export { PlayerStore };
