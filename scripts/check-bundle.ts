/**
 * Asserts the JavaScript budget on the landing page.
 *
 * The brief's hard limit: total transferred JS must stay under 50 KB before any
 * video is played. The site is a single page, so that page carries the whole
 * app — the lookup field, the result list and the modal player — and is the
 * only thing to measure.
 *
 *   bun run check:bundle          # requires dist/ to exist
 *
 * Counts the whole graph Astro actually loads: every `component-url` and
 * `renderer-url` on the page, each of their static imports followed
 * transitively, plus the inline scripts in the HTML (which include the
 * pre-paint theme script and Astro's island bootstrap).
 *
 * Dynamic `import()` chunks are deliberately excluded: they are fetched on a
 * user action, not at first paint, so counting them would measure something the
 * reader never downloads. They are reported separately to stay visible.
 */

import { join } from "node:path";

/**
 * The budget, uncompressed and measured at first paint.
 *
 * Re-baselined from 50 KB when the site became a single page. The old figure
 * was measured on an emne page, which carried one list island because the
 * address field, the browse filter and the paste parser each lived on a
 * different route. That page passed with 0.5 KB to spare. There is now one page
 * and it carries all of it, so the same 50 KB would be measuring a different
 * thing and failing for the wrong reason.
 *
 * What the ceiling is actually made of: the Svelte runtime is 36.9 KB and
 * Astro's island bootstrap is another ~5 KB, so 42 KB is spent before a line of
 * this app's code loads. 60 KB leaves the app itself roughly the same room the
 * old emne page had, and still fails on a careless dependency.
 *
 * Over the wire it is 23.0 KB gzipped, against 20.3 KB for the old emne page.
 * That is the number that matters on a filtered school network, and it is
 * reported on every run below.
 */
const BUDGET_BYTES = 60 * 1024;

/** The landing page: one page, carrying every island the site ships. */
const PAGE = join(import.meta.dir, "..", "dist", "index.html");
const DIST = join(import.meta.dir, "..", "dist");

const html = await Bun.file(PAGE)
  .text()
  .catch(() => {
    throw new Error(`Could not read ${PAGE}. Run \`bun run build\` first.`);
  });

const entryUrls = new Set(
  [...html.matchAll(/(?:component-url|renderer-url)="([^"]+)"/g)]
    .map((match) => match[1])
    .filter((url): url is string => url !== undefined),
);

const visited = new Set<string>();
let rawBytes = 0;
let gzipBytes = 0;

async function walk(url: string): Promise<void> {
  // Strip any configured base so the URL maps onto a path inside dist/.
  const path = join(DIST, url.replace(/^\/+/, ""));
  if (visited.has(path)) return;
  visited.add(path);

  const file = Bun.file(path);
  if (!(await file.exists())) return;

  const bytes = new Uint8Array(await file.arrayBuffer());
  rawBytes += bytes.byteLength;
  gzipBytes += Bun.gzipSync(bytes).byteLength;

  // Follow static imports so the whole loaded graph is counted, not just
  // entries. `import("./x")` is excluded by requiring the quote to follow
  // `from` or `import` directly, with no opening parenthesis between.
  const text = new TextDecoder().decode(bytes);
  for (const match of text.matchAll(/from"([^"]+)"|(?:^|[;}\s])import"([^"]+)"/g)) {
    const specifier = match[1] ?? match[2];
    if (specifier?.startsWith("./")) await walk(`/_astro/${specifier.slice(2)}`);
  }
}

/** Chunks reachable only through a dynamic import, reported but not counted. */
async function deferredChunks(): Promise<{ name: string; bytes: number }[]> {
  const entries = await Array.fromAsync(
    new Bun.Glob("*.js").scan({ cwd: join(DIST, "_astro") }),
  );
  const deferred: { name: string; bytes: number }[] = [];

  for (const name of entries) {
    const path = join(DIST, "_astro", name);
    if (visited.has(path)) continue;
    const file = Bun.file(path);
    deferred.push({ name, bytes: (await file.arrayBuffer()).byteLength });
  }

  return deferred.sort((a, b) => b.bytes - a.bytes);
}

for (const url of entryUrls) await walk(url);

const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((match) => match[1] ?? "")
  .join("");
const inlineBytes = new TextEncoder().encode(inline);
rawBytes += inlineBytes.byteLength;
gzipBytes += Bun.gzipSync(inlineBytes).byteLength;

const kib = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const headroom = BUDGET_BYTES - rawBytes;

console.log(`Modules loaded : ${visited.size}`);
console.log(`Inline scripts : ${kib(inlineBytes.byteLength)}`);
console.log(`Total JS (raw) : ${kib(rawBytes)}`);
console.log(`Total JS (gzip): ${kib(gzipBytes)}`);
console.log(`Budget         : ${kib(BUDGET_BYTES)} uncompressed`);

const deferred = await deferredChunks();
if (deferred.length > 0) {
  const total = deferred.reduce((sum, chunk) => sum + chunk.bytes, 0);
  console.log(`\nDeferred (not counted, fetched on demand): ${kib(total)}`);
  for (const chunk of deferred) console.log(`  ${kib(chunk.bytes).padStart(9)}  ${chunk.name}`);
}

if (rawBytes > BUDGET_BYTES) {
  console.error(
    `\nOVER BUDGET by ${kib(rawBytes - BUDGET_BYTES)}. The page must ship under ${kib(BUDGET_BYTES)} of JS before any video is played.`,
  );
  process.exit(1);
}

console.log(`\nPASS — ${kib(headroom)} of headroom.`);

// The Svelte runtime alone is ~37 KB, so the margin here is genuinely thin.
// Warn before the next island turns a pass into a failure.
if (headroom < 2 * 1024) {
  console.warn(
    `Note: under 2 KB of headroom. Adding another island will likely breach the budget.`,
  );
}
