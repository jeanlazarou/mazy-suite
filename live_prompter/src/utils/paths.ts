// Relative so the app also runs one level deep, as on the portal site, where
// the shared data sits next to the app's folder. Served at the domain root,
// `../data` still resolves to `/data`: a browser clamps `..` at the origin.
export const DATA = '../data';
