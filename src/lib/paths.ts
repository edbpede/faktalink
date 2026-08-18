import { DEFAULT_LOCALE, type Locale } from "../i18n";

/**
 * Route builders.
 *
 * Astro's `base` is prepended here rather than at each call site, so the same
 * build works under a subpath (GitHub Pages project site) and at a domain root
 * (Netlify, or a folder opened from a USB stick).
 */

/** `import.meta.env.BASE_URL` is "/" when no base is configured. */
const BASE = import.meta.env.BASE_URL ?? "/";

/** Joins the configured base with a root-relative path, avoiding double slashes. */
function withBase(path: string): string {
  const base = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  const suffix = path.startsWith("/") ? path : `/${path}`;
  const joined = `${base}${suffix}`;
  return joined === "" ? "/" : joined;
}

/** Prefixes a path with the locale. Danish is unprefixed (prefixDefaultLocale: false). */
function withLocale(locale: Locale, path: string): string {
  const suffix = path === "/" ? "" : path;
  return locale === DEFAULT_LOCALE ? withBase(suffix || "/") : withBase(`/${locale}${suffix}`);
}

export function homePath(locale: Locale): string {
  return withLocale(locale, "/");
}

/** The site base, handed to the lookup island so it can resolve the snapshot. */
export function basePath(): string {
  return withBase("/");
}

/**
 * Maps the current path to its counterpart in the other locale, so the language
 * switcher keeps the reader on the same page instead of dumping them home.
 */
export function alternatePath(currentPath: string, target: Locale): string {
  const base = BASE.endsWith("/") ? BASE.slice(0, -1) : BASE;
  let path = currentPath;
  if (base !== "" && path.startsWith(base)) path = path.slice(base.length);
  if (path.startsWith("/en/")) path = path.slice(3);
  else if (path === "/en") path = "/";
  if (path === "") path = "/";
  return withLocale(target, path);
}
