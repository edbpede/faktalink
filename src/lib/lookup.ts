/**
 * Resolves a pasted faktalink address to a list of playable videos.
 *
 * Two sources, tried in order:
 *
 *   1. Snapshot — a small per-page JSON file, refreshed twice daily by
 *      `.github/workflows/crawl.yml` and served from our own origin. No third
 *      party, no CORS, typically a single fast request.
 *   2. Live — for a page published since the last crawl, the page is fetched
 *      through a public CORS proxy and parsed in the browser with the same
 *      extractor the crawl uses.
 *
 * The order matters. faktalink.dk sends no `Access-Control-Allow-Origin`, so a
 * live lookup can only go through a proxy, and measured proxy reliability is
 * poor: three consecutive requests to different providers returned 429, 522 and
 * 403. Leading with the snapshot means the overwhelmingly common case never
 * touches a third party at all, and the proxies only ever serve as a
 * best-effort tail for genuinely new pages.
 */

import type { EmneResult, ResultSource, VideoProps } from "./types";
import { FAKTALINK_ORIGIN } from "./urls";

/** Why a lookup produced nothing. Each maps to a specific message in the UI. */
export type LookupFailure =
  | "empty"
  | "not-a-url"
  | "wrong-host"
  | "not-an-emne"
  | "missing-slug"
  | "no-videos"
  | "not-found"
  | "unreachable";

export type LookupResult =
  | { readonly ok: true; readonly source: ResultSource; readonly emne: EmneResult }
  | { readonly ok: false; readonly reason: LookupFailure; readonly slug?: string };

/** Hosts we accept a pasted URL from. */
const FAKTALINK_HOSTS = new Set(["faktalink.dk", "www.faktalink.dk"]);

/**
 * A bare slug: lowercase letters (including the Danish æ/ø/å), digits and
 * hyphens. Real slugs look like `1970-erne` and `rusland-op-til-1991`.
 */
const BARE_SLUG_PATTERN = /^[a-z0-9æøå]+(?:-[a-z0-9æøå]+)*$/i;

export type ResolveFailure = Extract<
  LookupFailure,
  "empty" | "not-a-url" | "wrong-host" | "not-an-emne" | "missing-slug"
>;

export type ResolveResult =
  | { readonly ok: true; readonly slug: string }
  | { readonly ok: false; readonly reason: ResolveFailure };

/**
 * Turns whatever the reader pasted into an emne slug.
 *
 * Accepts a full faktalink URL, a bare path, or a bare slug, and reports which
 * expectation failed so the UI can say something specific instead of "invalid
 * input". Pure: no network, no DOM.
 */
export function resolveEmneInput(raw: string): ResolveResult {
  const trimmed = raw.trim();
  if (trimmed === "") return { ok: false, reason: "empty" };

  const looksLikeUrl = /^https?:\/\//i.test(trimmed) || trimmed.includes("/");

  if (!looksLikeUrl) {
    if (!BARE_SLUG_PATTERN.test(trimmed)) return { ok: false, reason: "not-a-url" };
    return { ok: true, slug: trimmed.toLowerCase() };
  }

  const hasScheme = /^https?:\/\//i.test(trimmed);

  // A path-only input ("/emner/1970-erne") is resolved against faktalink itself.
  // Prefixing it with a scheme instead would promote "emner" to the hostname.
  const isBarePath = !hasScheme && trimmed.startsWith("/");

  let url: URL;
  try {
    url = isBarePath
      ? new URL(trimmed, FAKTALINK_ORIGIN)
      : new URL(hasScheme ? trimmed : `https://${trimmed}`);
  } catch {
    return { ok: false, reason: "not-a-url" };
  }

  if (!FAKTALINK_HOSTS.has(url.hostname.toLowerCase())) {
    return { ok: false, reason: "wrong-host" };
  }

  const segments = url.pathname.split("/").filter((segment) => segment !== "");
  const emnerIndex = segments.indexOf("emner");
  if (emnerIndex === -1) return { ok: false, reason: "not-an-emne" };

  const slug = segments[emnerIndex + 1];
  if (slug === undefined || slug === "") return { ok: false, reason: "missing-slug" };

  try {
    return { ok: true, slug: decodeURIComponent(slug).toLowerCase() };
  } catch {
    return { ok: true, slug: slug.toLowerCase() };
  }
}

