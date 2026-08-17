import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merges class names, resolving conflicts so a caller-supplied class wins over
 * a component default. This is the same `cn()` shadcn components import; it
 * still uses clsx + tailwind-merge under UnoCSS because presetWind4 generates
 * Tailwind-compatible class names.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Formats an integer for a locale, e.g. 1234 -> "1.234" in Danish. */
export function formatCount(value: number, locale: string): string {
  return new Intl.NumberFormat(locale === "da" ? "da-DK" : "en-GB").format(value);
}

/**
 * Formats a start offset as `m:ss`, matching how YouTube itself shows a
 * timestamp. Used on the few videos faktalink publishes with a `t=` parameter.
 */
export function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const paddedSecs = String(secs).padStart(2, "0");
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${paddedSecs}`;
  return `${minutes}:${paddedSecs}`;
}
