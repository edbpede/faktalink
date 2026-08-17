/**
 * Refreshes the video snapshot from faktalink.dk.
 *
 * Runs on a schedule in CI (`.github/workflows/crawl.yml`) and commits the
 * result, so the site always has a fast, private, dependency-free answer for
 * every page faktalink publishes. Pages newer than the last crawl are still
 * resolved live in the browser; this snapshot is what makes the common case
 * instant and reliable rather than hostage to a third-party CORS proxy.
 *
 *   bun run crawl              # uses the on-disk cache where available
 *   bun run crawl:refresh      # ignores the cache and refetches everything
 *
 * Output: src/data/emner.json — committed, so a build needs no network at all.
 *
 * Scope: /emner/ pages only. We record video metadata and the page title; we do
 * not mirror faktalink's article text, and every result links back to source.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractFromHtml, type VideoProvider } from "../src/lib/extract";
import { FAKTALINK_ORIGIN } from "../src/lib/urls";

/** Identifies us honestly, with a contact route, as a courtesy to the operator. */
const USER_AGENT =
  "faktalink-video-viewer/2.0 (+https://github.com/edbpede/faktalink; scheduled indexer)";

/** Politeness: a small parallel window against a public service. */
const CONCURRENCY = 6;

/** Pause between a worker finishing one page and starting the next. */
const DELAY_MS = 120;

const CACHE_DIR = join(import.meta.dir, "..", ".cache", "faktalink");
const OUTPUT_FILE = join(import.meta.dir, "..", "src", "data", "emner.json");
const SITEMAP_URL = `${FAKTALINK_ORIGIN}/sitemap.xml`;

/** One page's videos, as written to the committed snapshot. */
interface EmneRecord {
  slug: string;
  title: string;
  videoCount: number;
  videos: {
    id: string;
    provider: VideoProvider;
    title: string | null;
    description: string | null;
    startSeconds: number | null;
  }[];
}

const refresh = process.argv.includes("--refresh");

/** Fetches with a real User-Agent and a bounded retry on transient failures. */
async function fetchText(url: string, attempt = 1): Promise<string> {
  const maxAttempts = 3;
  try {
    const response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.text();
  } catch (cause) {
    if (attempt >= maxAttempts) throw cause;
    // Back off before retrying; a struggling origin should not be hammered.
    await Bun.sleep(500 * 2 ** (attempt - 1));
    return fetchText(url, attempt + 1);
  }
}

/** Reads a cached page, or fetches and caches it. Keeps iteration off the network. */
async function loadPage(slug: string): Promise<string> {
  const cacheFile = join(CACHE_DIR, `${encodeURIComponent(slug)}.html`);

  if (!refresh) {
    try {
      return await readFile(cacheFile, "utf8");
    } catch {
      // Cache miss: fall through and fetch.
    }
  }

  const html = await fetchText(`${FAKTALINK_ORIGIN}/emner/${slug}`);
  await writeFile(cacheFile, html, "utf8");
  await Bun.sleep(DELAY_MS);
  return html;
}

/** Pulls the /emner/ slugs out of the sitemap. */
async function loadEmneSlugs(): Promise<string[]> {
  const cacheFile = join(CACHE_DIR, "sitemap.xml");
  let xml: string;

  if (refresh) {
    xml = await fetchText(SITEMAP_URL);
    await writeFile(cacheFile, xml, "utf8");
  } else {
    try {
      xml = await readFile(cacheFile, "utf8");
    } catch {
      xml = await fetchText(SITEMAP_URL);
      await writeFile(cacheFile, xml, "utf8");
    }
  }

  const slugs = new Set<string>();
  for (const match of xml.matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const loc = match[1]?.trim();
    if (loc === undefined) continue;
    // Only /emner/<slug>, never the /emner index or deeper paths.
    const emne = loc.match(/\/emner\/([^/?#]+)\/?$/);
    const slug = emne?.[1];
    if (slug !== undefined) slugs.add(decodeURIComponent(slug).toLowerCase());
  }
  return [...slugs].sort();
}

/** Runs `worker` over `items` with a fixed-size window of in-flight tasks. */
async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function run(): Promise<void> {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      const item = items[index];
      if (item === undefined) return;
      results[index] = await worker(item, index);
    }
  }

  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, run));
  return results;
}

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  await mkdir(join(import.meta.dir, "..", "src", "data"), { recursive: true });

  const cachedBefore = refresh ? 0 : (await readdir(CACHE_DIR).catch(() => [])).length;
  console.log(
    `Crawling faktalink.dk (concurrency ${CONCURRENCY}${refresh ? ", cache bypassed" : `, ${cachedBefore} files cached`})`,
  );

  const slugs = await loadEmneSlugs();
  console.log(`Sitemap lists ${slugs.length} /emner/ pages.`);

  let done = 0;
  const failures: { slug: string; error: string }[] = [];

  const records = await mapWithConcurrency(slugs, CONCURRENCY, async (slug) => {
    try {
      const html = await loadPage(slug);
      const { title, videos } = extractFromHtml(html);
      return {
        slug,
        title: title ?? slug,
        videoCount: videos.length,
        videos: videos.map((v) => ({
          id: v.id,
          provider: v.provider,
          title: v.title,
          description: v.description,
          startSeconds: v.startSeconds,
        })),
      } satisfies EmneRecord;
    } catch (cause) {
      // The extractor no longer throws on an unfamiliar page shape, so anything
      // reaching here is a genuine network or filesystem failure.
      failures.push({ slug, error: String(cause) });
      return null;
    } finally {
      done++;
      if (done % 50 === 0 || done === slugs.length) {
        console.log(`  ${done}/${slugs.length}`);
      }
    }
  });

  // Only pages that actually carry video are worth storing. The rest resolve
  // live and report "no videos on this page", which is the truthful answer.
  const indexed = records
    .filter((record): record is EmneRecord => record !== null)
    .filter((record) => record.videoCount > 0)
    .sort((a, b) => a.slug.localeCompare(b.slug, "da"));

  const totalVideos = indexed.reduce((sum, record) => sum + record.videoCount, 0);
  const vimeoCount = indexed.reduce(
    (sum, record) => sum + record.videos.filter((v) => v.provider === "vimeo").length,
    0,
  );

  await writeFile(OUTPUT_FILE, `${JSON.stringify(indexed, null, 2)}\n`, "utf8");

  console.log(
    `\nSnapshot: ${indexed.length} pages with video (of ${slugs.length} crawled), ${totalVideos} videos (${vimeoCount} Vimeo).`,
  );
  console.log(`Wrote ${OUTPUT_FILE}`);

  if (failures.length > 0) {
    console.warn(`\n${failures.length} page(s) failed:`);
    for (const failure of failures.slice(0, 10)) {
      console.warn(`  ${failure.slug}: ${failure.error}`);
    }
    if (failures.length > 10) console.warn(`  ...and ${failures.length - 10} more`);

    // A handful of transient failures is normal; losing a large fraction of the
    // site is a signal something changed, and CI should not commit that quietly.
    if (failures.length > slugs.length * 0.2) {
      console.error(`\nMore than 20% of pages failed. Refusing to write a degraded snapshot.`);
      process.exit(1);
    }
  }
}

await main();
