# Faktalink Video

Paste a [faktalink.dk](https://faktalink.dk) address, get the videos on that page — playable,
in a real player.

## Why this exists

faktalink.dk keeps its embedded videos behind a Cookiebot consent gate, and that gate is
broken for a large group of users:

- The page loads `https://consent.cookiebot.eu/uc.js`. Many DNS blocklists — Pi-hole,
  NextDNS, AdGuard, school and corporate resolvers — null-route that host.
- The script tag carries `id="Cookiebot"`, so the browser still creates `window.Cookiebot`,
  pointing at the **script element** rather than the library.
- The "Opdater samtykke" button calls `window.Cookiebot.renew()`, which throws
  `TypeError: window.Cookiebot.renew is not a function`. React swallows it, and nothing
  happens.
- The videos never render, and there is no way to reach them from the page.

A bookmarklet fixes this, but bookmarklets are blocked on managed ChromeOS devices through
the `URLBlocklist` policy entry `javascript://*`. So the fix has to be an ordinary website.

## The site

One page. A heading, an address field, and the videos for whatever address is submitted.

The field renders `faktalink.dk/emner/` as a real prefix inside the control, so it documents
the format it expects and the caret sits exactly where the topic name goes. Pasting a full
address strips it to the slug. Below roughly 26rem of field width the prefix would take more
room than the slug it precedes, so it moves to the label and the whole field goes to the
input.

Clicking a video opens a modal player built on the native `<dialog>` element, which supplies
the focus trap, the inert background, the top layer and Esc-to-close rather than
reimplementing them. Playback goes through `https://www.yout-ube.com/embed/<ID>` — the `www.`
host directly, so users never eat the apex's 301. It sets no `X-Frame-Options` and no
`frame-ancestors`, so it embeds cleanly. Every video also carries a plain `youtube.com/watch`
link, so it stays reachable if the embed host is down or blocked.

## How a lookup works

### The CORS constraint

faktalink.dk sends no `Access-Control-Allow-Origin` header:

```bash
curl -sSI -H "Origin: https://example.com" https://faktalink.dk/emner/1970-erne | grep -i access-control
# returns nothing
```

A browser on this site's domain therefore cannot fetch a faktalink page directly. Routing
every lookup through a public CORS proxy was measured and rejected — three consecutive
requests to different providers returned `429`, `522` and `403`. That is not a dependency to
put in front of school Chromebooks that are already behind DNS filters.

### Snapshot first, live second

1. **Snapshot.** `.github/workflows/crawl.yml` crawls faktalink twice daily, where CORS does
   not exist, and commits the result to `src/data/emner.json`. The build turns that into one
   small JSON file per page at `/videoer/<slug>.json`, so the browser fetches a couple of
   kilobytes to answer one question rather than a ~280 KB index. No third party is involved.
2. **Live.** A page published since the last crawl is not in the snapshot, and its request
   404s. Only then does the client fetch the live page through a CORS proxy and parse it in
   the browser with the same extractor the crawl uses. This is best-effort by design.

A page that genuinely holds no video says so. "Could not be fetched" and "has no videos" are
reported as different things, because they are.

### The extractor

Deliberately pattern-based rather than structure-based. faktalink edits its pages often, so
nothing depends on a CSS path, a component `__typename`, or a fixed JSON location. Two
independent passes run over every page and their results are merged:

1. **JSON pass** — parses any embedded payload and walks the whole tree for objects carrying
   a recognisable video URL in any of several likely keys, reading title and description from
   the object that holds the URL.
2. **Raw pass** — regexes the page text itself for provider URLs and iframe embeds, seeing
   through JSON escaping (`\/`, `\u002F`) and HTML entities.

The raw pass is the safety net: it matches URLs inside JSON string literals as readily as in
markup, so a front-end rewrite still yields videos as long as the page references YouTube or
Vimeo at all. Verified against all 505 cached pages — renaming the video component, deleting
the JSON payload, and serving plain iframe markup each still extract correctly.

### Deduplication

Videos are deduplicated **by provider and extracted ID, never by raw URL string**. faktalink
publishes the same video as `https://youtu.be/ID`, `https://www.youtube.com/watch?v=ID`, and
occasionally with a `?t=` timestamp, and duplicates every video across `subject.content` and
`subject.pages[].sections[].content`. On `/emner/rusland-op-til-1991` that is 10 raw nodes
collapsing to 5 videos.

## Coverage

Verified against the live site at the last crawl:

|                                   |      |
| --------------------------------- | ---- |
| `/emner/` pages in the sitemap    | 505  |
| Pages carrying at least one video | 443  |
| Videos indexed                    | 1087 |
| of which Vimeo                    | 9    |

Videos also appear as curated source links in faktalink's "Baggrundskilder" sections. Those
are real, editorially titled clips, so they are extracted too.

## Commands

```bash
bun install

bun run dev             # dev server
bun run build           # static build, no network needed
bun run check           # type-check .astro and .svelte

bun test                # extractor and lookup unit tests
bun run test:e2e        # Playwright, against the real build
bun run check:bundle    # assert the JS budget on the landing page

bun run crawl           # refresh the snapshot (uses the on-disk cache)
bun run crawl:refresh   # refresh, bypassing the cache
bun run tokens          # regenerate the caffeine token stylesheet

prek install            # wire the git hooks
prek run --all-files    # everything that runs on commit

# What CI runs. `--hook-stage manual` is the selector that reaches the stack
# guards; `--group ci` selects only the grouped subset and silently drops them.
SKIP=no-commit-to-branch,build prek run --all-files --hook-stage manual
```

## Continuous integration

| Workflow           | Runs                                                                |
| ------------------ | ------------------------------------------------------------------- |
| `code-quality.yml` | Biome, the full prek hook set, `astro check`, build                 |
| `tests.yml`        | Unit suite, the bundle budget, Playwright                           |
| `smoke.yml`        | Builds, serves `dist/`, asserts every route loads with real content |
| `crawl.yml`        | Refreshes the video snapshot twice daily and commits any change     |
| `deploy.yml`       | Publishes `dist/` to the `gh-pages` branch on push to `main`        |

The crawl writes to `main` unattended, so it is fenced: the crawl fails if more than 20% of
pages error, the snapshot is schema-validated before it is committed, and a run yielding
under 80% of the previous page count refuses to commit at all — a faktalink redesign fails
loudly rather than quietly publishing the loss. Nothing is committed when nothing changed.
The deploy is dispatched explicitly afterwards, because a push authenticated with
`GITHUB_TOKEN` raises no workflow events.

## Deployment

Published to GitHub Pages at **https://faktalink.edbpede.net** by `peaceiris/actions-gh-pages`,
which force-pushes `dist/` to the `gh-pages` branch and rewrites the `CNAME` file on every
run — which is why the custom domain survives a redeploy instead of being reset.

Because it serves from the root of a custom domain, `astro.config.mjs` sets no `base`. A
GitHub Pages _project_ subpath would need `base: "/faktalink"` restored and the Playwright
and smoke URLs adjusted to match.

The build needs no network access: the snapshot is committed, so a deploy publishes exactly
what a local `bun run build` produces.

## Stack

Bun 1.3 · Astro 7 (static, no adapter) · Svelte 5 (runes only) · UnoCSS (`presetWind4` +
`presetShadcn` + `presetAnimations`) · Biome · prek · Playwright.

Design tokens are the [caffeine](https://tweakcn.com/r/themes/caffeine.json) theme from
tweakcn, ported into `src/styles/caffeine.css` by `scripts/tokens.ts` and committed. tweakcn
is never fetched at build time — a third party should not be able to change the colours
between deploys. Light is the default; dark toggles the `.dark` class on `<html>`, persisted
with `@nanostores/persistent` and applied by a pre-paint inline script so a dark-mode reload
never flashes white.

The page ships about 23 KB of gzipped JavaScript before any video is played. The extractor
and the modal player load only when they are actually needed — on a live lookup and on the
first play respectively — so neither is in the bundle a reader downloads just to search.

## Internationalisation

Danish is the default locale and lives at the root (`/`); English is prefixed (`/en/`). UI
strings come from typed message objects sharing one key type, so a missing translation is a
compile error rather than a runtime blank.

Content from faktalink — page titles, video titles, descriptions — is Danish source data and
is rendered as-is in both locales, never machine-translated. Inside the English page those
elements carry `lang="da"` so screen readers pronounce them correctly.

## Scope

This site reads a public page's own published data and links out to the videos its editors
chose to embed. It covers `/emner/` pages only, does not mirror faktalink's article text, and
every result links back to its faktalink source.

## Licence

AGPL-3.0-or-later. See [LICENSE](./LICENSE).
