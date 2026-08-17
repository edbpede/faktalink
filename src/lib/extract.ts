/**
 * Turns a faktalink.dk page into a video list.
 *
 * Deliberately pattern-based rather than structure-based. faktalink.dk edits its
 * pages often and has already changed CMS shape once, so nothing here depends on
 * a CSS path, a component `__typename`, or a fixed JSON location. Two independent
 * passes run over every page and their results are merged:
 *
 *   1. JSON pass — parse any embedded JSON payload (`__NEXT_DATA__`, an App
 *      Router flight chunk, a plain `application/json` script) and walk the whole
 *      tree for strings that parse as a video URL, reading title and description
 *      from the object that carries the URL.
 *   2. Raw pass — regex the page text itself for provider URLs and iframe embeds.
 *
 * The raw pass is the safety net: it matches URLs inside JSON string literals as
 * readily as ones in markup, so even a total rewrite of faktalink's front end
 * still yields videos as long as the page references YouTube or Vimeo at all.
 * The JSON pass only exists to add the human metadata the raw pass cannot see.
 *
 * Pure: no network, no DOM globals, no side effects.
 */

/** Video hosts faktalink embeds. Vimeo is rare but real (3 pages at last count). */
export type VideoProvider = "youtube" | "vimeo";

/** A single, deduplicated video extracted from a faktalink page. */
export interface FaktalinkVideo {
  /** YouTube's 11-character ID, or Vimeo's numeric ID. Unique per provider. */
  readonly id: string;
  readonly provider: VideoProvider;
  /** Editor-supplied title, when the page provides one. */
  readonly title: string | null;
  /** Editor-supplied description, when the page provides one. */
  readonly description: string | null;
  /** The original URL as published, kept for attribution and debugging. */
  readonly sourceUrl: string;
  /** Start offset in seconds, parsed from a `t=`/`start=` parameter. */
  readonly startSeconds: number | null;
}

/** The full result of extracting one faktalink page. */
export interface ExtractionResult {
  /** The emne title, from the payload or the document head. */
  readonly title: string | null;
  /** The emne slug, from the payload or the canonical URL. */
  readonly slug: string | null;
  /** Videos in first-seen order, deduplicated by provider and ID. */
  readonly videos: readonly FaktalinkVideo[];
}

/** YouTube IDs are exactly 11 characters of URL-safe base64. */
const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Vimeo IDs are numeric, currently 6-11 digits. */
const VIMEO_ID_PATTERN = /^\d{6,12}$/;

/** Hosts whose first path segment is the video ID. */
const YOUTUBE_SHORT_HOSTS = new Set(["youtu.be"]);

/** Hosts using `/watch?v=`, `/embed/<id>`, `/shorts/<id>`, `/live/<id>`. */
const YOUTUBE_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
  // The embed host this site plays through, so a page that already links it round-trips.
  "yout-ube.com",
  "www.yout-ube.com",
]);

/** Path prefixes on the long hosts that are followed by a bare video ID. */
const YOUTUBE_ID_SEGMENTS = new Set(["embed", "shorts", "live", "v", "e"]);

const VIMEO_HOSTS = new Set(["vimeo.com", "www.vimeo.com", "player.vimeo.com"]);

/**
 * Every provider URL spelling, in one sweep over the page text.
 *
 * The scheme is optional because faktalink's CMS data contains hand-entered,
 * occasionally scheme-less URLs. The terminating class stops at whatever ends a
 * URL in either markup or a JSON string literal.
 */
