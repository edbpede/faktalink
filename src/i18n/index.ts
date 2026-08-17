import { da, type MessageKey, type Messages } from "./da";
import { en } from "./en";

/** The two locales this site ships. Danish is the source language. */
export const LOCALES = ["da", "en"] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "da";

/** BCP 47 tags for `<html lang>` and `hreflang`. */
export const HTML_LANG: Record<Locale, string> = { da: "da-DK", en: "en" };

const CATALOGUES: Record<Locale, Messages> = { da, en };

export type { MessageKey, Messages };

/** Narrows an arbitrary string to a supported locale. */
export function isLocale(value: string | undefined): value is Locale {
  return value !== undefined && (LOCALES as readonly string[]).includes(value);
}

/**
 * Returns a lookup function for a locale.
 *
 * Keys are typed, so a typo is a compile error rather than a blank on the page.
 */
export function useTranslations(locale: Locale) {
  const catalogue = CATALOGUES[locale];
  return function t(key: MessageKey): string {
    return catalogue[key];
  };
}

/** Reads the locale from a URL pathname. Danish is unprefixed. */
export function localeFromPath(pathname: string): Locale {
  const segments = pathname.split("/").filter((segment) => segment !== "");
  // With a configured base, the locale is not always the first segment.
  return segments.includes("en") && segments.indexOf("en") <= 1 ? "en" : "da";
}
