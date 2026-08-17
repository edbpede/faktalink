import { describe, expect, test } from "bun:test";
import {
  collectVideosFromJson,
  extractFromHtml,
  parseStartSeconds,
  parseVideoUrl,
  scanTextForVideos,
} from "./extract";

/**
 * Fixtures mirror the real faktalink.dk payload shape, verified against the live
 * site and against 505 cached pages: videos are duplicated across
 * `subject.content` and `subject.pages[].sections[].content`, the same video is
 * published under several URL spellings, and video links also appear as
 * `ComponentSharedRecommendedLink` entries in the "Baggrundskilder" section.
 *
 * The extractor is pattern-based on purpose, so these tests assert on observable
 * extraction behaviour — never on a component name or a JSON path.
 */

function video(id: string, url: string, title?: string | null, description?: string | null) {
  return {
    __typename: "ComponentSharedVideo" as const,
    id,
    url,
    optionalTitle: title ?? null,
    description: description ?? null,
  };
}

function nextData(options: {
  title?: string | null;
  slug?: string | null;
  content?: unknown[];
  sections?: unknown[][];
}) {
  return {
    props: {
      pageProps: {
        subject: {
          title: options.title ?? "Et emne",
          slug: options.slug ?? "et-emne",
          content: options.content ?? [],
          pages: (options.sections ?? []).map((content, index) => ({
            id: String(index),
            sections: [{ id: `s${index}`, content }],
          })),
        },
      },
    },
  };
}

function htmlWith(payload: unknown, attrs = 'id="__NEXT_DATA__" type="application/json"') {
  return `<!DOCTYPE html><html><head><title>x</title></head><body><div id="__next"></div><script ${attrs}>${JSON.stringify(payload)}</script></body></html>`;
}

describe("parseVideoUrl", () => {
  test("reads the ID from every YouTube spelling faktalink publishes", () => {
    const cases = [
      "https://youtu.be/3nMDjKtTigQ",
      "https://www.youtube.com/watch?v=3nMDjKtTigQ",
      "https://www.youtube.com/embed/3nMDjKtTigQ",
      "https://www.youtube.com/shorts/3nMDjKtTigQ",
      "https://www.youtube.com/live/3nMDjKtTigQ",
      "https://www.youtube-nocookie.com/embed/3nMDjKtTigQ",
      "https://m.youtube.com/watch?v=3nMDjKtTigQ",
      "youtu.be/3nMDjKtTigQ",
      "//youtu.be/3nMDjKtTigQ",
    ];
    for (const url of cases) {
      expect(parseVideoUrl(url)).toMatchObject({ id: "3nMDjKtTigQ", provider: "youtube" });
    }
  });

  test("reads Vimeo IDs from the canonical and player hosts", () => {
    // Nine real Vimeo videos across eight pages; they must not be skipped.
    expect(parseVideoUrl("https://vimeo.com/236730636")).toMatchObject({
      id: "236730636",
      provider: "vimeo",
    });
    expect(parseVideoUrl("https://player.vimeo.com/video/212553694")).toMatchObject({
      id: "212553694",
      provider: "vimeo",
    });
  });

  test("recovers the start offset from ?t=, &t= and start=", () => {
    // `youtu.be/ID?t=214` is published on /emner/enhedslisten.
    expect(parseVideoUrl("https://youtu.be/dgmkuyHKm4A?t=214")?.startSeconds).toBe(214);
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=i7oNZrpUEbs&t=2s")?.startSeconds,
    ).toBe(2);
    expect(
      parseVideoUrl("https://www.youtube.com/watch?v=i7oNZrpUEbs&start=90")?.startSeconds,
    ).toBe(90);
  });

  test("keeps the video when a stray & joins the offset to the path", () => {
    // Hand-entered CMS data produces `youtu.be/ID&t=90`, which has no query
    // string at all. Losing the whole video over that would be a bad trade.
    const ref = parseVideoUrl("https://youtu.be/3nMDjKtTigQ&t=90");
    expect(ref).toMatchObject({ id: "3nMDjKtTigQ", provider: "youtube", startSeconds: 90 });
  });

  test("rejects non-video URLs, malformed input and wrong-length IDs", () => {
    expect(parseVideoUrl("https://faktalink.dk/emner/1970-erne")).toBeNull();
    expect(parseVideoUrl("https://www.dr.dk/nyheder/udland/brexit")).toBeNull();
    expect(parseVideoUrl("https://bibliotek.dk/linkme?em=brexit")).toBeNull();
    expect(parseVideoUrl("https://youtu.be/tooshort")).toBeNull();
    expect(parseVideoUrl("https://youtu.be/waaaaaaaaytoolong")).toBeNull();
    expect(parseVideoUrl("not a url at all")).toBeNull();
    expect(parseVideoUrl("")).toBeNull();
    expect(parseVideoUrl(null)).toBeNull();
    expect(parseVideoUrl(undefined)).toBeNull();
  });
});

