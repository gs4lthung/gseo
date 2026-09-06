use crate::crawler::crawl;
use crate::crawler::types::{CrawlConfig, CrawlSummary, PageResult, ResourceResult};
use crate::export;
use crate::state::AppState;
use std::sync::atomic::Ordering;
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
    state.cancel.store(false, Ordering::SeqCst);
    state.running.store(true, Ordering::SeqCst);

    let running = state.running.clone();
    let cancel = state.cancel.clone();
    let pages = state.pages.clone();
    let resources = state.resources.clone();
    let app_handle = app.clone();

    tauri::async_runtime::spawn(async move {
        let cancelled_before = cancel.load(Ordering::SeqCst);
        crawl::run_crawl(app_handle.clone(), config, cancel.clone(), pages.clone(), resources)
            .await;
        running.store(false, Ordering::SeqCst);
        let cancelled = cancelled_before || cancel.load(Ordering::SeqCst);
        let pages_crawled = pages.lock().unwrap().len();
        let _ = app_handle.emit(
            "crawl://done",
            CrawlSummary {
                pages_crawled,
                resources_checked: 0,
                cancelled,
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
