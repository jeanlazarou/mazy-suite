export class LocalStorage {
  constructor(key) {
    this.key = key;
  }

  save = (param, value) => {
    const current = this.restore();

    current[param] = value;

    localStorage.setItem(this.key, JSON.stringify(current));
  };

  restore = () => {
    const values = localStorage.getItem(this.key);

    return values ? JSON.parse(values) : {};
  };
}
