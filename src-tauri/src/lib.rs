mod commands;
mod crawler;
mod export;
mod state;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::start_crawl,
            commands::stop_crawl,
            commands::get_pages,
            commands::get_resources,
            commands::export_csv,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
