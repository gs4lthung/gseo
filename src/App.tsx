import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open, save } from "@tauri-apps/plugin-dialog";
import type { ColumnDef } from "@tanstack/react-table";
import "./App.css";
import { CrawlForm } from "./components/CrawlForm";
import { SummaryBar } from "./components/SummaryBar";
import { DataTable } from "./components/DataTable";
import { DetailModal } from "./components/DetailModal";
import {
  DEFAULT_CONFIG,
  type CrawlConfig,
  type CrawlProgress,
  type CrawlSnapshot,
  type PageResult,
  type ResourceResult,
} from "./types";
import { type FilterKey, filterPages, filterResources, filterTab, getDuplicateTitleSet } from "./lib/filters";

type Tab = "pages" | "resources";

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
];

const resourceColumns: ColumnDef<ResourceResult, any>[] = [
  { accessorKey: "url", header: "URL", size: 380 },
  { accessorKey: "resourceType", header: "Type", size: 80 },
  { accessorKey: "status", header: "Status", size: 70, cell: (c) => c.getValue() ?? "-" },
  { accessorKey: "statusText", header: "Status Text", size: 160 },
  { accessorKey: "sourcePage", header: "Source Page", size: 360 },
  { accessorKey: "isInternal", header: "Internal", size: 80, cell: (c) => (c.getValue() ? "Yes" : "No") },
  { accessorKey: "error", header: "Error", size: 200, cell: (c) => c.getValue() ?? "" },
];

function App() {
  const [config, setConfig] = useState<CrawlConfig>(DEFAULT_CONFIG);
  const [pages, setPages] = useState<PageResult[]>([]);
  const [resources, setResources] = useState<ResourceResult[]>([]);
  const [progress, setProgress] = useState<CrawlProgress | null>(null);
  const [running, setRunning] = useState(false);
  const [paused, setPaused] = useState(false);
  const [tab, setTab] = useState<Tab>("pages");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [selectedPage, setSelectedPage] = useState<PageResult | null>(null);
  const [selectedResource, setSelectedResource] = useState<ResourceResult | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
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
      await registerListener<CrawlProgress>("crawl://progress", (payload) => {
        setProgress(payload);
        setPaused(payload.paused);
      });
      await registerListener<void>("crawl://done", () => {
        setRunning(false);
        setPaused(false);
        setProgress((prev) => (prev ? { ...prev, running: false, paused: false } : prev));
      });
      await registerListener<string>("crawl://error", (payload) => {
        setErrorMsg(payload);
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
    setErrorMsg(null);
    setFilter("all");
    setPaused(false);
    pagesBufRef.current = [];
    resourcesBufRef.current = [];
    setRunning(true);
    try {
      await invoke("start_crawl", { config });
    } catch (err) {
      setErrorMsg(String(err));
      setRunning(false);
    }
  }, [config]);

  const handleStop = useCallback(async () => {
    try {
      await invoke("stop_crawl");
    } catch (err) {
      setErrorMsg(String(err));
    }
  }, []);

  const handlePause = useCallback(async () => {
    setPaused(true);
    try {
      await invoke("pause_crawl");
    } catch (err) {
      setErrorMsg(String(err));
      setPaused(false);
    }
  }, []);

  const handleResume = useCallback(async () => {
    setPaused(false);
    try {
      await invoke("resume_crawl");
    } catch (err) {
      setErrorMsg(String(err));
      setPaused(true);
    }
  }, []);

  const handleExport = useCallback(async (what: Tab) => {
    try {
      const path = await save({
        filters: [{ name: "CSV", extensions: ["csv"] }],
        defaultPath: `${what}-export.csv`,
      });
      if (!path) return;
      await invoke("export_csv", { path, what });
    } catch (err) {
      setErrorMsg(String(err));
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
      setErrorMsg(String(err));
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
      setErrorMsg(String(err));
    }
  }, []);

  const activeCount = useMemo(() => (tab === "pages" ? pages.length : resources.length), [tab, pages, resources]);

  const duplicateTitleSet = useMemo(() => getDuplicateTitleSet(pages), [pages]);
  const filteredPages = useMemo(
    () => filterPages(pages, filter, duplicateTitleSet),
    [pages, filter, duplicateTitleSet],
  );
  const filteredResources = useMemo(() => filterResources(resources, filter), [resources, filter]);

  const handleSelectFilter = useCallback((next: FilterKey) => {
    setFilter((prev) => {
      const resolved = prev === next ? "all" : next;
      const targetTab = filterTab(resolved);
      if (targetTab) setTab(targetTab);
      return resolved;
    });
  }, []);

  return (
    <div className="app">
      <header className="app-header">
        <h1>GSEO Crawler</h1>
        <CrawlForm
          config={config}
          onChange={setConfig}
          running={running}
          paused={paused}
          onStart={handleStart}
          onStop={handleStop}
          onPause={handlePause}
          onResume={handleResume}
        />
      </header>

      <SummaryBar
        pages={pages}
        resources={resources}
        progress={progress}
        running={running}
        paused={paused}
        activeFilter={filter}
        onSelectFilter={handleSelectFilter}
      />

      {errorMsg && (
        <div className="error-banner">
          {errorMsg}
          <button onClick={() => setErrorMsg(null)}>×</button>
        </div>
      )}

      <div className="tabs">
        <button
          className={tab === "pages" ? "tab active" : "tab"}
          onClick={() => {
            setTab("pages");
            setFilter("all");
          }}
        >
          Pages ({pages.length})
        </button>
        <button
          className={tab === "resources" ? "tab active" : "tab"}
          onClick={() => {
            setTab("resources");
            setFilter("all");
          }}
        >
          Links & Images ({resources.length})
        </button>
        {filter !== "all" && (
          <span className="filter-chip">
            Filtered
            <button onClick={() => setFilter("all")}>Clear ×</button>
          </span>
        )}
        <div className="tab-spacer" />
        <button className="btn" onClick={handleOpenCrawl} disabled={running}>
          Open Crawl…
        </button>
        <button className="btn" onClick={handleSaveCrawl} disabled={pages.length === 0 && resources.length === 0}>
          Save Crawl…
        </button>
        <button className="btn" onClick={() => handleExport(tab)} disabled={activeCount === 0}>
          Export {tab === "pages" ? "Pages" : "Resources"} CSV
        </button>
      </div>

      <main className="table-area">
        {tab === "pages" ? (
          <DataTable
            data={filteredPages}
            columns={pageColumns}
            emptyLabel="No pages crawled yet — start a crawl above."
            onRowClick={setSelectedPage}
          />
        ) : (
          <DataTable
            data={filteredResources}
            columns={resourceColumns}
            emptyLabel="No external links or images checked yet."
            onRowClick={setSelectedResource}
          />
        )}
      </main>

      {selectedPage && (
        <DetailModal
          title={selectedPage.url}
          onClose={() => setSelectedPage(null)}
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
          ]}
        />
      )}

      {selectedResource && (
        <DetailModal
          title={selectedResource.url}
          onClose={() => setSelectedResource(null)}
          fields={[
            { label: "URL", value: selectedResource.url },
            { label: "Type", value: selectedResource.resourceType },
            { label: "Status", value: selectedResource.status },
            { label: "Status Text", value: selectedResource.statusText },
            { label: "Source Page", value: selectedResource.sourcePage },
            { label: "Internal", value: selectedResource.isInternal ? "Yes" : "No" },
            { label: "Alt Text", value: selectedResource.altText },
            { label: "Error", value: selectedResource.error, isError: true },
          ]}
        />
      )}
    </div>
  );
}

export default App;
