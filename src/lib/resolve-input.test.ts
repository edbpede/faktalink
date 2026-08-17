import { describe, expect, test } from "bun:test";
import { resolveEmneInput } from "./resolve-input";

describe("resolveEmneInput", () => {
  test("resolves a full faktalink emne URL", () => {
    expect(resolveEmneInput("https://faktalink.dk/emner/1970-erne")).toEqual({
      ok: true,
      slug: "1970-erne",
    });
  });

  test("resolves the www host, a trailing slash, and query or hash noise", () => {
    expect(resolveEmneInput("https://www.faktalink.dk/emner/1970-erne/")).toEqual({
      ok: true,
      slug: "1970-erne",
    });
    expect(resolveEmneInput("https://faktalink.dk/emner/1970-erne?ref=x#top")).toEqual({
      ok: true,
      slug: "1970-erne",
    });
  });

  test("resolves a bare slug", () => {
    expect(resolveEmneInput("rusland-op-til-1991")).toEqual({
      ok: true,
      slug: "rusland-op-til-1991",
    });
  });

  test("resolves a scheme-less URL and a bare path", () => {
    expect(resolveEmneInput("faktalink.dk/emner/den-kolde-krig")).toEqual({
      ok: true,
      slug: "den-kolde-krig",
    });
    expect(resolveEmneInput("/emner/den-kolde-krig")).toEqual({
      ok: true,
      slug: "den-kolde-krig",
    });
  });

  test("trims surrounding whitespace from a paste", () => {
    expect(resolveEmneInput("  https://faktalink.dk/emner/1970-erne \n")).toEqual({
      ok: true,
      slug: "1970-erne",
    });
  });

  test("lowercases the slug", () => {
    expect(resolveEmneInput("https://faktalink.dk/emner/1970-ERNE")).toEqual({
      ok: true,
      slug: "1970-erne",
    });
  });

  test("decodes a percent-encoded Danish slug", () => {
    expect(resolveEmneInput("https://faktalink.dk/emner/b%C3%B8rn-og-medier")).toEqual({
      ok: true,
      slug: "børn-og-medier",
    });
  });

  test("reports an empty input", () => {
    expect(resolveEmneInput("")).toEqual({ ok: false, reason: "empty" });
    expect(resolveEmneInput("   ")).toEqual({ ok: false, reason: "empty" });
  });

  test("reports a non-faktalink host", () => {
    expect(resolveEmneInput("https://example.com/emner/1970-erne")).toEqual({
      ok: false,
      reason: "wrong-host",
    });
  });

  test("reports a faktalink URL that is not an emne page", () => {
    expect(resolveEmneInput("https://faktalink.dk/temaer/klima")).toEqual({
      ok: false,
      reason: "not-an-emne",
    });
    expect(resolveEmneInput("https://faktalink.dk/")).toEqual({
      ok: false,
      reason: "not-an-emne",
    });
  });

  test("reports an emne index URL as missing its slug", () => {
    // /emner is the index page: the user is in the right section but has not
    // named an emne, which is a different fix than "this is not an emne page".
    expect(resolveEmneInput("https://faktalink.dk/emner")).toEqual({
      ok: false,
      reason: "missing-slug",
    });
    expect(resolveEmneInput("https://faktalink.dk/emner/")).toEqual({
      ok: false,
      reason: "missing-slug",
    });
  });

  test("reports free text that is neither a URL nor a slug", () => {
    expect(resolveEmneInput("den kolde krig")).toEqual({ ok: false, reason: "not-a-url" });
  });
});
