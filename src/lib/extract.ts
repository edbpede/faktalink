/**
 * The single source of truth for turning a faktalink.dk page into a video list.
 *
 * faktalink.dk is a Next.js Pages Router site: every page ships its complete
 * content as JSON inside `<script id="__NEXT_DATA__" type="application/json">`,
 * present regardless of the Cookiebot consent gate. Videos appear as objects
 * with `__typename === "ComponentSharedVideo"`.
 *
 * Both entry paths import this module — the build-time crawler (raw HTML string)
 * and the browser paste-HTML fallback (DOMParser document). The parse-and-dedupe
 * logic exists exactly once; only the way the JSON string is obtained differs.
 *
 * Pure: no network, no DOM globals at module scope, no side effects.
 */

/** A single, deduplicated video extracted from a faktalink page. */
export interface FaktalinkVideo {
  /** The 11-character YouTube video ID. The deduplication key. */
  readonly id: string;
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
  /** `props.pageProps.subject.title`, when present. */
  readonly title: string | null;
  /** `props.pageProps.subject.slug`, when present. */
  readonly slug: string | null;
  /** Videos in first-seen order, deduplicated by video ID. */
  readonly videos: readonly FaktalinkVideo[];
}

/** Returned when the page carried no parseable `__NEXT_DATA__` payload at all. */
export class NextDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NextDataError";
  }
}

const EMPTY_RESULT: ExtractionResult = { title: null, slug: null, videos: [] };

/** YouTube IDs are exactly 11 characters of URL-safe base64. */
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/;

/** Hosts whose first path segment is the video ID. */
const SHORT_HOSTS = new Set(["youtu.be"]);

/** Hosts that use `/watch?v=`, `/embed/<id>`, `/shorts/<id>`, `/live/<id>`. */
const LONG_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "music.youtube.com",
  "youtube-nocookie.com",
  "www.youtube-nocookie.com",
]);

/** Path prefixes on the long hosts that are followed by a bare video ID. */
const ID_BEARING_SEGMENTS = new Set(["embed", "shorts", "live", "v"]);

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

/**
 * Extracts the YouTube video ID from any URL spelling faktalink publishes.
 *
 * Handles `https://youtu.be/ID`, `https://www.youtube.com/watch?v=ID`, the
 * `&t=` timestamp form, and the embed/shorts/live variants. Vimeo appears in
 * faktalink's schema but is unused in practice; it returns null rather than
 * throwing, so a stray non-YouTube entry is skipped instead of failing a build.
 */
export function extractVideoId(rawUrl: string | null | undefined): string | null {
  if (typeof rawUrl !== "string") return null;
  const trimmed = rawUrl.trim();
  if (trimmed === "") return null;

  // A bare ID is accepted so callers can pass an already-extracted value.
  if (VIDEO_ID_PATTERN.test(trimmed)) return trimmed;

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

  if (SHORT_HOSTS.has(host)) {
    const candidate = segments[0];
    return candidate !== undefined && VIDEO_ID_PATTERN.test(candidate) ? candidate : null;
  }

  if (LONG_HOSTS.has(host)) {
    const vParam = url.searchParams.get("v");
    if (vParam !== null && VIDEO_ID_PATTERN.test(vParam)) return vParam;

    const [first, second] = segments;
    if (first !== undefined && ID_BEARING_SEGMENTS.has(first) && second !== undefined) {
      return VIDEO_ID_PATTERN.test(second) ? second : null;
    }
  }

  return null;
}

