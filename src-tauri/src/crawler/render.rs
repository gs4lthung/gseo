use super::types::AccessibilityViolation;
use headless_chrome::{Browser, LaunchOptions, Tab};
use serde_json::Value;
use std::sync::Arc;
use url::Url;

pub fn launch_browser() -> Result<Browser, String> {
    let options = LaunchOptions::default_builder()
        .headless(true)
        .build()
        .map_err(|e| e.to_string())?;
    Browser::new(options).map_err(|e| e.to_string())
}

/// Injects axe-core into the already-loaded page and runs an accessibility scan,
/// returning each violation with its affected node count. Best-effort: any failure
/// (axe not loading, evaluate erroring, unexpected result shape) is reported as an
/// `Err` so the caller can just fall back to an empty violation list.
fn run_axe(tab: &Tab, axe_source: &str) -> Result<Vec<AccessibilityViolation>, String> {
    tab.evaluate(axe_source, false).map_err(|e| e.to_string())?;

    let wrapped = "(async () => JSON.stringify((await axe.run()).violations))()";
    let remote = tab.evaluate(wrapped, true).map_err(|e| e.to_string())?;
    let json_str = remote
        .value
        .ok_or_else(|| "axe.run() returned no value".to_string())?;
    let json_str = json_str
        .as_str()
        .ok_or_else(|| "axe.run() result was not a string".to_string())?;

    let raw: Value = serde_json::from_str(json_str).map_err(|e| e.to_string())?;
    let mut violations = Vec::new();
    if let Value::Array(items) = raw {
        for item in items {
            let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("unknown").to_string();
            let impact = item.get("impact").and_then(|v| v.as_str()).map(|s| s.to_string());
            let description = item.get("description").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let help_url = item.get("helpUrl").and_then(|v| v.as_str()).unwrap_or("").to_string();
            let node_count = item.get("nodes").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
            violations.push(AccessibilityViolation { id, impact, description, help_url, node_count });
        }
    }
    Ok(violations)
}

/// Renders a page in a fresh browser tab, returning the post-JS-execution HTML and,
/// when `axe_source` is provided, an accessibility violation list from the same
/// loaded page (so the audit reflects what the browser actually rendered).
pub async fn render_page(
    browser: Arc<Browser>,
    url: Url,
    axe_source: Option<Arc<String>>,
) -> Result<(String, Vec<AccessibilityViolation>), String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tab = browser.new_tab().map_err(|e| e.to_string())?;
        tab.navigate_to(url.as_str()).map_err(|e| e.to_string())?;
        tab.wait_until_navigated().map_err(|e| e.to_string())?;
        let html = tab.get_content().map_err(|e| e.to_string())?;
        let violations = match axe_source.as_deref() {
            Some(src) => run_axe(&tab, src).unwrap_or_default(),
            None => Vec::new(),
        };
        Ok((html, violations))
    })
    .await
    .map_err(|e| e.to_string())?
}
