use scraper::{Html, Selector};
use serde_json::Value;
use url::Url;

pub struct ParsedPage {
    pub title: Option<String>,
    pub meta_description: Option<String>,
    pub meta_robots: Option<String>,
    pub h1: Option<String>,
    pub h1_count: usize,
    pub word_count: usize,
    pub canonical: Option<String>,
    pub canonical_count: usize,
    pub internal_links: Vec<Url>,
    pub external_links: Vec<Url>,
    pub images: Vec<(Url, Option<String>)>,
    pub html_size_bytes: usize,
    pub minify_savings_pct: f64,
    pub is_minified: bool,
    pub insecure_link_count: usize,
    pub missing_alt_count: usize,
    pub lang: Option<String>,
    pub hreflang_values: Vec<String>,
    pub internal_nofollow_count: usize,
    pub text_ratio_pct: f64,
    pub content_hash: String,
    pub viewport: Option<String>,
    pub has_open_graph: bool,
    pub has_twitter_card: bool,
    pub structured_data_types: Vec<String>,
    pub structured_data_errors: Vec<String>,
}

/// Walks a parsed JSON-LD value collecting every `@type` found, including
/// inside a `@graph` array or a top-level array of multiple entities.
fn collect_schema_types(value: &Value, out: &mut Vec<String>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_schema_types(item, out);
            }
        }
        Value::Object(map) => {
            if let Some(graph) = map.get("@graph") {
                collect_schema_types(graph, out);
            }
            match map.get("@type") {
                Some(Value::String(s)) => out.push(s.clone()),
                Some(Value::Array(types)) => {
                    for t in types {
                        if let Value::String(s) = t {
                            out.push(s.clone());
                        }
                    }
                }
                _ => {}
            }
        }
        _ => {}
    }
}

/// Below this estimated re-minification saving, a page is considered already minified.
const MINIFIED_SAVINGS_THRESHOLD_PCT: f64 = 10.0;

fn strip_html_comments(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < s.len() {
        if s[i..].starts_with("<!--") {
            match s[i..].find("-->") {
                Some(end) => {
                    i += end + 3;
                    continue;
                }
                None => break,
            }
        }
        let ch = s[i..].chars().next().unwrap();
        out.push(ch);
        i += ch.len_utf8();
    }
    out
}

fn collapse_whitespace(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut last_was_space = false;
    for ch in s.chars() {
        if ch.is_whitespace() {
            if !last_was_space {
                out.push(' ');
            }
            last_was_space = true;
        } else {
            out.push(ch);
            last_was_space = false;
        }
    }
    out.trim().to_string()
}

/// Estimates how much smaller `body` could get from stripping HTML comments and
/// collapsing whitespace runs. A high savings percentage means the page was served
/// unminified; a low one means it was already minified (or was already tiny/dense).
fn estimate_minify_savings_pct(body: &str) -> f64 {
    let original_len = body.len();
    if original_len == 0 {
        return 0.0;
    }
    let minified = collapse_whitespace(&strip_html_comments(body));
    let minified_len = minified.len();
    if minified_len >= original_len {
        return 0.0;
    }
    (1.0 - (minified_len as f64 / original_len as f64)) * 100.0
}

fn resolve_url(base: &Url, href: &str) -> Option<Url> {
    let href = href.trim();
    if href.is_empty() || href.starts_with('#') {
        return None;
    }
    let lower = href.to_ascii_lowercase();
    if lower.starts_with("mailto:")
        || lower.starts_with("tel:")
        || lower.starts_with("javascript:")
        || lower.starts_with("data:")
    {
        return None;
    }
    base.join(href).ok().map(|mut u| {
        u.set_fragment(None);
        u
    })
}

fn is_same_site(base: &Url, other: &Url) -> bool {
    base.host_str() == other.host_str()
}

fn has_rel_value(rel_attr: Option<&str>, value: &str) -> bool {
    rel_attr
        .map(|rel| rel.split_ascii_whitespace().any(|v| v.eq_ignore_ascii_case(value)))
        .unwrap_or(false)
}

/// A stable hash of normalized visible text, used to spot duplicate/near-duplicate
/// content across crawled pages. Empty pages hash to an empty string so they never
/// spuriously "match" each other.
fn hash_content(text: &str) -> String {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};

    if text.trim().is_empty() {
        return String::new();
    }
    let normalized = text.split_whitespace().collect::<Vec<_>>().join(" ").to_ascii_lowercase();
    let mut hasher = DefaultHasher::new();
    normalized.hash(&mut hasher);
    format!("{:016x}", hasher.finish())
}

