import type { PageResult, ResourceResult } from "../types";

export type FilterKey =
  | "all"
  | "2xx"
  | "3xx"
  | "4xx5xx"
  | "missingTitle"
  | "duplicateTitles"
  | "missingMeta"
  | "h1Issues"
  | "unminified"
  | "broken"
  | "missingAlt"
  | "insecureLinks"
  | "missingHsts"
  | "titleTooShort"
  | "titleTooLong"
  | "missingLang"
  | "missingHreflang"
  | "duplicateContent"
  | "lowTextRatio"
  | "nofollowLinks"
  | "duplicateMeta"
  | "multipleCanonical"
  | "brokenCanonicalTarget"
  | "slowResponse"
  | "missingViewport"
  | "missingSocialTags"
  | "redirectChainTooLong"
  | "orphanPage"
  | "structuredDataErrors"
  | "missingStructuredData"
  | "accessibilityIssues";

export const TITLE_MIN_LENGTH = 30;
export const TITLE_MAX_LENGTH = 60;
export const LOW_TEXT_RATIO_THRESHOLD_PCT = 10;
export const SLOW_RESPONSE_THRESHOLD_MS = 600;

export function getDuplicateTitleSet(pages: PageResult[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) {
    if (p.title) counts.set(p.title, (counts.get(p.title) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [title, count] of counts) {
    if (count > 1) duplicates.add(title);
  }
  return duplicates;
}

export function getDuplicateContentSet(pages: PageResult[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) {
    if (p.contentHash) counts.set(p.contentHash, (counts.get(p.contentHash) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [hash, count] of counts) {
    if (count > 1) duplicates.add(hash);
  }
  return duplicates;
}

export function getDuplicateMetaSet(pages: PageResult[]): Set<string> {
  const counts = new Map<string, number>();
  for (const p of pages) {
    if (p.metaDescription) counts.set(p.metaDescription, (counts.get(p.metaDescription) ?? 0) + 1);
  }
  const duplicates = new Set<string>();
  for (const [desc, count] of counts) {
    if (count > 1) duplicates.add(desc);
  }
  return duplicates;
}

/** URL -> status of every crawled page, so a page's canonical target can be
 * cross-referenced against what we actually observed when we crawled it. */
export function getCanonicalStatusMap(pages: PageResult[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (const p of pages) map.set(p.url, p.status);
  return map;
}

/** Which tab a filter's results live in — null means it doesn't imply a tab (e.g. "all"). */
export function filterTab(filter: FilterKey): "pages" | "resources" | null {
  return filter === "broken" ? "resources" : filter === "all" ? null : "pages";
}

export function filterPages(
  pages: PageResult[],
  filter: FilterKey,
  duplicateTitles: Set<string>,
  duplicateContent: Set<string>,
  duplicateMeta: Set<string> = new Set(),
  canonicalStatusMap: Map<string, number | null> = new Map(),
  linkedUrls: Set<string> = new Set(),
): PageResult[] {
  switch (filter) {
    case "2xx":
      return pages.filter((p) => p.status !== null && Math.floor(p.status / 100) === 2);
    case "3xx":
      return pages.filter((p) => p.status !== null && Math.floor(p.status / 100) === 3);
    case "4xx5xx":
      return pages.filter((p) => p.status === null || p.status >= 400);
    case "missingTitle":
      return pages.filter((p) => !p.title);
    case "duplicateTitles":
      return pages.filter((p) => p.title && duplicateTitles.has(p.title));
    case "missingMeta":
      return pages.filter((p) => !p.metaDescription);
    case "h1Issues":
      return pages.filter((p) => p.h1Count !== 1);
    case "unminified":
      return pages.filter((p) => p.htmlSizeBytes > 0 && !p.isMinified);
    case "missingAlt":
      return pages.filter((p) => p.missingAltCount > 0);
    case "insecureLinks":
      return pages.filter((p) => p.insecureLinkCount > 0);
    case "missingHsts":
      return pages.filter((p) => p.url.startsWith("https:") && !p.hsts);
    case "titleTooShort":
      return pages.filter((p) => p.title && p.titleLength < TITLE_MIN_LENGTH);
    case "titleTooLong":
      return pages.filter((p) => p.titleLength > TITLE_MAX_LENGTH);
    case "missingLang":
      return pages.filter((p) => p.htmlSizeBytes > 0 && !p.lang);
    case "missingHreflang":
      return pages.filter((p) => p.htmlSizeBytes > 0 && p.hreflangValues.length === 0);
    case "duplicateContent":
      return pages.filter((p) => p.contentHash && duplicateContent.has(p.contentHash));
    case "lowTextRatio":
      return pages.filter((p) => p.htmlSizeBytes > 0 && p.textRatioPct < LOW_TEXT_RATIO_THRESHOLD_PCT);
    case "nofollowLinks":
      return pages.filter((p) => p.internalNofollowCount > 0);
    case "duplicateMeta":
      return pages.filter((p) => p.metaDescription && duplicateMeta.has(p.metaDescription));
    case "multipleCanonical":
      return pages.filter((p) => p.canonicalCount > 1);
    case "brokenCanonicalTarget":
      return pages.filter((p) => {
        if (!p.canonical || p.canonical === p.url) return false;
        if (!canonicalStatusMap.has(p.canonical)) return false;
        const targetStatus = canonicalStatusMap.get(p.canonical);
        return targetStatus === null || targetStatus === undefined || targetStatus >= 400;
      });
    case "slowResponse":
      return pages.filter((p) => p.responseTimeMs > SLOW_RESPONSE_THRESHOLD_MS);
    case "missingViewport":
      return pages.filter((p) => p.htmlSizeBytes > 0 && !p.viewport);
    case "missingSocialTags":
      return pages.filter((p) => p.htmlSizeBytes > 0 && !p.hasOpenGraph && !p.hasTwitterCard);
    case "redirectChainTooLong":
      return pages.filter((p) => p.redirectChain.length > 1);
    case "orphanPage":
      return pages.filter((p) => p.discoveredViaSitemap && !linkedUrls.has(p.url));
    case "structuredDataErrors":
      return pages.filter((p) => p.structuredDataErrors.length > 0);
    case "missingStructuredData":
      return pages.filter((p) => p.htmlSizeBytes > 0 && p.structuredDataTypes.length === 0);
    case "accessibilityIssues":
      return pages.filter((p) => p.accessibilityViolations.length > 0);
    default:
      return pages;
  }
}

export function filterResources(resources: ResourceResult[], filter: FilterKey): ResourceResult[] {
  if (filter === "broken") {
    return resources.filter((r) => (r.status !== null && r.status >= 400) || !!r.error);
  }
  return resources;
}

/** Free-text search across a page's URL, title, meta description and H1 — case-insensitive substring match. */
export function searchPages(pages: PageResult[], query: string): PageResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return pages;
  return pages.filter(
    (p) =>
      p.url.toLowerCase().includes(q) ||
      (p.title?.toLowerCase().includes(q) ?? false) ||
      (p.metaDescription?.toLowerCase().includes(q) ?? false) ||
      (p.h1?.toLowerCase().includes(q) ?? false),
  );
}

/** Free-text search across a resource's URL, source page and alt text — case-insensitive substring match. */
export function searchResources(resources: ResourceResult[], query: string): ResourceResult[] {
  const q = query.trim().toLowerCase();
  if (!q) return resources;
  return resources.filter(
    (r) =>
      r.url.toLowerCase().includes(q) ||
      r.sourcePage.toLowerCase().includes(q) ||
      (r.altText?.toLowerCase().includes(q) ?? false),
  );
}

const ALL_PAGE_ISSUE_KEYS: FilterKey[] = [
  "4xx5xx",
  "missingTitle",
  "titleTooShort",
  "titleTooLong",
  "duplicateTitles",
  "missingMeta",
  "duplicateMeta",
  "h1Issues",
  "duplicateContent",
  "lowTextRatio",
  "missingAlt",
  "nofollowLinks",
  "unminified",
  "insecureLinks",
  "missingHsts",
  "missingLang",
  "missingHreflang",
  "multipleCanonical",
  "brokenCanonicalTarget",
  "slowResponse",
  "missingViewport",
  "missingSocialTags",
  "redirectChainTooLong",
  "orphanPage",
  "structuredDataErrors",
  "missingStructuredData",
  "accessibilityIssues",
];

/** Which issue keys apply to a single page — reuses `filterPages` against a
 * one-item array so the "what counts as an issue" logic has one source of truth. */
export function getPageIssueKeys(
  page: PageResult,
  duplicateTitles: Set<string>,
  duplicateContent: Set<string>,
  duplicateMeta: Set<string> = new Set(),
  canonicalStatusMap: Map<string, number | null> = new Map(),
  linkedUrls: Set<string> = new Set(),
): FilterKey[] {
  return ALL_PAGE_ISSUE_KEYS.filter(
    (key) =>
      filterPages([page], key, duplicateTitles, duplicateContent, duplicateMeta, canonicalStatusMap, linkedUrls)
        .length > 0,
  );
}

export function getResourceIssueKeys(resource: ResourceResult): FilterKey[] {
  const keys: FilterKey[] = [];
  if (filterResources([resource], "broken").length > 0) keys.push("broken");
  if (resource.isInsecure) keys.push("insecureLinks");
  return keys;
}
