import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ColumnDef } from "@tanstack/react-table";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { UrlCombobox } from "@/components/url-combobox";
import { CrawlActions } from "@/components/crawl-actions";
import { CrawlOptionsSheet } from "@/components/crawl-options-sheet";
import { ThemeToggle } from "@/components/theme-toggle";
import { Overview } from "./components/Overview";
import { DataTable } from "./components/DataTable";
import { DetailModal } from "./components/DetailModal";
import { SiteInfoPanel } from "./components/SiteInfoPanel";
import {
  DEFAULT_CONFIG,
  type CrawlConfig,
  type CrawlProgress,
  type CrawlSnapshot,
  type CrawlSummary,
  type PageResult,
  type ResourceResult,
  type SiteInfo,
} from "./types";
import {
  type FilterKey,
  filterPages,
  filterResources,
  filterTab,
  getCanonicalStatusMap,
  getDuplicateContentSet,
  getDuplicateMetaSet,
  getDuplicateTitleSet,
  getPageIssueKeys,
  getResourceIssueKeys,
} from "./lib/filters";
import { ISSUE_SOLUTIONS } from "./lib/issueSolutions";

type Tab = "overview" | "pages" | "resources";

const pageColumns: ColumnDef<PageResult, any>[] = [
  { accessorKey: "url", header: "URL", size: 360 },
  { accessorKey: "status", header: "Status", size: 70, cell: (c) => c.getValue() ?? "-" },
  { accessorKey: "indexability", header: "Indexability", size: 160 },
  { accessorKey: "title", header: "Title", size: 260, cell: (c) => c.getValue() ?? "" },
  { accessorKey: "titleLength", header: "Title Len", size: 80 },
  { accessorKey: "metaDescription", header: "Meta Description", size: 260, cell: (c) => c.getValue() ?? "" },
  { accessorKey: "metaDescriptionLength", header: "Meta Len", size: 80 },
  { accessorKey: "h1", header: "H1", size: 200, cell: (c) => c.getValue() ?? "" },
  { accessorKey: "h1Count", header: "H1 Count", size: 80 },
  { accessorKey: "wordCount", header: "Word Count", size: 100 },
  { accessorKey: "canonical", header: "Canonical", size: 260, cell: (c) => c.getValue() ?? "" },
  { accessorKey: "responseTimeMs", header: "Time (ms)", size: 90 },
  { accessorKey: "internalLinkCount", header: "Inlinks", size: 80 },
  { accessorKey: "externalLinkCount", header: "Outlinks", size: 80 },
  { accessorKey: "imageCount", header: "Images", size: 70 },
  {
    accessorKey: "htmlSizeBytes",
    header: "Size (KB)",
    size: 90,
    cell: (c) => (c.getValue() ? (c.getValue() / 1024).toFixed(1) : "-"),
  },
  {
    accessorKey: "isMinified",
    header: "Minified",
    size: 90,
    cell: (c) => (c.row.original.htmlSizeBytes ? (c.getValue() ? "Yes" : "No") : "-"),
  },
  {
    accessorKey: "minifySavingsPct",
    header: "Minify Savings",
    size: 110,
    cell: (c) => (c.row.original.htmlSizeBytes ? `${(c.getValue() as number).toFixed(0)}%` : "-"),
  },
  { accessorKey: "depth", header: "Depth", size: 60 },
  {
    accessorKey: "rendered",
    header: "JS Rendered",
    size: 100,
    cell: (c) => (c.getValue() ? "Yes" : "No"),
  },
  {
    accessorKey: "hsts",
    header: "HSTS",
    size: 80,
    cell: (c) => (c.row.original.url.startsWith("https:") ? (c.getValue() ? "Yes" : "No") : "-"),
  },
  { accessorKey: "insecureLinkCount", header: "Insecure Links", size: 110 },
  { accessorKey: "missingAltCount", header: "Missing Alt", size: 100 },
  {
    accessorKey: "lang",
    header: "Lang",
    size: 80,
    cell: (c) => (c.row.original.htmlSizeBytes ? (c.getValue() ?? "-") : "-"),
  },
  {
    accessorKey: "hreflangValues",
    header: "Hreflang",
    size: 140,
    cell: (c) => (c.getValue() as string[]).join(", "),
  },
  { accessorKey: "internalNofollowCount", header: "Nofollow Links", size: 110 },
  {
    accessorKey: "textRatioPct",
    header: "Text/HTML Ratio",
    size: 120,
    cell: (c) => (c.row.original.htmlSizeBytes ? `${(c.getValue() as number).toFixed(1)}%` : "-"),
  },
  {
    accessorKey: "viewport",
    header: "Viewport",
    size: 90,
    cell: (c) => (c.row.original.htmlSizeBytes ? (c.getValue() ? "Yes" : "No") : "-"),
  },
  {
    accessorKey: "hasOpenGraph",
    header: "Open Graph",
    size: 100,
    cell: (c) => (c.getValue() ? "Yes" : "No"),
  },
  {
    accessorKey: "hasTwitterCard",
    header: "Twitter Card",
    size: 100,
    cell: (c) => (c.getValue() ? "Yes" : "No"),
  },
  { accessorKey: "canonicalCount", header: "Canonical Count", size: 110 },
  {
    accessorKey: "redirectChain",
    header: "Redirect Hops",
    size: 110,
    cell: (c) => (c.getValue() as string[]).length,
  },
  {
    accessorKey: "discoveredViaSitemap",
    header: "Via Sitemap",
    size: 100,
    cell: (c) => (c.getValue() ? "Yes" : "No"),
  },
  {
    accessorKey: "structuredDataTypes",
    header: "Structured Data",
    size: 150,
    cell: (c) => (c.getValue() as string[]).join(", "),
  },
  {
    accessorKey: "accessibilityViolations",
    header: "A11y Issues",
    size: 100,
    cell: (c) => (c.getValue() as unknown[]).length,
  },
];

