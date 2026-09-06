import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { cn } from "@/lib/utils";
import type { CrawlProgress, PageResult, ResourceResult } from "../types";
import {
  type FilterKey,
  LOW_TEXT_RATIO_THRESHOLD_PCT,
  SLOW_RESPONSE_THRESHOLD_MS,
  TITLE_MAX_LENGTH,
  TITLE_MIN_LENGTH,
} from "../lib/filters";

interface OverviewProps {
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

const TONE_TEXT: Record<"ok" | "warn" | "bad", string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  bad: "text-red-600 dark:text-red-400",
};

function StatTile({
  active,
  value,
  label,
  tone,
  onClick,
}: {
  active: boolean;
  value: number;
  label: string;
  tone?: "ok" | "warn" | "bad";
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex flex-col items-start gap-0 rounded-lg px-3 py-1.5 text-left ring-1 ring-foreground/10 transition-colors hover:bg-muted/60",
        active && "bg-muted ring-ring/50",
      )}
    >
      <span className={cn("text-lg leading-tight font-semibold", tone && TONE_TEXT[tone])}>{value}</span>
      <span className="text-xs whitespace-nowrap text-muted-foreground">{label}</span>
    </button>
  );
}

export function Overview({
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
}: OverviewProps) {
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

  const activeGroupTitle = useMemo(
    () => groups.find((g) => g.items.some((i) => i.key === activeFilter))?.title,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [activeFilter, summary],
  );

  const [openGroups, setOpenGroups] = useState<string[]>([]);
  useEffect(() => {
    if (activeGroupTitle) {
      setOpenGroups((prev) => (prev.includes(activeGroupTitle) ? prev : [...prev, activeGroupTitle]));
    }
  }, [activeGroupTitle]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <StatTile active={false} value={pages.length} label="Pages crawled" onClick={() => {}} />
        <StatTile active={false} value={progress?.queued ?? 0} label="Queued" onClick={() => {}} />
        <StatTile
          active={activeFilter === "2xx"}
          value={summary.byStatus["2xx"] ?? 0}
          label="2xx"
          tone="ok"
          onClick={() => onSelectFilter("2xx")}
        />
        <StatTile
          active={activeFilter === "3xx"}
          value={summary.byStatus["3xx"] ?? 0}
          label="3xx"
          tone="warn"
          onClick={() => onSelectFilter("3xx")}
        />
        <StatTile
          active={activeFilter === "4xx5xx"}
          value={(summary.byStatus["4xx"] ?? 0) + (summary.byStatus["5xx"] ?? 0) + (summary.byStatus["error"] ?? 0)}
          label="4xx/5xx/Error"
          tone="bad"
          onClick={() => onSelectFilter("4xx5xx")}
        />
        <div className="flex-1" />
        <Badge variant={totalIssues > 0 ? "destructive" : "secondary"} className="h-auto py-1">
          {totalIssues > 0 ? `${totalIssues} issue${totalIssues === 1 ? "" : "s"}` : "No issues found"}
        </Badge>
        <Badge variant="outline" className="h-auto gap-1.5 py-1">
          <span className={cn("size-1.5 rounded-full", running && !paused ? "bg-emerald-500" : "bg-muted-foreground")} />
          {running ? (paused ? "Paused" : "Crawling…") : "Idle"}
        </Badge>
      </div>

      <Accordion type="multiple" value={openGroups} onValueChange={setOpenGroups}>
        {groups.map((group) => {
          const groupTotal = group.items.reduce((sum, i) => sum + i.value, 0);
          return (
            <AccordionItem key={group.title} value={group.title}>
              <AccordionTrigger>
                <span className="flex items-center gap-2">
                  {group.title}
                  <Badge variant={groupTotal > 0 ? "secondary" : "outline"} className="h-auto py-0">
                    {groupTotal}
                  </Badge>
                </span>
              </AccordionTrigger>
              <AccordionContent>
                <div className="flex flex-wrap gap-2">
                  {group.items.map((item) => (
                    <StatTile
                      key={item.key}
                      active={activeFilter === item.key}
                      value={item.value}
                      label={item.label}
                      tone={item.tone}
                      onClick={() => onSelectFilter(item.key)}
                    />
                  ))}
                </div>
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
