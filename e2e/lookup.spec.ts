import { expect, test } from "@playwright/test";

/**
 * The lookup flow: submit an address, get that page's videos.
 *
 * Every test here drives the real static build. Lookups resolve against the
 * committed snapshot served from our own origin, so these run without reaching
 * faktalink.dk — the live fallback is exercised separately in `live.spec.ts`,
 * where the network is deliberately blocked.
 *
 * /emner/1970-erne is the reference page: 13 videos, verified against the live
 * site, so counts are asserted rather than assumed.
 */

const FIELD = /adresse eller emnenavn/i;
const SUBMIT = /vis videoer/i;
const PLAY = /afspil videoen/i;

test.describe("address field", () => {
  test("resolves a bare slug", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(13);
    await expect(page.getByRole("heading", { name: /1970'erne/i })).toBeVisible();
  });

  test("stays on one page rather than navigating", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("den-kolde-krig");
    await page.getByRole("button", { name: SUBMIT }).click();
    await expect(page.getByRole("button", { name: PLAY }).first()).toBeVisible();

    // The whole point of the refactor: results appear in place.
    expect(new URL(page.url()).pathname).toBe("/");
  });

  test("strips a pasted full URL down to the slug", async ({ page }) => {
    await page.goto("/");
    const field = page.getByLabel(FIELD);

    // Paste rather than fill: the normalisation runs on the paste event, and
    // pasting the full address is the single most common action on this page.
    await field.focus();
    await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>("#emne-input");
      if (input === null) throw new Error("field not found");
      const data = new DataTransfer();
      data.setData("text", "https://faktalink.dk/emner/1970-erne");
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });

    // The field shows a prefix, so it must hold the slug alone — never the
    // whole address pasted after the prefix already on screen.
    await expect(field).toHaveValue("1970-erne");

    await page.getByRole("button", { name: SUBMIT }).click();
    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(13);
  });

  test("accepts a full URL typed in full", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("https://faktalink.dk/emner/1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(13);
  });

  test("starts typing from a click on the prefix, with the caret at the end", async ({
    page,
  }) => {
    await page.goto("/");
    const field = page.getByLabel(FIELD);
    await field.fill("1970");

    // The prefix is inside the box, so a click on it means "type here".
    await page.locator(".lookup-prefix").click();
    await expect(field).toBeFocused();

    await page.keyboard.type("-erne");
    // Appended, not prepended: the caret follows what is already there.
    await expect(field).toHaveValue("1970-erne");

    await page.getByRole("button", { name: SUBMIT }).click();
    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(13);
  });

  test("starts typing from a click on the field's padding", async ({ page }) => {
    await page.goto("/");

    // The corner of the box, well clear of the input element itself.
    await page.locator(".lookup-field").click({ position: { x: 4, y: 4 } });

    await expect(page.getByLabel(FIELD)).toBeFocused();
    await page.keyboard.type("1970-erne");
    await expect(page.getByLabel(FIELD)).toHaveValue("1970-erne");
  });

  test("submits on Enter", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.keyboard.press("Enter");

    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(13);
  });

  test("clears the field and the results", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();
    await expect(page.getByRole("button", { name: PLAY }).first()).toBeVisible();

    await page.getByRole("button", { name: /ryd feltet/i }).click();
    await expect(page.getByLabel(FIELD)).toHaveValue("");
    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(0);
  });

  test("editing mid-flight frees the button and drops the stale answer", async ({
    page,
    context,
  }) => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await context.route("**/videoer/1970-erne.json", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();

    // Spotting your own typo must not cost you the wait: correcting the field
    // has to re-enable the button straight away, not after every proxy has
    // timed out.
    await page.getByLabel(FIELD).fill("den-kolde-krig");
    await expect(page.getByRole("button", { name: SUBMIT })).toBeEnabled();

    release?.();

    // The answer to the abandoned address must not arrive against the new one.
    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /1970'erne/i })).toHaveCount(0);

    // And the corrected address still works.
    await page.getByRole("button", { name: SUBMIT }).click();
    await expect(page.getByRole("button", { name: PLAY }).first()).toBeVisible();
  });

  test("pasting over a pending lookup drops it too", async ({ page, context }) => {
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await context.route("**/videoer/1970-erne.json", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();

    // Paste takes its own route: onPaste calls preventDefault and assigns the
    // value directly, so no input event follows and this path has to abandon
    // the pending lookup itself.
    await page.evaluate(async () => {
      const input = document.querySelector<HTMLInputElement>("#emne-input");
      if (input === null) throw new Error("field not found");
      const data = new DataTransfer();
      data.setData("text", "https://faktalink.dk/emner/den-kolde-krig");
      input.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true }));
    });

    await expect(page.getByLabel(FIELD)).toHaveValue("den-kolde-krig");
    await expect(page.getByRole("button", { name: SUBMIT })).toBeEnabled();

    release?.();

    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(0);
    await expect(page.getByRole("heading", { name: /1970'erne/i })).toHaveCount(0);
  });

  test("a lookup abandoned mid-flight cannot repopulate the cleared field", async ({
    page,
    context,
  }) => {
    // Held open, then released, so the clear lands strictly between the
    // request and its answer. A snapshot miss can idle for the better part of
    // a minute in the wild; this reproduces that window deterministically.
    let release: (() => void) | undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });

    await context.route("**/videoer/1970-erne.json", async (route) => {
      await held;
      await route.continue();
    });

    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();

    await page.getByRole("button", { name: /ryd feltet/i }).click();
    await expect(page.getByLabel(FIELD)).toHaveValue("");

    release?.();

    // The withdrawn question must stay withdrawn: no videos, no error, and a
    // submit button the reader can use again immediately.
    await expect(page.getByRole("button", { name: SUBMIT })).toBeEnabled();
    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(0);
    await expect(page.getByRole("alert")).toHaveCount(0);
    await expect(page.getByLabel(FIELD)).toHaveValue("");
  });
});

test.describe("errors name the actual problem", () => {
  test("a non-faktalink host", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("https://example.com/emner/x");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("alert")).toContainText(/ikke på faktalink\.dk/i);
  });

  test("a faktalink URL that is not a topic page", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("https://faktalink.dk/temaer/klima");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("alert")).toContainText(/ikke på en emneside/i);
  });

  test("free text that is neither an address nor a slug", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("den kolde krig");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("alert")).toContainText(/hverken en adresse/i);
  });

  test("an empty field", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("alert")).toContainText(/skriv en adresse/i);
  });
});

test.describe("results", () => {
  test("links back to the faktalink source page", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(
      page.getByRole("link", { name: /åbn siden på faktalink\.dk/i }),
    ).toHaveAttribute("href", "https://faktalink.dk/emner/1970-erne");
  });

  test("mounts no iframe before a video is played", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel(FIELD).fill("1970-erne");
    await page.getByRole("button", { name: SUBMIT }).click();
    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(13);

    await expect(page.locator("iframe")).toHaveCount(0);
  });
});
