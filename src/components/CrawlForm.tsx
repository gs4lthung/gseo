import { useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { CrawlConfig } from "../types";
import { addUrlToHistory, clearUrlHistory, getUrlHistory, removeUrlFromHistory } from "../lib/urlHistory";

interface CrawlFormProps {
  config: CrawlConfig;
  onChange: (config: CrawlConfig) => void;
  running: boolean;
  paused: boolean;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function CrawlForm({
  config,
  onChange,
  running,
  paused,
  onStart,
  onStop,
  onPause,
  onResume,
}: CrawlFormProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState(config.startUrl);
  const inputWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setHistory(getUrlHistory());
  }, []);

  useEffect(() => {
    const handle = window.setTimeout(() => setDebouncedQuery(config.startUrl), 150);
    return () => window.clearTimeout(handle);
  }, [config.startUrl]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (inputWrapRef.current && !inputWrapRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filteredHistory = useMemo(() => {
    const q = debouncedQuery.trim().toLowerCase();
    const list = q ? history.filter((u) => u.toLowerCase().includes(q)) : history;
    return list.slice(0, 8);
  }, [history, debouncedQuery]);

  function set<K extends keyof CrawlConfig>(key: K, value: CrawlConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  function handleStartClick() {
    addUrlToHistory(config.startUrl);
    setHistory(getUrlHistory());
    setShowDropdown(false);
    onStart();
  }

  function selectHistoryUrl(url: string) {
    set("startUrl", url);
    setShowDropdown(false);
  }

  function handleClearHistory() {
    clearUrlHistory();
    setHistory([]);
  }

  function handleRemoveHistoryItem(e: ReactMouseEvent, url: string) {
    e.stopPropagation();
    removeUrlFromHistory(url);
    setHistory((prev) => prev.filter((u) => u !== url));
  }

  return (
    <div className="crawl-form">
      <div className="url-input-wrap" ref={inputWrapRef}>
        <input
          type="text"
          className="url-input"
          placeholder="https://example.com"
          value={config.startUrl}
          disabled={running}
          onFocus={() => setShowDropdown(true)}
          onChange={(e) => set("startUrl", e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !running && config.startUrl) handleStartClick();
            else if (e.key === "Escape") setShowDropdown(false);
          }}
        />
        {showDropdown && !running && filteredHistory.length > 0 && (
          <ul className="url-history-dropdown">
            {filteredHistory.map((u) => (
              <li key={u} className="url-history-item">
                <button type="button" className="url-history-select" onClick={() => selectHistoryUrl(u)}>
                  {u}
                </button>
                <button
                  type="button"
                  className="url-history-remove"
                  aria-label={`Remove ${u} from history`}
                  onClick={(e) => handleRemoveHistoryItem(e, u)}
                >
                  ×
                </button>
              </li>
            ))}
            <li className="url-history-clear">
              <button type="button" onClick={handleClearHistory}>
                Clear history
              </button>
            </li>
          </ul>
        )}
      </div>
      {!running ? (
        <button className="btn primary" disabled={!config.startUrl} onClick={handleStartClick}>
          Start Crawl
        </button>
      ) : (
        <>
          {paused ? (
            <button className="btn" onClick={onResume}>
              Resume
            </button>
          ) : (
            <button className="btn" onClick={onPause}>
              Pause
            </button>
          )}
          <button className="btn danger" onClick={onStop}>
            Stop
          </button>
        </>
      )}

      <details className="options">
        <summary>Options</summary>
        <div className="options-grid">
          <label>
            Max pages
            <input
              type="number"
              min={1}
              value={config.maxPages}
              disabled={running}
              onChange={(e) => set("maxPages", Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Max depth
            <input
              type="number"
              min={0}
              value={config.maxDepth}
              disabled={running}
              onChange={(e) => set("maxDepth", Number(e.target.value) || 0)}
            />
          </label>
          <label>
            Concurrency
            <input
              type="number"
              min={1}
              max={50}
              value={config.concurrency}
              disabled={running}
              onChange={(e) => set("concurrency", Number(e.target.value) || 1)}
            />
          </label>
          <label>
            Timeout (s)
            <input
              type="number"
              min={1}
              value={config.timeoutSecs}
              disabled={running}
              onChange={(e) => set("timeoutSecs", Number(e.target.value) || 1)}
            />
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.checkExternalLinks}
              disabled={running}
              onChange={(e) => set("checkExternalLinks", e.target.checked)}
            />
            Check external links
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.checkImages}
              disabled={running}
              onChange={(e) => set("checkImages", e.target.checked)}
            />
            Check images
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.respectRobots}
              disabled={running}
              onChange={(e) => set("respectRobots", e.target.checked)}
            />
            Respect robots.txt
          </label>
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={config.useSitemap}
              disabled={running}
              onChange={(e) => set("useSitemap", e.target.checked)}
            />
            Seed from sitemap.xml
          </label>
          <label className="checkbox-label" title="Renders each page with a headless Chrome instance before parsing. Requires Chrome/Chromium installed; much slower per page.">
            <input
              type="checkbox"
              checked={config.renderJs}
              disabled={running}
              onChange={(e) =>
                onChange({
                  ...config,
                  renderJs: e.target.checked,
                  // Accessibility audit runs inside the same JS-render browser pass,
                  // so it can't be enabled without it.
                  runAccessibilityAudit: e.target.checked ? config.runAccessibilityAudit : false,
                })
              }
            />
            Render JavaScript (slow)
          </label>
          <label
            className="checkbox-label"
            title="Runs an axe-core accessibility audit on the rendered page. Requires 'Render JavaScript' since it reuses that browser pass; enabling this turns Render JavaScript on automatically."
          >
            <input
              type="checkbox"
              checked={config.runAccessibilityAudit}
              disabled={running}
              onChange={(e) =>
                onChange({
                  ...config,
                  runAccessibilityAudit: e.target.checked,
                  renderJs: e.target.checked ? true : config.renderJs,
                })
              }
            />
            Run accessibility audit (axe-core, slow)
          </label>
          <label
            className="checkbox-label"
            title="Sends the site's resolved IP address to the free ip-api.com service to identify the hosting provider/ASN."
          >
            <input
              type="checkbox"
              checked={config.lookupHosting}
              disabled={running}
              onChange={(e) => set("lookupHosting", e.target.checked)}
            />
            Look up hosting provider (calls ip-api.com)
          </label>
          <label className="wide">
            User agent
            <input
              type="text"
              value={config.userAgent}
              disabled={running}
              onChange={(e) => set("userAgent", e.target.value)}
            />
          </label>
        </div>
      </details>
    </div>
  );
}
