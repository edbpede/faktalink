/**
 * Types crossing the server→island boundary.
 *
 * Island props must be JSON-serializable, so these are deliberately plain data:
 * no methods, no Date, no functions. Kept in a .ts module rather than exported
 * from a .svelte file so both Astro pages and Svelte components can import them.
 */

import type { VideoProvider } from "./extract";

export type { VideoProvider };

/** A video as handed to the result list and the player. */
export interface VideoProps {
  id: string;
  provider: VideoProvider;
  title: string | null;
  description: string | null;
  startSeconds: number | null;
}

/** One page's worth of videos, as served by the snapshot and the live lookup. */
export interface EmneResult {
  slug: string;
  title: string;
  videos: VideoProps[];
}

/** Where a result came from, so the UI can be honest about freshness. */
export type ResultSource = "snapshot" | "live";
