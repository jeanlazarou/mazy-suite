import _ from "lodash";
import queryString from "query-string";

export function params(key, defaultValue = undefined) {
  const hash = queryString.parse(document.location.search);

  const value = hash[key];

  return value === undefined ? defaultValue : value;
}

export function isConfig() {
  const hash = queryString.parse(document.location.search);

  return _.has(hash, "config");
}
