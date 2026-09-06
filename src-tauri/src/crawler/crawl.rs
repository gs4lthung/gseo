use super::hosting;
use super::parse::parse_page;
use super::render;
use super::robots::RobotsRules;
use super::sitemap;
use super::techdetect;
use super::types::*;
use dashmap::DashMap;
use headless_chrome::Browser;
use reqwest::Client;
use std::collections::{HashSet, VecDeque};
use std::sync::atomic::{AtomicBool, AtomicUsize, Ordering};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};
use tokio::sync::Semaphore;
use tokio::task::JoinSet;
use url::Url;

const MAX_REDIRECT_HOPS: usize = 10;
const AXE_CORE_URL: &str = "https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.0/axe.min.js";

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
    x_robots_tag: Option<&str>,
    requested: &Url,
    final_url: &Url,
) -> String {
    if status >= 400 || status == 0 {
        return format!("Non-Indexable ({status})");
    }
    if requested.as_str() != final_url.as_str() {
        return "Redirected".to_string();
    }
    let has_noindex = |v: Option<&str>| v.map(|s| s.to_ascii_lowercase().contains("noindex")).unwrap_or(false);
    if has_noindex(meta_robots) || has_noindex(x_robots_tag) {
        return "Non-Indexable (noindex)".to_string();
    }
    if let Some(canon) = canonical {
        if canon != requested.as_str() && canon != final_url.as_str() {
            return "Canonicalised".to_string();
        }
    }
    "Indexable".to_string()
}

fn robots_blocked_result(url: &Url, depth: usize) -> PageResult {
    PageResult {
        url: url.to_string(),
        depth,
        status_text: "Blocked".to_string(),
        indexability: "Non-Indexable (robots.txt)".to_string(),
        // An unparsed page has no HTML to have skipped minifying.
        is_minified: true,
        ..PageResult::default()
    }
}

fn empty_outcome(result: PageResult) -> PageFetchOutcome {
    PageFetchOutcome {
        result,
        discovered_internal: Vec::new(),
        discovered_external: Vec::new(),
        discovered_images: Vec::new(),
    }
}

/// Builds the outcome for a page whose fetch/read failed after the response headers
/// were already known. `base` carries those headers (status, content-type, HSTS, etc. —
/// see where it's built in `fetch_and_parse`), so both the JS-render fallback and the
/// plain-fetch path can share this one path instead of each duplicating the same result.
fn body_read_error_outcome(base: PageResult, elapsed: u64, error: reqwest::Error) -> PageFetchOutcome {
    empty_outcome(PageResult {
        indexability: "Non-Indexable (Error)".to_string(),
        response_time_ms: elapsed,
        error: Some(error.to_string()),
        ..base
    })
}

/// Result of manually following a redirect chain (the client this is used with must
/// have its redirect policy set to `none` so we see every intermediate hop).
struct FollowedResponse {
    response: reqwest::Response,
    /// Every URL requested before the final one (the final URL is `response.url()`).
    chain: Vec<String>,
    redirect_capped: bool,
}

async fn fetch_following_redirects(client: &Client, start: Url) -> Result<FollowedResponse, reqwest::Error> {
    let mut current = start;
    let mut chain = Vec::new();
    let mut seen: HashSet<String> = HashSet::new();
    seen.insert(normalize(&current));

    loop {
        let resp = client.get(current.clone()).send().await?;
        if resp.status().is_redirection() {
            let location = resp
                .headers()
                .get(reqwest::header::LOCATION)
                .and_then(|v| v.to_str().ok())
                .map(|s| s.to_string());
            if let Some(loc) = location {
                if let Ok(next) = current.join(&loc) {
                    chain.push(current.to_string());
                    let key = normalize(&next);
                    if chain.len() >= MAX_REDIRECT_HOPS || !seen.insert(key) {
                        return Ok(FollowedResponse { response: resp, chain, redirect_capped: true });
                    }
                    current = next;
                    continue;
                }
            }
        }
        return Ok(FollowedResponse { response: resp, chain, redirect_capped: false });
    }
}

