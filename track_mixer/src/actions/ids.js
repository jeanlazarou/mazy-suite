// Shared id generator for tracks, envelope points and regions.
let seq = 1;
export const uid = (prefix) => `${prefix}${seq++}`;