pub fn parse_page(body: &str, base: &Url) -> ParsedPage {
    let mut html = Html::parse_document(body);

    // Extract JSON-LD structured data before stripping <script> tags below.
    let ld_json_sel = Selector::parse(r#"script[type="application/ld+json"]"#).unwrap();
    let mut structured_data_types = Vec::new();
    let mut structured_data_errors = Vec::new();
    for script in html.select(&ld_json_sel) {
        let raw = script.text().collect::<String>();
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        match serde_json::from_str::<Value>(trimmed) {
            Ok(value) => collect_schema_types(&value, &mut structured_data_types),
            Err(e) => structured_data_errors.push(format!("Invalid JSON-LD: {e}")),
        }
    }

    // Strip script/style/noscript/template subtrees so word-count and text
    // extraction only reflect visible content, not embedded code or CSS.
    let remove_sel = Selector::parse("script, style, noscript, template").unwrap();
    let remove_ids: Vec<_> = html.select(&remove_sel).map(|e| e.id()).collect();
    for id in remove_ids {
        if let Some(mut node) = html.tree.get_mut(id) {
            node.detach();
        }
    }

    let title_sel = Selector::parse("title").unwrap();
    let title = html
        .select(&title_sel)
        .next()
        .map(|e| e.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty());

    let meta_sel = Selector::parse("meta").unwrap();
    let mut meta_description = None;
    let mut meta_robots = None;
    let mut viewport = None;
    let mut has_open_graph = false;
    let mut has_twitter_card = false;
    for meta in html.select(&meta_sel) {
        let name = meta.value().attr("name").unwrap_or("").to_ascii_lowercase();
        let property = meta.value().attr("property").unwrap_or("").to_ascii_lowercase();
        if name == "description" {
            meta_description = meta
                .value()
                .attr("content")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
        } else if name == "robots" {
            meta_robots = meta
                .value()
                .attr("content")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
        } else if name == "viewport" {
            viewport = meta
                .value()
                .attr("content")
                .map(|s| s.trim().to_string())
                .filter(|s| !s.is_empty());
        } else if name.starts_with("twitter:") {
            has_twitter_card = true;
        }
        if property.starts_with("og:") {
            has_open_graph = true;
        }
    }

    let h1_sel = Selector::parse("h1").unwrap();
    let h1s: Vec<String> = html
        .select(&h1_sel)
        .map(|e| e.text().collect::<String>().trim().to_string())
        .filter(|s| !s.is_empty())
        .collect();
    let h1_count = h1s.len();
    let h1 = h1s.into_iter().next();

    let canonical_sel = Selector::parse(r#"link[rel="canonical"]"#).unwrap();
    let canonical_links: Vec<_> = html.select(&canonical_sel).collect();
    let canonical_count = canonical_links.len();
    let canonical = canonical_links
        .first()
        .and_then(|e| e.value().attr("href"))
        .and_then(|href| resolve_url(base, href))
        .map(|u| u.to_string());

    let html_tag_sel = Selector::parse("html").unwrap();
    let lang = html
        .select(&html_tag_sel)
        .next()
        .and_then(|e| e.value().attr("lang"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty());

    let hreflang_sel = Selector::parse(r#"link[rel="alternate"][hreflang]"#).unwrap();
    let hreflang_values: Vec<String> = html
        .select(&hreflang_sel)
        .filter_map(|e| e.value().attr("hreflang"))
        .map(|s| s.to_string())
        .collect();

    let body_sel = Selector::parse("body").unwrap();
    let body_text = html
        .select(&body_sel)
        .next()
        .map(|b| b.text().collect::<Vec<_>>().join(" "))
        .unwrap_or_default();
    let word_count = body_text.split_whitespace().count();
    let content_hash = hash_content(&body_text);

    let a_sel = Selector::parse("a[href]").unwrap();
    let mut internal_links = Vec::new();
    let mut external_links = Vec::new();
    let mut internal_nofollow_count = 0;
    for a in html.select(&a_sel) {
        if let Some(href) = a.value().attr("href") {
            if let Some(joined) = resolve_url(base, href) {
                if is_same_site(base, &joined) {
                    if has_rel_value(a.value().attr("rel"), "nofollow") {
                        internal_nofollow_count += 1;
                    }
                    internal_links.push(joined);
                } else {
                    external_links.push(joined);
                }
            }
        }
    }

    let img_sel = Selector::parse("img[src]").unwrap();
    let mut images = Vec::new();
    // An explicit alt="" (decorative image) is intentional per accessibility best
    // practice; only a wholly absent alt attribute counts as "missing".
    let mut missing_alt_count = 0;
    for img in html.select(&img_sel) {
        if let Some(src) = img.value().attr("src") {
            if let Some(joined) = resolve_url(base, src) {
                let alt_attr = img.value().attr("alt");
                if alt_attr.is_none() {
                    missing_alt_count += 1;
                }
                let alt = alt_attr.map(|s| s.to_string()).filter(|s| !s.is_empty());
                images.push((joined, alt));
            }
        }
    }

    // A link/image using plain http:// from a page served over https is a mixed
    // content / insecure-resource concern worth flagging.
    let insecure_link_count = if base.scheme() == "https" {
        internal_links
            .iter()
            .chain(external_links.iter())
            .chain(images.iter().map(|(u, _)| u))
            .filter(|u| u.scheme() == "http")
            .count()
    } else {
        0
    };

    let html_size_bytes = body.len();
    let minify_savings_pct = estimate_minify_savings_pct(body);
    let is_minified = minify_savings_pct < MINIFIED_SAVINGS_THRESHOLD_PCT;
    let text_ratio_pct = if html_size_bytes > 0 {
        (body_text.len() as f64 / html_size_bytes as f64) * 100.0
    } else {
        0.0
    };

    ParsedPage {
        title,
        meta_description,
        meta_robots,
        h1,
        h1_count,
        word_count,
        canonical,
        canonical_count,
        internal_links,
        external_links,
        images,
        html_size_bytes,
        minify_savings_pct,
        is_minified,
        insecure_link_count,
        missing_alt_count,
        lang,
        hreflang_values,
        internal_nofollow_count,
        text_ratio_pct,
        content_hash,
        viewport,
        has_open_graph,
        has_twitter_card,
        structured_data_types,
        structured_data_errors,
    }
}
