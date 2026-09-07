# Development CI

Every PR, default-branch push and manual `ci.yml` dispatch runs the same checks.
The required `ci / required` aggregate rejects failed, cancelled, missing and
skipped prerequisites. Workflow validation is read-only and rejects tracked-file
mutations. Shared guards, gate and Biome repair use versioned releases of
`engels74/automation`; all external action references use full version tags.

The quality lane runs complementary prek hygiene and stack guards, read-only
Biome, actual type checks, applicable unit tests, a static build and applicable
bundle budget. It uploads one `site-dist` artifact. HTTP smoke and browser lanes
consume those exact bytes, so they neither rebuild nor accidentally test a dev
server. Frozen installs use packageManager's Bun version and a lockfile-keyed cache.
Only `ci.yml` has development triggers; the other check workflows are callable lanes.

Extractor/URL unit tests, Svelte island types, bundle budget, snapshot/404 HTTP assertions and browser behavior remain required. CI uses the committed snapshot and never crawls the live source.

Reproduce locally: `bun install --frozen-lockfile`, then
`SKIP=no-commit-to-branch,biome,build prek run --all-files --hook-stage manual`,
`bash .github/scripts/check.sh`, and `bash .github/scripts/smoke.sh`.
Where a browser suite exists, install its Playwright browsers and run
`CI=true bun run test:e2e` after the build. Keep port 4321 free for these checks.
Prek's Biome and build hooks are skipped only because explicit CI steps cover them;
the default-branch hook applies to local commits. No existing stack guards are removed.

The shared Renovate preset includes the official Biome schema manager and isolates
Biome/TypeScript/prek groups. Biome repair computes changes without write permission,
then a separate publisher validates the allowed paths and live PR head before
committing and dispatching full CI on the new SHA. Existing template formatting
exclusions remain in force. TypeScript stays below 7 until Astro/Svelte language
tools support its compiler API.

Automerge stays off until the corrected shared policy and strict required-check
protection are activated. Pages publishing remains separate from development CI.

The scheduled crawler now updates one `fix/refresh-video-snapshot` PR instead
of pushing directly to the protected default branch. Its existing failure and
page-count guards remain. Enable **Allow GitHub Actions to create and approve
pull requests** (the workflow only creates PRs), with contents/PR/actions write
permissions scoped to the crawl workflow. It explicitly dispatches full CI with
the PR number and exact SHA because GITHUB_TOKEN-created PRs do not trigger
ordinary workflow runs. Failed dispatches leave the PR unmergeable; the job
reports the exact manual recovery inputs. Source data refreshes remain manual
merges after CI, and Pages deployment follows the merge.

See the [action's event-trigger guidance](https://github.com/peter-evans/create-pull-request/blob/main/docs/concepts-guidelines.md#triggering-further-workflow-runs).

The Bun-only hook recognizes Renovate's `datasource=npm` metadata without
treating it as a package-manager invocation. An injected `run: npm install`
fixture was rejected by the unchanged command policy.
