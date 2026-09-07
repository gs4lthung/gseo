use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlConfig {
    pub start_url: String,
    #[serde(default = "default_max_pages")]
    pub max_pages: usize,
    #[serde(default = "default_max_depth")]
    pub max_depth: usize,
    #[serde(default = "default_concurrency")]
    pub concurrency: usize,
    #[serde(default = "default_user_agent")]
    pub user_agent: String,
    #[serde(default = "default_timeout")]
    pub timeout_secs: u64,
    /// Minimum delay, in milliseconds, between starting successive page requests —
    /// a politeness throttle independent of `concurrency`. The site's robots.txt
    /// `Crawl-delay`, if present and longer, takes precedence (see `run_crawl`).
    #[serde(default)]
    pub delay_ms: u64,
    #[serde(default = "default_true")]
    pub check_external_links: bool,
    #[serde(default = "default_true")]
    pub check_images: bool,
    #[serde(default)]
    pub respect_robots: bool,
    #[serde(default)]
    pub use_sitemap: bool,
    #[serde(default)]
    pub render_js: bool,
    #[serde(default)]
    pub lookup_hosting: bool,
    #[serde(default)]
    pub run_accessibility_audit: bool,
}

fn default_max_pages() -> usize {
    500
}
fn default_max_depth() -> usize {
    10
}
fn default_concurrency() -> usize {
    5
}
fn default_user_agent() -> String {
    "GSEOCrawler/0.1 (+https://worldcraftlogistics.com)".to_string()
}
fn default_timeout() -> u64 {
    15
}
fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum ResourceType {
    Link,
    Image,
}

#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PageResult {
    pub url: String,
    pub depth: usize,
    pub status: Option<u16>,
    pub status_text: String,
    pub content_type: Option<String>,
    pub title: Option<String>,
    pub title_length: usize,
    pub meta_description: Option<String>,
    pub meta_description_length: usize,
    pub h1: Option<String>,
    pub h1_count: usize,
    pub word_count: usize,
    pub canonical: Option<String>,
    pub meta_robots: Option<String>,
    pub redirect_url: Option<String>,
    pub indexability: String,
    pub response_time_ms: u64,
    pub internal_link_count: usize,
    pub external_link_count: usize,
    pub image_count: usize,
    pub html_size_bytes: usize,
    pub minify_savings_pct: f64,
    pub is_minified: bool,
    pub rendered: bool,
    pub hsts: bool,
    pub insecure_link_count: usize,
    pub missing_alt_count: usize,
    pub lang: Option<String>,
    pub hreflang_values: Vec<String>,
    pub internal_nofollow_count: usize,
    pub text_ratio_pct: f64,
    pub content_hash: String,
    pub x_robots_tag: Option<String>,
    pub viewport: Option<String>,
    pub has_open_graph: bool,
    pub has_twitter_card: bool,
    pub canonical_count: usize,
    pub discovered_via_sitemap: bool,
    pub redirect_chain: Vec<String>,
    pub structured_data_types: Vec<String>,
    pub structured_data_errors: Vec<String>,
    pub accessibility_violations: Vec<AccessibilityViolation>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AccessibilityViolation {
    pub id: String,
    pub impact: Option<String>,
    pub description: String,
    pub help_url: String,
    pub node_count: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ResourceResult {
    pub url: String,
    pub resource_type: ResourceType,
    pub source_page: String,
    pub alt_text: Option<String>,
    pub status: Option<u16>,
    pub status_text: String,
    pub is_internal: bool,
    pub is_insecure: bool,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlProgress {
    pub crawled: usize,
    pub queued: usize,
    pub resources_checked: usize,
    pub resources_total: usize,
    pub running: bool,
    pub paused: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SiteInfo {
    pub llms_txt_found: bool,
    pub llms_txt_url: Option<String>,
    pub robots_txt_checked: bool,
    pub server: Option<String>,
    pub powered_by: Option<String>,
    pub cdn: Option<String>,
    pub cms: Option<String>,
    pub technologies: Vec<String>,
    pub ip_addresses: Vec<String>,
    pub hosting_org: Option<String>,
    pub hosting_country: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlSummary {
    pub pages_crawled: usize,
    pub resources_checked: usize,
    pub cancelled: bool,
    pub linked_urls: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlSnapshot {
    pub start_url: String,
    pub saved_at_unix_ms: u64,
    pub pages: Vec<PageResult>,
    pub resources: Vec<ResourceResult>,
}
