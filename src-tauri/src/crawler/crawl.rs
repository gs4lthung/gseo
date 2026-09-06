use super::parse::parse_page;
use super::types::*;
use dashmap::DashMap;
use reqwest::Client;
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use url::Url;

struct PageFetchOutcome {
    result: PageResult,
    discovered_internal: Vec<Url>,
    discovered_external: Vec<Url>,
    discovered_images: Vec<(Url, Option<String>)>,
}

fn normalize(url: &Url) -> String {
    let mut u = url.clone();
    u.set_fragment(None);
    u.to_string()
}

fn indexability_for(
    status: u16,
    canonical: Option<&str>,
    meta_robots: Option<&str>,
    requested: &Url,
    final_url: &Url,
) -> String {
    if status >= 400 || status == 0 {
        return format!("Non-Indexable ({status})");
    }
    if requested.as_str() != final_url.as_str() {
        return "Redirected".to_string();
    }
    if let Some(robots) = meta_robots {
        if robots.to_ascii_lowercase().contains("noindex") {
            return "Non-Indexable (noindex)".to_string();
        }
    }
    if let Some(canon) = canonical {
        if canon != requested.as_str() && canon != final_url.as_str() {
            return "Canonicalised".to_string();
        }
    }
    "Indexable".to_string()
}

async fn fetch_and_parse(client: &Client, url: Url, depth: usize) -> PageFetchOutcome {
    let started = Instant::now();

    let resp = match client.get(url.clone()).send().await {
        Ok(r) => r,
        Err(e) => {
            let elapsed = started.elapsed().as_millis() as u64;
            let result = PageResult {
                url: url.to_string(),
                depth,
                status: None,
                status_text: "Error".to_string(),
                content_type: None,
                title: None,
                title_length: 0,
                meta_description: None,
                meta_description_length: 0,
                h1: None,
                h1_count: 0,
                word_count: 0,
                canonical: None,
                meta_robots: None,
                redirect_url: None,
                indexability: "Non-Indexable (Error)".to_string(),
                response_time_ms: elapsed,
                internal_link_count: 0,
                external_link_count: 0,
                image_count: 0,
                error: Some(e.to_string()),
            };
            return PageFetchOutcome {
                result,
                discovered_internal: vec![],
                discovered_external: vec![],
                discovered_images: vec![],
            };
        }
    };

    let status_code = resp.status();
    let status = status_code.as_u16();
    let status_text = status_code.to_string();
    let final_url = resp.url().clone();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let is_html = content_type
        .as_deref()
        .map(|ct| ct.contains("html"))
        .unwrap_or(false);
    let redirect_url = if final_url.as_str() != url.as_str() {
        Some(final_url.to_string())
    } else {
        None
    };

    if !is_html {
        let elapsed = started.elapsed().as_millis() as u64;
        let indexability = indexability_for(status, None, None, &url, &final_url);
        let result = PageResult {
            url: url.to_string(),
            depth,
            status: Some(status),
            status_text,
            content_type,
            title: None,
            title_length: 0,
            meta_description: None,
            meta_description_length: 0,
            h1: None,
            h1_count: 0,
            word_count: 0,
            canonical: None,
            meta_robots: None,
            redirect_url,
            indexability,
            response_time_ms: elapsed,
            internal_link_count: 0,
            external_link_count: 0,
            image_count: 0,
            error: None,
        };
        return PageFetchOutcome {
            result,
            discovered_internal: vec![],
            discovered_external: vec![],
            discovered_images: vec![],
        };
    }

    let body = match resp.text().await {
        Ok(b) => b,
        Err(e) => {
            let elapsed = started.elapsed().as_millis() as u64;
            let result = PageResult {
                url: url.to_string(),
                depth,
                status: Some(status),
                status_text,
                content_type,
                title: None,
                title_length: 0,
                meta_description: None,
                meta_description_length: 0,
                h1: None,
                h1_count: 0,
                word_count: 0,
                canonical: None,
                meta_robots: None,
                redirect_url,
                indexability: "Non-Indexable (Error)".to_string(),
                response_time_ms: elapsed,
                internal_link_count: 0,
                external_link_count: 0,
                image_count: 0,
                error: Some(e.to_string()),
            };
            return PageFetchOutcome {
                result,
                discovered_internal: vec![],
                discovered_external: vec![],
                discovered_images: vec![],
            };
        }
    };

    let elapsed = started.elapsed().as_millis() as u64;
    let parsed = parse_page(&body, &final_url);
    let indexability = indexability_for(
        status,
        parsed.canonical.as_deref(),
        parsed.meta_robots.as_deref(),
        &url,
        &final_url,
    );

    let title_length = parsed.title.as_ref().map(|s| s.chars().count()).unwrap_or(0);
    let meta_description_length = parsed
        .meta_description
        .as_ref()
        .map(|s| s.chars().count())
        .unwrap_or(0);

    let result = PageResult {
        url: url.to_string(),
        depth,
        status: Some(status),
        status_text,
        content_type,
        title: parsed.title,
        title_length,
        meta_description: parsed.meta_description,
        meta_description_length,
        h1: parsed.h1,
        h1_count: parsed.h1_count,
        word_count: parsed.word_count,
        canonical: parsed.canonical,
        meta_robots: parsed.meta_robots,
        redirect_url,
        indexability,
        response_time_ms: elapsed,
        internal_link_count: parsed.internal_links.len(),
        external_link_count: parsed.external_links.len(),
        image_count: parsed.images.len(),
        error: None,
    };

    PageFetchOutcome {
        result,
        discovered_internal: parsed.internal_links,
        discovered_external: parsed.external_links,
        discovered_images: parsed.images,
    }
}

