import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/** Home resolution, browse filtering, the paste fallback, i18n and theming. */

test.describe("home page", () => {
  test("resolves a full faktalink URL to its emne page", async ({ page }) => {
    await page.goto("/");
    await page
      .getByLabel(/adresse eller emnenavn/i)
      .fill("https://faktalink.dk/emner/1970-erne");
    await page.getByRole("button", { name: /vis videoer/i }).click();

    await page.waitForURL(/\/emner\/1970-erne/);
    await expect(page.getByRole("button", { name: /afspil videoen/i })).toHaveCount(13);
  });

  test("resolves a bare slug", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/adresse eller emnenavn/i).fill("den-kolde-krig");
    await page.getByRole("button", { name: /vis videoer/i }).click();

    await page.waitForURL(/\/emner\/den-kolde-krig/);
    await expect(page.getByRole("button", { name: /afspil videoen/i })).toHaveCount(1);
  });

  test("names the specific problem for a non-faktalink URL", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/adresse eller emnenavn/i).fill("https://example.com/emner/x");
    await page.getByRole("button", { name: /vis videoer/i }).click();

    await expect(page.getByRole("alert")).toContainText(/ikke på faktalink\.dk/i);
  });

  test("offers the paste fallback when a slug is not in the index", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(/adresse eller emnenavn/i).fill("et-emne-der-ikke-findes");
    await page.getByRole("button", { name: /vis videoer/i }).click();

    const alert = page.getByRole("alert");
    await expect(alert).toContainText(/findes ikke i registeret/i);
    await expect(alert.getByRole("link", { name: /indsæt sidekode/i })).toBeVisible();
  });
});

test.describe("browse", () => {
  test("filters the index client-side", async ({ page }) => {
    await page.goto("/emner");
    const rows = page.locator("main ul li");
    const total = await rows.count();
    expect(total).toBeGreaterThan(400);

    await page.getByLabel(/søg blandt emner/i).fill("kolde krig");
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText(/den kolde krig/i);
  });

  test("folds Danish characters so 'dodshjaelp' finds 'dødshjælp'", async ({ page }) => {
    await page.goto("/emner");
    await page.getByLabel(/søg blandt emner/i).fill("dodshjaelp");
    await expect(page.locator("main ul li")).toHaveCount(1);
  });

  test("shows a real empty state, not a blank list", async ({ page }) => {
    await page.goto("/emner");
    await page.getByLabel(/søg blandt emner/i).fill("zzzzzzzz");
    await expect(page.getByText(/ingen emner passer til søgningen/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /ryd søgning/i })).toBeVisible();
  });
});

test.describe("paste-HTML fallback", () => {
  test("extracts the same 13 videos from pasted source, with no network", async ({
    page,
    context,
  }) => {
    // Prove it is genuinely offline: block every external request first.
    await context.route(/^https?:\/\/(?!localhost)/, (route) => route.abort());

    // Read with node:fs rather than Bun.file so the spec runs under either runtime.
    const source = readFileSync(".cache/faktalink/1970-erne.html", "utf8");

    await page.goto("/indsaet");
    await page.getByLabel(/sidens kildekode/i).fill(source);
    await page.getByRole("button", { name: /find videoer/i }).click();

    // The same extractor the crawler uses, so the same 13 videos.
    await expect(page.getByRole("button", { name: /afspil videoen/i })).toHaveCount(13);
  });

  test("explains what to do when the paste is not page source", async ({ page }) => {
    await page.goto("/indsaet");
    await page.getByLabel(/sidens kildekode/i).fill("<html><body>ingen data</body></html>");
    await page.getByRole("button", { name: /find videoer/i }).click();

    await expect(page.getByText(/kunne ikke læses/i)).toBeVisible();
  });
});

test.describe("i18n", () => {
  test("serves Danish at the root and English under /en", async ({ page }) => {
    await page.goto("/emner/1970-erne");
    await expect(page.locator("html")).toHaveAttribute("lang", "da-DK");

    await page.goto("/en/emner/1970-erne");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
  });

  test("marks Danish source content inside the English page", async ({ page }) => {
    await page.goto("/en/emner/1970-erne");
    // The emne title is faktalink's own Danish text and is never translated.
    await expect(page.locator("h1[lang='da']")).toBeVisible();
  });

  test("the language switcher preserves the current route", async ({ page }) => {
    await page.goto("/emner/1970-erne");
    await page.getByRole("link", { name: /sprog: engelsk/i }).click();
    await expect(page).toHaveURL(/\/en\/emner\/1970-erne/);
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
    await page.goto("/emner/1970-erne");
    await page.keyboard.press("Tab");
    const skip = page.getByRole("link", { name: /gå til indhold/i });
    await expect(skip).toBeFocused();
    await expect(skip).toHaveAttribute("href", "#main");
  });

  test("an emne page has exactly one h1", async ({ page }) => {
    await page.goto("/emner/1970-erne");
    await expect(page.locator("h1")).toHaveCount(1);
  });
});