describe("parseStartSeconds", () => {
  test("parses bare seconds and compound durations", () => {
    expect(parseStartSeconds("90")).toBe(90);
    expect(parseStartSeconds("2s")).toBe(2);
    expect(parseStartSeconds("1m30s")).toBe(90);
    expect(parseStartSeconds("1h2m10s")).toBe(3730);
  });

  test("returns null for absent, zero and unparseable values", () => {
    expect(parseStartSeconds(null)).toBeNull();
    expect(parseStartSeconds("")).toBeNull();
    expect(parseStartSeconds("0")).toBeNull();
    expect(parseStartSeconds("banan")).toBeNull();
  });
});

describe("scanTextForVideos", () => {
  test("finds videos in markup with no JSON payload whatsoever", () => {
    const html = `
      <iframe src="https://www.youtube.com/embed/3nMDjKtTigQ?rel=0"></iframe>
      <iframe src="//player.vimeo.com/video/236730636"></iframe>
      <a href="https://youtu.be/OHZ3Qww9kIY">Se klippet</a>`;
    expect(scanTextForVideos(html).map((v) => v.id)).toEqual([
      "3nMDjKtTigQ",
      "236730636",
      "OHZ3Qww9kIY",
    ]);
  });

  test("sees through JSON escaping and HTML entities", () => {
    // Embedded JSON writes `\/`; attributes write `&amp;`. Both must still match.
    const escaped = String.raw`{"url":"https:\/\/youtu.be\/3nMDjKtTigQ"}`;
    expect(scanTextForVideos(escaped).map((v) => v.id)).toEqual(["3nMDjKtTigQ"]);

    const entity = '<a href="https://www.youtube.com/watch?v=i7oNZrpUEbs&amp;t=2s">x</a>';
    expect(scanTextForVideos(entity)[0]).toMatchObject({ id: "i7oNZrpUEbs", startSeconds: 2 });
  });

  test("stops at trailing prose punctuation", () => {
    const prose = "Se videoen på https://youtu.be/3nMDjKtTigQ.";
    expect(scanTextForVideos(prose).map((v) => v.id)).toEqual(["3nMDjKtTigQ"]);
  });

  test("deduplicates across spellings and returns nothing for a video-free page", () => {
    const mixed = `
      https://youtu.be/i7oNZrpUEbs
      https://www.youtube.com/watch?v=i7oNZrpUEbs
      https://www.youtube.com/watch?v=i7oNZrpUEbs&t=2s`;
    expect(scanTextForVideos(mixed)).toHaveLength(1);
    expect(scanTextForVideos("<p>Ingen video her</p>")).toEqual([]);
  });
});

describe("collectVideosFromJson", () => {
  test("keeps the editor's title and description from the node holding the URL", () => {
    const videos = collectVideosFromJson(
      nextData({
        content: [
          video(
            "9768",
            "https://youtu.be/3nMDjKtTigQ",
            "Se Joseph Stalins sidste offentlige tale.",
            "Med engelske undertekster.",
          ),
        ],
      }),
    );
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      id: "3nMDjKtTigQ",
      title: "Se Joseph Stalins sidste offentlige tale.",
      description: "Med engelske undertekster.",
      sourceUrl: "https://youtu.be/3nMDjKtTigQ",
    });
  });

  test("finds videos regardless of component name, key name or depth", () => {
    // The resilience contract: no `__typename` and no fixed path is required.
    const videos = collectVideosFromJson({
      a: {
        b: [
          { c: { __typename: "SomethingRenamedInV2", link: "https://youtu.be/3nMDjKtTigQ" } },
        ],
      },
      d: { embedUrl: "https://vimeo.com/236730636" },
    });
    expect(videos.map((v) => v.id).sort()).toEqual(["236730636", "3nMDjKtTigQ"]);
  });

  test("reads recommended source links, which carry real videos too", () => {
    // ComponentSharedRecommendedLink in "Baggrundskilder" holds playable videos
    // the old typename-scoped parser missed; non-video links stay excluded.
    const videos = collectVideosFromJson({
      links: [
        {
          __typename: "ComponentSharedRecommendedLink",
          title: "Brexit 101: The U.K.'s EU Referendum Explained",
          origin: "Wall Street Journal, 03-06-2016",
          link: "https://www.youtube.com/watch?v=JirBvgI8JXA",
        },
        {
          __typename: "ComponentSharedRecommendedLink",
          title: "Brexit",
          origin: "DR.dk",
          link: "https://www.dr.dk/nyheder/udland/brexit",
        },
      ],
    });
    expect(videos).toHaveLength(1);
    expect(videos[0]).toMatchObject({
      id: "JirBvgI8JXA",
      title: "Brexit 101: The U.K.'s EU Referendum Explained",
    });
  });

  test("survives malformed input without throwing", () => {
    expect(collectVideosFromJson(null)).toEqual([]);
    expect(collectVideosFromJson("nope")).toEqual([]);
    expect(collectVideosFromJson({})).toEqual([]);
  });
});

