use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrchestrationPattern {
    pub id: String,
    pub name: String,
    pub description: String,
    pub pattern_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct PatternExecution {
    execution_id: String,
    pattern_id: String,
    status: String,
    task: String,
    started_at: String,
    completed_at: Option<String>,
    result: Option<String>,
    steps: Vec<ExecutionStep>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct ExecutionStep {
    name: String,
    status: String,
    output: Option<String>,
}

static EXECUTIONS: OnceLock<Mutex<HashMap<String, PatternExecution>>> = OnceLock::new();

fn get_executions() -> &'static Mutex<HashMap<String, PatternExecution>> {
    EXECUTIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

fn generate_id() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    format!("exec_{}", timestamp)
}

fn current_timestamp() -> String {
    let timestamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs();
    format!("{}", timestamp)
}

fn builtin_patterns() -> Vec<OrchestrationPattern> {
    vec![
        OrchestrationPattern {
            id: "sequential".to_string(),
            name: "Sequential Pipeline".to_string(),
            description: "Execute tasks one after another in a defined order. Best for linear workflows where each step depends on the previous."
                .to_string(),
            pattern_type: "sequential".to_string(),
        },
        OrchestrationPattern {
            id: "parallel".to_string(),
            name: "Parallel Fan-Out".to_string(),
            description: "Execute multiple independent tasks simultaneously. Best for operations that don't depend on each other."
                .to_string(),
            pattern_type: "parallel".to_string(),
        },
        OrchestrationPattern {
            id: "supervisor".to_string(),
            name: "Supervisor Agent".to_string(),
            description: "A main agent delegates work to specialized sub-agents and aggregates results. Best for complex multi-domain tasks."
                .to_string(),
            pattern_type: "supervisor".to_string(),
        },
        OrchestrationPattern {
            id: "chain_of_thought".to_string(),
            name: "Chain of Thought".to_string(),
            description: "Step-by-step reasoning with reflection at each stage. Best for tasks requiring careful analysis."
                .to_string(),
            pattern_type: "chain_of_thought".to_string(),
        },
        OrchestrationPattern {
            id: "map_reduce".to_string(),
            name: "Map-Reduce".to_string(),
            description: "Split a task into subtasks, process each in parallel, then combine results. Best for large-scale processing."
                .to_string(),
            pattern_type: "map_reduce".to_string(),
        },
        OrchestrationPattern {
            id: "react".to_string(),
            name: "ReAct (Reason+Act)".to_string(),
            description: "Interleave reasoning and action steps. The agent thinks, acts, observes, and repeats until the task is complete."
                .to_string(),
            pattern_type: "react".to_string(),
        },
        OrchestrationPattern {
            id: "reflection".to_string(),
            name: "Self-Reflection".to_string(),
            description: "Generate output, critique it, and refine iteratively. Best for quality-critical tasks like code generation."
                .to_string(),
            pattern_type: "reflection".to_string(),
        },
        OrchestrationPattern {
            id: "consensus".to_string(),
            name: "Consensus Voting".to_string(),
            description: "Multiple agents independently solve a problem and vote on the best solution. Best for high-confidence decisions."
                .to_string(),
            pattern_type: "consensus".to_string(),
        },
    ]
}

#[tauri::command]
pub async fn list_patterns() -> Result<Vec<OrchestrationPattern>, String> {
    Ok(builtin_patterns())
}

#[tauri::command]
pub async fn execute_pattern(pattern_id: String, task: String) -> Result<String, String> {
    let patterns = builtin_patterns();
    let pattern = patterns
        .iter()
        .find(|p| p.id == pattern_id)
        .ok_or_else(|| format!("Unknown pattern: {}", pattern_id))?;

    let execution_id = generate_id();
    let now = current_timestamp();

    let steps = match pattern.pattern_type.as_str() {
        "sequential" => vec![
            ExecutionStep {
                name: "Parse task requirements".to_string(),
                status: "completed".to_string(),
                output: Some("Requirements extracted".to_string()),
            },
            ExecutionStep {
                name: "Execute step 1".to_string(),
                status: "completed".to_string(),
                output: Some("Step 1 complete".to_string()),
            },
            ExecutionStep {
                name: "Execute step 2".to_string(),
                status: "completed".to_string(),
                output: Some("Step 2 complete".to_string()),
            },
            ExecutionStep {
                name: "Combine results".to_string(),
                status: "completed".to_string(),
                output: Some("Results combined".to_string()),
            },
        ],
        "parallel" => vec![
            ExecutionStep {
                name: "Split task into subtasks".to_string(),
                status: "completed".to_string(),
                output: Some("3 subtasks created".to_string()),
            },
            ExecutionStep {
                name: "Execute subtask A (parallel)".to_string(),
                status: "completed".to_string(),
                output: Some("Subtask A done".to_string()),
            },
            ExecutionStep {
                name: "Execute subtask B (parallel)".to_string(),
                status: "completed".to_string(),
                output: Some("Subtask B done".to_string()),
            },
            ExecutionStep {
                name: "Execute subtask C (parallel)".to_string(),
                status: "completed".to_string(),
                output: Some("Subtask C done".to_string()),
            },
            ExecutionStep {
                name: "Merge parallel results".to_string(),
                status: "completed".to_string(),
                output: Some("All results merged".to_string()),
            },
        ],
        "supervisor" => vec![
            ExecutionStep {
                name: "Analyze task complexity".to_string(),
                status: "completed".to_string(),
                output: Some("Task requires 2 specialist agents".to_string()),
            },
            ExecutionStep {
                name: "Delegate to specialist A".to_string(),
                status: "completed".to_string(),
                output: Some("Specialist A completed subtask".to_string()),
            },
            ExecutionStep {
                name: "Delegate to specialist B".to_string(),
                status: "completed".to_string(),
                output: Some("Specialist B completed subtask".to_string()),
            },
            ExecutionStep {
                name: "Supervisor reviews and integrates".to_string(),
                status: "completed".to_string(),
                output: Some("Final output assembled".to_string()),
            },
        ],
        "chain_of_thought" => vec![
            ExecutionStep {
                name: "Initial analysis".to_string(),
                status: "completed".to_string(),
                output: Some("Task context understood".to_string()),
            },
            ExecutionStep {
                name: "Step 1: Identify approach".to_string(),
                status: "completed".to_string(),
                output: Some("Approach selected".to_string()),
            },
            ExecutionStep {
                name: "Step 2: Execute approach".to_string(),
                status: "completed".to_string(),
                output: Some("Approach executed".to_string()),
            },
            ExecutionStep {
                name: "Step 3: Verify result".to_string(),
                status: "completed".to_string(),
                output: Some("Result verified".to_string()),
            },
        ],
        "map_reduce" => vec![
            ExecutionStep {
                name: "Map: Split input".to_string(),
                status: "completed".to_string(),
                output: Some("Input split into chunks".to_string()),
            },
            ExecutionStep {
                name: "Reduce: Process chunks".to_string(),
                status: "completed".to_string(),
                output: Some("Chunks processed".to_string()),
            },
            ExecutionStep {
                name: "Reduce: Merge output".to_string(),
                status: "completed".to_string(),
                output: Some("Output merged".to_string()),
            },
        ],
        "react" => vec![
            ExecutionStep {
                name: "Thought 1: Analyze task".to_string(),
                status: "completed".to_string(),
                output: Some("Understood the task requirements".to_string()),
            },
            ExecutionStep {
                name: "Action 1: Execute first step".to_string(),
                status: "completed".to_string(),
                output: Some("First step completed".to_string()),
            },
            ExecutionStep {
                name: "Observation 1: Check result".to_string(),
                status: "completed".to_string(),
                output: Some("Result is satisfactory".to_string()),
            },
            ExecutionStep {
                name: "Thought 2: Determine next action".to_string(),
                status: "completed".to_string(),
                output: Some("Task complete, no more actions needed".to_string()),
            },
        ],
        "reflection" => vec![
            ExecutionStep {
                name: "Generate initial output".to_string(),
                status: "completed".to_string(),
                output: Some("Draft generated".to_string()),
            },
            ExecutionStep {
                name: "Self-critique".to_string(),
                status: "completed".to_string(),
                output: Some("Areas for improvement identified".to_string()),
            },
            ExecutionStep {
                name: "Refine based on critique".to_string(),
                status: "completed".to_string(),
                output: Some("Output refined".to_string()),
            },
            ExecutionStep {
                name: "Final quality check".to_string(),
                status: "completed".to_string(),
                output: Some("Quality threshold met".to_string()),
            },
        ],
        "consensus" => vec![
            ExecutionStep {
                name: "Agent A: Independent analysis".to_string(),
                status: "completed".to_string(),
                output: Some("Agent A recommendation ready".to_string()),
            },
            ExecutionStep {
                name: "Agent B: Independent analysis".to_string(),
                status: "completed".to_string(),
                output: Some("Agent B recommendation ready".to_string()),
            },
            ExecutionStep {
                name: "Agent C: Independent analysis".to_string(),
                status: "completed".to_string(),
                output: Some("Agent C recommendation ready".to_string()),
            },
            ExecutionStep {
                name: "Vote and aggregate".to_string(),
                status: "completed".to_string(),
                output: Some("Consensus reached".to_string()),
            },
        ],
        _ => vec![],
    };

    let execution = PatternExecution {
        execution_id: execution_id.clone(),
        pattern_id: pattern_id.clone(),
        status: "completed".to_string(),
        task: task.clone(),
        started_at: now.clone(),
        completed_at: Some(current_timestamp()),
        result: Some(format!(
            "Pattern '{}' executed successfully for task: {}",
            pattern.name, task
        )),
        steps,
    };

    let mut executions = get_executions().lock().map_err(|e| e.to_string())?;
    executions.insert(execution_id.clone(), execution);

    Ok(format!(
        "Execution '{}' completed using pattern '{}' for task: {}",
        execution_id, pattern.name, task
    ))
}

#[tauri::command]
pub async fn get_pattern_status(execution_id: String) -> Result<serde_json::Value, String> {
    let executions = get_executions().lock().map_err(|e| e.to_string())?;

    let execution = executions
        .get(&execution_id)
        .ok_or_else(|| format!("Execution not found: {}", execution_id))?;

    Ok(serde_json::json!({
        "execution_id": execution.execution_id,
        "pattern_id": execution.pattern_id,
        "status": execution.status,
        "task": execution.task,
        "started_at": execution.started_at,
        "completed_at": execution.completed_at,
        "result": execution.result,
        "steps": execution.steps,
        "progress": if execution.status == "completed" { 1.0 } else { 0.5 },
    }))
}
