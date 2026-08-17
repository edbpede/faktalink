/**
 * Build-time crawler: turns faktalink.dk's sitemap into the static video index.
 *
 * Astro frontmatter runs in Bun on our machine, where CORS does not exist —
 * which is the whole reason this runs at build time instead of in the browser.
 * faktalink.dk sends no `Access-Control-Allow-Origin` header, so a browser on
 * our domain cannot fetch it, and shipping a third-party CORS proxy would add
 * an uncontrolled dependency and leak user browsing to a stranger.
 *
 *   bun run crawl              # uses the on-disk cache where available
 *   bun run crawl:refresh      # ignores the cache and refetches everything
 *
 * Output: src/data/emner.json — the committed index the site builds from.
 * Builds therefore need no network at all.
 *
 * Scope: /emner/ pages only. We record video metadata and the page title; we do
 * not mirror faktalink's article text, and every emne page links back to source.
 */

import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { extractFromHtml, NextDataError } from "../src/lib/extract";
import { FAKTALINK_ORIGIN } from "../src/lib/urls";

/** Identifies us honestly, with a contact route, as a courtesy to the operator. */
const USER_AGENT =
  "faktalink-video-viewer/1.0 (+https://github.com/edbpede/faktalink; build-time indexer)";

/** Politeness: a small parallel window, well inside the brief's 4-8 range. */
const CONCURRENCY = 6;

/** Pause between a worker finishing one page and starting the next. */
const DELAY_MS = 120;

const CACHE_DIR = join(import.meta.dir, "..", ".cache", "faktalink");
const OUTPUT_FILE = join(import.meta.dir, "..", "src", "data", "emner.json");
const SITEMAP_URL = `${FAKTALINK_ORIGIN}/sitemap.xml`;

/** One indexed emne, as written to the committed JSON index. */
interface EmneRecord {
  slug: string;
  title: string;
  videoCount: number;
  videos: {
    id: string;
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
        videos: videos.map((video) => ({
          id: video.id,
          title: video.title,
          description: video.description,
          startSeconds: video.startSeconds,
        })),
      } satisfies EmneRecord;
    } catch (cause) {
      const message = cause instanceof NextDataError ? cause.message : String(cause);
      failures.push({ slug, error: message });
      return null;
    } finally {
      done++;
      if (done % 50 === 0 || done === slugs.length) {
        console.log(`  ${done}/${slugs.length}`);
      }
    }
  });

  // Only emner that actually carry video are worth a page; the rest would be a
  // route that renders an empty state nobody asked for. The counts still get
  // reported so a drop in coverage is visible between crawls.
  const indexed = records
    .filter((record): record is EmneRecord => record !== null)
    .filter((record) => record.videoCount > 0)
    .sort((a, b) => a.title.localeCompare(b.title, "da"));

  const totalVideos = indexed.reduce((sum, record) => sum + record.videoCount, 0);

  await writeFile(OUTPUT_FILE, `${JSON.stringify(indexed, null, 2)}\n`, "utf8");

  console.log(
    `\nIndexed ${indexed.length} emner with video (of ${slugs.length} crawled), ${totalVideos} videos total.`,
  );
  console.log(`Wrote ${OUTPUT_FILE}`);

  if (failures.length > 0) {
    console.warn(`\n${failures.length} page(s) failed:`);
    for (const failure of failures.slice(0, 10)) {
      console.warn(`  ${failure.slug}: ${failure.error}`);
    }
    if (failures.length > 10) console.warn(`  ...and ${failures.length - 10} more`);
  }
}

await main();
