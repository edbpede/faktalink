import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end configuration.
 *
 * Runs against the real static build served by `astro preview`, not the dev
 * server: the build is what ships, and it is the only thing that exercises
 * Astro's Rust compiler and the hydration output together.
 *
 * `base` is "/faktalink" in astro.config.mjs, so the preview server serves the
 * site under that path and baseURL includes it.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env["CI"]),
  retries: process.env["CI"] ? 2 : 0,
  reporter: process.env["CI"] ? "list" : [["list"]],
  use: {
    baseURL: "http://localhost:4321/faktalink",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    // Not `astro preview`: in Astro 7 it registers a background daemon, so a
    // second invocation detects the first and exits immediately, which Playwright
    // reports as "Process from config.webServer exited early". scripts/serve-dist.ts
    // is a plain foreground file server with no shared state.
    command: "bun run scripts/serve-dist.ts --port 4321 --base /faktalink",
    url: "http://localhost:4321/faktalink/",
    reuseExistingServer: !process.env["CI"],
    timeout: 120_000,
  },
});
