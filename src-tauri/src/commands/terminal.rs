use serde::Serialize;
use std::collections::HashMap;
use std::io::{Read, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::{Mutex, OnceLock};
use std::thread;

use super::error::CommandError;

struct TerminalSession {
    stdin: Option<ChildStdin>,
    output: Vec<String>,
}

static TERMINALS: OnceLock<Mutex<HashMap<String, TerminalSession>>> = OnceLock::new();

fn get_terminals() -> &'static Mutex<HashMap<String, TerminalSession>> {
    TERMINALS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TerminalOutput {
    pub id: String,
    pub output: String,
}

#[tauri::command]
pub fn spawn_terminal(id: String, _cwd: String) -> Result<TerminalOutput, CommandError> {
    let mut child: Child = if cfg!(target_os = "windows") {
        Command::new("cmd.exe")
            .arg("")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| CommandError { code: "TERMINAL_ERROR".into(), message: format!("Failed to spawn terminal: {}", e) })?
    } else {
        Command::new("bash")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| CommandError { code: "TERMINAL_ERROR".into(), message: format!("Failed to spawn terminal: {}", e) })?
    };

    let stdin = child.stdin.take().ok_or_else(|| CommandError { code: "TERMINAL_ERROR".into(), message: "Failed to capture stdin".into() })?;
    let stdout = child.stdout.take().ok_or_else(|| CommandError { code: "TERMINAL_ERROR".into(), message: "Failed to capture stdout".into() })?;
    let stderr = child.stderr.take().ok_or_else(|| CommandError { code: "TERMINAL_ERROR".into(), message: "Failed to capture stderr".into() })?;

    let id_clone = id.clone();
    let id_clone2 = id.clone();
    let output_clone = get_terminals();

    thread::spawn(move || {
        let mut stdout_reader = stdout;
        let mut buf = [0u8; 4096];
        loop {
            let n = match stdout_reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            let text = String::from_utf8_lossy(&buf[..n]).to_string();
            let lines: Vec<String> = text.lines().map(String::from).collect();
            if let Ok(mut terminals) = output_clone.lock() {
                if let Some(session) = terminals.get_mut(&id_clone) {
                    session.output.extend(lines);
                }
            }
        }
    });

    let output_clone2 = get_terminals();
    thread::spawn(move || {
        let mut stderr_reader = stderr;
        let mut buf = [0u8; 4096];
        loop {
            let n = match stderr_reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => n,
                Err(_) => break,
            };
            let text = String::from_utf8_lossy(&buf[..n]).to_string();
            let lines: Vec<String> = text.lines().map(String::from).collect();
            if let Ok(mut terminals) = output_clone2.lock() {
                if let Some(session) = terminals.get_mut(&id_clone2) {
                    session.output.extend(lines);
                }
            }
        }
    });

    let session = TerminalSession {
        stdin: Some(stdin),
        output: vec![format!("Terminal {} spawned", id)],
    };

    let mut terminals = get_terminals().lock().map_err(|e| CommandError { code: "LOCK_ERROR".into(), message: e.to_string() })?;
    terminals.insert(id.clone(), session);

    Ok(TerminalOutput {
        id,
        output: String::new(),
    })
}

#[tauri::command]
pub fn send_input(id: String, input: String) -> Result<TerminalOutput, CommandError> {
    let mut terminals = get_terminals().lock().map_err(|e| CommandError { code: "LOCK_ERROR".into(), message: e.to_string() })?;
    let session = terminals
        .get_mut(&id)
        .ok_or_else(|| CommandError { code: "TERMINAL_NOT_FOUND".into(), message: format!("Terminal {} not found", id) })?;

    let stdin = session
        .stdin
        .as_mut()
        .ok_or_else(|| CommandError { code: "STDIN_CLOSED".into(), message: "stdin already closed".into() })?;

    stdin
        .write_all(input.as_bytes())
        .map_err(|e| CommandError { code: "IO_ERROR".into(), message: format!("Failed to write to stdin: {}", e) })?;
    stdin
        .write_all(b"\n")
        .map_err(|e| CommandError { code: "IO_ERROR".into(), message: format!("Failed to write newline: {}", e) })?;
    stdin.flush().map_err(|e| CommandError { code: "IO_ERROR".into(), message: format!("Failed to flush stdin: {}", e) })?;

    let output_lines: Vec<String> = session.output.drain(..).collect();
    let output = output_lines.join("\n");

    Ok(TerminalOutput { id, output })
}

#[tauri::command]
pub fn get_terminal_output(id: String) -> Result<TerminalOutput, CommandError> {
    let mut terminals = get_terminals().lock().map_err(|e| CommandError { code: "LOCK_ERROR".into(), message: e.to_string() })?;
    let session = terminals
        .get_mut(&id)
        .ok_or_else(|| CommandError { code: "TERMINAL_NOT_FOUND".into(), message: format!("Terminal {} not found", id) })?;

    let output_lines: Vec<String> = session.output.drain(..).collect();
    let output = output_lines.join("\n");

    Ok(TerminalOutput { id, output })
}