async fn check_resource(client: &Client, url: &Url) -> (Option<u16>, String, Option<String>) {
    match client.head(url.clone()).send().await {
        Ok(resp) => {
            let status = resp.status();
            if status.as_u16() == 405 || status.as_u16() == 501 {
                match client.get(url.clone()).send().await {
                    Ok(r2) => (Some(r2.status().as_u16()), r2.status().to_string(), None),
                    Err(e) => (None, "Error".to_string(), Some(e.to_string())),
                }
            } else {
                (Some(status.as_u16()), status.to_string(), None)
            }
        }
        Err(e) => match client.get(url.clone()).send().await {
            Ok(r2) => (Some(r2.status().as_u16()), r2.status().to_string(), None),
            Err(_) => (None, "Error".to_string(), Some(e.to_string())),
        },
    }
}

#[allow(clippy::too_many_arguments)]
fn queue_resource_check(
    app: &AppHandle,
    client: &Client,
    semaphore: &Arc<Semaphore>,
    resources: &Arc<DashMap<String, ResourceResult>>,
    tasks: &mut JoinSet<()>,
    url: Url,
    kind: ResourceType,
    source_page: String,
    alt_text: Option<String>,
    is_internal: bool,
) {
    let key = url.to_string();
    if resources.contains_key(&key) {
        return;
    }
    resources.insert(
        key.clone(),
        ResourceResult {
            url: key.clone(),
            resource_type: kind,
            source_page: source_page.clone(),
            alt_text: alt_text.clone(),
            status: None,
            status_text: "Checking".to_string(),
            is_internal,
            error: None,
        },
    );

    let app = app.clone();
    let client = client.clone();
    let semaphore = semaphore.clone();
    let resources = resources.clone();

    tasks.spawn(async move {
        let _permit = semaphore.acquire_owned().await.unwrap();
        let (status, status_text, error) = check_resource(&client, &url).await;
        let entry = ResourceResult {
            url: key.clone(),
            resource_type: kind,
            source_page,
            alt_text,
            status,
            status_text,
            is_internal,
            error,
        };
        resources.insert(key, entry.clone());
        let _ = app.emit("crawl://resource", entry);
    });
}