async fn fetch_and_parse(
    client: &Client,
    browser: Option<Arc<Browser>>,
    axe_source: Option<Arc<String>>,
    url: Url,
    depth: usize,
) -> PageFetchOutcome {
    let started = Instant::now();

    let followed = match fetch_following_redirects(client, url.clone()).await {
        Ok(f) => f,
        Err(e) => {
            let elapsed = started.elapsed().as_millis() as u64;
            return empty_outcome(PageResult {
                url: url.to_string(),
                depth,
                status_text: "Error".to_string(),
                indexability: "Non-Indexable (Error)".to_string(),
                response_time_ms: elapsed,
                error: Some(e.to_string()),
                is_minified: true,
                ..PageResult::default()
            });
        }
    };

    let resp = followed.response;
    let redirect_chain = followed.chain;
    let status_code = resp.status();
    let status = status_code.as_u16();
    let mut status_text = status_code.to_string();
    if followed.redirect_capped {
        status_text = format!("{status_text} (redirect loop or too many hops)");
    }
    let final_url = resp.url().clone();
    let content_type = resp
        .headers()
        .get(reqwest::header::CONTENT_TYPE)
        .and_then(|v| v.to_str().ok())
        .map(|s| s.to_string());
    let hsts = resp.headers().get("strict-transport-security").is_some();
    let x_robots_tag = resp
        .headers()
        .get("x-robots-tag")
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

    // Every response-derived field shared by the two outcomes below that never reach a
    // parsed page (non-HTML content, or a body-read failure) — built once here so those
    // paths and the JS-render fallback don't each repeat the same field list.
    let base = PageResult {
        url: url.to_string(),
        depth,
        status: Some(status),
        status_text: status_text.clone(),
        content_type: content_type.clone(),
        redirect_url: redirect_url.clone(),
        hsts,
        x_robots_tag: x_robots_tag.clone(),
        redirect_chain: redirect_chain.clone(),
        is_minified: true,
        ..PageResult::default()
    };

    if !is_html {
        let elapsed = started.elapsed().as_millis() as u64;
        let indexability = indexability_for(status, None, None, x_robots_tag.as_deref(), &url, &final_url);
        return empty_outcome(PageResult { indexability, response_time_ms: elapsed, ..base });
    }

    let mut rendered = false;
    let mut accessibility_violations = Vec::new();
    let body: String = if let Some(browser) = browser {
        match render::render_page(browser, final_url.clone(), axe_source).await {
            Ok((html, violations)) => {
                rendered = true;
                accessibility_violations = violations;
                html
            }
            Err(_) => match resp.text().await {
                Ok(b) => b,
                Err(e) => {
                    let elapsed = started.elapsed().as_millis() as u64;
                    return body_read_error_outcome(base, elapsed, e);
                }
            },
        }
    } else {
        match resp.text().await {
            Ok(b) => b,
            Err(e) => {
                let elapsed = started.elapsed().as_millis() as u64;
                return body_read_error_outcome(base, elapsed, e);
            }
        }
    };

    let elapsed = started.elapsed().as_millis() as u64;
    let parsed = parse_page(&body, &final_url);
    let indexability = indexability_for(
        status,
        parsed.canonical.as_deref(),
        parsed.meta_robots.as_deref(),
        x_robots_tag.as_deref(),
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
        hsts,
        insecure_link_count: parsed.insecure_link_count,
        missing_alt_count: parsed.missing_alt_count,
        lang: parsed.lang,
        hreflang_values: parsed.hreflang_values,
        internal_nofollow_count: parsed.internal_nofollow_count,
        text_ratio_pct: parsed.text_ratio_pct,
        content_hash: parsed.content_hash,
        x_robots_tag,
        viewport: parsed.viewport,
        has_open_graph: parsed.has_open_graph,
        has_twitter_card: parsed.has_twitter_card,
        canonical_count: parsed.canonical_count,
        discovered_via_sitemap: false,
        redirect_chain,
        structured_data_types: parsed.structured_data_types,
        structured_data_errors: parsed.structured_data_errors,
        accessibility_violations,
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

/// Shared handles every queued resource check needs. Bundled into one struct — built
/// once per crawl — so `queue_resource_check` doesn't take a separate parameter for
/// each of these on top of the ones describing the specific resource being checked.
#[derive(Clone)]
struct ResourceCheckCtx {
    app: AppHandle,
    client: Client,
    semaphore: Arc<Semaphore>,
    resources: Arc<DashMap<String, ResourceResult>>,
    resources_checked: Arc<AtomicUsize>,
}

/// A single link or image discovered on a page, awaiting a status check.
struct ResourceCandidate {
    url: Url,
    kind: ResourceType,
    source_page: String,
    alt_text: Option<String>,
    is_internal: bool,
    is_insecure: bool,
}

fn queue_resource_check(ctx: &ResourceCheckCtx, tasks: &mut JoinSet<()>, candidate: ResourceCandidate) {
    let ResourceCandidate { url, kind, source_page, alt_text, is_internal, is_insecure } = candidate;
    let key = url.to_string();
    if ctx.resources.contains_key(&key) {
        return;
    }
    ctx.resources.insert(
        key.clone(),
        ResourceResult {
            url: key.clone(),
            resource_type: kind,
            source_page: source_page.clone(),
            alt_text: alt_text.clone(),
            status: None,
            status_text: "Checking".to_string(),
            is_internal,
            is_insecure,
            error: None,
        },
    );

    let ctx = ctx.clone();

    tasks.spawn(async move {
        let _permit = ctx.semaphore.acquire_owned().await.unwrap();
        let (status, status_text, error) = check_resource(&ctx.client, &url).await;
        let entry = ResourceResult {
            url: key.clone(),
            resource_type: kind,
            source_page,
            alt_text,
            status,
            status_text,
            is_internal,
            is_insecure,
            error,
        };
        ctx.resources.insert(key, entry.clone());
        ctx.resources_checked.fetch_add(1, Ordering::Relaxed);
        let _ = ctx.app.emit("crawl://resource", entry);
    });
}

pub async fn run_crawl(
    app: AppHandle,
    config: CrawlConfig,
    cancel: Arc<AtomicBool>,
    paused: Arc<AtomicBool>,
    pages: Arc<StdMutex<Vec<PageResult>>>,
    resources: Arc<DashMap<String, ResourceResult>>,
    resources_checked: Arc<AtomicUsize>,
) -> Vec<String> {
    let start_url = match Url::parse(&config.start_url) {
        Ok(u) => u,
        Err(e) => {
            let _ = app.emit("crawl://error", format!("Invalid start URL: {e}"));
            return Vec::new();
        }
    };

    // `client` auto-follows redirects (used for every auxiliary fetch: robots.txt,
    // sitemap, tech detection, resource checks) so those keep working exactly as
    // before. `page_client` disables auto-follow so the main page fetch can walk
    // the redirect chain itself and report every hop.
    let client = match Client::builder()
        .user_agent(config.user_agent.clone())
        .timeout(Duration::from_secs(config.timeout_secs))
        .redirect(reqwest::redirect::Policy::limited(10))
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit("crawl://error", format!("Failed to build HTTP client: {e}"));
            return Vec::new();
        }
    };
    let page_client = match Client::builder()
        .user_agent(config.user_agent.clone())
        .timeout(Duration::from_secs(config.timeout_secs))
        .redirect(reqwest::redirect::Policy::none())
        .build()
    {
        Ok(c) => c,
        Err(e) => {
            let _ = app.emit("crawl://error", format!("Failed to build HTTP client: {e}"));
            return Vec::new();
        }
    };

    let robots = if config.respect_robots {
        Some(RobotsRules::fetch(&client, &start_url).await)
    } else {
        None
    };

    {
        let llms_txt_found = match start_url.join("/llms.txt") {
            Ok(llms_txt_url) => matches!(
                client.get(llms_txt_url).send().await,
                Ok(resp) if resp.status().is_success()
            ),
            Err(_) => false,
        };
        let llms_txt_url = start_url.join("/llms.txt").ok().map(|u| u.to_string());

        let (server, powered_by, cdn, cms, technologies) =
            match client.get(start_url.clone()).send().await {
                Ok(resp) => {
                    let header_tech = techdetect::detect_from_headers(resp.headers());
                    let (cms, technologies) = match resp.text().await {
                        Ok(body) => techdetect::detect_from_html(&body),
                        Err(_) => (None, Vec::new()),
                    };
                    (header_tech.server, header_tech.powered_by, header_tech.cdn, cms, technologies)
                }
                Err(_) => (None, None, None, None, Vec::new()),
            };

        let ip_addresses = hosting::resolve_ips(&start_url).await;

        let (hosting_org, hosting_country) = if config.lookup_hosting {
            match ip_addresses.first() {
                Some(ip) => match hosting::lookup_org(&client, ip).await {
                    Some(info) => (info.org, info.country),
                    None => (None, None),
                },
                None => (None, None),
            }
        } else {
            (None, None)
        };

        let _ = app.emit(
            "crawl://site_info",
            SiteInfo {
                llms_txt_found,
                llms_txt_url,
                robots_txt_checked: config.respect_robots,
                server,
                powered_by,
                cdn,
                cms,
                technologies,
                ip_addresses,
                hosting_org,
                hosting_country,
            },
        );
    }

    let browser: Option<Arc<Browser>> = if config.render_js || config.run_accessibility_audit {
        match tauri::async_runtime::spawn_blocking(render::launch_browser).await {
            Ok(Ok(b)) => Some(Arc::new(b)),
            Ok(Err(e)) => {
                let _ = app.emit(
                    "crawl://error",
                    format!("Could not launch headless Chrome ({e}). Continuing without JS rendering/accessibility audit."),
                );
                None
            }
            Err(e) => {
                let _ = app.emit(
                    "crawl://error",
                    format!("Could not launch headless Chrome ({e}). Continuing without JS rendering/accessibility audit."),
                );
                None
            }
        }
    } else {
        None
    };

    // Accessibility audits only run when we already have a browser tab open for JS
    // rendering, since that avoids a second, separate page navigation per URL.
    let axe_source: Option<Arc<String>> = if config.run_accessibility_audit && browser.is_some() {
        match client.get(AXE_CORE_URL).send().await {
            Ok(resp) if resp.status().is_success() => match resp.text().await {
                Ok(text) => Some(Arc::new(text)),
                Err(_) => {
                    let _ = app.emit("crawl://error", "Could not read axe-core script; skipping accessibility audit.".to_string());
                    None
                }
            },
            _ => {
                let _ = app.emit("crawl://error", "Could not download axe-core; skipping accessibility audit.".to_string());
                None
            }
        }
    } else {
        None
    };

    let resource_ctx = ResourceCheckCtx {
        app: app.clone(),
        client: client.clone(),
        semaphore: Arc::new(Semaphore::new(config.concurrency.max(1))),
        resources: resources.clone(),
        resources_checked: resources_checked.clone(),
    };
    let max_pages = config.max_pages.max(1);

    let mut visited: HashSet<String> = HashSet::new();
    let mut frontier: VecDeque<(Url, usize, bool)> = VecDeque::new();
    visited.insert(normalize(&start_url));
    frontier.push_back((start_url.clone(), 0, false));
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
                frontier.push_back((su, 0, true));
            }
        }
    }

    // Every internal link target discovered anywhere, used to flag orphan pages
    // (sitemap-only URLs nothing on the site actually links to).
    let mut linked_urls: HashSet<String> = HashSet::new();

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
                let (url, depth, via_sitemap) = frontier.pop_front().unwrap();

                if let Some(robots) = &robots {
                    if !robots.is_allowed(url.path()) {
                        crawled_count += 1;
                        let result = robots_blocked_result(&url, depth);
                        let _ = app.emit("crawl://page", &result);
                        pages.lock().unwrap().push(result);
                        continue;
                    }
                }

                let page_client = page_client.clone();
                let browser = browser.clone();
                let axe_source = axe_source.clone();
                page_tasks.spawn(async move {
                    let mut outcome = fetch_and_parse(&page_client, browser, axe_source, url, depth).await;
                    outcome.result.discovered_via_sitemap = via_sitemap;
                    outcome
                });
            }
        }

        if page_tasks.is_empty() && resource_tasks.is_empty() {
            if is_paused && !frontier.is_empty() {
                let _ = app.emit(
                    "crawl://progress",
                    CrawlProgress {
                        crawled: crawled_count,
                        queued: frontier.len(),
                        resources_checked: resources_checked.load(Ordering::Relaxed),
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
                        for link in &discovered_internal {
                            let key = normalize(link);
                            linked_urls.insert(key.clone());
                            if !visited.contains(&key) && scheduled_count < max_pages {
                                visited.insert(key);
                                scheduled_count += 1;
                                frontier.push_back((link.clone(), result.depth + 1, false));
                            }
                        }
                    } else {
                        for link in &discovered_internal {
                            linked_urls.insert(normalize(link));
                        }
                    }

                    let page_url = result.url.clone();
                    let page_is_https = Url::parse(&page_url).map(|u| u.scheme() == "https").unwrap_or(false);
                    let _ = app.emit("crawl://page", &result);
                    pages.lock().unwrap().push(result);

                    if config.check_external_links {
                        for link in discovered_external {
                            let insecure = page_is_https && link.scheme() == "http";
                            queue_resource_check(&resource_ctx, &mut resource_tasks, ResourceCandidate {
                                url: link,
                                kind: ResourceType::Link,
                                source_page: page_url.clone(),
                                alt_text: None,
                                is_internal: false,
                                is_insecure: insecure,
                            });
                        }
                    }
                    if config.check_images {
                        for (img_url, alt) in discovered_images {
                            let internal = img_url.host_str() == start_url.host_str();
                            let insecure = page_is_https && img_url.scheme() == "http";
                            queue_resource_check(&resource_ctx, &mut resource_tasks, ResourceCandidate {
                                url: img_url,
                                kind: ResourceType::Image,
                                source_page: page_url.clone(),
                                alt_text: alt,
                                is_internal: internal,
                                is_insecure: insecure,
                            });
                        }
                    }

                    let _ = app.emit("crawl://progress", CrawlProgress {
                        crawled: crawled_count,
                        queued: frontier.len(),
                        resources_checked: resources_checked.load(Ordering::Relaxed),
                        resources_total: resources.len(),
                        running: true,
                        paused: is_paused,
                    });
                }
            }
            res = resource_tasks.join_next(), if !resource_tasks.is_empty() => {
                let _ = res;
                let _ = app.emit("crawl://progress", CrawlProgress {
                    crawled: crawled_count,
                    queued: frontier.len(),
                    resources_checked: resources_checked.load(Ordering::Relaxed),
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

    linked_urls.into_iter().collect()
}
