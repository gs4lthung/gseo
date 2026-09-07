export interface CrawlConfig {
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  userAgent: string;
  timeoutSecs: number;
  /** Minimum delay, in milliseconds, between starting successive page requests to the crawled site — a politeness throttle independent of concurrency. If the site's robots.txt specifies a longer `Crawl-delay`, that value wins. */
  delayMs: number;
  checkExternalLinks: boolean;
  checkImages: boolean;
  respectRobots: boolean;
  useSitemap: boolean;
  renderJs: boolean;
  lookupHosting: boolean;
  runAccessibilityAudit: boolean;
}

export interface PageResult {
  url: string;
  depth: number;
  status: number | null;
  statusText: string;
  contentType: string | null;
  title: string | null;
  titleLength: number;
  metaDescription: string | null;
  metaDescriptionLength: number;
  h1: string | null;
  h1Count: number;
  wordCount: number;
  canonical: string | null;
  metaRobots: string | null;
  redirectUrl: string | null;
  indexability: string;
  responseTimeMs: number;
  internalLinkCount: number;
  externalLinkCount: number;
  imageCount: number;
  htmlSizeBytes: number;
  minifySavingsPct: number;
  isMinified: boolean;
  rendered: boolean;
  hsts: boolean;
  insecureLinkCount: number;
  missingAltCount: number;
  lang: string | null;
  hreflangValues: string[];
  internalNofollowCount: number;
  textRatioPct: number;
  contentHash: string;
  xRobotsTag: string | null;
  viewport: string | null;
  hasOpenGraph: boolean;
  hasTwitterCard: boolean;
  canonicalCount: number;
  discoveredViaSitemap: boolean;
  redirectChain: string[];
  structuredDataTypes: string[];
  structuredDataErrors: string[];
  accessibilityViolations: AccessibilityViolation[];
  error: string | null;
}

export interface AccessibilityViolation {
  id: string;
  impact: string | null;
  description: string;
  helpUrl: string;
  nodeCount: number;
}

export type ResourceKind = "link" | "image";

export interface ResourceResult {
  url: string;
  resourceType: ResourceKind;
  sourcePage: string;
  altText: string | null;
  status: number | null;
  statusText: string;
  isInternal: boolean;
  isInsecure: boolean;
  error: string | null;
}

export interface CrawlProgress {
  crawled: number;
  queued: number;
  resourcesChecked: number;
  resourcesTotal: number;
  running: boolean;
  paused: boolean;
}

export interface SiteInfo {
  llmsTxtFound: boolean;
  llmsTxtUrl: string | null;
  robotsTxtChecked: boolean;
  server: string | null;
  poweredBy: string | null;
  cdn: string | null;
  cms: string | null;
  technologies: string[];
  ipAddresses: string[];
  hostingOrg: string | null;
  hostingCountry: string | null;
}

export interface CrawlSummary {
  pagesCrawled: number;
  resourcesChecked: number;
  cancelled: boolean;
  linkedUrls: string[];
}

export interface CrawlSnapshot {
  startUrl: string;
  savedAtUnixMs: number;
  pages: PageResult[];
  resources: ResourceResult[];
}

export const DEFAULT_CONFIG: CrawlConfig = {
  startUrl: "",
  maxPages: 500,
  maxDepth: 10,
  concurrency: 5,
  userAgent: "GSEOCrawler/0.1 (+https://worldcraftlogistics.com)",
  timeoutSecs: 15,
  delayMs: 0,
  checkExternalLinks: true,
  checkImages: true,
  respectRobots: false,
  useSitemap: false,
  renderJs: false,
  lookupHosting: false,
  runAccessibilityAudit: false,
};
