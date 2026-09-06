use crate::crawler::crawl;
use crate::crawler::types::{CrawlConfig, CrawlSnapshot, CrawlSummary, PageResult, ResourceResult};
use crate::export;
use crate::state::AppState;
use std::sync::atomic::Ordering;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn start_crawl(
    app: AppHandle,
    state: State<'_, AppState>,
    config: CrawlConfig,
) -> Result<(), String> {
    if state.running.load(Ordering::SeqCst) {
        return Err("A crawl is already running".to_string());
    }

    state.pages.lock().unwrap().clear();
    state.resources.clear();
    state.resources_checked.store(0, Ordering::SeqCst);
    state.cancel.store(false, Ordering::SeqCst);
    state.paused.store(false, Ordering::SeqCst);
    state.running.store(true, Ordering::SeqCst);

    let running = state.running.clone();
    let cancel = state.cancel.clone();
    let paused = state.paused.clone();
    let pages = state.pages.clone();
    let resources = state.resources.clone();
    let resources_checked = state.resources_checked.clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let linked_urls = crawl::run_crawl(
            app_handle.clone(),
            config,
            cancel.clone(),
            paused,
            pages.clone(),
            resources.clone(),
            resources_checked,
        )
        .await;
        running.store(false, Ordering::SeqCst);
        let cancelled = cancel.load(Ordering::SeqCst);
        let pages_crawled = pages.lock().unwrap().len();
        let resources_checked = resources.len();
        let _ = app_handle.emit(
            "crawl://done",
            CrawlSummary {
                pages_crawled,
                resources_checked,
                cancelled,
                linked_urls,
            },
        );
    });

    Ok(())
}

#[tauri::command]
pub fn stop_crawl(state: State<'_, AppState>) -> Result<(), String> {
    state.cancel.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn pause_crawl(state: State<'_, AppState>) -> Result<(), String> {
    state.paused.store(true, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn resume_crawl(state: State<'_, AppState>) -> Result<(), String> {
    state.paused.store(false, Ordering::SeqCst);
    Ok(())
}

#[tauri::command]
pub fn get_pages(state: State<'_, AppState>) -> Result<Vec<PageResult>, String> {
    Ok(state.pages.lock().unwrap().clone())
}

#[tauri::command]
pub fn get_resources(state: State<'_, AppState>) -> Result<Vec<ResourceResult>, String> {
    Ok(state.resources.iter().map(|r| r.value().clone()).collect())
}

#[tauri::command]
pub fn export_csv(state: State<'_, AppState>, path: String, what: String) -> Result<(), String> {
    match what.as_str() {
        "pages" => {
            let pages = state.pages.lock().unwrap();
            export::export_pages_csv(&pages, &path).map_err(|e| e.to_string())
        }
        "resources" => {
            let resources: Vec<ResourceResult> =
                state.resources.iter().map(|r| r.value().clone()).collect();
            export::export_resources_csv(&resources, &path).map_err(|e| e.to_string())
        }
        _ => Err(format!("Unknown export type: {what}")),
    }
}

#[tauri::command]
pub fn save_crawl(state: State<'_, AppState>, path: String, start_url: String) -> Result<(), String> {
    let pages = state.pages.lock().unwrap().clone();
    let resources: Vec<ResourceResult> = state.resources.iter().map(|r| r.value().clone()).collect();
    let saved_at_unix_ms = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0);

    let snapshot = CrawlSnapshot {
        start_url,
        saved_at_unix_ms,
        pages,
        resources,
    };

    let json = serde_json::to_string_pretty(&snapshot).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn load_crawl(state: State<'_, AppState>, path: String) -> Result<CrawlSnapshot, String> {
    let content = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let snapshot: CrawlSnapshot = serde_json::from_str(&content).map_err(|e| e.to_string())?;

    *state.pages.lock().unwrap() = snapshot.pages.clone();
    state.resources.clear();
    for r in &snapshot.resources {
        state.resources.insert(r.url.clone(), r.clone());
    }

    Ok(snapshot)
}
