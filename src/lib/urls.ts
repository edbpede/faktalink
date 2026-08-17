/**
 * URL builders for playback, posters and attribution.
 *
 * Every outbound URL the site produces is built here so the embed host cannot
 * drift between components. Pure string construction: no network, no DOM.
 */

/**
 * The embed host.
 *
 * `yout-ube.com` 301-redirects to the `www.` host, so we link the `www.` host
 * directly and users never pay for the redirect. Verified: it sets no
 * `X-Frame-Options` and no `frame-ancestors`, so it embeds cleanly — which is
 * the entire reason this site exists.
 */
const EMBED_ORIGIN = "https://www.yout-ube.com";

/** Canonical YouTube watch host, used only for the always-present fallback link. */
const WATCH_ORIGIN = "https://www.youtube.com";

/** YouTube's thumbnail CDN. `hqdefault.jpg` exists for every video (480x360). */
const THUMBNAIL_ORIGIN = "https://i.ytimg.com";

/** faktalink.dk, for linking each emne page back to its source. */
export const FAKTALINK_ORIGIN = "https://faktalink.dk";

/**
 * Builds the embed URL used when a poster is clicked.
 *
 * `autoplay=1` is intentional: the iframe is only ever mounted by a deliberate
 * user click, so playback starting is the expected outcome of that click and
 * never an unprompted autoplay.
 */
export function buildEmbedUrl(videoId: string, startSeconds?: number | null): string {
  const url = new URL(`/embed/${videoId}`, EMBED_ORIGIN);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("rel", "0");
  if (typeof startSeconds === "number" && startSeconds > 0) {
    url.searchParams.set("start", String(startSeconds));
  }
  return url.href;
}

/**
 * Builds the plain YouTube link shown next to every video, so the video stays
 * reachable if `yout-ube.com` is down or blocked by the user's network.
 */
export function buildWatchUrl(videoId: string, startSeconds?: number | null): string {
  const url = new URL("/watch", WATCH_ORIGIN);
  url.searchParams.set("v", videoId);
  if (typeof startSeconds === "number" && startSeconds > 0) {
    url.searchParams.set("t", `${startSeconds}s`);
  }
  return url.href;
}

/** Builds the poster URL shown in place of an unloaded iframe. */
export function buildPosterUrl(videoId: string): string {
  return `${THUMBNAIL_ORIGIN}/vi/${videoId}/hqdefault.jpg`;
}

/** Builds the canonical faktalink URL for an emne slug, for attribution. */
export function buildFaktalinkUrl(slug: string): string {
  return `${FAKTALINK_ORIGIN}/emner/${slug}`;
}
