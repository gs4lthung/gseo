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
            r.error.clone().unwrap_or_default(),
        ])?;
    }

    wtr.flush()?;
    Ok(())
}
