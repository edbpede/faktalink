/**
 * Serves the static build for the end-to-end run.
 *
 * `astro preview` is not used here: in Astro 7 it registers a background daemon,
 * so a second invocation detects the first and exits immediately — which makes
 * Playwright's `webServer` (it expects a foreground process it owns) fail with
 * "Process from config.webServer exited early" whenever a stale daemon lingers.
 * A plain file server has no shared state, so the suite is deterministic locally
 * and in CI.
 *
 * Serves dist/ the way the site is actually deployed, including the
 * directory-index and 404 behaviour of a typical static host.
 *
 *   bun run scripts/serve-dist.ts [--port 4321] [--base ""]
 *   PORT=4321 bun run scripts/serve-dist.ts
 *
 * Binds 0.0.0.0 so IPv4 probes from a CI step reach it regardless of how the
 * runner resolves localhost.
 */

import { join, normalize } from "node:path";

function flag(name: string, fallback: string): string {
  const index = process.argv.indexOf(`--${name}`);
  const value = index === -1 ? undefined : process.argv[index + 1];
  return value ?? fallback;
}

// PORT is read from the environment too, so a CI step can set it without
// having to thread an argument through a shell quote.
const port = Number.parseInt(flag("port", process.env["PORT"] ?? "4321"), 10);
// The deployed site lives at the root of a custom domain, so no base by default.
const base = flag("base", "").replace(/\/$/, "");
const root = join(import.meta.dir, "..", "dist");

/** Resolves a request path to a file inside dist/, refusing traversal. */
async function resolve(pathname: string): Promise<Response | null> {
  let relative = pathname;
  if (base !== "" && relative.startsWith(base)) relative = relative.slice(base.length);
  if (relative === "") relative = "/";

  // normalize() collapses any ../ before it can escape the root.
  const safe = normalize(relative).replace(/^(\.\.[/\\])+/, "");
  const candidates = safe.endsWith("/")
    ? [join(root, safe, "index.html")]
    : [join(root, safe), join(root, `${safe}.html`), join(root, safe, "index.html")];

  for (const candidate of candidates) {
    if (!candidate.startsWith(root)) continue;
    const file = Bun.file(candidate);
    if (await file.exists()) {
      const stat = await file.stat();
      if (stat.isDirectory?.()) continue;
      return new Response(file);
    }
  }
  return null;
}

const server = Bun.serve({
  port,
  hostname: "0.0.0.0",
  async fetch(request) {
    const { pathname } = new URL(request.url);

    const response = await resolve(pathname);
    if (response !== null) return response;

    // Static hosts serve the 404 page with a 404 status.
    const notFound = Bun.file(join(root, "404.html"));
    if (await notFound.exists()) {
      return new Response(notFound, { status: 404, headers: { "Content-Type": "text/html" } });
    }
    return new Response("Not found", { status: 404 });
  },
});

console.log(`Serving dist/ at http://localhost:${server.port}${base}/`);
