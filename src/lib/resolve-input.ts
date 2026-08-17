/**
 * Turns whatever a user pastes into the home-page field into an emne slug.
 *
 * Accepts a full faktalink URL or a bare slug, and reports precisely which
 * expectation failed so the UI can say something specific instead of
 * "invalid input". Pure: no network, no DOM.
 */

import { FAKTALINK_ORIGIN } from "./urls";

/** Why an input could not be resolved to an emne slug. */
export type ResolveFailure =
  | "empty"
  | "not-a-url"
  | "wrong-host"
  | "not-an-emne"
  | "missing-slug";

export type ResolveResult =
  | { readonly ok: true; readonly slug: string }
  | { readonly ok: false; readonly reason: ResolveFailure };

/** Hosts we accept a pasted URL from. */
const FAKTALINK_HOSTS = new Set(["faktalink.dk", "www.faktalink.dk"]);

/**
 * A bare slug: lowercase letters (including the Danish æ/ø/å), digits and
 * hyphens. Real slugs look like `1970-erne` and `rusland-op-til-1991`.
 */
const BARE_SLUG_PATTERN = /^[a-z0-9æøå]+(?:-[a-z0-9æøå]+)*$/i;

/**
 * Resolves user input to an emne slug.
 *
 * Only `/emner/` pages are in scope, so a valid faktalink URL pointing at
 * `/temaer/...` is rejected as `not-an-emne` rather than being coerced.
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

  return { ok: true, slug: decodeURIComponent(slug).toLowerCase() };
}