const PROVIDER_URL_PATTERN =
  /(?:https?:\/\/|\/\/)?(?:[a-z0-9-]+\.)*(?:youtube-nocookie\.com|yout-ube\.com|youtube\.com|youtu\.be|vimeo\.com)\/[^\s"'<>\\)\]}]+/gi;

/** Keys that carry a human title on the object holding the URL. */
const TITLE_KEYS = [
  "optionalTitle",
  "videoTitle",
  "title",
  "heading",
  "name",
  "caption",
  "label",
] as const;

/** Keys that carry a human description on the object holding the URL. */
const DESCRIPTION_KEYS = ["description", "summary", "text", "body", "caption"] as const;

/** Keys that plausibly hold a video URL. Checked before the value is parsed. */
const URL_KEYS = ["url", "href", "src", "link", "video", "videoUrl", "embedUrl"] as const;

/**
 * Parses a YouTube start offset. YouTube accepts a bare second count (`t=90`)
 * and a compound duration (`t=1h2m10s`, `t=2s`). Anything else yields null.
 */
export function parseStartSeconds(raw: string | null): number | null {
  if (!raw) return null;
  const value = raw.trim().toLowerCase();
  if (value === "") return null;

  if (/^\d+$/.test(value)) {
    const seconds = Number.parseInt(value, 10);
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null;
  }

  const compound = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!compound) return null;
  const [, h, m, s] = compound;
  if (h === undefined && m === undefined && s === undefined) return null;

  const total =
    Number.parseInt(h ?? "0", 10) * 3600 +
    Number.parseInt(m ?? "0", 10) * 60 +
    Number.parseInt(s ?? "0", 10);
  return total > 0 ? total : null;
}

/** A video reference recovered from a URL, before metadata is attached. */
export interface VideoRef {
  readonly id: string;
  readonly provider: VideoProvider;
  readonly startSeconds: number | null;
  readonly sourceUrl: string;
}

/**
 * Parses any published URL spelling into a provider and ID.
 *
 * Returns null rather than throwing for anything unrecognised, so one stray
 * link never fails a whole page.
 */
export function parseVideoUrl(rawUrl: string | null | undefined): VideoRef | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (trimmed === "") return null;

  // Protocol-relative and scheme-less URLs both appear in hand-entered CMS data.
  const withScheme = /^https?:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/\//, "")}`;

  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }

  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter((segment) => segment !== "");

  // Hand-entered CMS data sometimes joins the offset with `&` on a URL that has
  // no query string at all (`youtu.be/ID&t=90`). The browser parses that as part
  // of the path, so the parameter is recovered here rather than losing the video.
  const strayQuery = segments.length > 0 ? (segments[segments.length - 1] ?? "") : "";
  const strayParams = strayQuery.includes("&")
    ? new URLSearchParams(strayQuery.slice(strayQuery.indexOf("&") + 1))
    : null;
  if (strayParams !== null && segments.length > 0) {
    segments[segments.length - 1] = strayQuery.slice(0, strayQuery.indexOf("&"));
  }

  const startSeconds = parseStartSeconds(
    url.searchParams.get("t") ??
      url.searchParams.get("start") ??
      strayParams?.get("t") ??
      strayParams?.get("start") ??
      null,
  );

  if (YOUTUBE_SHORT_HOSTS.has(host)) {
    const candidate = segments[0];
    if (candidate !== undefined && YOUTUBE_ID_PATTERN.test(candidate)) {
      return { id: candidate, provider: "youtube", startSeconds, sourceUrl: trimmed };
    }
    return null;
  }

  if (YOUTUBE_HOSTS.has(host)) {
    const vParam = url.searchParams.get("v");
    if (vParam !== null && YOUTUBE_ID_PATTERN.test(vParam)) {
      return { id: vParam, provider: "youtube", startSeconds, sourceUrl: trimmed };
    }

    const [first, second] = segments;
    if (
      first !== undefined &&
      YOUTUBE_ID_SEGMENTS.has(first) &&
      second !== undefined &&
      YOUTUBE_ID_PATTERN.test(second)
    ) {
      return { id: second, provider: "youtube", startSeconds, sourceUrl: trimmed };
    }
    return null;
  }

  if (VIMEO_HOSTS.has(host)) {
    // `/video/<id>` on the player host, a bare `/<id>` on the canonical host.
    const candidate = segments[0] === "video" ? segments[1] : segments[0];
    if (candidate !== undefined && VIMEO_ID_PATTERN.test(candidate)) {
      return { id: candidate, provider: "vimeo", startSeconds, sourceUrl: trimmed };
    }
    return null;
  }

  return null;
}

/** Narrows to a non-null object without widening to `any`. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** Trims a value to a non-empty string, or null. Faktalink uses null liberally. */
function cleanString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/**
 * Undoes the escaping that hides URLs from a plain text scan.
 *
 * JSON embedded in HTML writes `\/` and sometimes `\u002F`; attributes carry
 * `&amp;`. Applied to a scratch copy used only for matching, never to output.
 */
