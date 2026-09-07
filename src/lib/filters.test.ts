import { describe, expect, it } from "vitest";
import type { PageResult, ResourceResult } from "../types";
import {
  LOW_TEXT_RATIO_THRESHOLD_PCT,
  SLOW_RESPONSE_THRESHOLD_MS,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
  filterPages,
  filterResources,
  filterTab,
  getCanonicalStatusMap,
  getDuplicateContentSet,
  getDuplicateMetaSet,
  getDuplicateTitleSet,
  getPageIssueKeys,
  getResourceIssueKeys,
  searchPages,
  searchResources,
} from "./filters";

function makePage(overrides: Partial<PageResult> = {}): PageResult {
  return {
    url: "https://example.com/",
    depth: 0,
    status: 200,
    statusText: "OK",
    contentType: "text/html",
    title: "A perfectly fine title that is long enough for SEO purposes",
    titleLength: 55,
    metaDescription: "A perfectly fine meta description that is long enough.",
    metaDescriptionLength: 55,
    h1: "Heading",
    h1Count: 1,
    wordCount: 500,
    canonical: "https://example.com/",
    metaRobots: null,
    redirectUrl: null,
    indexability: "Indexable",
    responseTimeMs: 100,
    internalLinkCount: 5,
    externalLinkCount: 2,
    imageCount: 3,
    htmlSizeBytes: 10000,
    minifySavingsPct: 5,
    isMinified: true,
    rendered: false,
    hsts: true,
    insecureLinkCount: 0,
    missingAltCount: 0,
    lang: "en",
    hreflangValues: [],
    internalNofollowCount: 0,
    textRatioPct: 20,
    contentHash: "hash1",
    xRobotsTag: null,
    viewport: "width=device-width",
    hasOpenGraph: true,
    hasTwitterCard: true,
    canonicalCount: 1,
    discoveredViaSitemap: true,
    redirectChain: [],
    structuredDataTypes: ["Article"],
    structuredDataErrors: [],
    accessibilityViolations: [],
    error: null,
    ...overrides,
  };
}

function makeResource(overrides: Partial<ResourceResult> = {}): ResourceResult {
  return {
    url: "https://example.com/image.png",
    resourceType: "image",
    sourcePage: "https://example.com/",
    altText: "An image",
    status: 200,
    statusText: "OK",
    isInternal: true,
    isInsecure: false,
    error: null,
    ...overrides,
  };
}

describe("getDuplicateTitleSet", () => {
  it("flags titles shared by more than one page", () => {
    const pages = [makePage({ title: "Same" }), makePage({ title: "Same" }), makePage({ title: "Unique" })];
    const dupes = getDuplicateTitleSet(pages);
    expect(dupes.has("Same")).toBe(true);
    expect(dupes.has("Unique")).toBe(false);
  });

  it("ignores pages with no title", () => {
    const pages = [makePage({ title: null }), makePage({ title: null })];
    expect(getDuplicateTitleSet(pages).size).toBe(0);
  });
});

describe("getDuplicateContentSet", () => {
  it("flags content hashes shared by more than one page", () => {
    const pages = [makePage({ contentHash: "a" }), makePage({ contentHash: "a" }), makePage({ contentHash: "b" })];
    const dupes = getDuplicateContentSet(pages);
    expect(dupes.has("a")).toBe(true);
    expect(dupes.has("b")).toBe(false);
  });
});

describe("getDuplicateMetaSet", () => {
  it("flags meta descriptions shared by more than one page", () => {
    const pages = [
      makePage({ metaDescription: "Same desc" }),
      makePage({ metaDescription: "Same desc" }),
      makePage({ metaDescription: "Other desc" }),
    ];
    const dupes = getDuplicateMetaSet(pages);
    expect(dupes.has("Same desc")).toBe(true);
    expect(dupes.has("Other desc")).toBe(false);
  });
});