describe("extractFromHtml", () => {
  test("reads title, slug and videos from a real payload shape", () => {
    const result = extractFromHtml(
      htmlWith(
        nextData({
          title: "1970'erne",
          slug: "1970-erne",
          content: [video("1", "https://youtu.be/3nMDjKtTigQ", "Stalins tale")],
        }),
      ),
    );
    expect(result.title).toBe("1970'erne");
    expect(result.slug).toBe("1970-erne");
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.title).toBe("Stalins tale");
  });

  test("collapses the payload's duplication into one entry per video", () => {
    // Every video appears in both trees under different spellings: a page whose
    // walk finds 10 nodes must yield 5 videos.
    const a = video("1", "https://youtu.be/3nMDjKtTigQ", "Stalins tale");
    const b = video("2", "https://youtu.be/OHZ3Qww9kIY", "Anden video");
    const result = extractFromHtml(
      htmlWith(
        nextData({
          content: [a, b],
          sections: [[video("3", "https://www.youtube.com/watch?v=3nMDjKtTigQ"), b]],
        }),
      ),
    );
    expect(result.videos.map((v) => v.id)).toEqual(["3nMDjKtTigQ", "OHZ3Qww9kIY"]);
  });

  test("first occurrence wins, later copies fill only what is missing", () => {
    const result = extractFromHtml(
      htmlWith(
        nextData({
          content: [
            video("1", "https://youtu.be/3nMDjKtTigQ", "Første titel", null),
            video(
              "2",
              "https://www.youtube.com/watch?v=3nMDjKtTigQ",
              "Anden titel",
              "En beskrivelse",
            ),
          ],
        }),
      ),
    );
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.title).toBe("Første titel");
    expect(result.videos[0]?.description).toBe("En beskrivelse");
  });

  test("keeps working when the CMS renames its video component", () => {
    // Verified against the live page: renaming ComponentSharedVideo to anything
    // else must not change the result.
    const payload = JSON.stringify(
      nextData({ content: [video("1", "https://youtu.be/3nMDjKtTigQ", "Stalins tale")] }),
    ).replaceAll("ComponentSharedVideo", "VideoBlockV2");
    const result = extractFromHtml(
      `<html><body><script id="__NEXT_DATA__" type="application/json">${payload}</script></body></html>`,
    );
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.title).toBe("Stalins tale");
  });

  test("keeps working when the JSON payload disappears entirely", () => {
    // An App Router migration would drop __NEXT_DATA__. The raw pass carries it.
    const plain = `<!doctype html><html><head>
      <title>Rusland op til 1991 | Emner | Faktalink</title>
      <link rel="canonical" href="https://faktalink.dk/emner/rusland-op-til-1991">
      </head><body>
      <iframe src="https://www.youtube.com/embed/3nMDjKtTigQ?rel=0"></iframe>
      <a href="https://youtu.be/OHZ3Qww9kIY">Se klippet</a>
      </body></html>`;
    const result = extractFromHtml(plain);
    expect(result.title).toBe("Rusland op til 1991");
    expect(result.slug).toBe("rusland-op-til-1991");
    expect(result.videos.map((v) => v.id)).toEqual(["3nMDjKtTigQ", "OHZ3Qww9kIY"]);
  });

  test("falls back to og:title when the document title is client-rendered", () => {
    const result = extractFromHtml(
      `<html><head><meta property="og:title" content="Brexit | Emner | Faktalink"></head><body></body></html>`,
    );
    expect(result.title).toBe("Brexit");
  });

  test("returns an empty list instead of throwing on a video-free page", () => {
    // 62 of 505 real pages carry no video. That is a fact to report, not a
    // failure: the UI says so plainly rather than showing a broken result.
    const result = extractFromHtml("<html><body>Ingen video her</body></html>");
    expect(result.videos).toEqual([]);
    expect(result.title).toBeNull();
  });

  test("recovers from a payload that is not valid JSON", () => {
    const broken = `<html><body>
      <script id="__NEXT_DATA__" type="application/json">{ nope </script>
      <iframe src="https://www.youtube.com/embed/3nMDjKtTigQ"></iframe>
      </body></html>`;
    expect(extractFromHtml(broken).videos).toHaveLength(1);
  });
});
