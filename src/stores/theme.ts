import { persistentAtom } from "@nanostores/persistent";

/** The two themes. Light is the default; dark is available via the toggle. */
export type Theme = "light" | "dark";

/**
 * The chosen theme, surviving full page loads.
 *
 * Stored as a bare string so the pre-paint script in Layout.astro can read the
 * same value with a single `localStorage.getItem` before any JS bundle loads.
 * Changing the key or the encoding here means changing it there too.
 */
export const THEME_STORAGE_KEY = "faktalink-theme";

export const $theme = persistentAtom<Theme>(THEME_STORAGE_KEY, "light", {
  encode: (value) => value,
  decode: (value) => (value === "dark" ? "dark" : "light"),
});

/** Applies the theme to the document. The `.dark` class is the shadcn convention. */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  root.classList.toggle("dark", theme === "dark");
  // Keeps form controls and scrollbars in step with the palette.
  root.style.colorScheme = theme;
}

export function toggleTheme(): void {
  $theme.set($theme.get() === "dark" ? "light" : "dark");
}
