/**
 * URL builders for playback, posters and attribution.
 *
 * Every outbound URL the site produces is built here so the embed host cannot
 * drift between components. Pure string construction: no network, no DOM.
 */

import type { VideoProvider } from "./extract";

/**
 * The YouTube embed host.
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

/** Vimeo's player and canonical hosts. */
const VIMEO_EMBED_ORIGIN = "https://player.vimeo.com";
const VIMEO_WATCH_ORIGIN = "https://vimeo.com";

/** faktalink.dk, for linking each result back to its source. */
export const FAKTALINK_ORIGIN = "https://faktalink.dk";

/**
 * Builds the embed URL loaded into the player.
 *
 * `autoplay=1` is intentional: the player is only ever mounted by a deliberate
 * click, so playback starting is the expected outcome of that click and never
 * an unprompted autoplay.
 */
export function buildEmbedUrl(
  videoId: string,
  provider: VideoProvider = "youtube",
  startSeconds?: number | null,
): string {
  const hasStart = typeof startSeconds === "number" && startSeconds > 0;

  if (provider === "vimeo") {
    const url = new URL(`/video/${videoId}`, VIMEO_EMBED_ORIGIN);
    url.searchParams.set("autoplay", "1");
    // Vimeo takes the offset as a media fragment, not a query parameter.
    return hasStart ? `${url.href}#t=${startSeconds}s` : url.href;
  }

  const url = new URL(`/embed/${videoId}`, EMBED_ORIGIN);
  url.searchParams.set("autoplay", "1");
  url.searchParams.set("rel", "0");
  if (hasStart) url.searchParams.set("start", String(startSeconds));
  return url.href;
}

/**
 * Builds the canonical link shown next to every video, so it stays reachable if
 * the embed host is down or blocked by the reader's network.
 */
export function buildWatchUrl(
  videoId: string,
  provider: VideoProvider = "youtube",
  startSeconds?: number | null,
): string {
  const hasStart = typeof startSeconds === "number" && startSeconds > 0;

  if (provider === "vimeo") {
    const url = new URL(`/${videoId}`, VIMEO_WATCH_ORIGIN);
    return hasStart ? `${url.href}#t=${startSeconds}s` : url.href;
  }

  const url = new URL("/watch", WATCH_ORIGIN);
  url.searchParams.set("v", videoId);
  if (hasStart) url.searchParams.set("t", `${startSeconds}s`);
  return url.href;
}

/**
 * Builds the poster URL for a video.
 *
 * Vimeo has no equivalent deterministic thumbnail URL — its CDN paths are
 * per-video and only discoverable through an API call — so Vimeo videos return
 * null and the UI draws its own placeholder rather than a broken image.
 */
export function buildPosterUrl(
  videoId: string,
  provider: VideoProvider = "youtube",
): string | null {
  if (provider === "vimeo") return null;
  return `${THUMBNAIL_ORIGIN}/vi/${videoId}/hqdefault.jpg`;
}

/** Builds the canonical faktalink URL for an emne slug, for attribution. */
export function buildFaktalinkUrl(slug: string): string {
  return `${FAKTALINK_ORIGIN}/emner/${slug}`;
}
