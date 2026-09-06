import type { CrawlConfig } from "../types";

interface CrawlFormProps {
  config: CrawlConfig;
  onChange: (config: CrawlConfig) => void;
  running: boolean;
  onStart: () => void;
  onStop: () => void;
}

export function CrawlForm({ config, onChange, running, onStart, onStop }: CrawlFormProps) {
  function set<K extends keyof CrawlConfig>(key: K, value: CrawlConfig[K]) {
    onChange({ ...config, [key]: value });
  }

  return (
    <div className="crawl-form">
      <input
        type="text"
        className="url-input"
        placeholder="https://example.com"
        value={config.startUrl}
        disabled={running}
        onChange={(e) => set("startUrl", e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !running && config.startUrl) onStart();
        }}
      />
      {!running ? (
        <button className="btn primary" disabled={!config.startUrl} onClick={onStart}>
          Start Crawl
        </button>
      ) : (
        <button className="btn danger" onClick={onStop}>
          Stop
        </button>
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