describe("getCanonicalStatusMap", () => {
  it("maps each page's url to its status", () => {
    const pages = [makePage({ url: "https://example.com/a", status: 200 }), makePage({ url: "https://example.com/b", status: 404 })];
    const map = getCanonicalStatusMap(pages);
    expect(map.get("https://example.com/a")).toBe(200);
    expect(map.get("https://example.com/b")).toBe(404);
    expect(map.has("https://example.com/missing")).toBe(false);
  });
});

describe("filterTab", () => {
  it("routes 'broken' to resources and everything else (except 'all') to pages", () => {
    expect(filterTab("broken")).toBe("resources");
    expect(filterTab("all")).toBe(null);
    expect(filterTab("missingTitle")).toBe("pages");
  });
});

describe("filterPages", () => {
  const emptySets = {
    duplicateTitles: new Set<string>(),
    duplicateContent: new Set<string>(),
    duplicateMeta: new Set<string>(),
    canonicalStatusMap: new Map<string, number | null>(),
    linkedUrls: new Set<string>(),
  };

  function run(pages: PageResult[], filter: Parameters<typeof filterPages>[1]) {
    return filterPages(
      pages,
      filter,
      emptySets.duplicateTitles,
      emptySets.duplicateContent,
      emptySets.duplicateMeta,
      emptySets.canonicalStatusMap,
      emptySets.linkedUrls,
    );
  }

  it("returns everything for 'all'", () => {
    const pages = [makePage(), makePage({ status: 404 })];
    expect(run(pages, "all")).toHaveLength(2);
  });

  it("filters by status class (2xx/3xx/4xx5xx)", () => {
    const pages = [makePage({ status: 200 }), makePage({ status: 301 }), makePage({ status: 404 }), makePage({ status: null })];
    expect(run(pages, "2xx")).toEqual([pages[0]]);
    expect(run(pages, "3xx")).toEqual([pages[1]]);
    expect(run(pages, "4xx5xx")).toEqual([pages[2], pages[3]]);
  });

  it("flags missing title", () => {
    const pages = [makePage({ title: null }), makePage({ title: "Has one" })];
    expect(run(pages, "missingTitle")).toEqual([pages[0]]);
  });

  it("flags duplicate titles using the provided set", () => {
    const pages = [makePage({ title: "Dup" }), makePage({ title: "Solo" })];
    const result = filterPages(
      pages,
      "duplicateTitles",
      new Set(["Dup"]),
      emptySets.duplicateContent,
      emptySets.duplicateMeta,
      emptySets.canonicalStatusMap,
      emptySets.linkedUrls,
    );
    expect(result).toEqual([pages[0]]);
  });

  it("flags missing meta description", () => {
    const pages = [makePage({ metaDescription: null }), makePage()];
    expect(run(pages, "missingMeta")).toEqual([pages[0]]);
  });

  it("flags h1 count anything other than exactly one", () => {
    const pages = [makePage({ h1Count: 0 }), makePage({ h1Count: 1 }), makePage({ h1Count: 2 })];
    expect(run(pages, "h1Issues")).toEqual([pages[0], pages[2]]);
  });

  it("flags unminified pages that actually have html", () => {
    const pages = [
      makePage({ htmlSizeBytes: 1000, isMinified: false }),
      makePage({ htmlSizeBytes: 1000, isMinified: true }),
      makePage({ htmlSizeBytes: 0, isMinified: false }),
    ];
    expect(run(pages, "unminified")).toEqual([pages[0]]);
  });

  it("flags missing alt text and insecure links by count", () => {
    const pages = [makePage({ missingAltCount: 2 }), makePage({ missingAltCount: 0 })];
    expect(run(pages, "missingAlt")).toEqual([pages[0]]);

    const insecurePages = [makePage({ insecureLinkCount: 1 }), makePage({ insecureLinkCount: 0 })];
    expect(run(insecurePages, "insecureLinks")).toEqual([insecurePages[0]]);
  });

  it("flags missing HSTS only for https pages", () => {
    const pages = [
      makePage({ url: "https://example.com/a", hsts: false }),
      makePage({ url: "https://example.com/b", hsts: true }),
      makePage({ url: "http://example.com/c", hsts: false }),
    ];
    expect(run(pages, "missingHsts")).toEqual([pages[0]]);
  });

  it("flags title length outside the min/max bounds", () => {
    const short = makePage({ title: "Short", titleLength: TITLE_MIN_LENGTH - 1 });
    const long = makePage({ title: "Long", titleLength: TITLE_MAX_LENGTH + 1 });
    const fine = makePage({ title: "Fine", titleLength: (TITLE_MIN_LENGTH + TITLE_MAX_LENGTH) / 2 });
    const noTitle = makePage({ title: null, titleLength: 0 });

    expect(run([short, fine], "titleTooShort")).toEqual([short]);
    expect(run([long, fine], "titleTooLong")).toEqual([long]);
    // titleTooShort requires a title to exist — a missing title is a separate issue (missingTitle)
    expect(run([noTitle], "titleTooShort")).toEqual([]);
  });

  it("flags missing lang/hreflang only when the page actually has html", () => {
    const pages = [
      makePage({ htmlSizeBytes: 1000, lang: null }),
      makePage({ htmlSizeBytes: 1000, lang: "en" }),
      makePage({ htmlSizeBytes: 0, lang: null }),
    ];
    expect(run(pages, "missingLang")).toEqual([pages[0]]);

    const hreflangPages = [
      makePage({ htmlSizeBytes: 1000, hreflangValues: [] }),
      makePage({ htmlSizeBytes: 1000, hreflangValues: ["en"] }),
    ];
    expect(run(hreflangPages, "missingHreflang")).toEqual([hreflangPages[0]]);
  });

  it("flags duplicate content using the provided set", () => {
    const pages = [makePage({ contentHash: "dup" }), makePage({ contentHash: "solo" })];
    const result = filterPages(
      pages,
      "duplicateContent",
      emptySets.duplicateTitles,
      new Set(["dup"]),
      emptySets.duplicateMeta,
      emptySets.canonicalStatusMap,
      emptySets.linkedUrls,
    );
    expect(result).toEqual([pages[0]]);
  });

  it("flags low text/html ratio", () => {
    const pages = [
      makePage({ htmlSizeBytes: 1000, textRatioPct: LOW_TEXT_RATIO_THRESHOLD_PCT - 1 }),
      makePage({ htmlSizeBytes: 1000, textRatioPct: LOW_TEXT_RATIO_THRESHOLD_PCT + 1 }),
      makePage({ htmlSizeBytes: 0, textRatioPct: 0 }),
    ];
    expect(run(pages, "lowTextRatio")).toEqual([pages[0]]);
  });

  it("flags nofollow links by count", () => {
    const pages = [makePage({ internalNofollowCount: 1 }), makePage({ internalNofollowCount: 0 })];
    expect(run(pages, "nofollowLinks")).toEqual([pages[0]]);
  });

  it("flags duplicate meta descriptions using the provided set", () => {
    const pages = [makePage({ metaDescription: "dup" }), makePage({ metaDescription: "solo" })];
    const result = filterPages(
      pages,
      "duplicateMeta",
      emptySets.duplicateTitles,
      emptySets.duplicateContent,
      new Set(["dup"]),
      emptySets.canonicalStatusMap,
      emptySets.linkedUrls,
    );
    expect(result).toEqual([pages[0]]);
  });

  it("flags multiple canonical tags", () => {
    const pages = [makePage({ canonicalCount: 2 }), makePage({ canonicalCount: 1 })];
    expect(run(pages, "multipleCanonical")).toEqual([pages[0]]);
  });

  it("flags a broken canonical target (dead or unknown-but-crawled)", () => {
    const canonicalStatusMap = new Map<string, number | null>([
      ["https://example.com/dead", 404],
      ["https://example.com/alive", 200],
    ]);
    const pages = [
      makePage({ url: "https://example.com/a", canonical: "https://example.com/dead" }),
      makePage({ url: "https://example.com/b", canonical: "https://example.com/alive" }),
      // self-canonical never counts as broken
      makePage({ url: "https://example.com/c", canonical: "https://example.com/c" }),
      // canonical target that was never crawled is not flagged (we can't know its status)
      makePage({ url: "https://example.com/d", canonical: "https://example.com/never-crawled" }),
    ];
    const result = filterPages(
      pages,
      "brokenCanonicalTarget",
      emptySets.duplicateTitles,
      emptySets.duplicateContent,
      emptySets.duplicateMeta,
      canonicalStatusMap,
      emptySets.linkedUrls,
    );
    expect(result).toEqual([pages[0]]);
  });

  it("flags slow responses", () => {
    const pages = [
      makePage({ responseTimeMs: SLOW_RESPONSE_THRESHOLD_MS + 1 }),
      makePage({ responseTimeMs: SLOW_RESPONSE_THRESHOLD_MS - 1 }),
    ];
    expect(run(pages, "slowResponse")).toEqual([pages[0]]);
  });

  it("flags missing viewport and missing social tags only for html pages", () => {
    const viewportPages = [makePage({ htmlSizeBytes: 1000, viewport: null }), makePage({ htmlSizeBytes: 0, viewport: null })];
    expect(run(viewportPages, "missingViewport")).toEqual([viewportPages[0]]);

    const socialPages = [
      makePage({ htmlSizeBytes: 1000, hasOpenGraph: false, hasTwitterCard: false }),
      makePage({ htmlSizeBytes: 1000, hasOpenGraph: true, hasTwitterCard: false }),
    ];
    expect(run(socialPages, "missingSocialTags")).toEqual([socialPages[0]]);
  });

  it("flags long redirect chains", () => {
    const pages = [makePage({ redirectChain: ["a", "b"] }), makePage({ redirectChain: ["a"] }), makePage({ redirectChain: [] })];
    expect(run(pages, "redirectChainTooLong")).toEqual([pages[0]]);
  });

  it("flags orphan pages (in sitemap, not linked internally)", () => {
    const pages = [
      makePage({ url: "https://example.com/orphan", discoveredViaSitemap: true }),
      makePage({ url: "https://example.com/linked", discoveredViaSitemap: true }),
      makePage({ url: "https://example.com/not-in-sitemap", discoveredViaSitemap: false }),
    ];
    const result = filterPages(
      pages,
      "orphanPage",
      emptySets.duplicateTitles,
      emptySets.duplicateContent,
      emptySets.duplicateMeta,
      emptySets.canonicalStatusMap,
      new Set(["https://example.com/linked"]),
    );
    expect(result).toEqual([pages[0]]);
  });

  it("flags structured data errors and missing structured data", () => {
    const errorPages = [makePage({ structuredDataErrors: ["bad json"] }), makePage({ structuredDataErrors: [] })];
    expect(run(errorPages, "structuredDataErrors")).toEqual([errorPages[0]]);

    const missingPages = [
      makePage({ htmlSizeBytes: 1000, structuredDataTypes: [] }),
      makePage({ htmlSizeBytes: 1000, structuredDataTypes: ["Article"] }),
      makePage({ htmlSizeBytes: 0, structuredDataTypes: [] }),
    ];
    expect(run(missingPages, "missingStructuredData")).toEqual([missingPages[0]]);
  });

  it("flags accessibility violations", () => {
    const violation = { id: "v1", impact: "serious", description: "d", helpUrl: "u", nodeCount: 1 };
    const pages = [makePage({ accessibilityViolations: [violation] }), makePage({ accessibilityViolations: [] })];
    expect(run(pages, "accessibilityIssues")).toEqual([pages[0]]);
  });
});

