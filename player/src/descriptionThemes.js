export const DEFAULT_THEME = "default";

// Themes are implemented in DescriptionThemes.css and documented in README.md
export const DESCRIPTION_THEMES = [
  DEFAULT_THEME,
  "sleeve",
  "liner",
  "neon",
  "minimal",
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

// The default theme keeps the plain markup, so the app's dark mode styles it
export function themeClassNames(name) {
  const theme = normalizeTheme(name);

  if (theme === DEFAULT_THEME) return "";

  return `description-themed description-theme-${theme}`;
}
