import type { APIRoute } from "astro";
import { getEmner, toIndexEntries } from "../lib/collection";

/**
 * The static JSON index: `{ slug, title, videoCount }` per emne.
 *
 * Emitted as a file at build time (the site is `output: "static"`), so this is
 * a plain asset, not a server route. The home-page resolver fetches it on first
 * submit to tell "not in the index" apart from "typo", without the whole index
 * having to be inlined into every page.
 */
export const GET: APIRoute = async () => {
  const entries = toIndexEntries(await getEmner());
  return new Response(JSON.stringify(entries), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
};
