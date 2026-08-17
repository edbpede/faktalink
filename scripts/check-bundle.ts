/**
 * Asserts the JavaScript budget on an emne page.
 *
 * The brief's hard limit: total transferred JS on an emne page must stay under
 * 50 KB before any video is clicked. That was verified by hand during
 * development; this makes it a gate, so a future island or dependency cannot
 * quietly spend the remaining headroom.
 *
 *   bun run check:bundle          # requires dist/ to exist
 *
 * Counts the whole graph Astro actually loads: every `component-url` and
 * `renderer-url` on the page, each of their static imports followed
 * transitively, plus the inline scripts in the HTML (which include the
 * pre-paint theme script and Astro's island bootstrap).
 */

import { join } from "node:path";

/** The brief's budget, uncompressed. */
const BUDGET_BYTES = 50 * 1024;

/** The reference page: 13 videos, the largest island payload the site serves. */
const PAGE = join(import.meta.dir, "..", "dist", "emner", "1970-erne", "index.html");
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

  // Follow static imports so the whole loaded graph is counted, not just entries.
  const text = new TextDecoder().decode(bytes);
  for (const match of text.matchAll(/from"([^"]+)"|import"([^"]+)"/g)) {
    const specifier = match[1] ?? match[2];
    if (specifier?.startsWith("./")) await walk(`/_astro/${specifier.slice(2)}`);
  }
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

if (rawBytes > BUDGET_BYTES) {
  console.error(
    `\nOVER BUDGET by ${kib(rawBytes - BUDGET_BYTES)}. An emne page must ship under ${kib(BUDGET_BYTES)} of JS before any video is clicked.`,
  );
  process.exit(1);
}

console.log(`\nPASS — ${kib(headroom)} of headroom.`);

// The Svelte runtime alone is ~35 KB, so the margin here is genuinely thin.
// Warn before the next island turns a pass into a failure.
if (headroom < 4 * 1024) {
  console.warn(
    `Note: under 4 KB of headroom. Adding another island to an emne page will likely breach the budget.`,
  );
}
