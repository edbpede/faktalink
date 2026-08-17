import { describe, expect, test } from "bun:test";
import {
  extractFromDocument,
  extractFromHtml,
  extractFromNextData,
  extractVideoId,
  findNextDataScript,
  NextDataError,
  parseStartSeconds,
} from "./extract";

/**
 * Fixtures mirror the real faktalink.dk payload shape, verified against the
 * live site: videos are duplicated across `subject.content` and
 * `subject.pages[].sections[].content`, and the same video is published under
 * several different URL spellings.
 */

interface VideoNode {
  __typename: "ComponentSharedVideo";
  id: string;
  url: string;
  optionalTitle?: string | null;
  description?: string | null;
}

function video(id: string, url: string, title?: string | null, description?: string | null) {
  return {
    __typename: "ComponentSharedVideo" as const,
    id,
    url,
    optionalTitle: title ?? null,
    description: description ?? null,
  };
}

/** Builds a payload with the real nesting: top-level content plus page sections. */
function nextData(options: {
  title?: string | null;
  slug?: string | null;
  content?: VideoNode[];
  sections?: VideoNode[][];
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

describe("extractVideoId", () => {
  test("reads the ID from a youtu.be short link", () => {
    expect(extractVideoId("https://youtu.be/3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
  });

  test("reads the ID from a watch?v= link", () => {
    expect(extractVideoId("https://www.youtube.com/watch?v=i7oNZrpUEbs")).toBe("i7oNZrpUEbs");
  });

  test("reads the ID from the &t= timestamp form", () => {
    // This exact URL is published on /emner/den-kolde-krig.
    expect(extractVideoId("https://www.youtube.com/watch?v=i7oNZrpUEbs&t=2s")).toBe(
      "i7oNZrpUEbs",
    );
  });

  test("reads the ID from a youtu.be link carrying a timestamp", () => {
    expect(extractVideoId("https://youtu.be/3nMDjKtTigQ?t=90")).toBe("3nMDjKtTigQ");
  });

  test("handles embed, shorts, live and no-cookie hosts", () => {
    expect(extractVideoId("https://www.youtube.com/embed/3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
    expect(extractVideoId("https://www.youtube.com/shorts/3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
    expect(extractVideoId("https://www.youtube.com/live/3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
    expect(extractVideoId("https://www.youtube-nocookie.com/embed/3nMDjKtTigQ")).toBe(
      "3nMDjKtTigQ",
    );
  });

  test("handles m. and music. subdomains and scheme-less input", () => {
    expect(extractVideoId("https://m.youtube.com/watch?v=3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
    expect(extractVideoId("youtu.be/3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
    expect(extractVideoId("//youtu.be/3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
  });

  test("accepts an already-extracted bare ID", () => {
    expect(extractVideoId("3nMDjKtTigQ")).toBe("3nMDjKtTigQ");
  });

  test("rejects non-YouTube, malformed and empty input", () => {
    // Vimeo is in faktalink's schema but unused; it must be skipped, not thrown on.
    expect(extractVideoId("https://vimeo.com/123456789")).toBeNull();
    expect(extractVideoId("https://faktalink.dk/emner/1970-erne")).toBeNull();
    expect(extractVideoId("not a url at all")).toBeNull();
    expect(extractVideoId("")).toBeNull();
    expect(extractVideoId(null)).toBeNull();
    expect(extractVideoId(undefined)).toBeNull();
  });

  test("rejects IDs that are not exactly 11 characters", () => {
    expect(extractVideoId("https://youtu.be/tooshort")).toBeNull();
    expect(extractVideoId("https://youtu.be/waaaaaaaaytoolong")).toBeNull();
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

describe("extractFromNextData", () => {
  test("pulls the page title and slug from props.pageProps.subject", () => {
    const result = extractFromNextData(nextData({ title: "1970'erne", slug: "1970-erne" }));
    expect(result.title).toBe("1970'erne");
    expect(result.slug).toBe("1970-erne");
  });

  test("keeps the editor's title and description", () => {
    const result = extractFromNextData(
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
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.title).toBe("Se Joseph Stalins sidste offentlige tale.");
    expect(result.videos[0]?.description).toBe("Med engelske undertekster.");
    expect(result.videos[0]?.sourceUrl).toBe("https://youtu.be/3nMDjKtTigQ");
  });

  test("records the start offset from the &t= form", () => {
    const result = extractFromNextData(
      nextData({ content: [video("1", "https://www.youtube.com/watch?v=i7oNZrpUEbs&t=2s")] }),
    );
    expect(result.videos[0]?.startSeconds).toBe(2);
  });

  test("leaves startSeconds null when no timestamp is published", () => {
    const result = extractFromNextData(
      nextData({ content: [video("1", "https://youtu.be/3nMDjKtTigQ")] }),
    );
    expect(result.videos[0]?.startSeconds).toBeNull();
  });

  test("deduplicates the same video across content and page sections", () => {
    // The real duplication: every video appears in both trees, so a page whose
    // walk finds 26 nodes must yield 13 videos.
    const a = video("1", "https://youtu.be/3nMDjKtTigQ", "Stalins tale");
    const b = video("2", "https://youtu.be/OHZ3Qww9kIY", "Anden video");
    const result = extractFromNextData(nextData({ content: [a, b], sections: [[a, b]] }));
    expect(result.videos).toHaveLength(2);
    expect(result.videos.map((v) => v.id)).toEqual(["3nMDjKtTigQ", "OHZ3Qww9kIY"]);
  });

  test("deduplicates by video ID, not by raw URL string", () => {
    // The distinction that makes this extractor correct: one video published
    // under three spellings is one video, not three.
    const result = extractFromNextData(
      nextData({
        content: [
          video("1", "https://youtu.be/i7oNZrpUEbs"),
          video("2", "https://www.youtube.com/watch?v=i7oNZrpUEbs"),
          video("3", "https://www.youtube.com/watch?v=i7oNZrpUEbs&t=2s"),
        ],
      }),
    );
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.id).toBe("i7oNZrpUEbs");
  });

  test("first occurrence wins, but later copies fill in missing metadata", () => {
    const result = extractFromNextData(
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
    );
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.title).toBe("Første titel");
    expect(result.videos[0]?.description).toBe("En beskrivelse");
  });

  test("preserves first-seen order", () => {
    const result = extractFromNextData(
      nextData({
        content: [
          video("1", "https://youtu.be/aaaaaaaaaaa"),
          video("2", "https://youtu.be/bbbbbbbbbbb"),
          video("3", "https://youtu.be/ccccccccccc"),
        ],
      }),
    );
    expect(result.videos.map((v) => v.id)).toEqual([
      "aaaaaaaaaaa",
      "bbbbbbbbbbb",
      "ccccccccccc",
    ]);
  });

  test("returns an empty list for a page with zero videos", () => {
    const result = extractFromNextData(nextData({ title: "Uden video", content: [] }));
    expect(result.videos).toEqual([]);
    expect(result.title).toBe("Uden video");
  });

  test("skips video nodes with a missing, empty or non-YouTube url", () => {
    const result = extractFromNextData(
      nextData({
        content: [
          { __typename: "ComponentSharedVideo", id: "1", url: "" } as VideoNode,
          { __typename: "ComponentSharedVideo", id: "2" } as unknown as VideoNode,
          video("3", "https://vimeo.com/123456789"),
          video("4", "https://youtu.be/3nMDjKtTigQ"),
        ],
      }),
    );
    expect(result.videos).toHaveLength(1);
    expect(result.videos[0]?.id).toBe("3nMDjKtTigQ");
  });

  test("ignores components that are not videos", () => {
    const result = extractFromNextData({
      props: {
        pageProps: {
          subject: {
            title: "Blandet",
            content: [
              { __typename: "ComponentSharedRichText", body: "tekst" },
              { __typename: "ComponentSharedImage", url: "https://youtu.be/3nMDjKtTigQ" },
            ],
          },
        },
      },
    });
    expect(result.videos).toEqual([]);
  });

  test("finds videos at any depth, without relying on fixed indices", () => {
    const result = extractFromNextData({
      props: {
        pageProps: {
          subject: {
            title: "Dybt",
            a: { b: { c: [{ d: [video("1", "https://youtu.be/3nMDjKtTigQ")] }] } },
          },
        },
      },
    });
    expect(result.videos).toHaveLength(1);
  });

  test("survives malformed input without throwing", () => {
    expect(extractFromNextData(null).videos).toEqual([]);
    expect(extractFromNextData("nope").videos).toEqual([]);
    expect(extractFromNextData({}).title).toBeNull();
  });
});

describe("findNextDataScript", () => {
  test("finds the payload regardless of attribute order", () => {
    const payload = nextData({ content: [video("1", "https://youtu.be/3nMDjKtTigQ")] });
    const reordered = htmlWith(payload, 'type="application/json" id="__NEXT_DATA__"');
    expect(findNextDataScript(reordered)).not.toBeNull();
  });

  test("returns null when the page has no payload", () => {
    expect(findNextDataScript("<html><body>Ingen data</body></html>")).toBeNull();
  });
});

describe("extractFromHtml", () => {
  test("extracts videos from a raw HTML string", () => {
    const html = htmlWith(
      nextData({
        title: "1970'erne",
        content: [video("1", "https://youtu.be/3nMDjKtTigQ", "Stalins tale")],
        sections: [[video("1", "https://www.youtube.com/watch?v=3nMDjKtTigQ")]],
      }),
    );
    const result = extractFromHtml(html);
    expect(result.title).toBe("1970'erne");
    expect(result.videos).toHaveLength(1);
  });

  test("throws NextDataError when the payload is absent", () => {
    expect(() => extractFromHtml("<html><body>Ingen data</body></html>")).toThrow(
      NextDataError,
    );
  });

  test("throws NextDataError when the payload is not valid JSON", () => {
    const broken = '<script id="__NEXT_DATA__" type="application/json">{ nope </script>';
    expect(() => extractFromHtml(broken)).toThrow(NextDataError);
  });
});

describe("extractFromDocument", () => {
  /** Minimal stand-in for the DOMParser document the browser fallback builds. */
  function fakeDoc(payload: string | null) {
    return {
      getElementById: (id: string) =>
        id === "__NEXT_DATA__" && payload !== null ? { textContent: payload } : null,
    };
  }

  test("produces the same result as the HTML path from the same source", () => {
    const payload = nextData({
      title: "1970'erne",
      content: [
        video("1", "https://youtu.be/3nMDjKtTigQ", "Stalins tale"),
        video("2", "https://www.youtube.com/watch?v=i7oNZrpUEbs&t=2s"),
      ],
      sections: [[video("1", "https://www.youtube.com/watch?v=3nMDjKtTigQ")]],
    });

    const fromHtml = extractFromHtml(htmlWith(payload));
    const fromDoc = extractFromDocument(fakeDoc(JSON.stringify(payload)));

    // Both entry points share one extractor, so results must be identical.
    expect(fromDoc).toEqual(fromHtml);
    expect(fromDoc.videos).toHaveLength(2);
  });

  test("throws a paste-specific NextDataError when the payload is missing", () => {
    expect(() => extractFromDocument(fakeDoc(null))).toThrow(/View Source/);
  });

  test("throws when the script element is present but empty", () => {
    expect(() => extractFromDocument(fakeDoc("   "))).toThrow(NextDataError);
  });
});
