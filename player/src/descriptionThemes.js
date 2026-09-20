export const DEFAULT_THEME = "default";

// Themes are implemented in DescriptionThemes.css and documented in README.md
export const DESCRIPTION_THEMES = [
  DEFAULT_THEME,
  "sleeve",
  "liner",
  "neon",
  "minimal",
  // these show the origin block ($KIND / $FROM / $NOTE); the four above
  // predate it and leave it out
  "dossier",
  "lineage",
  "prism",
  "orbit",
];

// `$THEME:name` on a line of its own, returns the raw name or null
export function themeMarker(line) {
  const match = line.match(/^\s*\$THEME:\s*(.*?)\s*$/);

  return match ? match[1] : null;
}

export function normalizeTheme(name) {
  if (!name) return DEFAULT_THEME;

  const theme = name.trim().toLowerCase();

  if (DESCRIPTION_THEMES.includes(theme)) return theme;

  console.warn(
    `Unknown description theme "${name}", using "${DEFAULT_THEME}" instead`
  );

  return DEFAULT_THEME;
}

// The default is marked `description-plain` rather than `description-themed`:
// it gets its own (light) styling, while the app's dark mode and the per-album
// `<style>` blocks stay in charge of it, both of which key off the absence of
// `description-themed`.
export function themeClassNames(name) {
  const theme = normalizeTheme(name);

  if (theme === DEFAULT_THEME) return "description-plain";

  return `description-themed description-theme-${theme}`;
}