describe("filterResources", () => {
  it("returns everything unless the filter is 'broken'", () => {
    const resources = [makeResource({ status: 200 }), makeResource({ status: 404 })];
    expect(filterResources(resources, "all")).toHaveLength(2);
  });

  it("flags resources with a 4xx/5xx status or an error", () => {
    const resources = [
      makeResource({ status: 404 }),
      makeResource({ status: 200, error: "timeout" }),
      makeResource({ status: 200, error: null }),
      makeResource({ status: null, error: null }),
    ];
    expect(filterResources(resources, "broken")).toEqual([resources[0], resources[1]]);
  });
});

describe("getPageIssueKeys", () => {
  it("returns no issues for a page with nothing wrong", () => {
    // hreflangValues/discoveredViaSitemap need explicit non-default values here since makePage()'s
    // defaults (empty hreflang, discovered via sitemap) are themselves flagged issues otherwise.
    const page = makePage({ hreflangValues: ["en"], discoveredViaSitemap: false });
    const keys = getPageIssueKeys(page, new Set(), new Set(), new Set(), new Map(), new Set());
    expect(keys).toEqual([]);
  });

  it("returns every applicable issue key for a page with many problems", () => {
    const page = makePage({ status: 404, title: null, metaDescription: null, h1Count: 0 });
    const keys = getPageIssueKeys(page, new Set(), new Set(), new Set(), new Map(), new Set());
    expect(keys).toEqual(expect.arrayContaining(["4xx5xx", "missingTitle", "missingMeta", "h1Issues"]));
  });

  it("stays in sync with filterPages for every issue key (single source of truth)", () => {
    // A no-issues page and a many-issues page, checked against filterPages directly rather than
    // re-deriving the "what counts as an issue" rules a second time in this test.
    const pages = [makePage(), makePage({ status: 404, title: null, canonicalCount: 2, insecureLinkCount: 1 })];
    for (const page of pages) {
      const keys = getPageIssueKeys(page, new Set(), new Set(), new Set(), new Map(), new Set());
      for (const key of keys) {
        expect(filterPages([page], key, new Set(), new Set(), new Set(), new Map(), new Set())).toHaveLength(1);
      }
    }
  });
});

