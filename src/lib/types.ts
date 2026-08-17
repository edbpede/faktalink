/**
 * Types crossing the server→island boundary.
 *
 * Island props must be JSON-serializable, so these are deliberately plain data:
 * no methods, no Date, no functions. Kept in a .ts module rather than exported
 * from a .svelte file so both Astro pages and Svelte components can import them.
 */

/** A video as handed to the VideoList island. */
export interface VideoProps {
  id: string;
  title: string | null;
  description: string | null;
  startSeconds: number | null;
}

/** One row of the browse index. */
export interface EmneEntry {
  slug: string;
  title: string;
  videoCount: number;
}

/** The labels VideoList needs, resolved in the page's locale. */
export interface VideoLabels {
  play: string;
  playLabel: string;
  fallback: string;
  fallbackHint: string;
  idLabel: string;
  startsAt: string;
  untitled: string;
}