pub async fn run_crawl(
    app: AppHandle,
    config: CrawlConfig,
    cancel: Arc<AtomicBool>,
    pages: Arc<StdMutex<Vec<PageResult>>>,
    resources: Arc<DashMap<String, ResourceResult>>,
) {
    let start_url = match Url::parse(&config.start_url) {
        Ok(u) => u,
        Err(e) => {
            let _ = app.emit("crawl://error", format!("Invalid start URL: {e}"));
            return;
        }
    };

    let client = match Client::builder()
        .user_agent(config.user_agent.clone())
        .timeout(Duration::from_secs(config.timeout_secs))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit("crawl://error", format!("Failed to build HTTP client: {e}"));
            return;
        }
    };

    let resource_semaphore = Arc::new(Semaphore::new(config.concurrency.max(1)));
    let max_pages = config.max_pages.max(1);

    let mut visited: HashSet<String> = HashSet::new();
    let mut frontier: VecDeque<(Url, usize)> = VecDeque::new();
    visited.insert(normalize(&start_url));
    frontier.push_back((start_url.clone(), 0));
    let mut scheduled_count: usize = 1;

    let mut page_tasks: JoinSet<PageFetchOutcome> = JoinSet::new();
    let mut resource_tasks: JoinSet<()> = JoinSet::new();
    let mut crawled_count: usize = 0;

    loop {
        if cancel.load(Ordering::SeqCst) {
            break;
        }

        while page_tasks.len() < config.concurrency && !frontier.is_empty() {
            let (url, depth) = frontier.pop_front().unwrap();
            let client = client.clone();
            page_tasks.spawn(async move { fetch_and_parse(&client, url, depth).await });
        }

        if page_tasks.is_empty() && resource_tasks.is_empty() {
            break;
        }

        tokio::select! {
            res = page_tasks.join_next(), if !page_tasks.is_empty() => {
                if let Some(Ok(outcome)) = res {
                    crawled_count += 1;
                    let PageFetchOutcome { result, discovered_internal, discovered_external, discovered_images } = outcome;

                    if result.depth < config.max_depth {
                        for link in discovered_internal {
                            let key = normalize(&link);
                            if !visited.contains(&key) && scheduled_count < max_pages {
                                visited.insert(key);
                                scheduled_count += 1;
                                frontier.push_back((link, result.depth + 1));
                            }
                        }
                    }

                    let page_url = result.url.clone();
                    let _ = app.emit("crawl://page", &result);
                    pages.lock().unwrap().push(result);

                    if config.check_external_links {
                        for link in discovered_external {
                            queue_resource_check(&app, &client, &resource_semaphore, &resources, &mut resource_tasks, link, ResourceType::Link, page_url.clone(), None, false);
                        }
                    }
                    if config.check_images {
                        for (img_url, alt) in discovered_images {
                            let internal = img_url.host_str() == start_url.host_str();
                            queue_resource_check(&app, &client, &resource_semaphore, &resources, &mut resource_tasks, img_url, ResourceType::Image, page_url.clone(), alt, internal);
                        }
                    }

                    let resources_checked = resources.iter().filter(|r| r.status.is_some() || r.error.is_some()).count();
                    let _ = app.emit("crawl://progress", CrawlProgress {
                        crawled: crawled_count,
                        queued: frontier.len(),
                        resources_checked,
                        resources_total: resources.len(),
                        running: true,
                    });
                }
            }
            res = resource_tasks.join_next(), if !resource_tasks.is_empty() => {
                let _ = res;
                let resources_checked = resources.iter().filter(|r| r.status.is_some() || r.error.is_some()).count();
                let _ = app.emit("crawl://progress", CrawlProgress {
                    crawled: crawled_count,
                    queued: frontier.len(),
                    resources_checked,
                    resources_total: resources.len(),
                    running: true,
                });
            }
        }
    }

    if cancel.load(Ordering::SeqCst) {
        page_tasks.abort_all();
        resource_tasks.abort_all();
    }
}
