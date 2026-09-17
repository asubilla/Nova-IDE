use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub theme: String,
    pub font_size: u32,
    pub tab_size: u32,
    pub auto_save: bool,
    pub default_provider: String,
}

static SETTINGS: OnceLock<Mutex<Option<AppSettings>>> = OnceLock::new();

fn get_settings_store() -> &'static Mutex<Option<AppSettings>> {
    SETTINGS.get_or_init(|| Mutex::new(None))
}

fn default_settings() -> AppSettings {
    AppSettings {
        theme: "dark".to_string(),
        font_size: 14,
        tab_size: 4,
        auto_save: true,
        default_provider: "openai".to_string(),
    }
}

fn get_settings_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home)
        .join(".nova-ide")
        .join("settings.json")
}

fn load_settings_from_disk() -> AppSettings {
    let path = get_settings_path();
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_else(|_| default_settings())
    } else {
        default_settings()
    }
}

fn save_settings_to_disk(settings: &AppSettings) -> Result<(), String> {
    let path = get_settings_path();
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| format!("Failed to create config dir: {}", e))?;
    }
    let content =
        serde_json::to_string_pretty(settings).map_err(|e| format!("Failed to serialize: {}", e))?;
    fs::write(&path, content).map_err(|e| format!("Failed to write settings: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn get_settings() -> Result<AppSettings, String> {
    let mut store = get_settings_store().lock().map_err(|e| e.to_string())?;

    if store.is_none() {
        *store = Some(load_settings_from_disk());
    }

    Ok(store.clone().unwrap_or_else(default_settings))
}

#[tauri::command]
pub async fn update_settings(settings: AppSettings) -> Result<(), String> {
    save_settings_to_disk(&settings)?;

    let mut store = get_settings_store().lock().map_err(|e| e.to_string())?;
    *store = Some(settings);

    Ok(())
}

#[tauri::command]
pub async fn reset_settings() -> Result<AppSettings, String> {
    let settings = default_settings();
    save_settings_to_disk(&settings)?;

    let mut store = get_settings_store().lock().map_err(|e| e.to_string())?;
    *store = Some(settings.clone());

    Ok(settings)
}
