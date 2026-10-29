import _ from "lodash";

import { DATA } from "./api";

// The cache is keyed by track urls as written in the album files, while the
// player looks tracks up by their encoded url (see convertList in api.js):
// re-key it the same way, or every url with a space misses the cache.
export async function loadAlbumsCache() {
  const response = await fetch(`${DATA}/albums_cache.json`);
  const cache = await response.json();

  return _.mapKeys(cache, (entry, url) => encodeURI(url));
}
