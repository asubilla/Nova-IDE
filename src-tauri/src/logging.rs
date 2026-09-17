use std::fs::{self, OpenOptions};
use std::io::Write;
use std::sync::{Mutex, OnceLock};
use std::time::SystemTime;

static LOG_FILE: OnceLock<Mutex<Option<std::fs::File>>> = OnceLock::new();

pub fn init() {
    if let Some(home) = dirs::home_dir() {
        let log_dir = home.join(".nova-ide");
        let _ = fs::create_dir_all(&log_dir);
        let log_path = log_dir.join("nova-ide.log");
        let file = OpenOptions::new()
            .create(true)
            .append(true)
            .open(log_path)
            .ok();
        let _ = LOG_FILE.set(Mutex::new(file));
    }
}

pub fn log(level: &str, module: &str, message: &str) {
    let ts = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    let line = format!("[{}] {} {}: {}\n", ts, level, module, message);
    if let Some(guard) = LOG_FILE.get().and_then(|m| m.lock().ok()) {
        if let Some(ref mut file) = *guard {
            let _ = file.write_all(line.as_bytes());
        }
    }
    println!("{}", line.trim());
}
