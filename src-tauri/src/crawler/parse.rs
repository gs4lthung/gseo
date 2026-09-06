use scraper::{Html, Selector};
use url::Url;

pub struct ParsedPage {
    pub title: Option<String>,
    pub meta_description: Option<String>,
    pub meta_robots: Option<String>,
    pub h1: Option<String>,
    pub h1_count: usize,
    pub word_count: usize,
    pub canonical: Option<String>,
    pub internal_links: Vec<Url>,
    pub external_links: Vec<Url>,
    pub images: Vec<(Url, Option<String>)>,
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

pub fn parse_page(body: &str, base: &Url) -> ParsedPage {
    let mut html = Html::parse_document(body);

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
    for meta in html.select(&meta_sel) {
        let name = meta.value().attr("name").unwrap_or("").to_ascii_lowercase();
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
    let canonical = html
        .select(&canonical_sel)
        .next()
        .and_then(|e| e.value().attr("href"))
        .and_then(|href| resolve_url(base, href))
        .map(|u| u.to_string());

    let body_sel = Selector::parse("body").unwrap();
    let word_count = html
        .select(&body_sel)
        .next()
        .map(|b| b.text().collect::<Vec<_>>().join(" "))
        .unwrap_or_default()
        .split_whitespace()
        .count();

    let a_sel = Selector::parse("a[href]").unwrap();
    let mut internal_links = Vec::new();
    let mut external_links = Vec::new();
    for a in html.select(&a_sel) {
        if let Some(href) = a.value().attr("href") {
            if let Some(joined) = resolve_url(base, href) {
                if is_same_site(base, &joined) {
                    internal_links.push(joined);
                } else {
                    external_links.push(joined);
                }
            }
        }
    }

    let img_sel = Selector::parse("img[src]").unwrap();
    let mut images = Vec::new();
    for img in html.select(&img_sel) {
        if let Some(src) = img.value().attr("src") {
            if let Some(joined) = resolve_url(base, src) {
                let alt = img
                    .value()
                    .attr("alt")
                    .map(|s| s.to_string())
                    .filter(|s| !s.is_empty());
                images.push((joined, alt));
            }
        }
    }

    ParsedPage {
        title,
        meta_description,
        meta_robots,
        h1,
        h1_count,
        word_count,
        canonical,
        internal_links,
        external_links,
        images,
    }
}
