import { getCollection } from "astro:content";
import type { EmneEntry, VideoProps } from "./types";

/**
 * Shared queries over the emne collection.
 *
 * Both locales' routes read through here, so sorting and shaping happen once
 * and the Danish and English pages cannot drift apart.
 */

export interface EmneRecord extends EmneEntry {
  videos: VideoProps[];
}

/** All indexed emner, sorted by title using Danish collation (æ, ø, å last). */
export async function getEmner(): Promise<EmneRecord[]> {
  const collection = await getCollection("emner");
  return collection
    .map((entry) => ({
      slug: entry.data.slug,
      title: entry.data.title,
      videoCount: entry.data.videoCount,
      videos: entry.data.videos,
    }))
    .sort((a, b) => a.title.localeCompare(b.title, "da"));
}

/** The lightweight rows the browse list and the JSON index need. */
export function toIndexEntries(records: readonly EmneRecord[]): EmneEntry[] {
  return records.map(({ slug, title, videoCount }) => ({ slug, title, videoCount }));
}

/** Total videos across the index. */
export function totalVideos(records: readonly EmneRecord[]): number {
  return records.reduce((sum, record) => sum + record.videoCount, 0);
}
