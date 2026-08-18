import { describe, expect, test } from "bun:test";
import { buildEmbedUrl, buildFaktalinkUrl, buildPosterUrl, buildWatchUrl } from "./urls";

describe("buildEmbedUrl", () => {
  test("targets the www yout-ube.com host directly, skipping the 301", () => {
    // The apex 301-redirects to www; linking www means users never eat the hop.
    expect(buildEmbedUrl("3nMDjKtTigQ")).toStartWith(
      "https://www.yout-ube.com/embed/3nMDjKtTigQ",
    );
  });

  test("never points at youtube.com/embed, which refuses to frame", () => {
    expect(buildEmbedUrl("3nMDjKtTigQ")).not.toContain("youtube.com/embed");
  });

  test("carries the start offset when the source URL had a timestamp", () => {
    expect(buildEmbedUrl("i7oNZrpUEbs", "youtube", 2)).toContain("start=2");
  });

  test("omits start for null, undefined and zero", () => {
    expect(buildEmbedUrl("i7oNZrpUEbs", "youtube", null)).not.toContain("start=");
    expect(buildEmbedUrl("i7oNZrpUEbs")).not.toContain("start=");
    expect(buildEmbedUrl("i7oNZrpUEbs", "youtube", 0)).not.toContain("start=");
  });

  test("builds a Vimeo player URL with the offset as a media fragment", () => {
    expect(buildEmbedUrl("236730636", "vimeo")).toStartWith(
      "https://player.vimeo.com/video/236730636",
    );
    // Vimeo takes the offset as #t=, not as a query parameter.
    expect(buildEmbedUrl("236730636", "vimeo", 90)).toEndWith("#t=90s");
  });
});

describe("buildWatchUrl", () => {
  test("builds the canonical fallback link", () => {
    expect(buildWatchUrl("3nMDjKtTigQ")).toBe("https://www.youtube.com/watch?v=3nMDjKtTigQ");
  });

  test("appends the timestamp in YouTube's own format", () => {
    expect(buildWatchUrl("i7oNZrpUEbs", "youtube", 2)).toBe(
      "https://www.youtube.com/watch?v=i7oNZrpUEbs&t=2s",
    );
  });

  test("builds a canonical Vimeo link", () => {
    expect(buildWatchUrl("236730636", "vimeo")).toBe("https://vimeo.com/236730636");
  });
});

describe("buildPosterUrl", () => {
  test("uses hqdefault, which exists for every video", () => {
    expect(buildPosterUrl("3nMDjKtTigQ")).toBe(
      "https://i.ytimg.com/vi/3nMDjKtTigQ/hqdefault.jpg",
    );
  });

  test("returns null for Vimeo, which has no deterministic thumbnail URL", () => {
    // The UI draws its own placeholder rather than requesting a broken image.
    expect(buildPosterUrl("236730636", "vimeo")).toBeNull();
  });
});

describe("buildFaktalinkUrl", () => {
  test("links an emne back to its source page", () => {
    expect(buildFaktalinkUrl("1970-erne")).toBe("https://faktalink.dk/emner/1970-erne");
  });
});