/** Reads the start offset from either `t` or `start`, whichever is present. */
function extractStartSeconds(rawUrl: string): number | null {
  try {
    const url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`);
    return parseStartSeconds(url.searchParams.get("t") ?? url.searchParams.get("start"));
  } catch {
    return null;
  }
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
 * Walks an entire parsed JSON tree collecting `ComponentSharedVideo` objects.
 *
 * Deliberately structural rather than path-based: the same video appears under
 * both `subject.content` and `subject.pages[].sections[].content`, and the array
 * indices differ per page, so fixed paths would silently miss videos.
 */
function collectVideoNodes(root: unknown): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = [];
  const seen = new WeakSet<object>();
  const stack: unknown[] = [root];

  while (stack.length > 0) {
    const node = stack.pop();
    if (!isRecord(node)) continue;

    // Guards against shared references; JSON trees are acyclic but callers may
    // hand us a live object graph from a document instead of a fresh parse.
    if (seen.has(node)) continue;
    seen.add(node);

    if (node["__typename"] === "ComponentSharedVideo") found.push(node);

    if (Array.isArray(node)) {
      for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
      continue;
    }
    for (const value of Object.values(node)) {
      if (isRecord(value)) stack.push(value);
    }
  }

  return found;
}

/**
 * Deduplicates by extracted video ID — never by raw URL string.
 *
 * The same video reaches us as up to three different spellings
 * (`youtu.be/ID`, `youtube.com/watch?v=ID`, and the `&t=` form), so string
 * dedupe leaves visible duplicates. Where duplicates disagree, the first
 * occurrence wins and later copies only fill fields the first one left null.
 */
function dedupeByVideoId(nodes: readonly Record<string, unknown>[]): FaktalinkVideo[] {
  const byId = new Map<string, FaktalinkVideo>();

  for (const node of nodes) {
    const sourceUrl = cleanString(node["url"]);
    if (sourceUrl === null) continue;

    const id = extractVideoId(sourceUrl);
    if (id === null) continue;

    const title = cleanString(node["optionalTitle"]);
    const description = cleanString(node["description"]);
    const existing = byId.get(id);

    if (existing === undefined) {
      byId.set(id, {
        id,
        title,
        description,
        sourceUrl,
        startSeconds: extractStartSeconds(sourceUrl),
      });
      continue;
    }

    if (existing.title === null && title !== null) {
      byId.set(id, { ...existing, title });
    }
    if (byId.get(id)?.description === null && description !== null) {
      const current = byId.get(id);
      if (current !== undefined) byId.set(id, { ...current, description });
    }
  }

  return [...byId.values()];
}

/**
 * Extracts videos and page metadata from an already-parsed `__NEXT_DATA__` tree.
 * This is the core both entry points funnel into.
 */
export function extractFromNextData(data: unknown): ExtractionResult {
  if (!isRecord(data)) return EMPTY_RESULT;

  const props = isRecord(data["props"]) ? data["props"] : undefined;
  const pageProps = props && isRecord(props["pageProps"]) ? props["pageProps"] : undefined;
  const subject =
    pageProps && isRecord(pageProps["subject"]) ? pageProps["subject"] : undefined;

  return {
    title: subject ? cleanString(subject["title"]) : null,
    slug: subject ? cleanString(subject["slug"]) : null,
    videos: dedupeByVideoId(collectVideoNodes(data)),
  };
}

/**
 * Locates the `__NEXT_DATA__` payload in a raw HTML string.
 *
 * Written without a DOM so the build-time crawler can call it directly in Bun.
 * The attribute order is not assumed: the tag is matched on its id, then the
 * JSON body is taken up to the closing tag. Next.js HTML-escapes `</script>`
 * inside the payload, so a non-greedy match to the first `</script>` is safe.
 */
export function findNextDataScript(html: string): string | null {
  const match = html.match(
    /<script\b[^>]*\bid=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  return match?.[1]?.trim() ?? null;
}

/**
 * Extracts videos from a raw HTML string. Used by the build-time crawler.
 *
 * @throws {NextDataError} when the page carries no parseable payload, so a
 * crawl surfaces a changed page shape instead of silently recording zero videos.
 */
export function extractFromHtml(html: string): ExtractionResult {
  const payload = findNextDataScript(html);
  if (payload === null) {
    throw new NextDataError('No <script id="__NEXT_DATA__"> found in the page source.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (cause) {
    throw new NextDataError(
      `Found __NEXT_DATA__ but its JSON did not parse: ${(cause as Error).message}`,
    );
  }

  return extractFromNextData(parsed);
}

/**
 * Extracts videos from a DOM document. Used by the browser paste-HTML fallback,
 * which builds the document with `DOMParser` — zero network, works offline.
 *
 * Takes the minimal structural shape it needs rather than `Document`, so this
 * module stays free of DOM lib types and remains testable under `bun test`.
 */
export function extractFromDocument(doc: {
  getElementById(id: string): { textContent: string | null } | null;
}): ExtractionResult {
  const script = doc.getElementById("__NEXT_DATA__");
  const payload = script?.textContent?.trim();
  if (payload === undefined || payload === "") {
    throw new NextDataError(
      'No <script id="__NEXT_DATA__"> found. Paste the full page source from View Source (Ctrl+U).',
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch (cause) {
    throw new NextDataError(
      `Found __NEXT_DATA__ but its JSON did not parse: ${(cause as Error).message}`,
    );
  }

  return extractFromNextData(parsed);
}
