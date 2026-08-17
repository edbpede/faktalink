import { defineConfig, presetIcons, presetWind4, transformerVariantGroup } from "unocss";
import presetAnimations from "unocss-preset-animations";
import { presetShadcn } from "unocss-preset-shadcn";

/**
 * UnoCSS is the styling engine — there is no tailwind.config.js in this stack.
 *
 * presetWind4 is the current Tailwind-v4-compatible preset; its predecessors are
 * superseded and must not appear here (prek enforces this). presetShadcn bridges
 * shadcn's token contract to UnoCSS utilities, and presetAnimations supplies the
 * animation utilities that tw-animate-css provides in the Tailwind path.
 */
export default defineConfig({
  presets: [
    presetWind4(),
    presetAnimations(),
    presetShadcn(
      {
        // Our tokens come from src/styles/caffeine.css, ported from tweakcn.
        // Disabling the preset's own colour and radius output stops it emitting
        // a competing :root block that would shadow the caffeine palette.
        color: false,
        radius: false,
        darkSelector: ".dark",
      },
      // Suppress the preset's global element rules for the same reason: the
      // committed stylesheet owns body colours and the default border colour.
      { globals: false },
    ),
    presetIcons({
      scale: 1.2,
      // Icons are pure CSS masks, so no icon-component runtime reaches the client.
      extraProperties: { display: "inline-block", "vertical-align": "middle" },
    }),
  ],
  transformers: [transformerVariantGroup()],
  content: {
    pipeline: {
      include: [
        /\.(vue|svelte|[jt]sx|mdx?|astro|elm|php|phtml|html)($|\?)/,
        // shadcn-svelte keeps class strings (buttonVariants) in .ts files, which
        // UnoCSS does not scan by default. Without this, those classes are never
        // generated and every button renders unstyled.
        "(components|src)/**/*.{js,ts}",
      ],
    },
  },
  theme: {
    font: {
      // Set on :root by src/styles/global.css; named here so `font-sans`,
      // `font-serif` and `font-mono` utilities resolve to the same stacks.
      sans: "var(--font-sans)",
      serif: "var(--font-serif)",
      mono: "var(--font-mono)",
    },
  },
  shortcuts: {
    // The one focus treatment used site-wide. Defined once so a keyboard user
    // sees exactly the same ring on every interactive element.
    "focus-ring":
      "outline-none focus-visible:(ring-2 ring-ring ring-offset-2 ring-offset-background)",
    // The eyebrow label used above section headings.
    eyebrow: "font-mono text-[0.6875rem] uppercase tracking-[0.18em] text-muted-foreground",
  },
});
