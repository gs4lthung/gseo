<p align="center">
  <img src="docs/banner.svg" alt="GSEO Crawler" width="100%" />
</p>

# GSEO Crawler

A desktop site crawler and SEO auditor built with **Tauri**, **React**, and **Rust**. Point it at a URL, crawl the site, and get a searchable, sortable table of every page and resource — with SEO/accessibility issues flagged inline, not buried in a report.

## Download

No build tools required — grab an installer for your OS from the **[Releases page](https://github.com/gs4lthung/gseo/releases)**:

| Platform | File |
| --- | --- |
| Windows | `.msi` or `.exe` |
| macOS (Apple Silicon) | `.dmg` (aarch64) |
| macOS (Intel) | `.dmg` (x64) |
| Linux | `.AppImage` or `.deb` |

Builds aren't code-signed yet, so the OS will warn before the first run:
- **Windows**: click "More info" → "Run anyway" on the SmartScreen prompt.
- **macOS**: right-click the app → "Open" (instead of double-clicking) the first time, since Gatekeeper blocks unsigned apps from opening normally.

If there's no release yet for the version you need, see [Getting started](#getting-started) to build it yourself.

## Features

**Crawling**
- Configurable depth, page limit, and concurrency, with pause/resume and cancel
- Optional `robots.txt` compliance (including `Crawl-delay`) and a politeness delay independent of concurrency
- Sitemap.xml seeding, redirect-chain tracking, and orphan-page detection (in the sitemap but not internally linked)
- Optional JavaScript rendering via headless Chrome, with an axe-core accessibility audit on the rendered page
- Site fingerprinting: server/CDN/CMS detection, `llms.txt` discovery, and optional hosting/ASN lookup

**Auditing**
- 25+ built-in issue checks — broken links, missing/duplicate titles & meta descriptions, title length, H1 issues, canonical problems, insecure links, missing alt text, HSTS, hreflang, structured data errors, and more
- Problem cells and rows are flagged inline in the table (not just in a report), with a per-page issue count and hover detail
- A detail modal per page/resource with plain-language explanations and fixes for every flagged issue

**Working with results**
- Virtualized tables handle large crawls smoothly; columns are resizable and sortable
- The URL column stays pinned while scrolling; any other column can be pinned too (right-click a header)
- Quick text search across URL/title/meta description, plus canned filters (status codes, missing titles, duplicate content, etc.)
- Save/load a full crawl snapshot, or export pages/resources to CSV

## Tech stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, shadcn/Radix UI, TanStack Table + Virtual
- **Backend**: Rust, Tauri 2, Tokio, reqwest, scraper, headless_chrome
- **Tests**: Vitest (frontend), Rust's built-in test harness (backend)

## Getting started

Prerequisites: [Node.js](https://nodejs.org/), [Rust](https://www.rust-lang.org/tools/install), and the [Tauri system dependencies](https://tauri.app/start/prerequisites/) for your OS.

```bash
npm install

# run the app in development mode
npm run tauri dev

# build a release bundle
npm run tauri build
```

Running just the frontend in a browser (`npm run dev`) also works for UI-only iteration, but crawling requires the Tauri backend.

## Testing

```bash
npm test              # frontend unit tests (Vitest)
cd src-tauri && cargo test   # backend unit tests
```

## Project structure

```
src/                  React frontend
  components/         UI components (DataTable, DetailModal, Overview, ...)
  lib/                 Issue-detection rules, filters, search
src-tauri/src/
  crawler/             Crawl loop, HTML parsing, robots.txt/sitemap, rendering, tech detection
  commands.rs          Tauri commands exposed to the frontend
docs/                  Assets referenced from this README
```

## Releasing (maintainers)

Pushing a tag matching `v*` (e.g. `v0.1.0`) triggers [`.github/workflows/release.yml`](.github/workflows/release.yml), which builds installers for Windows, macOS (Intel + Apple Silicon), and Linux, and publishes them as a **draft** GitHub Release for review before it goes public:

```bash
git tag v0.1.0
git push origin v0.1.0
```

It can also be run manually from the Actions tab (`workflow_dispatch`) without a tag push.