function unescapeForScanning(text: string): string {
  return text
    .replace(/\\u002[fF]/g, "/")
    .replace(/\\\//g, "/")
    .replace(/&#x2[fF];/g, "/")
    .replace(/&amp;/g, "&")
    .replace(/&#38;/g, "&");
}

/** The composite key a video is deduplicated on. */
function refKey(ref: { provider: VideoProvider; id: string }): string {
  return `${ref.provider}:${ref.id}`;
}

/**
 * Collects video URLs from raw page text, in document order.
 *
 * This is the pass that survives a CMS migration: it needs no JSON, no known
 * component name and no DOM, only that the page mentions the video somewhere.
 */
export function scanTextForVideos(text: string): VideoRef[] {
  const haystack = unescapeForScanning(text);
  const found: VideoRef[] = [];
  const seen = new Set<string>();

  for (const match of haystack.matchAll(PROVIDER_URL_PATTERN)) {
    // Trailing punctuation from prose or markup is not part of the URL.
    const candidate = match[0].replace(/[.,;:!?)\]}'"]+$/, "");
    const ref = parseVideoUrl(candidate);
    if (ref === null) continue;

    const key = refKey(ref);
    if (seen.has(key)) continue;
    seen.add(key);
    found.push(ref);
  }

  return found;
}

/** Reads the first non-empty string among `keys` on an object. */
function firstString(node: Record<string, unknown>, keys: readonly string[]): string | null {
  for (const key of keys) {
    const value = cleanString(node[key]);
    if (value !== null) return value;
  }
  return null;
}

/**
 * Walks a parsed JSON tree for objects that carry a video URL.
 *
 * Structural, not path-based: the same video appears under several branches and
 * the array indices differ per page, so fixed paths would silently miss videos.
 * Title and description are read only from the object that holds the URL, so a
 * surrounding page title can never be mistaken for a video title.
 */
export function collectVideosFromJson(root: unknown): FaktalinkVideo[] {
  const collected: FaktalinkVideo[] = [];
  const seen = new WeakSet<object>();
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!isRecord(node)) continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (Array.isArray(node)) {
      // Pushed in reverse so the shallowest element is popped first.
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }

    // Any string field on this object that parses as a video URL makes it a
    // video node — no component name required.
    let ref: VideoRef | null = null;
    for (const key of URL_KEYS) {
      ref = parseVideoUrl(cleanString(node[key]));
      if (ref !== null) break;
    }

    if (ref !== null) {
      collected.push({
        id: ref.id,
        provider: ref.provider,
        title: firstString(node, TITLE_KEYS),
        description: firstString(node, DESCRIPTION_KEYS),
        sourceUrl: ref.sourceUrl,
        startSeconds: ref.startSeconds,
      });
    }

    for (const value of Object.values(node)) {
      if (isRecord(value)) stack.push(value);
    }
  }

  return collected;
}

/**
 * Merges duplicates into one entry per video.
 *
 * Deduplicates by provider and ID, never by raw URL string: faktalink publishes
 * the same video as `youtu.be/ID`, `youtube.com/watch?v=ID` and occasionally
 * with a `&t=` offset, and duplicates every video across several branches of the
 * payload. First occurrence wins; later copies only fill fields left null.
 */
function mergeVideos(candidates: readonly FaktalinkVideo[]): FaktalinkVideo[] {
  const byKey = new Map<string, FaktalinkVideo>();

  for (const candidate of candidates) {
    const key = refKey(candidate);
    const existing = byKey.get(key);

    if (existing === undefined) {
      byKey.set(key, candidate);
      continue;
    }

    byKey.set(key, {
      ...existing,
      title: existing.title ?? candidate.title,
      description: existing.description ?? candidate.description,
      startSeconds: existing.startSeconds ?? candidate.startSeconds,
    });
  }

  return [...byKey.values()];
}

/** Strips faktalink's breadcrumb suffix from a document title. */
function cleanDocumentTitle(raw: string | null): string | null {
  if (raw === null) return null;
  const stripped = raw.replace(/\s*\|\s*(?:Emner\s*\|\s*)?Faktalink\s*$/i, "").trim();
  return stripped === "" ? null : stripped;
}

