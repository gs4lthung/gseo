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
  | "broken";

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

/** Which tab a filter's results live in — null means it doesn't imply a tab (e.g. "all"). */
export function filterTab(filter: FilterKey): "pages" | "resources" | null {
  return filter === "broken" ? "resources" : filter === "all" ? null : "pages";
}

export function filterPages(pages: PageResult[], filter: FilterKey, duplicateTitles: Set<string>): PageResult[] {
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
