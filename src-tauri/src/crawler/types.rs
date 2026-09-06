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

#[derive(Debug, Clone, Serialize, Deserialize)]
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
    pub error: Option<String>,
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
pub struct CrawlSummary {
    pub pages_crawled: usize,
    pub resources_checked: usize,
    pub cancelled: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CrawlSnapshot {
    pub start_url: String,
    pub saved_at_unix_ms: u64,
    pub pages: Vec<PageResult>,
    pub resources: Vec<ResourceResult>,
}
