use headless_chrome::{Browser, LaunchOptions};
use std::sync::Arc;
use url::Url;

pub fn launch_browser() -> Result<Browser, String> {
    let options = LaunchOptions::default_builder()
        .headless(true)
        .build()
        .map_err(|e| e.to_string())?;
    Browser::new(options).map_err(|e| e.to_string())
}

/// Renders a page in a fresh browser tab and returns the post-JS-execution HTML.
pub async fn render_page(browser: Arc<Browser>, url: Url) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let tab = browser.new_tab().map_err(|e| e.to_string())?;
        tab.navigate_to(url.as_str()).map_err(|e| e.to_string())?;
        tab.wait_until_navigated().map_err(|e| e.to_string())?;
        let html = tab.get_content().map_err(|e| e.to_string())?;
        Ok(html)
    })
    .await
    .map_err(|e| e.to_string())?
}
