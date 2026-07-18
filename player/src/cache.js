import { DATA } from "./api";

export async function loadAlbumsCache() {
  const response = await fetch(`${DATA}/albums_cache.json`);
  return await response.json();
}