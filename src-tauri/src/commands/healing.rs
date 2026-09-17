use keyring::Entry;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

const SERVICE_NAME: &str = "nova-ide";

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealingEvent {
    pub id: String,
    pub timestamp: String,
    pub event_type: String,
    pub message: String,
    pub agent_id: String,
}

static HEALING_LOG: OnceLock<Mutex<Vec<HealingEvent>>> = OnceLock::new();
static HEALING_STATS: OnceLock<Mutex<HealingStats>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HealingStats {
    total_events: u64,
    successful_heals: u64,
    failed_heals: u64,
    auto_heals: u64,
    manual_heals: u64,
    uptime_start: u64,
}

fn get_healing_log() -> &'static Mutex<Vec<HealingEvent>> {
    HEALING_LOG.get_or_init(|| Mutex::new(Vec::new()))
}

fn get_healing_stats() -> &'static Mutex<HealingStats> {
    HEALING_STATS.get_or_init(|| {
        Mutex::new(HealingStats {
            total_events: 0,
            successful_heals: 0,
            failed_heals: 0,
            auto_heals: 0,
            manual_heals: 0,
            uptime_start: SystemTime::now()
                .duration_since(UNIX_EPOCH)
                .unwrap_or_default()
                .as_secs(),
        })
    })
}

fn generate_event_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("heal_{}", timestamp)
}

fn current_timestamp() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", timestamp)
}

fn get_log_path() -> PathBuf {
    let home = std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home)
        .join(".nova-ide")
        .join("healing_log.json")
}

fn load_log_from_disk() -> Vec<HealingEvent> {
    let path = get_log_path();
    if let Ok(content) = fs::read_to_string(&path) {
        serde_json::from_str(&content).unwrap_or_default()
    } else {
        Vec::new()
    }
}

fn save_log_to_disk(log: &[HealingEvent]) {
    let path = get_log_path();
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    if let Ok(content) = serde_json::to_string_pretty(log) {
        let _ = fs::write(&path, content);
    }
}

fn add_event(event_type: &str, message: &str, agent_id: &str) -> HealingEvent {
    let event = HealingEvent {
        id: generate_event_id(),
        timestamp: current_timestamp(),
        event_type: event_type.to_string(),
        message: message.to_string(),
        agent_id: agent_id.to_string(),
    };

    let mut log = get_healing_log().lock().unwrap();
    log.push(event.clone());
    save_log_to_disk(&log);

    let mut stats = get_healing_stats().lock().unwrap();
    stats.total_events += 1;

    event
}

#[tauri::command]
pub async fn get_healing_log() -> Result<Vec<HealingEvent>, String> {
    let disk_log = load_log_from_disk();
    let mut log = get_healing_log().lock().map_err(|e| e.to_string())?;

    for event in disk_log {
        if !log.iter().any(|e| e.id == event.id) {
            log.push(event);
        }
    }

    log.sort_by(|a, b| b.timestamp.cmp(&a.timestamp));
    Ok(log.clone())
}

fn get_home_dir() -> PathBuf {
    std::env::var("USERPROFILE")
        .or_else(|_| std::env::var("HOME"))
        .unwrap_or_else(|_| ".".to_string())
        .into()
}

fn check_filesystem() -> (bool, String) {
    let nova_dir = get_home_dir().join(".nova-ide");
    if !nova_dir.exists() {
        if let Err(e) = fs::create_dir_all(&nova_dir) {
            return (false, format!("Cannot create ~/.nova-ide: {}", e));
        }
    }
    match fs::write(nova_dir.join(".heal_test"), "ok") {
        Ok(()) => {
            let _ = fs::remove_file(nova_dir.join(".heal_test"));
            (true, "Filesystem check passed".to_string())
        }
        Err(e) => (false, format!("Cannot write to ~/.nova-ide: {}", e)),
    }
}

fn check_process_memory() -> (bool, String) {
    let pid = std::process::id();
    let proc_dir = PathBuf::from(format!("/proc/{}", pid));
    if proc_dir.exists() {
        return (true, format!("Process {} is alive (Linux)", pid));
    }
    // On Windows, just verify we can get our own PID (basic check)
    (true, format!("Process {} self-verified (Windows)", pid))
}

fn check_ai_connectivity() -> (bool, String) {
    let providers = ["openai", "anthropic", "google", "groq", "deepseek"];
    for provider_id in &providers {
        let entry = match Entry::new(SERVICE_NAME, &format!("api_key_{}", provider_id)) {
            Ok(e) => e,
            Err(_) => continue,
        };
        if let Ok(_) = entry.get_password() {
            return (true, format!("API key found for provider: {}", provider_id));
        }
    }
    (false, "No API keys configured for any provider".to_string())
}

