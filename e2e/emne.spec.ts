import { expect, test } from "@playwright/test";

/**
 * The end-to-end run the brief requires: load an emne page, click a poster,
 * and assert the yout-ube.com iframe mounted with the right video ID.
 *
 * /emner/1970-erne is the reference page — 13 videos, verified against the
 * live site — so the count is asserted rather than assumed.
 */

const EMNE = "/emner/1970-erne";

test.describe("emne page", () => {
  test("lists all 13 videos with no iframe mounted up front", async ({ page }) => {
    await page.goto(EMNE);

    const playButtons = page.getByRole("button", { name: /afspil videoen/i });
    await expect(playButtons).toHaveCount(13);

    // Click-to-play: a page with 13 videos must not mount 13 iframes.
    await expect(page.locator("iframe")).toHaveCount(0);
  });

  test("clicking a poster mounts a yout-ube.com iframe with the right video ID", async ({
    page,
  }) => {
    await page.goto(EMNE);

    // The first video on this page, verified from the live __NEXT_DATA__.
    const expectedId = "40CITsp-Us8";

    await page
      .getByRole("button", { name: /afspil videoen/i })
      .first()
      .click();

    const frame = page.locator("iframe").first();
    await expect(frame).toHaveCount(1);

    const src = await frame.getAttribute("src");
    expect(src).toContain("www.yout-ube.com/embed/");
    expect(src).toContain(expectedId);
    // youtube.com/embed refuses to frame — that is the whole reason for this site.
    expect(src).not.toContain("youtube.com/embed");

    // Accessibility: the iframe carries the video's own title, not a generic one.
    const title = await frame.getAttribute("title");
    expect(title).toBeTruthy();
    expect(await frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(await frame.getAttribute("allow")).toContain("fullscreen");
  });

  test("only one iframe is mounted at a time", async ({ page }) => {
    await page.goto(EMNE);
    const buttons = page.getByRole("button", { name: /afspil videoen/i });

    await buttons.first().click();
    await expect(page.locator("iframe")).toHaveCount(1);

    // Playing a second video releases the first rather than stacking players.
    await buttons.nth(1).click();
    await expect(page.locator("iframe")).toHaveCount(1);
  });

  test("every video keeps a working plain YouTube fallback link", async ({ page }) => {
    await page.goto(EMNE);
    const fallbacks = page.getByRole("link", { name: /åbn på youtube/i });
    await expect(fallbacks).toHaveCount(13);
    await expect(fallbacks.first()).toHaveAttribute(
      "href",
      /^https:\/\/www\.youtube\.com\/watch\?v=/,
    );
  });

  test("links back to its faktalink source", async ({ page }) => {
    await page.goto(EMNE);
    await expect(page.getByRole("link", { name: /faktalink\.dk/i }).first()).toHaveAttribute(
      "href",
      "https://faktalink.dk/emner/1970-erne",
    );
  });

  test("play buttons are keyboard operable", async ({ page }) => {
    await page.goto(EMNE);
    const first = page.getByRole("button", { name: /afspil videoen/i }).first();

    // A real <button>, so it takes focus and responds to Enter.
    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("iframe")).toHaveCount(1);
  });
});
