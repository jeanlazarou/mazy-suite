export const DEFAULT_THEME = "default";

// Themes that share one layout and differ only in their palette, so that an
// album can be matched to its cover without changing how it reads. The family
// name becomes a second class on the panel and the layout is written once;
// each member only declares `--desc-*` values.
export const THEME_FAMILIES = {
  gallery: [
    "dusk",
    "ember",
    "garnet",
    "ochre",
    "moss",
    "plum",
    "ivory",
    "slate",
  ],
};

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
  ...Object.values(THEME_FAMILIES).flat(),
];

export function familyOf(theme) {
  const found = Object.entries(THEME_FAMILIES).find(([, members]) =>
    members.includes(theme)
  );

  return found ? found[0] : null;
}

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

  const family = familyOf(theme);

  return [
    "description-themed",
    family ? `description-family-${family}` : null,
    `description-theme-${theme}`,
  ]
    .filter(Boolean)
    .join(" ");
}
