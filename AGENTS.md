# AGENTS.md

This file provides guidance to AI coding agents when working with code in this
repository.

Static Astro 7 site, no adapter and no server: it resolves a faktalink.dk `/emner/` slug to
playable videos. Bun is the only runtime, installer and script runner.

## Commands

```bash
bun install
bun run check                       # astro check plus svelte-check for islands
bun run build                       # required before check:bundle and test:e2e
bun test                            # unit suite; bunfig.toml scopes it to src/
bun test src/lib/extract.test.ts    # one file
bun test src/lib/extract.test.ts -t "reads Vimeo IDs"          # one case
bun run test:e2e                                               # Playwright
bunx --bun playwright test e2e/lookup.spec.ts -g "resolves a bare slug"
bun run lint:fix                    # biome check --write . (`format` is the same command)
```

`bun test` cannot run `e2e/*.spec.ts` — they import `@playwright/test`, which does not load
under `bun:test`. `bunfig.toml` sets `root = "src"` so the bare command excludes them. Put
new unit tests in `src/`, new browser tests in `e2e/`.

`playwright.config.ts` builds nothing; it only serves `dist/` through `scripts/serve-dist.ts`.
Run `bun run build` first or the suite tests a stale build. Don't switch it back to
`astro preview` — Astro 7's preview registers a background daemon and Playwright then reports
"Process from config.webServer exited early".

## Hooks (prek)

`prek install` wires pre-commit, commit-msg and pre-push. To reproduce what CI runs:

```bash
SKIP=no-commit-to-branch,biome,build prek run --all-files --hook-stage manual
```

`--hook-stage manual` is the selector that reaches the stack guards. `--group ci` silently
drops every one of them (they carry no `groups` key), so don't use it to check your work.

Commits to `main` are blocked by hook — branch first. Messages must be Conventional Commits.

## Generated files — never hand-edit

| File | Regenerate with |
| --- | --- |
| `src/data/emner.json` | `bun run crawl` (uses `.cache/`) or `bun run crawl:refresh` |
| `src/styles/caffeine.css` | `bun run scripts/tokens.ts` (`--fetch` re-pulls tweakcn) |
| `src/styles/caffeine.theme.json` | `bun run scripts/tokens.ts --fetch` |

All three are excluded from Biome and prek, so a hand edit passes every gate and is then
overwritten by the next crawl or token run.

`package.json` has no `tokens` script, though `README.md` and `scripts/tokens.ts` both
document `bun run tokens`. Invoke the script path directly.

## Invariants

- **Embed host.** Playback goes through `https://www.yout-ube.com/embed/<id>`;
  `youtube.com/embed` refuses framing on the networks this site exists to serve. Build every
  outbound URL in `src/lib/urls.ts` rather than inline in a component — a prek guard denies
  `youtube.com/embed` anywhere under `src/{components,lib,layouts,pages}` (tests exempt).
- **The extractor is shared.** `src/lib/extract.ts` is imported by both `scripts/crawl.ts`
  (build time, Node/Bun) and `src/lib/lookup.ts` (browser live fallback). It must stay free of
  Node-only APIs, and a change to it changes both paths at once.
- **Extraction is pattern-based on purpose.** An embedded-JSON tree walk and a raw regex pass
  over the page text run independently and are merged, deduplicated by `provider + id` and
  never by URL string. Replacing either with a CSS selector or a fixed JSON path breaks on
  faktalink's next front-end edit — extend the patterns instead.
- **Snapshot schema lives in three places.** `src/content.config.ts` (Zod, validates at build),
  `scripts/crawl.ts` (writes it) and the inline validator in `.github/workflows/crawl.yml`.
  Change the shape in all three, or the scheduled crawl commits data the build then rejects.
- **i18n.** `src/i18n/da.ts` derives `Messages`/`MessageKey`; `en.ts` is typed as `Messages`,
  so a missing translation is a compile error. Danish is the source locale at `/`, English at
  `/en/`. faktalink's own content stays Danish in both, marked `lang="da"`.
- **Routes.** Build paths with `src/lib/paths.ts`, not string literals — it applies
  `import.meta.env.BASE_URL`, which is `/` only because `astro.config.mjs` sets no `base`.
- **JS budget.** The landing page must stay under 60 KB uncompressed before any video plays
  (`scripts/check-bundle.ts`, run against `dist/`). Load new client code behind a dynamic
  `import()`: deferred chunks are reported but not counted against the budget.
- **Biome does not format `.astro` or `.svelte`** — an override in `biome.json` disables the
  formatter there (it only lints and sorts imports in script blocks), and Biome 2.5 has no
  Markdown support. Nothing formats those files, so match the surrounding style by hand.

## Reference

- `.agents/rules/bun-astro-dev-pro.md` — binding Bun / Astro 7 / Svelte 5 runes / UnoCSS /
  shadcn conventions plus an anti-pattern list. Read before writing a Svelte island, an
  `.astro` page, or touching `uno.config.ts`. Several prek hooks make its anti-patterns
  unpushable: Svelte 4 syntax (`export let`, `on:`, `$:`), `presetUno`/`presetWind3`, any
  `tailwind.config.*`, `Astro.glob()`, bare `client:only`, dynamically constructed UnoCSS
  class names, and `npm`/`pnpm`/`yarn`/`npx` in executable files.
- `prek.toml` — every hook, its scope, and why it exists. Read when a commit is blocked.
- `README.md` — the CORS constraint, snapshot-then-live lookup order, coverage numbers, and
  the GitHub Pages / CNAME deployment mechanics.
