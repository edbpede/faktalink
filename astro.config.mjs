import svelte from "@astrojs/svelte";
import { defineConfig } from "astro/config";
import UnoCSS from "unocss/astro";

/**
 * Static output, no adapter: the site must deploy as plain files and run from
 * GitHub Pages, Netlify or a USB stick. Every route is prerendered from the
 * committed index in src/data/emner.json, so a build needs no network access.
 */
export default defineConfig({
  output: "static",
  site: "https://edbpede.github.io",
  base: "/faktalink",
  trailingSlash: "ignore",
  integrations: [
    // injectReset pulls in the UnoCSS reset; presetWind4's own reset is not
    // separately injected, so there is exactly one reset in the output.
    UnoCSS({ injectReset: true }),
    svelte(),
  ],
  i18n: {
    locales: ["da", "en"],
    defaultLocale: "da",
    routing: {
      // Danish is the source language of the content and lives at the root.
      prefixDefaultLocale: false,
    },
  },
  build: {
    // One stylesheet beats a dozen blocking <link>s on a page that is mostly text.
    inlineStylesheets: "auto",
  },
});
