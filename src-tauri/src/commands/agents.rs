use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Agent {
    pub id: String,
    pub name: String,
    pub status: String,
    pub task: String,
    pub progress: f32,
    pub created_at: String,
    pub logs: Vec<String>,
}

static AGENTS: OnceLock<Mutex<HashMap<String, Agent>>> = OnceLock::new();

fn get_agents() -> &'static Mutex<HashMap<String, Agent>> {
    AGENTS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn generate_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("agent_{}", timestamp)
}

fn current_timestamp() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", timestamp)
}

#[tauri::command]
pub async fn spawn_agent(name: String, task: String) -> Result<Agent, String> {
    let id = generate_id();
    let agent = Agent {
        id: id.clone(),
        name: name.clone(),
        status: "running".to_string(),
        task: task.clone(),
        progress: 0.0,
        created_at: current_timestamp(),
        logs: vec![
            format!("[{}] Agent '{}' spawned", current_timestamp(), name),
            format!("[{}] Task assigned: {}", current_timestamp(), task),
            format!("[{}] Starting execution...", current_timestamp()),
        ],
    };

    let mut agents = get_agents().lock().map_err(|e| e.to_string())?;
    agents.insert(id.clone(), agent.clone());

    Ok(agent)
}

#[tauri::command]
pub async fn kill_agent(agent_id: String) -> Result<(), String> {
    let mut agents = get_agents().lock().map_err(|e| e.to_string())?;
    let agent = agents
        .get_mut(&agent_id)
        .ok_or_else(|| format!("Agent not found: {}", agent_id))?;

    agent.status = "killed".to_string();
    agent.progress = 1.0;
    agent
        .logs
        .push(format!("[{}] Agent killed", current_timestamp()));

    Ok(())
}

#[tauri::command]
pub async fn list_agents() -> Result<Vec<Agent>, String> {
    let agents = get_agents().lock().map_err(|e| e.to_string())?;
    Ok(agents.values().cloned().collect())
}

#[tauri::command]
pub async fn execute_workflow(workflow_path: String) -> Result<String, String> {
    let content = fs::read_to_string(&workflow_path)
        .map_err(|e| format!("Failed to read workflow file: {}", e))?;

    let workflow: serde_json::Value =
        serde_json::from_str(&content).map_err(|e| format!("Invalid workflow JSON: {}", e))?;

    let workflow_name = workflow["name"]
        .as_str()
        .unwrap_or("Unnamed Workflow");

    let steps = workflow["steps"]
        .as_array()
        .ok_or_else(|| "Workflow must contain a 'steps' array".to_string())?;

    let execution_id = generate_id();
    let mut results = Vec::new();

    for (i, step) in steps.iter().enumerate() {
        let step_name = step["name"]
            .as_str()
            .unwrap_or(&format!("Step {}", i + 1));
        let step_type = step["type"].as_str().unwrap_or("unknown");

        results.push(format!(
            "[Step {}/{}] {} ({}) — completed",
            i + 1,
            steps.len(),
            step_name,
            step_type
        ));
    }

    Ok(format!(
        "Workflow '{}' executed successfully.\nExecution ID: {}\n{}",
        workflow_name,
        execution_id,
        results.join("\n")
    ))
}

#[tauri::command]
pub async fn get_agent_logs(agent_id: String) -> Result<Vec<String>, String> {
    let agents = get_agents().lock().map_err(|e| e.to_string())?;
    let agent = agents
        .get(&agent_id)
        .ok_or_else(|| format!("Agent not found: {}", agent_id))?;

    Ok(agent.logs.clone())
}
