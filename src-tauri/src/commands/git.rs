use serde::Serialize;
use std::process::Command;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitStatusResult {
    pub branch: String,
    pub files: Vec<GitFileStatus>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitFileStatus {
    pub path: String,
    pub status: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffResult {
    pub files: Vec<GitDiffFile>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitDiffFile {
    pub path: String,
    pub diff: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitCommitResult {
    pub success: bool,
    pub message: String,
}

#[tauri::command]
pub fn git_status(cwd: String) -> Result<GitStatusResult, String> {
    let branch_output = Command::new("git")
        .args(["rev-parse", "--abbrev-ref", "HEAD"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get branch: {}", e))?;

    let branch = String::from_utf8_lossy(&branch_output.stdout).trim().to_string();

    let status_output = Command::new("git")
        .args(["status", "--porcelain"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get status: {}", e))?;

    let status_str = String::from_utf8_lossy(&status_output.stdout).to_string();
    let mut files = Vec::new();

    for line in status_str.lines() {
        if line.len() >= 3 {
            let status = line[..2].trim().to_string();
            let path = line[3..].to_string();
            files.push(GitFileStatus { path, status });
        }
    }

    Ok(GitStatusResult { branch, files })
}

#[tauri::command]
pub fn git_diff(cwd: String) -> Result<GitDiffResult, String> {
    let output = Command::new("git")
        .args(["diff", "--stat"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    let stat_str = String::from_utf8_lossy(&output.stdout).to_string();

    let diff_output = Command::new("git")
        .args(["diff"])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to get diff: {}", e))?;

    let diff_str = String::from_utf8_lossy(&diff_output.stdout).to_string();

    let chunks: Vec<&str> = diff_str.split("diff --git ").collect();
    let mut diff_map: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for chunk in &chunks[1..] {
        if let Some(end) = chunk.find("\ndiff --git ") {
            let header = &chunk[..end];
            let rest = &chunk[..end];
            if let Some(name_start) = rest.find(" b/") {
                let path = rest[name_start + 3..].trim().to_string();
                diff_map.insert(path, format!("diff --git {}", header));
            }
        } else {
            if let Some(name_start) = chunk.find(" b/") {
                let path = chunk[name_start + 3..].trim().to_string();
                diff_map.insert(path, format!("diff --git {}", chunk));
            }
        }
    }

    let mut files = Vec::new();
    for line in stat_str.lines() {
        if let Some(pos) = line.find('|') {
            let path = line[..pos].trim().to_string();
            let diff = diff_map.get(&path).cloned().unwrap_or_default();
            files.push(GitDiffFile { path, diff });
        }
    }

    Ok(GitDiffResult { files })
}

#[tauri::command]
pub fn git_commit(cwd: String, message: String, files: Vec<String>) -> Result<GitCommitResult, String> {
    if files.is_empty() {
        return Err("No files specified for commit".to_string());
    }

    let add_output = Command::new("git")
        .arg("add")
        .args(&files)
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to stage files: {}", e))?;

    if !add_output.status.success() {
        let stderr = String::from_utf8_lossy(&add_output.stderr).to_string();
        return Err(format!("Failed to stage files: {}", stderr));
    }

    let commit_output = Command::new("git")
        .args(["commit", "-m", &message])
        .current_dir(&cwd)
        .output()
        .map_err(|e| format!("Failed to commit: {}", e))?;

    if commit_output.status.success() {
        Ok(GitCommitResult {
            success: true,
            message: format!("Committed successfully with message: {}", message),
        })
    } else {
        let stderr = String::from_utf8_lossy(&commit_output.stderr).to_string();
        Err(format!("Commit failed: {}", stderr))
    }
}
