import { defineCollection } from "astro:content";
// `z` re-exported from astro:content is deprecated in Astro 7; astro:schema is
// the current source for the bundled Zod.
import { z } from "astro:schema";
import { file } from "astro/loaders";

/**
 * The video snapshot, loaded through the Content Layer API.
 *
 * `file()` is the right loader here: one JSON file holds many entries, produced
 * by the scheduled crawl. The schema validates that output at build time, so a
 * malformed snapshot fails the build instead of shipping a half-empty site.
 */
const emner = defineCollection({
  loader: file("src/data/emner.json", {
    // Entries are keyed by slug, which is also the route parameter.
    parser: (text) => {
      const parsed = JSON.parse(text) as { slug: string }[];
      return Object.fromEntries(parsed.map((entry) => [entry.slug, entry]));
    },
  }),
  schema: z.object({
    slug: z.string(),
    title: z.string(),
    videoCount: z.number().int().nonnegative(),
    videos: z.array(
      z.object({
        // YouTube IDs are 11 URL-safe base64 characters; Vimeo IDs are numeric.
        id: z.string().regex(/^[A-Za-z0-9_-]{11}$|^\d{6,12}$/),
        provider: z.enum(["youtube", "vimeo"]),
        title: z.string().nullable(),
        description: z.string().nullable(),
        startSeconds: z.number().int().positive().nullable(),
      }),
    ),
  }),
});

export const collections = { emner };
