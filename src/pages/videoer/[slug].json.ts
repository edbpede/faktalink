import { getCollection } from "astro:content";
import type { APIRoute, GetStaticPaths } from "astro";

/**
 * One small JSON file per page in the snapshot, at `/videoer/<slug>.json`.
 *
 * The browser fetches exactly the page it was asked about — a couple of
 * kilobytes — rather than a single index of every page, which would be a
 * ~280 KB download to answer one question. A 404 here is meaningful rather than
 * exceptional: it is how the client learns a page is not in the snapshot and
 * moves on to the live lookup.
 */

export const getStaticPaths: GetStaticPaths = async () => {
  const emner = await getCollection("emner");
  return emner.map((entry) => ({ params: { slug: entry.data.slug } }));
};

export const GET: APIRoute = async ({ params }) => {
  const emner = await getCollection("emner");
  const entry = emner.find((candidate) => candidate.data.slug === params.slug);

  if (entry === undefined) {
    return new Response(JSON.stringify({ error: "not-found" }), {
      status: 404,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  }

  return new Response(
    JSON.stringify({
      slug: entry.data.slug,
      title: entry.data.title,
      videos: entry.data.videos,
    }),
    {
      headers: {
        "content-type": "application/json; charset=utf-8",
        // Refreshed twice daily and republished on change, so a short cache
        // keeps repeat lookups instant without pinning a stale answer for long.
        "cache-control": "public, max-age=1800",
      },
    },
  );
};