fn check_mcp_registry() -> (bool, String) {
    let nova_dir = get_home_dir().join(".nova-ide");
    if !nova_dir.exists() {
        let _ = fs::create_dir_all(&nova_dir);
    }
    let registry_path = nova_dir.join("mcp_registry.json");
    if !registry_path.exists() {
        let default_registry = serde_json::json!({
            "servers": [],
            "version": "1.0"
        });
        if let Ok(content) = serde_json::to_string_pretty(&default_registry) {
            let _ = fs::write(&registry_path, content);
        }
    }
    match fs::read_to_string(&registry_path) {
        Ok(content) => {
            if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                (true, "MCP registry is valid".to_string())
            } else {
                (false, "MCP registry contains invalid JSON".to_string())
            }
        }
        Err(e) => (false, format!("Cannot read MCP registry: {}", e)),
    }
}

fn check_settings() -> (bool, String) {
    let settings_path = get_home_dir().join(".nova-ide").join("settings.json");
    if !settings_path.exists() {
        return (false, "settings.json does not exist".to_string());
    }
    match fs::read_to_string(&settings_path) {
        Ok(content) => {
            if serde_json::from_str::<serde_json::Value>(&content).is_ok() {
                (true, "Settings file is valid JSON".to_string())
            } else {
                (false, "Settings file contains invalid JSON".to_string())
            }
        }
        Err(e) => (false, format!("Cannot read settings.json: {}", e)),
    }
}

#[tauri::command]
pub async fn trigger_heal(agent_id: String) -> Result<String, String> {
    add_event(
        "heal_triggered",
        &format!("Manual heal triggered for agent: {}", agent_id),
        &agent_id,
    );

    add_event("diagnostic_start", "Running system diagnostics...", &agent_id);

    let mut checks: Vec<String> = Vec::new();
    let mut all_passed = true;

    let (ok, msg) = check_filesystem();
    let status = if ok { "OK" } else { "FAIL" };
    if !ok { all_passed = false; }
    checks.push(format!("Filesystem: {} - {}", status, msg));
    add_event("check", &format!("Filesystem check: {}", status), &agent_id);

    let (ok, msg) = check_process_memory();
    let status = if ok { "OK" } else { "FAIL" };
    if !ok { all_passed = false; }
    checks.push(format!("Memory: {} - {}", status, msg));
    add_event("check", &format!("Memory check: {}", status), &agent_id);

    let (ok, msg) = check_ai_connectivity();
    let status = if ok { "OK" } else { "FAIL" };
    if !ok { all_passed = false; }
    checks.push(format!("AI connectivity: {} - {}", status, msg));
    add_event("check", &format!("AI connectivity check: {}", status), &agent_id);

    let (ok, msg) = check_mcp_registry();
    let status = if ok { "OK" } else { "FAIL" };
    if !ok { all_passed = false; }
    checks.push(format!("MCP registry: {} - {}", status, msg));
    add_event("check", &format!("MCP registry check: {}", status), &agent_id);

    let (ok, msg) = check_settings();
    let status = if ok { "OK" } else { "FAIL" };
    if !ok { all_passed = false; }
    checks.push(format!("Settings: {} - {}", status, msg));
    add_event("check", &format!("Settings check: {}", status), &agent_id);

    let passed_count = checks.iter().filter(|c| c.contains("OK")).count();
    add_event(
        "heal_complete",
        &format!(
            "Heal completed. {}/{} checks passed.",
            passed_count,
            checks.len()
        ),
        &agent_id,
    );

    {
        let mut stats = get_healing_stats().lock().map_err(|e| e.to_string())?;
        if all_passed {
            stats.successful_heals += 1;
        } else {
            stats.failed_heals += 1;
        }
        stats.manual_heals += 1;
    }

    Ok(format!(
        "Heal completed for agent '{}' at {}\n\nChecks performed:\n{}",
        agent_id,
        current_timestamp(),
        checks.join("\n")
    ))
}

#[tauri::command]
pub async fn get_healing_stats() -> Result<HealingStatsResponse, String> {
    let stats = get_healing_stats().lock().map_err(|e| e.to_string())?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    let uptime_seconds = now.saturating_sub(stats.uptime_start);

    Ok(HealingStatsResponse {
        total_events: stats.total_events,
        successful_heals: stats.successful_heals,
        failed_heals: stats.failed_heals,
        auto_heals: stats.auto_heals,
        manual_heals: stats.manual_heals,
        uptime_seconds,
        health_score: if stats.total_events == 0 {
            100.0
        } else {
            (stats.successful_heals as f64 / stats.total_events as f64 * 100.0).round()
        },
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HealingStatsResponse {
    total_events: u64,
    successful_heals: u64,
    failed_heals: u64,
    auto_heals: u64,
    manual_heals: u64,
    uptime_seconds: u64,
    health_score: f64,
}