/** Pulls every embedded JSON payload out of the page, largest first. */
function findJsonPayloads(html: string): string[] {
  const payloads: string[] = [];
  const scriptPattern = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;

  for (const match of html.matchAll(scriptPattern)) {
    const attrs = match[1] ?? "";
    const body = match[2]?.trim();
    if (body === undefined || body === "") continue;

    const isJsonType = /type\s*=\s*["'](?:application\/json|application\/ld\+json)["']/i.test(
      attrs,
    );
    const isNextData = /id\s*=\s*["']__NEXT_DATA__["']/i.test(attrs);
    if (!isJsonType && !isNextData) continue;

    payloads.push(body);
  }

  return payloads;
}

/** Reads a meta tag's content attribute, tolerating either attribute order. */
function metaContent(html: string, property: string): string | null {
  const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(
      `<meta[^>]+(?:property|name)\\s*=\\s*["']${escaped}["'][^>]*\\bcontent\\s*=\\s*["']([^"']*)["']`,
      "i",
    ),
    new RegExp(
      `<meta[^>]+\\bcontent\\s*=\\s*["']([^"']*)["'][^>]*(?:property|name)\\s*=\\s*["']${escaped}["']`,
      "i",
    ),
  ];
  for (const pattern of patterns) {
    const value = cleanString(html.match(pattern)?.[1]);
    if (value !== null) return value;
  }
  return null;
}

/** Recovers the emne slug from a canonical or og:url link. */
function slugFromHtml(html: string): string | null {
  const canonical =
    metaContent(html, "og:url") ??
    cleanString(html.match(/<link[^>]+rel=["']canonical["'][^>]+href=["']([^"']+)["']/i)?.[1]);
  if (canonical === null) return null;

  const match = canonical.match(/\/emner\/([^/?#]+)/i);
  const slug = match?.[1];
  if (slug === undefined) return null;
  try {
    return decodeURIComponent(slug).toLowerCase();
  } catch {
    return slug.toLowerCase();
  }
}

/**
 * Extracts videos and page metadata from a faktalink page's HTML.
 *
 * Never throws on an unfamiliar page shape. A page with no recognisable video
 * returns an empty list, which the caller reports as "no videos here" — a true
 * statement — rather than as a parse failure the reader can do nothing about.
 */
export function extractFromHtml(html: string): ExtractionResult {
  const fromJson: FaktalinkVideo[] = [];
  let jsonTitle: string | null = null;
  let jsonSlug: string | null = null;

  for (const payload of findJsonPayloads(html)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(payload);
    } catch {
      // A malformed or non-JSON payload is skipped; the raw pass still covers it.
      continue;
    }

    fromJson.push(...collectVideosFromJson(parsed));

    if (jsonTitle === null || jsonSlug === null) {
      const subject = findSubject(parsed);
      jsonTitle ??= subject.title;
      jsonSlug ??= subject.slug;
    }
  }

  // The raw pass runs over the whole document, so it also covers pages whose
  // JSON failed to parse or never existed.
  const fromText: FaktalinkVideo[] = scanTextForVideos(html).map((ref) => ({
    id: ref.id,
    provider: ref.provider,
    title: null,
    description: null,
    sourceUrl: ref.sourceUrl,
    startSeconds: ref.startSeconds,
  }));

  // JSON first: it carries the metadata, and its order matches the page.
  const videos = mergeVideos([...fromJson, ...fromText]);

  const title =
    jsonTitle ??
    cleanDocumentTitle(cleanString(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1])) ??
    cleanDocumentTitle(metaContent(html, "og:title"));

  return { title, slug: jsonSlug ?? slugFromHtml(html), videos };
}

/**
 * Finds the page subject's title and slug anywhere in a payload.
 *
 * Looks for an object carrying both a slug and a title rather than reading a
 * fixed path, so a move from `pageProps.subject` to anywhere else still resolves.
 */
function findSubject(root: unknown): { title: string | null; slug: string | null } {
  const seen = new WeakSet<object>();
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!isRecord(node)) continue;
    if (seen.has(node)) continue;
    seen.add(node);

    if (!Array.isArray(node)) {
      const slug = cleanString(node["slug"]);
      const title = cleanString(node["title"]);
      if (slug !== null && title !== null) return { title, slug: slug.toLowerCase() };
    }

    for (const value of Object.values(node)) {
      if (isRecord(value)) stack.push(value);
    }
  }

  return { title: null, slug: null };
}
