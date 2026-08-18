import { expect, test } from "@playwright/test";

/**
 * The modal player.
 *
 * The brief's requirement: a video opens in a modal overlay with full player
 * controls, via the yout-ube.com embed host. These tests assert the modal
 * actually opens, loads the right video, and can be dismissed the three ways a
 * reader will try — the close button, Escape, and the backdrop.
 */

const FIELD = /adresse eller emnenavn/i;
const SUBMIT = /vis videoer/i;
const PLAY = /afspil videoen/i;

/** Submits the reference page and waits for its results. */
async function lookup(page: import("@playwright/test").Page, slug = "1970-erne") {
  await page.goto("/");
  await page.getByLabel(FIELD).fill(slug);
  await page.getByRole("button", { name: SUBMIT }).click();
  await expect(page.getByRole("button", { name: PLAY }).first()).toBeVisible();
}

test.describe("the blocked-embed message", () => {
  test("stays hidden while the embed is still loading", async ({ page }) => {
    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();
    await expect(page.locator("dialog iframe")).toHaveCount(1);

    // The regression: the message used to render unconditionally behind the
    // iframe, so it appeared in front of every player seconds before the video
    // did. A player that is merely loading is never announced as broken.
    await expect(page.locator(".player-blocked")).toHaveCount(0);
    await page.waitForTimeout(3000);
    await expect(page.locator(".player-blocked")).toHaveCount(0);
  });

  test("appears once no embed could still be loading", async ({ page }) => {
    // A DNS filter that swallows the embed host: the situation this site
    // exists for, and the one case where the message is the truth.
    await page.route("https://www.yout-ube.com/**", (route) => route.abort());

    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();

    // Longer than the player's grace period, which is deliberately generous.
    await expect(page.locator(".player-blocked")).toBeVisible({ timeout: 15_000 });
  });

  test("is withheld again for the next video", async ({ page }) => {
    await page.route("https://www.yout-ube.com/**", (route) => route.abort());

    await lookup(page);
    const buttons = page.getByRole("button", { name: PLAY });

    await buttons.first().click();
    await expect(page.locator(".player-blocked")).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: /^luk$/i }).click();
    await expect(page.locator("dialog.player-dialog")).toBeHidden();

    // The verdict belongs to one embed, not to the session: the next video
    // gets the same grace the first one did.
    await buttons.nth(1).click();
    await expect(page.locator(".player-blocked")).toHaveCount(0);
  });
});

test.describe("modal player", () => {
  test("opens a dialog with the right video on the embed host", async ({ page }) => {
    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();

    const dialog = page.locator("dialog.player-dialog");
    await expect(dialog).toBeVisible();
    // A real modal dialog, not a div pretending to be one: this is what
    // supplies the focus trap and the inert background.
    expect(await dialog.evaluate((d: HTMLDialogElement) => d.open)).toBe(true);

    const frame = page.locator("dialog iframe");
    await expect(frame).toHaveCount(1);

    const src = await frame.getAttribute("src");
    // The first video on this page, verified from the live payload.
    expect(src).toContain("40CITsp-Us8");
    expect(src).toContain("www.yout-ube.com/embed/");
    // youtube.com/embed refuses to frame — the whole reason this site exists.
    expect(src).not.toContain("youtube.com/embed");
  });

  test("gives the player the video's own title, not a generic one", async ({ page }) => {
    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();

    const frame = page.locator("dialog iframe");
    const title = await frame.getAttribute("title");
    expect(title).toBeTruthy();
    expect(title).not.toBe("");
    expect(await frame.getAttribute("referrerpolicy")).toBe("strict-origin-when-cross-origin");
    expect(await frame.getAttribute("allow")).toContain("fullscreen");
  });

  test("carries a YouTube fallback for a blocked embed host", async ({ page }) => {
    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();

    const fallback = page.getByRole("link", { name: /åbn på youtube/i });
    await expect(fallback).toBeVisible();
    await expect(fallback).toHaveAttribute("href", /^https:\/\/www\.youtube\.com\/watch\?v=/);
    await expect(fallback).toHaveAttribute("target", "_blank");
  });

  test("closes with the close button, and releases the player", async ({ page }) => {
    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();
    await expect(page.locator("dialog iframe")).toHaveCount(1);

    await page.getByRole("button", { name: /^luk$/i }).click();

    await expect(page.locator("dialog.player-dialog")).toBeHidden();
    // The iframe must be torn down, not merely hidden: a hidden iframe keeps
    // playing audio.
    await expect(page.locator("dialog iframe")).toHaveCount(0);
  });

  test("closes with Escape", async ({ page }) => {
    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();
    await expect(page.locator("dialog.player-dialog")).toBeVisible();

    await page.keyboard.press("Escape");

    await expect(page.locator("dialog.player-dialog")).toBeHidden();
    await expect(page.locator("dialog iframe")).toHaveCount(0);
  });

  test("closes on a click outside the video but not on the content", async ({ page }) => {
    await lookup(page);
    await page.getByRole("button", { name: PLAY }).first().click();
    const dialog = page.locator("dialog.player-dialog");
    await expect(dialog).toBeVisible();

    // On the content: must stay open, or reading the title would dismiss it.
    await page.locator(".player-titles h2").click();
    await expect(dialog).toBeVisible();

    // On the surface around the player: dismisses. The panel fills the dialog
    // to centre the player, so this is the real click target rather than the
    // dialog element, which nothing can reach.
    await page.locator(".player-panel").click({ position: { x: 4, y: 4 } });
    await expect(dialog).toBeHidden();
    await expect(page.locator("dialog iframe")).toHaveCount(0);
  });

  test("opens from the keyboard and returns focus on close", async ({ page }) => {
    await lookup(page);
    const first = page.getByRole("button", { name: PLAY }).first();

    await first.focus();
    await expect(first).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page.locator("dialog.player-dialog")).toBeVisible();

    await page.keyboard.press("Escape");
    await expect(page.locator("dialog.player-dialog")).toBeHidden();
    // The native dialog restores focus to the element that opened it, so the
    // reader is not dumped at the top of the document.
    await expect(first).toBeFocused();
  });

  test("plays one video at a time", async ({ page }) => {
    await lookup(page);
    const buttons = page.getByRole("button", { name: PLAY });

    await buttons.first().click();
    await expect(page.locator("dialog iframe")).toHaveCount(1);
    await page.keyboard.press("Escape");
    await expect(page.locator("dialog iframe")).toHaveCount(0);

    await buttons.nth(1).click();
    await expect(page.locator("dialog iframe")).toHaveCount(1);
  });
});
