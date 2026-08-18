import { expect, test } from "@playwright/test";

/**
 * The live fallback, for pages published since the last crawl.
 *
 * These tests never touch the real network. The proxy responses are stubbed, so
 * the suite asserts our own behaviour — that a snapshot miss falls through to a
 * live fetch, that the parsed result renders, and that a total failure is
 * reported honestly instead of being dressed up as "no videos".
 */

const FIELD = /adresse eller emnenavn/i;
const SUBMIT = /vis videoer/i;
const PLAY = /afspil videoen/i;

/** A minimal faktalink page carrying two videos, in the shape the site serves. */
const LIVE_PAGE = `<!doctype html><html><head>
<title>Et helt nyt emne | Emner | Faktalink</title>
<link rel="canonical" href="https://faktalink.dk/emner/et-helt-nyt-emne">
</head><body>
<script id="__NEXT_DATA__" type="application/json">
${JSON.stringify({
  props: {
    pageProps: {
      subject: {
        title: "Et helt nyt emne",
        slug: "et-helt-nyt-emne",
        content: [
          {
            __typename: "ComponentSharedVideo",
            url: "https://youtu.be/3nMDjKtTigQ",
            optionalTitle: "Den første video",
            description: "En beskrivelse fra redaktionen.",
          },
          {
            __typename: "ComponentSharedVideo",
            url: "https://www.youtube.com/watch?v=OHZ3Qww9kIY",
            optionalTitle: "Den anden video",
          },
        ],
      },
    },
  },
})}
</script></body></html>`;

test.describe("live fallback", () => {
  test("fetches and renders a page that is not in the snapshot", async ({ page, context }) => {
    // Every CORS proxy the client may try resolves to the same stub, so the
    // test does not depend on which provider is first in the list.
    await context.route(
      /proxy\.cors\.sh|api\.cors\.lol|allorigins\.win|codetabs\.com/,
      (route) => route.fulfill({ status: 200, contentType: "text/html", body: LIVE_PAGE }),
    );

    await page.goto("/");
    await page.getByLabel(FIELD).fill("et-helt-nyt-emne");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("button", { name: PLAY })).toHaveCount(2);
    await expect(page.getByRole("heading", { name: /et helt nyt emne/i })).toBeVisible();

    // The reader is told the result came from the live page rather than the
    // snapshot, so a surprising answer is explainable.
    await expect(page.getByText(/hentet direkte fra faktalink\.dk/i)).toBeVisible();
  });

  test("plays a live-fetched video through the same modal", async ({ page, context }) => {
    await context.route(
      /proxy\.cors\.sh|api\.cors\.lol|allorigins\.win|codetabs\.com/,
      (route) => route.fulfill({ status: 200, contentType: "text/html", body: LIVE_PAGE }),
    );

    await page.goto("/");
    await page.getByLabel(FIELD).fill("et-helt-nyt-emne");
    await page.getByRole("button", { name: SUBMIT }).click();
    await page.getByRole("button", { name: PLAY }).first().click();

    const src = await page.locator("dialog iframe").getAttribute("src");
    expect(src).toContain("www.yout-ube.com/embed/3nMDjKtTigQ");
  });

  test("says the page could not be fetched when every proxy fails", async ({
    page,
    context,
  }) => {
    await context.route(
      /proxy\.cors\.sh|api\.cors\.lol|allorigins\.win|codetabs\.com/,
      (route) => route.abort(),
    );

    await page.goto("/");
    await page.getByLabel(FIELD).fill("et-emne-der-ikke-findes");
    await page.getByRole("button", { name: SUBMIT }).click();

    // Honest about what happened: not "no videos", which would be a claim we
    // cannot support when the page was never reached.
    await expect(page.getByRole("alert")).toContainText(/kunne ikke hentes/i);
  });

  test("reports a real empty page as empty, not as a failure", async ({ page, context }) => {
    const emptyPage = `<!doctype html><html><head>
      <title>Uden video | Emner | Faktalink</title></head>
      <body><p>Denne side har ingen videoklip.</p></body></html>`;

    await context.route(
      /proxy\.cors\.sh|api\.cors\.lol|allorigins\.win|codetabs\.com/,
      (route) => route.fulfill({ status: 200, contentType: "text/html", body: emptyPage }),
    );

    await page.goto("/");
    await page.getByLabel(FIELD).fill("en-side-uden-video");
    await page.getByRole("button", { name: SUBMIT }).click();

    await expect(page.getByRole("alert")).toContainText(/ingen videoer/i);
  });
});