describe("searchPages", () => {
  const pages = [
    makePage({ url: "https://example.com/blog/hello-world", title: "Hello World", metaDescription: "A greeting", h1: "Hi" }),
    makePage({ url: "https://example.com/about", title: "About us", metaDescription: "Company info", h1: "About" }),
  ];

  it("returns everything for an empty or whitespace-only query", () => {
    expect(searchPages(pages, "")).toEqual(pages);
    expect(searchPages(pages, "   ")).toEqual(pages);
  });

  it("matches case-insensitively against url, title, meta description, and h1", () => {
    expect(searchPages(pages, "HELLO")).toEqual([pages[0]]);
    expect(searchPages(pages, "about us")).toEqual([pages[1]]);
    expect(searchPages(pages, "greeting")).toEqual([pages[0]]);
    expect(searchPages(pages, "Hi")).toEqual([pages[0]]);
  });

  it("tolerates null title/metaDescription/h1", () => {
    const page = makePage({ title: null, metaDescription: null, h1: null, url: "https://example.com/x" });
    expect(searchPages([page], "example.com/x")).toEqual([page]);
    expect(searchPages([page], "nomatch")).toEqual([]);
  });
});

describe("searchResources", () => {
  const resources = [
    makeResource({ url: "https://example.com/logo.png", sourcePage: "https://example.com/", altText: "Site logo" }),
    makeResource({ url: "https://cdn.example.com/hero.jpg", sourcePage: "https://example.com/about", altText: null }),
  ];

  it("returns everything for an empty query", () => {
    expect(searchResources(resources, "")).toEqual(resources);
  });

  it("matches case-insensitively against url, source page, and alt text", () => {
    expect(searchResources(resources, "LOGO")).toEqual([resources[0]]);
    expect(searchResources(resources, "/about")).toEqual([resources[1]]);
    expect(searchResources(resources, "cdn.example")).toEqual([resources[1]]);
  });

  it("tolerates null alt text", () => {
    expect(searchResources(resources, "hero")).toEqual([resources[1]]);
  });
});

describe("getResourceIssueKeys", () => {
  it("flags broken resources and insecure resources", () => {
    expect(getResourceIssueKeys(makeResource({ status: 404 }))).toEqual(["broken"]);
    expect(getResourceIssueKeys(makeResource({ isInsecure: true }))).toEqual(["insecureLinks"]);
    expect(getResourceIssueKeys(makeResource({ status: 404, isInsecure: true }))).toEqual(["broken", "insecureLinks"]);
    expect(getResourceIssueKeys(makeResource())).toEqual([]);
  });
});
