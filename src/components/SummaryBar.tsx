import { useEffect, useMemo, useState } from "react";
import type { CrawlProgress, PageResult, ResourceResult } from "../types";
import {
  type FilterKey,
  LOW_TEXT_RATIO_THRESHOLD_PCT,
  SLOW_RESPONSE_THRESHOLD_MS,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from "../lib/filters";

interface SummaryBarProps {
  pages: PageResult[];
  resources: ResourceResult[];
  linkedUrls: Set<string>;
  // Passed down from App rather than recomputed here — App already builds these
  // once per `pages` change for table filtering, so reusing them avoids running
  // the same O(n) scan over `pages` a second time on every crawl update.
  duplicateTitles: Set<string>;
  duplicateContent: Set<string>;
  duplicateMeta: Set<string>;
  canonicalStatusMap: Map<string, number | null>;
  progress: CrawlProgress | null;
  running: boolean;
  paused: boolean;
  activeFilter: FilterKey;
  onSelectFilter: (filter: FilterKey) => void;
}

interface StatDef {
  key: FilterKey;
  value: number;
  label: string;
  tone?: "ok" | "warn" | "bad";
}

// Filter keys that live inside the collapsible Issues panel rather than the
// always-visible response-code row (so opening the panel can be driven by
// whichever filter is currently active, even after a page reload/HMR).
const ISSUE_GROUP_KEYS: FilterKey[] = [
  "missingTitle",
  "duplicateTitles",
  "titleTooShort",
  "titleTooLong",
  "missingMeta",
  "duplicateMeta",
  "h1Issues",
  "duplicateContent",
  "lowTextRatio",
  "missingAlt",
  "nofollowLinks",
  "unminified",
  "broken",
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

export function SummaryBar({
  pages,
  resources,
  linkedUrls,
  duplicateTitles: duplicateTitleSet,
  duplicateContent: duplicateContentSet,
  duplicateMeta: duplicateMetaSet,
  canonicalStatusMap,
  progress,
  running,
  paused,
  activeFilter,
  onSelectFilter,
}: SummaryBarProps) {
  const [issuesOpen, setIssuesOpen] = useState(false);

  useEffect(() => {
    if (ISSUE_GROUP_KEYS.includes(activeFilter)) setIssuesOpen(true);
  }, [activeFilter]);

  const summary = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let missingTitle = 0;
    let missingMeta = 0;
    let missingH1 = 0;
    let multipleH1 = 0;
    let unminified = 0;
    let missingAlt = 0;
    let insecureLinks = 0;
    let missingHsts = 0;
    let titleTooShort = 0;
    let titleTooLong = 0;
    let missingLang = 0;
    let missingHreflang = 0;
    let nofollowLinks = 0;
    let lowTextRatio = 0;
    let multipleCanonical = 0;
    let slowResponse = 0;
    let missingViewport = 0;
    let missingSocialTags = 0;
    let redirectChainTooLong = 0;
    let orphanPage = 0;
    let structuredDataErrors = 0;
    let missingStructuredData = 0;
    let accessibilityIssues = 0;

    for (const p of pages) {
      const bucket = p.status ? `${Math.floor(p.status / 100)}xx` : "error";
      byStatus[bucket] = (byStatus[bucket] ?? 0) + 1;
      if (!p.title) missingTitle++;
      if (p.title && p.titleLength < TITLE_MIN_LENGTH) titleTooShort++;
      if (p.titleLength > TITLE_MAX_LENGTH) titleTooLong++;
      if (!p.metaDescription) missingMeta++;
      if (p.h1Count === 0) missingH1++;
      if (p.h1Count > 1) multipleH1++;
      if (p.htmlSizeBytes > 0 && !p.isMinified) unminified++;
      if (p.htmlSizeBytes > 0 && p.textRatioPct < LOW_TEXT_RATIO_THRESHOLD_PCT) lowTextRatio++;
      if (p.missingAltCount > 0) missingAlt++;
      if (p.insecureLinkCount > 0) insecureLinks++;
      if (p.url.startsWith("https:") && !p.hsts) missingHsts++;
      if (p.htmlSizeBytes > 0 && !p.lang) missingLang++;
      if (p.htmlSizeBytes > 0 && p.hreflangValues.length === 0) missingHreflang++;
      if (p.internalNofollowCount > 0) nofollowLinks++;
      if (p.canonicalCount > 1) multipleCanonical++;
      if (p.responseTimeMs > SLOW_RESPONSE_THRESHOLD_MS) slowResponse++;
      if (p.htmlSizeBytes > 0 && !p.viewport) missingViewport++;
      if (p.htmlSizeBytes > 0 && !p.hasOpenGraph && !p.hasTwitterCard) missingSocialTags++;
      if (p.redirectChain.length > 1) redirectChainTooLong++;
      if (p.discoveredViaSitemap && !linkedUrls.has(p.url)) orphanPage++;
      if (p.structuredDataErrors.length > 0) structuredDataErrors++;
      if (p.htmlSizeBytes > 0 && p.structuredDataTypes.length === 0) missingStructuredData++;
      if (p.accessibilityViolations.length > 0) accessibilityIssues++;
    }

    let brokenCanonicalTarget = 0;
    for (const p of pages) {
      if (!p.canonical || p.canonical === p.url) continue;
      if (!canonicalStatusMap.has(p.canonical)) continue;
      const targetStatus = canonicalStatusMap.get(p.canonical);
      if (targetStatus === null || targetStatus === undefined || targetStatus >= 400) brokenCanonicalTarget++;
    }

    const duplicateTitles = duplicateTitleSet.size;
    const duplicateContent = duplicateContentSet.size;
    const duplicateMeta = duplicateMetaSet.size;
    const brokenResources = resources.filter((r) => (r.status && r.status >= 400) || r.error).length;

    return {
      byStatus,
      missingTitle,
      missingMeta,
      missingH1,
      multipleH1,
      unminified,
      duplicateTitles,
      duplicateContent,
      duplicateMeta,
      brokenResources,
      missingAlt,
      insecureLinks,
      missingHsts,
      titleTooShort,
      titleTooLong,
      missingLang,
      missingHreflang,
      nofollowLinks,
      lowTextRatio,
      multipleCanonical,
      brokenCanonicalTarget,
      slowResponse,
      missingViewport,
      missingSocialTags,
      redirectChainTooLong,
      orphanPage,
      structuredDataErrors,
      missingStructuredData,
      accessibilityIssues,
    };
  }, [pages, resources, linkedUrls, duplicateTitleSet, duplicateContentSet, duplicateMetaSet, canonicalStatusMap]);

  function stat(key: FilterKey, value: number, label: string, tone?: "ok" | "warn" | "bad") {
    const active = activeFilter === key;
    return (
      <button
        key={key}
        type="button"
        className={`stat${active ? " stat-active" : ""}`}
        onClick={() => onSelectFilter(key)}
      >
        <span className="stat-value">{value}</span>
        <span className={`stat-label${tone ? ` ${tone}` : ""}`}>{label}</span>
      </button>
    );
  }

  const groups: Array<{ title: string; items: StatDef[] }> = [
    {
      title: "Titles",
      items: [
        { key: "missingTitle", value: summary.missingTitle, label: "Missing title" },
        { key: "duplicateTitles", value: summary.duplicateTitles, label: "Duplicate titles" },
        { key: "titleTooShort", value: summary.titleTooShort, label: "Title too short" },
        { key: "titleTooLong", value: summary.titleTooLong, label: "Title too long" },
      ],
    },
    {
      title: "Content",
      items: [
        { key: "missingMeta", value: summary.missingMeta, label: "Missing meta desc." },
        { key: "duplicateMeta", value: summary.duplicateMeta, label: "Duplicate meta desc." },
        { key: "h1Issues", value: summary.missingH1 + summary.multipleH1, label: "H1 issues" },
        { key: "duplicateContent", value: summary.duplicateContent, label: "Duplicate content" },
        { key: "lowTextRatio", value: summary.lowTextRatio, label: "Low text/HTML ratio", tone: "warn" },
        { key: "missingAlt", value: summary.missingAlt, label: "Missing alt text", tone: "warn" },
        { key: "nofollowLinks", value: summary.nofollowLinks, label: "Nofollow links" },
        { key: "unminified", value: summary.unminified, label: "Unminified pages", tone: "warn" },
      ],
    },
    {
      title: "Canonical & Indexing",
      items: [
        { key: "multipleCanonical", value: summary.multipleCanonical, label: "Multiple canonical tags", tone: "warn" },
        {
          key: "brokenCanonicalTarget",
          value: summary.brokenCanonicalTarget,
          label: "Canonical points to broken page",
          tone: "bad",
        },
        { key: "redirectChainTooLong", value: summary.redirectChainTooLong, label: "Long redirect chains", tone: "warn" },
        { key: "orphanPage", value: summary.orphanPage, label: "Orphan pages (sitemap only)", tone: "warn" },
      ],
    },
    {
      title: "Performance",
      items: [{ key: "slowResponse", value: summary.slowResponse, label: "Slow response (>600ms)", tone: "warn" }],
    },
    {
      title: "Meta & Social",
      items: [
        { key: "missingViewport", value: summary.missingViewport, label: "Missing viewport tag", tone: "warn" },
        { key: "missingSocialTags", value: summary.missingSocialTags, label: "Missing OG/Twitter tags" },
      ],
    },
    {
      title: "Structured Data",
      items: [
        { key: "structuredDataErrors", value: summary.structuredDataErrors, label: "Invalid structured data", tone: "bad" },
        { key: "missingStructuredData", value: summary.missingStructuredData, label: "No structured data" },
      ],
    },
    {
      title: "Accessibility",
      items: [
        { key: "accessibilityIssues", value: summary.accessibilityIssues, label: "Accessibility violations", tone: "bad" },
      ],
    },
    {
      title: "Security",
      items: [
        { key: "broken", value: summary.brokenResources, label: "Broken links/images", tone: "bad" },
        { key: "insecureLinks", value: summary.insecureLinks, label: "Insecure links", tone: "bad" },
        { key: "missingHsts", value: summary.missingHsts, label: "Missing HSTS", tone: "warn" },
      ],
    },
    {
      title: "International",
      items: [
        { key: "missingLang", value: summary.missingLang, label: "Missing lang attr." },
        { key: "missingHreflang", value: summary.missingHreflang, label: "Missing hreflang" },
      ],
    },
  ];

  const totalIssues = groups.flatMap((g) => g.items).reduce((sum, i) => sum + i.value, 0);

  return (
    <div className="summary-bar-wrap">
      <div className="summary-bar">
        <div className="stat stat-static">
          <span className="stat-value">{pages.length}</span>
          <span className="stat-label">Pages crawled</span>
        </div>
        <div className="stat stat-static">
          <span className="stat-value">{progress?.queued ?? 0}</span>
          <span className="stat-label">Queued</span>
        </div>
        {stat("2xx", summary.byStatus["2xx"] ?? 0, "2xx", "ok")}
        {stat("3xx", summary.byStatus["3xx"] ?? 0, "3xx", "warn")}
        {stat(
          "4xx5xx",
          (summary.byStatus["4xx"] ?? 0) + (summary.byStatus["5xx"] ?? 0) + (summary.byStatus["error"] ?? 0),
          "4xx/5xx/Error",
          "bad",
        )}
        <div className="summary-spacer" />
        <button type="button" className="issues-toggle" onClick={() => setIssuesOpen((o) => !o)}>
          {totalIssues > 0 ? (
            <>
              <span className="issues-dot" /> {totalIssues} issue{totalIssues === 1 ? "" : "s"}
            </>
          ) : (
            "No issues found"
          )}
          <span className="issues-caret">{issuesOpen ? "▲" : "▼"}</span>
        </button>
        <div className="status-pill">
          <span className={`dot ${running && !paused ? "running" : "idle"}`} />
          {running ? (paused ? "Paused" : "Crawling…") : "Idle"}
        </div>
      </div>

      {issuesOpen && (
        <div className="issues-panel">
          {groups.map((group) => (
            <div className="issue-group" key={group.title}>
              <div className="issue-group-title">{group.title}</div>
              <div className="issue-group-items">
                {group.items.map((item) => stat(item.key, item.value, item.label, item.tone))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
