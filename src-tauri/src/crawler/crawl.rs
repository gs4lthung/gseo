use super::parse::parse_page;
use super::render;
use super::robots::RobotsRules;
use super::sitemap;
use super::types::*;
use dashmap::DashMap;
use headless_chrome::Browser;
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

#[allow(clippy::too_many_arguments)]
fn empty_page_result(
    url: &Url,
    depth: usize,
    status: Option<u16>,
    status_text: String,
    content_type: Option<String>,
    redirect_url: Option<String>,
    indexability: String,
    response_time_ms: u64,
    error: Option<String>,
) -> PageResult {
    PageResult {
        url: url.to_string(),
        depth,
        status,
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
        response_time_ms,
        internal_link_count: 0,
        external_link_count: 0,
        image_count: 0,
        html_size_bytes: 0,
        minify_savings_pct: 0.0,
        is_minified: true,
        rendered: false,
        error,
    }
}

fn robots_blocked_result(url: &Url, depth: usize) -> PageResult {
    empty_page_result(
        url,
        depth,
        None,
        "Blocked".to_string(),
        None,
        None,
        "Non-Indexable (robots.txt)".to_string(),
        0,
        None,
    )
}

async fn fetch_and_parse(client: &Client, browser: Option<Arc<Browser>>, url: Url, depth: usize) -> PageFetchOutcome {
    let started = Instant::now();
    let no_discoveries = || (vec![], vec![], vec![]);

    let resp = match client.get(url.clone()).send().await {
        Ok(r) => r,
        Err(e) => {
            let elapsed = started.elapsed().as_millis() as u64;
            let result = empty_page_result(
                &url,
                depth,
                None,
                "Error".to_string(),
                None,
                None,
                "Non-Indexable (Error)".to_string(),
                elapsed,
                Some(e.to_string()),
            );
            let (discovered_internal, discovered_external, discovered_images) = no_discoveries();
            return PageFetchOutcome { result, discovered_internal, discovered_external, discovered_images };
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
        let result = empty_page_result(
            &url,
            depth,
            Some(status),
            status_text,
            content_type,
            redirect_url,
            indexability,
            elapsed,
            None,
        );
        let (discovered_internal, discovered_external, discovered_images) = no_discoveries();
        return PageFetchOutcome { result, discovered_internal, discovered_external, discovered_images };
    }

    let mut rendered = false;
    let body: String = if let Some(browser) = browser {
        match render::render_page(browser, final_url.clone()).await {
            Ok(html) => {
                rendered = true;
                html
            }
            Err(_) => match resp.text().await {
                Ok(b) => b,
                Err(e) => {
                    let elapsed = started.elapsed().as_millis() as u64;
                    let result = empty_page_result(
                        &url,
                        depth,
                        Some(status),
                        status_text,
                        content_type,
                        redirect_url,
                        "Non-Indexable (Error)".to_string(),
                        elapsed,
                        Some(e.to_string()),
                    );
                    let (discovered_internal, discovered_external, discovered_images) = no_discoveries();
                    return PageFetchOutcome { result, discovered_internal, discovered_external, discovered_images };
                }
            },
        }
    } else {
        match resp.text().await {
            Ok(b) => b,
            Err(e) => {
                let elapsed = started.elapsed().as_millis() as u64;
                let result = empty_page_result(
                    &url,
                    depth,
                    Some(status),
                    status_text,
                    content_type,
                    redirect_url,
                    "Non-Indexable (Error)".to_string(),
                    elapsed,
                    Some(e.to_string()),
                );
                let (discovered_internal, discovered_external, discovered_images) = no_discoveries();
                return PageFetchOutcome { result, discovered_internal, discovered_external, discovered_images };
            }
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
        html_size_bytes: parsed.html_size_bytes,
        minify_savings_pct: parsed.minify_savings_pct,
        is_minified: parsed.is_minified,
        rendered,
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

#[allow(clippy::too_many_arguments)]
pub async fn run_crawl(
    app: AppHandle,
    config: CrawlConfig,
    cancel: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
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

    let robots = if config.respect_robots {
        Some(RobotsRules::fetch(&client, &start_url).await)
    } else {
        None
    };

    let browser: Option<Arc<Browser>> = if config.render_js {
        match tauri::async_runtime::spawn_blocking(render::launch_browser).await {
            Ok(Ok(b)) => Some(Arc::new(b)),
            Ok(Err(e)) => {
                let _ = app.emit(
                    "crawl://error",
                    format!("Could not launch headless Chrome for JS rendering ({e}). Continuing without it."),
                );
                None
            }
            Err(e) => {
                let _ = app.emit(
                    "crawl://error",
                    format!("Could not launch headless Chrome for JS rendering ({e}). Continuing without it."),
                );
                None
            }
        }
    } else {
        None
    };

    let resource_semaphore = Arc::new(Semaphore::new(config.concurrency.max(1)));
    let max_pages = config.max_pages.max(1);

    let mut visited: HashSet<String> = HashSet::new();
    let mut frontier: VecDeque<(Url, usize)> = VecDeque::new();
    visited.insert(normalize(&start_url));
    frontier.push_back((start_url.clone(), 0));
    let mut scheduled_count: usize = 1;

    if config.use_sitemap {
        let sitemap_urls = sitemap::fetch_sitemap_urls(&client, &start_url).await;
        for su in sitemap_urls {
            if su.host_str() != start_url.host_str() {
                continue;
            }
            let key = normalize(&su);
            if !visited.contains(&key) && scheduled_count < max_pages {
                visited.insert(key);
                scheduled_count += 1;
                frontier.push_back((su, 0));
            }
        }
    }

    let mut page_tasks: JoinSet<PageFetchOutcome> = JoinSet::new();
    let mut resource_tasks: JoinSet<()> = JoinSet::new();
    let mut crawled_count: usize = 0;

    loop {
        if cancel.load(Ordering::SeqCst) {
            break;
        }

        let is_paused = paused.load(Ordering::SeqCst);

        if !is_paused {
            while page_tasks.len() < config.concurrency && !frontier.is_empty() {
                let (url, depth) = frontier.pop_front().unwrap();

                if let Some(robots) = &robots {
                    if !robots.is_allowed(url.path()) {
                        crawled_count += 1;
                        let result = robots_blocked_result(&url, depth);
                        let _ = app.emit("crawl://page", &result);
                        pages.lock().unwrap().push(result);
                        continue;
                    }
                }

                let client = client.clone();
                let browser = browser.clone();
                page_tasks.spawn(async move { fetch_and_parse(&client, browser, url, depth).await });
            }
        }

        if page_tasks.is_empty() && resource_tasks.is_empty() {
            if is_paused && !frontier.is_empty() {
                let resources_checked =
                    resources.iter().filter(|r| r.status.is_some() || r.error.is_some()).count();
                let _ = app.emit(
                    "crawl://progress",
                    CrawlProgress {
                        crawled: crawled_count,
                        queued: frontier.len(),
                        resources_checked,
                        resources_total: resources.len(),
                        running: true,
                        paused: true,
                    },
                );
                tokio::time::sleep(Duration::from_millis(200)).await;
                continue;
            }
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
                        paused: is_paused,
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
                    paused: is_paused,
                });
            }
        }
    }

    if cancel.load(Ordering::SeqCst) {
        page_tasks.abort_all();
        resource_tasks.abort_all();
    }
}
