use crate::crawler::types::{PageResult, ResourceResult, ResourceType};
use std::fs::File;

pub fn export_pages_csv(pages: &[PageResult], path: &str) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    let mut wtr = csv::Writer::from_writer(file);

    wtr.write_record([
        "URL",
        "Status",
        "Status Text",
        "Indexability",
        "Depth",
        "Title",
        "Title Length",
        "Meta Description",
        "Meta Description Length",
        "H1",
        "H1 Count",
        "Word Count",
        "Canonical",
        "Meta Robots",
        "Redirect URL",
        "Content Type",
        "Response Time (ms)",
        "Internal Links",
        "External Links",
        "Images",
        "Size (bytes)",
        "Minified",
        "Minify Savings (%)",
        "JS Rendered",
        "HSTS",
        "Insecure Links",
        "Missing Alt Images",
        "Lang",
        "Hreflang Values",
        "Internal Nofollow Links",
        "Text/HTML Ratio (%)",
        "Content Hash",
        "X-Robots-Tag",
        "Viewport",
        "Has Open Graph",
        "Has Twitter Card",
        "Canonical Count",
        "Discovered Via Sitemap",
        "Redirect Chain",
        "Structured Data Types",
        "Structured Data Errors",
        "Accessibility Violations",
        "Error",
    ])?;

    for p in pages {
        wtr.write_record([
            p.url.clone(),
            p.status.map(|s| s.to_string()).unwrap_or_default(),
            p.status_text.clone(),
            p.indexability.clone(),
            p.depth.to_string(),
            p.title.clone().unwrap_or_default(),
            p.title_length.to_string(),
            p.meta_description.clone().unwrap_or_default(),
            p.meta_description_length.to_string(),
            p.h1.clone().unwrap_or_default(),
            p.h1_count.to_string(),
            p.word_count.to_string(),
            p.canonical.clone().unwrap_or_default(),
            p.meta_robots.clone().unwrap_or_default(),
            p.redirect_url.clone().unwrap_or_default(),
            p.content_type.clone().unwrap_or_default(),
            p.response_time_ms.to_string(),
            p.internal_link_count.to_string(),
            p.external_link_count.to_string(),
            p.image_count.to_string(),
            p.html_size_bytes.to_string(),
            p.is_minified.to_string(),
            format!("{:.0}", p.minify_savings_pct),
            p.rendered.to_string(),
            p.hsts.to_string(),
            p.insecure_link_count.to_string(),
            p.missing_alt_count.to_string(),
            p.lang.clone().unwrap_or_default(),
            p.hreflang_values.join(", "),
            p.internal_nofollow_count.to_string(),
            format!("{:.1}", p.text_ratio_pct),
            p.content_hash.clone(),
            p.x_robots_tag.clone().unwrap_or_default(),
            p.viewport.clone().unwrap_or_default(),
            p.has_open_graph.to_string(),
            p.has_twitter_card.to_string(),
            p.canonical_count.to_string(),
            p.discovered_via_sitemap.to_string(),
            p.redirect_chain.join(" -> "),
            p.structured_data_types.join(", "),
            p.structured_data_errors.join("; "),
            p.accessibility_violations.len().to_string(),
            p.error.clone().unwrap_or_default(),
        ])?;
    }

    wtr.flush()?;
    Ok(())
}

pub fn export_resources_csv(
    resources: &[ResourceResult],
    path: &str,
) -> Result<(), Box<dyn std::error::Error>> {
    let file = File::create(path)?;
    let mut wtr = csv::Writer::from_writer(file);

    wtr.write_record([
        "URL",
        "Type",
        "Source Page",
        "Status",
        "Status Text",
        "Internal",
        "Alt Text",
        "Insecure",
        "Error",
    ])?;

    for r in resources {
        wtr.write_record([
            r.url.clone(),
            match r.resource_type {
                ResourceType::Link => "Link".to_string(),
                ResourceType::Image => "Image".to_string(),
            },
            r.source_page.clone(),
            r.status.map(|s| s.to_string()).unwrap_or_default(),
            r.status_text.clone(),
            r.is_internal.to_string(),
            r.alt_text.clone().unwrap_or_default(),
            r.is_insecure.to_string(),
            r.error.clone().unwrap_or_default(),
        ])?;
    }

    wtr.flush()?;
    Ok(())
}
