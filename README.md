# Faktalink Video Viewer

Find and play every video embedded on a [faktalink.dk](https://faktalink.dk) emne page.

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

This is that fix. Paste a faktalink URL and get a clean, playable list of every video on
that page.

## How it works

faktalink.dk is a Next.js Pages Router site, so every page ships its full content as JSON
inside `<script id="__NEXT_DATA__" type="application/json">`. Videos appear as objects with
`__typename === "ComponentSharedVideo"`. **That data is present regardless of consent**, so
this project handles no consent logic at all.

### The CORS constraint

faktalink.dk sends no `Access-Control-Allow-Origin` header:

```bash
curl -sSI -H "Origin: https://example.com" https://faktalink.dk/emner/1970-erne | grep -i access-control
# returns nothing
```

A browser on this site's domain therefore cannot fetch a faktalink page, which rules out the
obvious paste-URL-then-fetch design. Shipping a third-party CORS proxy would add an
uncontrolled dependency, leak user browsing to a stranger, and break the moment that proxy
rate-limits us.

It is solved at build time instead, where CORS does not exist:

1. `bun run crawl` fetches the sitemap, keeps the `/emner/` URLs, and fetches each page at a
   concurrency of 6 with a real `User-Agent`, caching every response on disk.
2. Each page's `__NEXT_DATA__` is walked structurally for video objects.
3. The result is committed to `src/data/emner.json` and loaded through a Content Layer
   `file()` loader, so **a build needs no network access at all**.

### The paste-HTML fallback

For pages published after the last crawl, `/indsaet` accepts raw pasted page source
(`Ctrl+U`, `Ctrl+A`, `Ctrl+C`). It parses in the browser with `DOMParser` and runs the exact
same extractor — zero network, works offline.

Both paths import one pure module, `src/lib/extract.ts`. The parser is not written twice.

### Deduplication

Videos are deduplicated **by extracted video ID, never by raw URL string**. faktalink
publishes the same video as `https://youtu.be/ID`, `https://www.youtube.com/watch?v=ID`, and
occasionally with a `&t=` timestamp, and duplicates every video across `subject.content` and
`subject.pages[].sections[].content`. On `/emner/1970-erne` that is 26 raw nodes collapsing
to 13 videos.

### Playback

Videos play through `https://www.yout-ube.com/embed/<ID>` — the `www.` host directly, so
users never eat the apex's 301 redirect. It sets no `X-Frame-Options` and no
`frame-ancestors`, so it embeds cleanly.

Cards are click-to-play: a page with 13 videos renders 13 poster images and mounts an iframe
only when one is clicked. Every video also carries a plain `youtube.com/watch` fallback link,
so it stays reachable if `yout-ube.com` is down or blocked.

## Index coverage

Verified against the live site at the last crawl:

|                                           |               |
| ----------------------------------------- | ------------- |
| `/emner/` pages in the sitemap            | 505           |
| Pages carrying at least one YouTube video | 429           |
| YouTube videos indexed                    | 874           |
| Vimeo videos found (not indexed)          | 3, on 3 pages |

Three videos across the site are Vimeo, which `yout-ube.com` cannot play, so they are skipped;
one of those pages has no YouTube video at all and is therefore not indexed. Counting them
gives the 430 pages / 877 videos figure quoted in the original brief.

## Commands

```bash
bun install

bun run dev             # dev server
bun run build           # static build, no network needed
bun run check           # type-check .astro and .svelte

bun test src            # extractor unit tests
bun run test:e2e        # Playwright, against the real build

bun run crawl           # refresh the index (uses the on-disk cache)
bun run crawl:refresh   # refresh, bypassing the cache
bun run tokens          # regenerate the caffeine token stylesheet

prek install            # wire the git hooks
prek run --all-files    # everything that runs on commit
```

## Stack

Bun 1.3 · Astro 7 (static, no adapter) · Svelte 5 (runes only) · UnoCSS (`presetWind4` +
`presetShadcn` + `presetAnimations`) · Biome + Prettier · prek · Playwright.

Design tokens are the [caffeine](https://tweakcn.com/r/themes/caffeine.json) theme from
tweakcn, ported into `src/styles/caffeine.css` by `scripts/tokens.ts` and committed. tweakcn
is never fetched at build time — a third party should not be able to change the colours
between deploys. Light is the default; dark toggles the `.dark` class on `<html>`, persisted
with `@nanostores/persistent` and applied by a pre-paint inline script so a dark-mode reload
never flashes white.

The site ships about 20 KB of gzipped JavaScript on an emne page before any video is clicked:
the theme toggle, the click-to-play card list, the browse filter and the paste parser are the
only islands.

## Internationalisation

Danish is the default locale and lives at the root (`/`, `/emner/...`); English is prefixed
(`/en/`, `/en/emner/...`). UI strings come from typed message objects sharing one key type, so
a missing translation is a compile error rather than a runtime blank.

Content from faktalink — emne titles, video titles, descriptions — is Danish source data and
is rendered as-is in both locales, never machine-translated. Inside the English pages those
elements carry `lang="da"` so screen readers pronounce them correctly.

## Scope

This site reads a public page's own published JSON and links out to the videos its editors
chose to embed. It indexes `/emner/` pages only, does not mirror faktalink's article text, and
every emne page links back to its faktalink source.

## Licence

AGPL-3.0-or-later. See [LICENSE](./LICENSE).
