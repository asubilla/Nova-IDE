use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::process::{Command, Stdio};

static TERMINALS: OnceLock<Mutex<HashMap<String, Vec<u8>>>> = OnceLock::new();

fn get_terminals() -> &'static Mutex<HashMap<String, Vec<u8>>> {
    TERMINALS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize)]
pub struct TerminalOutput {
    pub id: String,
    pub output: String,
}

#[tauri::command]
pub fn spawn_terminal(id: String, cwd: String) -> Result<TerminalOutput, String> {
    let output = Command::new("cmd")
        .args(["/C", "echo", &format!("Terminal {} spawned in {}", id, cwd)])
        .stdout(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to spawn terminal: {}", e))?;

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    let mut terminals = get_terminals().lock().map_err(|e| e.to_string())?;
    terminals.insert(id.clone(), Vec::new());

    Ok(TerminalOutput {
        id,
        output: stdout,
    })
}

#[tauri::command]
pub fn send_input(id: String, input: String) -> Result<TerminalOutput, String> {
    let output = Command::new("cmd")
        .args(["/C", &input])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .output()
        .map_err(|e| format!("Failed to execute command: {}", e))?;

    let mut result = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if !stderr.is_empty() {
        result.push_str(&stderr);
    }

    let mut terminals = get_terminals().lock().map_err(|e| e.to_string())?;
    if let Some(history) = terminals.get_mut(&id) {
        history.extend(input.as_bytes());
        history.push(b'\n');
    }

    Ok(TerminalOutput {
        id,
        output: result,
    })
}
