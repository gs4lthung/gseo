use crate::crawler::types::{PageResult, ResourceResult};
use dashmap::DashMap;
use std::sync::atomic::AtomicBool;
use std::sync::{Arc, Mutex};

pub struct AppState {
    pub running: Arc<AtomicBool>,
    pub cancel: Arc<AtomicBool>,
    pub pages: Arc<Mutex<Vec<PageResult>>>,
    pub resources: Arc<DashMap<String, ResourceResult>>,
}

impl Default for AppState {
    fn default() -> Self {
        Self {
            running: Arc::new(AtomicBool::new(false)),
            cancel: Arc::new(AtomicBool::new(false)),
            pages: Arc::new(Mutex::new(Vec::new())),
            resources: Arc::new(DashMap::new()),
        }
    }
}