/**
 * CORS proxies for the live tail, tried in order.
 *
 * Every one of these is a third party we do not control, which is exactly why
 * they are never the first choice. Measured behaviour at the time of writing:
 * cors.sh served the page, cors.lol rate-limited after a single request, and
 * allorigins returned 522 intermittently. Listing several means one provider
 * having a bad day does not take the fallback down with it.
 */
const CORS_PROXIES: readonly ((url: string) => string)[] = [
  (url) => `https://proxy.cors.sh/${url}`,
  (url) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
  (url) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(url)}`,
];

/** A live lookup is a fallback, not the main path; it may not hang the UI. */
const LIVE_TIMEOUT_MS = 12_000;

/** Where the per-page snapshot files are served from. */
function snapshotUrl(baseUrl: string, slug: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl.slice(0, -1) : baseUrl;
  return `${base}/videoer/${encodeURIComponent(slug)}.json`;
}

/** Reads one page out of the committed snapshot. */
async function fetchSnapshot(baseUrl: string, slug: string): Promise<EmneResult | null> {
  try {
    const response = await fetch(snapshotUrl(baseUrl, slug), {
      signal: AbortSignal.timeout(8000),
    });
    // A 404 is the normal "not in this snapshot" answer, not an error.
    if (!response.ok) return null;
    return (await response.json()) as EmneResult;
  } catch {
    return null;
  }
}

/**
 * Fetches and parses the live page through whichever proxy answers first.
 *
 * Returns null when every provider fails, which the caller reports honestly
 * rather than dressing up as "no videos".
 */
async function fetchLive(slug: string): Promise<EmneResult | null> {
  const target = `${FAKTALINK_ORIGIN}/emner/${encodeURIComponent(slug)}`;

  // The parser is only needed on this path, which fires for pages published
  // since the last crawl. Importing it dynamically keeps it out of the bundle
  // every reader downloads for the common case.
  const { extractFromHtml } = await import("./extract");

  for (const buildProxyUrl of CORS_PROXIES) {
    try {
      const response = await fetch(buildProxyUrl(target), {
        signal: AbortSignal.timeout(LIVE_TIMEOUT_MS),
      });
      if (!response.ok) continue;

      const html = await response.text();
      // A proxy that returns an error page rather than the target is useless
      // here; requiring a plausible faktalink document filters that out.
      if (html.length < 1000) continue;

      const extracted = extractFromHtml(html);
      // The page exists but the proxy may have served a soft 404; a page with
      // neither a title nor a video is not evidence of anything.
      if (extracted.title === null && extracted.videos.length === 0) continue;

      return {
        slug,
        title: extracted.title ?? slug,
        videos: extracted.videos.map(
          (video): VideoProps => ({
            id: video.id,
            provider: video.provider,
            title: video.title,
            description: video.description,
            startSeconds: video.startSeconds,
          }),
        ),
      };
    } catch {
      // Timeout, network error, blocked host: try the next provider.
    }
  }

  return null;
}

/**
 * Looks up one pasted address end to end.
 *
 * @param raw   whatever the reader typed or pasted
 * @param base  the site's base URL, so the snapshot resolves under a subpath
 */
export async function lookupEmne(raw: string, base = "/"): Promise<LookupResult> {
  const resolved = resolveEmneInput(raw);
  if (!resolved.ok) return { ok: false, reason: resolved.reason };

  const { slug } = resolved;

  const snapshot = await fetchSnapshot(base, slug);
  if (snapshot !== null) {
    return snapshot.videos.length > 0
      ? { ok: true, source: "snapshot", emne: snapshot }
      : { ok: false, reason: "no-videos", slug };
  }

  // Not in the snapshot: either published since the last crawl, or it carries
  // no video and was never stored. Only the live page can tell those apart.
  const live = await fetchLive(slug);
  if (live === null) return { ok: false, reason: "unreachable", slug };

  return live.videos.length > 0
    ? { ok: true, source: "live", emne: live }
    : { ok: false, reason: "no-videos", slug };
}