const resourceColumns: ColumnDef<ResourceResult, any>[] = [
  { accessorKey: "url", header: "URL", size: 380 },
  { accessorKey: "resourceType", header: "Type", size: 80 },
  { accessorKey: "status", header: "Status", size: 70, cell: (c) => c.getValue() ?? "-" },
  { accessorKey: "statusText", header: "Status Text", size: 160 },
  { accessorKey: "sourcePage", header: "Source Page", size: 360 },
  { accessorKey: "isInternal", header: "Internal", size: 80, cell: (c) => (c.getValue() ? "Yes" : "No") },
  { accessorKey: "altText", header: "Alt Text", size: 200, cell: (c) => c.getValue() ?? "" },
  { accessorKey: "isInsecure", header: "Insecure", size: 80, cell: (c) => (c.getValue() ? "Yes" : "No") },
  { accessorKey: "error", header: "Error", size: 200, cell: (c) => c.getValue() ?? "" },
];

function App() {
  const [config, setConfig] = useState<CrawlConfig>(DEFAULT_CONFIG);
  const [pages, setPages] = useState<PageResult[]>([]);
  const [resources, setResources] = useState<ResourceResult[]>([]);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [siteInfo, setSiteInfo] = useState<SiteInfo | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [selectedPage, setSelectedPage] = useState<PageResult | null>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceResult | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [linkedUrls, setLinkedUrls] = useState<string[]>([]);
  const pagesBufRef = useRef<PageResult[]>([]);
  const resourcesBufRef = useRef<ResourceResult[]>([]);

  useEffect(() => {
    // `listen()`/unlisten are async, and React StrictMode's dev-only
    // mount->unmount->remount cycle can leave a stale listener from the first
    // mount briefly registered alongside the second mount's listener before its
    // unlisten call resolves. Without this guard, events fired in that overlap
    // window get processed twice (e.g. duplicate rows for the same page).
    let active = true;
    const unlistenFns: Array<() => void> = [];
    let flushHandle: number | undefined;

    function scheduleFlush() {
      if (flushHandle !== undefined) return;
      flushHandle = window.setTimeout(() => {
        flushHandle = undefined;
        if (pagesBufRef.current.length > 0) {
          const batch = pagesBufRef.current;
          pagesBufRef.current = [];
          setPages((prev) => [...prev, ...batch]);
        }
        if (resourcesBufRef.current.length > 0) {
          const batch = resourcesBufRef.current;
          resourcesBufRef.current = [];
          setResources((prev) => [...prev, ...batch]);
        }
      }, 150);
    }

    async function registerListener<T>(event: string, handler: (payload: T) => void) {
      const unlisten = await listen<T>(event, (e) => {
        if (!active) return;
        handler(e.payload);
      });
      if (!active) {
        unlisten();
        return;
      }
      unlistenFns.push(unlisten);
    }

    (async () => {
      await registerListener<PageResult>("crawl://page", (payload) => {
        pagesBufRef.current.push(payload);
        scheduleFlush();
      });
      await registerListener<ResourceResult>("crawl://resource", (payload) => {
        resourcesBufRef.current.push(payload);
        scheduleFlush();
      });
      await registerListener<SiteInfo>("crawl://site_info", (payload) => {
        setSiteInfo(payload);
      });
      await registerListener<CrawlProgress>("crawl://progress", (payload) => {
        setProgress(payload);
        setPaused(payload.paused);
      });
      await registerListener<CrawlSummary>("crawl://done", (payload) => {
        setRunning(false);
        setPaused(false);
        setLinkedUrls(payload.linkedUrls);
        setProgress((prev) => (prev ? { ...prev, running: false, paused: false } : prev));
      });
      await registerListener<string>("crawl://error", (payload) => {
        toast.error(payload);
        setRunning(false);
      });
    })();

    return () => {
      active = false;
      if (flushHandle !== undefined) window.clearTimeout(flushHandle);
      unlistenFns.forEach((fn) => fn());
    };
  }, []);

  const handleStart = useCallback(async () => {
    setPages([]);
    setResources([]);
    setProgress(null);
    setFilter("all");
    setPaused(false);
    setSiteInfo(null);
    setLinkedUrls([]);
    pagesBufRef.current = [];
    resourcesBufRef.current = [];
    setRunning(true);
    try {
      await invoke("start_crawl", { config });
    } catch (err) {
      toast.error(String(err));
      setRunning(false);
    }
  }, [config]);

  const handleStop = useCallback(async () => {
    try {
      await invoke("stop_crawl");
    } catch (err) {
      toast.error(String(err));
    }
  }, []);

  const handlePause = useCallback(async () => {
    setPaused(true);
    try {
      await invoke("pause_crawl");
    } catch (err) {
      toast.error(String(err));
      setPaused(false);
    }
  }, []);

  const handleResume = useCallback(async () => {
    setPaused(false);
    try {
      await invoke("resume_crawl");
    } catch (err) {
      toast.error(String(err));
      setPaused(true);
    }
  }, []);

  const handleExport = useCallback(async (what: "pages" | "resources") => {
    try {
      const path = await save({
        filters: [{ name: "CSV", extensions: ["csv"] }],
        defaultPath: `${what}-export.csv`,
      });
      if (!path) return;
      await invoke("export_csv", { path, what });
    } catch (err) {
      toast.error(String(err));
    }
  }, []);

  const handleSaveCrawl = useCallback(async () => {
    try {
      const path = await save({
        filters: [{ name: "GSEO Crawl", extensions: ["json"] }],
        defaultPath: "crawl.json",
      });
      if (!path) return;
      await invoke("save_crawl", { path, startUrl: config.startUrl });
    } catch (err) {
      toast.error(String(err));
    }
  }, [config.startUrl]);

  const handleOpenCrawl = useCallback(async () => {
    try {
      const path = await open({
        multiple: false,
        filters: [{ name: "GSEO Crawl", extensions: ["json"] }],
      });
      if (!path || typeof path !== "string") return;
      const snapshot = await invoke<CrawlSnapshot>("load_crawl", { path });
      setPages(snapshot.pages);
      setResources(snapshot.resources);
      setProgress(null);
      setRunning(false);
      setFilter("all");
      setConfig((prev) => ({ ...prev, startUrl: snapshot.startUrl }));
    } catch (err) {
      toast.error(String(err));
    }
  }, []);

  const duplicateTitleSet = useMemo(() => getDuplicateTitleSet(pages), [pages]);
  const duplicateContentSet = useMemo(() => getDuplicateContentSet(pages), [pages]);
  const duplicateMetaSet = useMemo(() => getDuplicateMetaSet(pages), [pages]);
  const canonicalStatusMap = useMemo(() => getCanonicalStatusMap(pages), [pages]);
  const linkedUrlSet = useMemo(() => new Set(linkedUrls), [linkedUrls]);
  const filteredPages = useMemo(
    () => filterPages(pages, filter, duplicateTitleSet, duplicateContentSet, duplicateMetaSet, canonicalStatusMap, linkedUrlSet),
    [pages, filter, duplicateTitleSet, duplicateContentSet, duplicateMetaSet, canonicalStatusMap, linkedUrlSet],
  );
  const filteredResources = useMemo(() => filterResources(resources, filter), [resources, filter]);

  const selectedPageIssues = useMemo(() => {
    if (!selectedPage) return [];
    return getPageIssueKeys(selectedPage, duplicateTitleSet, duplicateContentSet, duplicateMetaSet, canonicalStatusMap, linkedUrlSet)
      .map((key) => ISSUE_SOLUTIONS[key])
      .filter((s) => s !== undefined);
  }, [selectedPage, duplicateTitleSet, duplicateContentSet, duplicateMetaSet, canonicalStatusMap, linkedUrlSet]);

  const selectedResourceIssues = useMemo(() => {
    if (!selectedResource) return [];
    return getResourceIssueKeys(selectedResource)
      .map((key) => ISSUE_SOLUTIONS[key])
      .filter((s) => s !== undefined);
  }, [selectedResource]);

  const handleSelectFilter = useCallback((next: FilterKey) => {
    setFilter((prev) => {
      const resolved = prev === next ? "all" : next;
      const targetTab = filterTab(resolved);
      if (targetTab) setTab(targetTab);
      return resolved;
    });
  }, []);

  const exportTab: "pages" | "resources" = tab === "resources" ? "resources" : "pages";
  const exportCount = exportTab === "resources" ? resources.length : pages.length;

  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-2.5 border-b bg-card px-4 py-2.5">
        <h1 className="text-sm font-semibold whitespace-nowrap">GSEO Crawler</h1>
        <UrlCombobox
          value={config.startUrl}
          disabled={running}
          onChange={(startUrl) => setConfig((c) => ({ ...c, startUrl }))}
          onSubmit={handleStart}
        />
        <CrawlActions
          running={running}
          paused={paused}
          canStart={!!config.startUrl}
          onStart={handleStart}
          onStop={handleStop}
          onPause={handlePause}
          onResume={handleResume}
        />
        <CrawlOptionsSheet config={config} running={running} onChange={setConfig} />
        <div className="flex-1" />
        <ThemeToggle />
      </header>

      <Tabs
        value={tab}
        onValueChange={(v) => {
          setTab(v as Tab);
          setFilter("all");
        }}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden p-4"
      >
        <div className="flex items-center gap-2.5">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="pages">Pages ({pages.length})</TabsTrigger>
            <TabsTrigger value="resources">Links & Images ({resources.length})</TabsTrigger>
          </TabsList>
          {filter !== "all" && (
            <Badge variant="secondary" className="h-auto gap-1.5 py-1">
              Filtered
              <button
                type="button"
                className="ml-0.5 hover:text-foreground"
                onClick={() => setFilter("all")}
                aria-label="Clear filter"
              >
                ×
              </button>
            </Badge>
          )}
          <div className="flex-1" />
          <Button variant="outline" size="sm" onClick={handleOpenCrawl} disabled={running}>
            Open Crawl…
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleSaveCrawl}
            disabled={pages.length === 0 && resources.length === 0}
          >
            Save Crawl…
          </Button>
          <Button variant="outline" size="sm" onClick={() => handleExport(exportTab)} disabled={exportCount === 0}>
            Export {exportTab === "pages" ? "Pages" : "Resources"} CSV
          </Button>
        </div>

        <TabsContent value="overview" className="flex flex-col gap-4 overflow-y-auto">
          {siteInfo && <SiteInfoPanel siteInfo={siteInfo} />}
          <Overview
            pages={pages}
            resources={resources}
            linkedUrls={linkedUrlSet}
            duplicateTitles={duplicateTitleSet}
            duplicateContent={duplicateContentSet}
            duplicateMeta={duplicateMetaSet}
            canonicalStatusMap={canonicalStatusMap}
            progress={progress}
            running={running}
            paused={paused}
            activeFilter={filter}
            onSelectFilter={handleSelectFilter}
          />
        </TabsContent>

        <TabsContent value="pages" className="min-h-0 flex-1">
          <DataTable
            data={filteredPages}
            columns={pageColumns}
            emptyLabel="No pages crawled yet — start a crawl above."
            onRowClick={setSelectedPage}
          />
        </TabsContent>

        <TabsContent value="resources" className="min-h-0 flex-1">
          <DataTable
            data={filteredResources}
            columns={resourceColumns}
            emptyLabel="No external links or images checked yet."
            onRowClick={setSelectedResource}
          />
        </TabsContent>
      </Tabs>

      {selectedPage && (
        <DetailModal
          title={selectedPage.url}
          onClose={() => setSelectedPage(null)}
          issues={selectedPageIssues}
          fields={[
            { label: "URL", value: selectedPage.url },
            { label: "Status", value: selectedPage.status },
            { label: "Status Text", value: selectedPage.statusText },
            { label: "Indexability", value: selectedPage.indexability },
            { label: "Error", value: selectedPage.error, isError: true },
            { label: "Redirect URL", value: selectedPage.redirectUrl },
            { label: "Title", value: selectedPage.title },
            { label: "Title Length", value: selectedPage.titleLength },
            { label: "Meta Description", value: selectedPage.metaDescription },
            { label: "Meta Description Length", value: selectedPage.metaDescriptionLength },
            { label: "H1", value: selectedPage.h1 },
            { label: "H1 Count", value: selectedPage.h1Count },
            { label: "Word Count", value: selectedPage.wordCount },
            { label: "Canonical", value: selectedPage.canonical },
            { label: "Meta Robots", value: selectedPage.metaRobots },
            { label: "Content Type", value: selectedPage.contentType },
            { label: "Response Time (ms)", value: selectedPage.responseTimeMs },
            { label: "Internal Links", value: selectedPage.internalLinkCount },
            { label: "External Links", value: selectedPage.externalLinkCount },
            { label: "Images", value: selectedPage.imageCount },
            { label: "Size (bytes)", value: selectedPage.htmlSizeBytes },
            { label: "Minified", value: selectedPage.htmlSizeBytes ? (selectedPage.isMinified ? "Yes" : "No") : null },
            {
              label: "Minify Savings",
              value: selectedPage.htmlSizeBytes ? `${selectedPage.minifySavingsPct.toFixed(0)}%` : null,
            },
            { label: "Depth", value: selectedPage.depth },
            { label: "JS Rendered", value: selectedPage.rendered ? "Yes" : "No" },
            {
              label: "HSTS",
              value: selectedPage.url.startsWith("https:") ? (selectedPage.hsts ? "Yes" : "No") : null,
            },
            { label: "Insecure Links", value: selectedPage.insecureLinkCount },
            { label: "Missing Alt Images", value: selectedPage.missingAltCount },
            { label: "Lang Attribute", value: selectedPage.htmlSizeBytes ? selectedPage.lang : null },
            {
              label: "Hreflang",
              value: selectedPage.hreflangValues.length > 0 ? selectedPage.hreflangValues.join(", ") : null,
            },
            { label: "Internal Nofollow Links", value: selectedPage.internalNofollowCount },
            {
              label: "Text/HTML Ratio",
              value: selectedPage.htmlSizeBytes ? `${selectedPage.textRatioPct.toFixed(1)}%` : null,
            },
            { label: "X-Robots-Tag", value: selectedPage.xRobotsTag },
            { label: "Viewport", value: selectedPage.viewport },
            { label: "Open Graph Tags", value: selectedPage.hasOpenGraph ? "Yes" : "No" },
            { label: "Twitter Card Tags", value: selectedPage.hasTwitterCard ? "Yes" : "No" },
            { label: "Canonical Tag Count", value: selectedPage.canonicalCount },
            { label: "Discovered Via Sitemap", value: selectedPage.discoveredViaSitemap ? "Yes" : "No" },
            {
              label: "Redirect Chain",
              value: selectedPage.redirectChain.length > 0 ? selectedPage.redirectChain.join(" → ") : null,
            },
            {
              label: "Structured Data Types",
              value: selectedPage.structuredDataTypes.length > 0 ? selectedPage.structuredDataTypes.join(", ") : null,
            },
            {
              label: "Structured Data Errors",
              value: selectedPage.structuredDataErrors.length > 0 ? selectedPage.structuredDataErrors.join("; ") : null,
              isError: true,
            },
            {
              label: "Accessibility Violations",
              value:
                selectedPage.accessibilityViolations.length > 0
                  ? selectedPage.accessibilityViolations.map((v) => `${v.id} (${v.nodeCount} nodes)`).join("; ")
                  : null,
              isError: true,
            },
          ]}
        />
      )}

      {selectedResource && (
        <DetailModal
          title={selectedResource.url}
          onClose={() => setSelectedResource(null)}
          issues={selectedResourceIssues}
          fields={[
            { label: "URL", value: selectedResource.url },
            { label: "Type", value: selectedResource.resourceType },
            { label: "Status", value: selectedResource.status },
            { label: "Status Text", value: selectedResource.statusText },
            { label: "Source Page", value: selectedResource.sourcePage },
            { label: "Internal", value: selectedResource.isInternal ? "Yes" : "No" },
            { label: "Alt Text", value: selectedResource.altText },
            { label: "Insecure", value: selectedResource.isInsecure ? "Yes" : "No" },
            { label: "Error", value: selectedResource.error, isError: true },
          ]}
        />
      )}
    </div>
  );
}

export default App;
