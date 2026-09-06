export interface CrawlConfig {
  startUrl: string;
  maxPages: number;
  maxDepth: number;
  concurrency: number;
  userAgent: string;
  timeoutSecs: number;
  checkExternalLinks: boolean;
  checkImages: boolean;
  respectRobots: boolean;
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
  error: string | null;
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
  error: string | null;
}

export interface CrawlProgress {
  crawled: number;
  queued: number;
  resourcesChecked: number;
  resourcesTotal: number;
  running: boolean;
}

export interface CrawlSummary {
  pagesCrawled: number;
  resourcesChecked: number;
  cancelled: boolean;
}

export const DEFAULT_CONFIG: CrawlConfig = {
  startUrl: "",
  maxPages: 500,
  maxDepth: 10,
  concurrency: 5,
  userAgent: "GSEOCrawler/0.1 (+https://worldcraftlogistics.com)",
  timeoutSecs: 15,
  checkExternalLinks: true,
  checkImages: true,
  respectRobots: false,
};
