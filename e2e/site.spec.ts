import { expect, test } from "@playwright/test";

/** Routing, i18n, theming, accessibility and the snapshot endpoint. */

const FIELD = /adresse eller emnenavn/i;
const EN_FIELD = /address or topic name/i;

test.describe("routes", () => {
  test("serves exactly the pages the site still has", async ({ page }) => {
    for (const path of ["/", "/en/"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      await expect(page.locator("h1")).toHaveCount(1);
    }
  });

  test("the removed catalogue routes are gone", async ({ page }) => {
    // The brief removed browsing and the paste page. A stale link must 404
    // rather than serve a half-working page.
    for (const path of ["/emner", "/emner/1970-erne", "/indsaet", "/en/emner"]) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(404);
    }
  });

  test("serves a per-page snapshot as JSON, and 404s an unknown page", async ({ request }) => {
    const hit = await request.get("/videoer/1970-erne.json");
    expect(hit.status()).toBe(200);

    const body = await hit.json();
    expect(body.slug).toBe("1970-erne");
    expect(Array.isArray(body.videos)).toBe(true);
    expect(body.videos).toHaveLength(13);
    for (const video of body.videos) {
      expect(typeof video.id).toBe("string");
      expect(["youtube", "vimeo"]).toContain(video.provider);
    }

    // A 404 is how the client learns to try the live lookup instead.
    const miss = await request.get("/videoer/findes-ikke-nogen-steder.json");
    expect(miss.status()).toBe(404);
  });
});

test.describe("i18n", () => {
  test("serves Danish at the root and English under /en", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).toHaveAttribute("lang", "da-DK");

    await page.goto("/en/");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("the English page looks up the same pages", async ({ page }) => {
    await page.goto("/en/");
    await page.getByLabel(EN_FIELD).fill("1970-erne");
    await page.getByRole("button", { name: /show videos/i }).click();

    await expect(page.getByRole("button", { name: /play the video/i })).toHaveCount(13);
  });

  test("marks Danish source content inside the English page", async ({ page }) => {
    await page.goto("/en/");
    await page.getByLabel(EN_FIELD).fill("1970-erne");
    await page.getByRole("button", { name: /show videos/i }).click();

    // faktalink's own title is Danish and is never translated, so it carries
    // its own lang for screen readers.
    await expect(page.locator("h2[lang='da']").first()).toBeVisible();
  });

  test("the language switcher preserves the current page", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("link", { name: /sprog: engelsk/i }).click();
    await expect(page).toHaveURL(/\/en\/?$/);
  });
});

test.describe("theme", () => {
  test("toggles to dark and survives a reload without flashing light", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("html")).not.toHaveClass(/dark/);

    await page.getByRole("button", { name: /skift til mørk eller lys/i }).click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    // The pre-paint script must apply .dark before first paint on reload.
    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);
  });
});

test.describe("accessibility", () => {
  test("the skip link is reachable and targets main", async ({ page }) => {
    await page.goto("/");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /gå til indhold/i });
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute("href", "#main");
  });

  test("the page has exactly one h1 and a labelled field", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveCount(1);

    // The field is the page's purpose, so its label must be programmatic and
    // not merely a placeholder.
    const field = page.getByLabel(FIELD);
    await expect(field).toBeVisible();
    await expect(field).toHaveAttribute("id", "emne-input");
  });

  test("marks the field invalid when the address is rejected", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("https://example.com/x");
    await page.getByRole("button", { name: /vis videoer/i }).click();

    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel(FIELD)).toHaveAttribute("aria-invalid", "true");
  });
});
