import { useMemo } from "react";
import type { CrawlProgress, PageResult, ResourceResult } from "../types";
import { type FilterKey, getDuplicateTitleSet } from "../lib/filters";

interface SummaryBarProps {
  pages: PageResult[];
  resources: ResourceResult[];
  progress: CrawlProgress | null;
  running: boolean;
  paused: boolean;
  activeFilter: FilterKey;
  onSelectFilter: (filter: FilterKey) => void;
}

export function SummaryBar({
  pages,
  resources,
  progress,
  running,
  paused,
  activeFilter,
  onSelectFilter,
}: SummaryBarProps) {
  const summary = useMemo(() => {
    const byStatus: Record<string, number> = {};
    let missingTitle = 0;
    let missingMeta = 0;
    let missingH1 = 0;
    let multipleH1 = 0;
    let unminified = 0;

    for (const p of pages) {
      const bucket = p.status ? `${Math.floor(p.status / 100)}xx` : "error";
      byStatus[bucket] = (byStatus[bucket] ?? 0) + 1;
      if (!p.title) missingTitle++;
      if (!p.metaDescription) missingMeta++;
      if (p.h1Count === 0) missingH1++;
      if (p.h1Count > 1) multipleH1++;
      if (p.htmlSizeBytes > 0 && !p.isMinified) unminified++;
    }

    const duplicateTitles = getDuplicateTitleSet(pages).size;
    const brokenResources = resources.filter((r) => (r.status && r.status >= 400) || r.error).length;

    return { byStatus, missingTitle, missingMeta, missingH1, multipleH1, unminified, duplicateTitles, brokenResources };
  }, [pages, resources]);

  function stat(key: FilterKey, value: number, label: string, labelClass?: string) {
    const active = activeFilter === key;
    return (
      <button type="button" className={`stat${active ? " stat-active" : ""}`} onClick={() => onSelectFilter(key)}>
        <span className="stat-value">{value}</span>
        <span className={`stat-label${labelClass ? ` ${labelClass}` : ""}`}>{label}</span>
      </button>
    );
  }

  return (
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
      {stat("missingTitle", summary.missingTitle, "Missing title")}
      {stat("duplicateTitles", summary.duplicateTitles, "Duplicate titles")}
      {stat("missingMeta", summary.missingMeta, "Missing meta desc.")}
      {stat("h1Issues", summary.missingH1 + summary.multipleH1, "H1 issues")}
      {stat("broken", summary.brokenResources, "Broken links/images", "bad")}
      {stat("unminified", summary.unminified, "Unminified pages", "warn")}
      <div className="status-pill">
        <span className={`dot ${running && !paused ? "running" : "idle"}`} />
        {running ? (paused ? "Paused" : "Crawling…") : "Idle"}
      </div>
    </div>
  );
}
