use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Mutex, OnceLock};
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OrchestrationPattern {
    pub id: String,
    pub name: String,
    pub description: String,
    pub pattern_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
#[serde(rename_all = "camelCase")]
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

fn get_steps_for_pattern(pattern_type: &str) -> Vec<ExecutionStep> {
    match pattern_type {
        "sequential" => vec![
            ExecutionStep {
                name: "Parse task requirements".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Execute step 1".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Execute step 2".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Combine results".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        "parallel" => vec![
            ExecutionStep {
                name: "Split task into subtasks".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Execute subtask A (parallel)".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Execute subtask B (parallel)".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Execute subtask C (parallel)".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Merge parallel results".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        "supervisor" => vec![
            ExecutionStep {
                name: "Analyze task complexity".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Delegate to specialist A".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Delegate to specialist B".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Supervisor reviews and integrates".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        "chain_of_thought" => vec![
            ExecutionStep {
                name: "Initial analysis".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Step 1: Identify approach".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Step 2: Execute approach".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Step 3: Verify result".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        "map_reduce" => vec![
            ExecutionStep {
                name: "Map: Split input".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Reduce: Process chunks".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Reduce: Merge output".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        "react" => vec![
            ExecutionStep {
                name: "Thought 1: Analyze task".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Action 1: Execute first step".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Observation 1: Check result".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Thought 2: Determine next action".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        "reflection" => vec![
            ExecutionStep {
                name: "Generate initial output".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Self-critique".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Refine based on critique".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Final quality check".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        "consensus" => vec![
            ExecutionStep {
                name: "Agent A: Independent analysis".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Agent B: Independent analysis".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Agent C: Independent analysis".to_string(),
                status: "pending".to_string(),
                output: None,
            },
            ExecutionStep {
                name: "Vote and aggregate".to_string(),
                status: "pending".to_string(),
                output: None,
            },
        ],
        _ => vec![],
    }
}

#[tauri::command]
pub async fn list_patterns() -> Result<Vec<OrchestrationPattern>, String> {
    Ok(builtin_patterns())
}

#[tauri::command]
pub async fn execute_pattern(
    app: AppHandle,
    pattern_id: String,
    task: String,
) -> Result<String, String> {
    let patterns = builtin_patterns();
    let pattern = patterns
        .iter()
        .find(|p| p.id == pattern_id)
        .ok_or_else(|| format!("Unknown pattern: {}", pattern_id))?;

    let execution_id = generate_id();
    let now = current_timestamp();

    let steps = get_steps_for_pattern(&pattern.pattern_type);

    let execution = PatternExecution {
        execution_id: execution_id.clone(),
        pattern_id: pattern_id.clone(),
        status: "running".to_string(),
        task: task.clone(),
        started_at: now.clone(),
        completed_at: None,
        result: None,
        steps,
    };

    {
        let mut executions = get_executions().lock().map_err(|e| e.to_string())?;
        executions.insert(execution_id.clone(), execution.clone());
    }

    let exec_id = execution_id.clone();
    let pat_name = pattern.name.clone();
    let pat_type = pattern.pattern_type.clone();
    let task_clone = task.clone();

    tokio::spawn(async move {
        let total_steps = {
            let executions = get_executions().lock().unwrap();
            executions.get(&exec_id).map(|e| e.steps.len()).unwrap_or(0)
        };

        for step_idx in 0..total_steps {
            tokio::time::sleep(std::time::Duration::from_millis(800)).await;

            let mut executions = match get_executions().lock() {
                Ok(e) => e,
                Err(_) => return,
            };

            if let Some(execution) = executions.get_mut(&exec_id) {
                if step_idx < execution.steps.len() {
                    let step_name = execution.steps[step_idx].name.clone();
                    execution.steps[step_idx].status = "running".to_string();

                    let snapshot = execution.clone();
                    drop(executions);

                    let _ = app.emit(
                        "pattern-step-progress",
                        serde_json::json!({
                            "executionId": exec_id,
                            "stepIndex": step_idx,
                            "stepName": step_name,
                            "status": "running",
                        }),
                    );

                    tokio::time::sleep(std::time::Duration::from_millis(400)).await;

                    let mut executions = match get_executions().lock() {
                        Ok(e) => e,
                        Err(_) => return,
                    };

                    if let Some(execution) = executions.get_mut(&exec_id) {
                        let output_msg = match pat_type.as_str() {
                            "sequential" => format!("Step {} completed", step_idx + 1),
                            "parallel" => format!("Subtask {} finished", (step_idx as u8 + b'A')),
                            "supervisor" => format!("Subtask delegated and completed"),
                            "chain_of_thought" => format!("Analysis phase {} done", step_idx + 1),
                            "map_reduce" => format!("Chunk {} processed", step_idx + 1),
                            "react" => format!("Reason-action cycle {} done", step_idx + 1),
                            "reflection" => format!("Reflection iteration {} done", step_idx + 1),
                            "consensus" => format!("Agent vote {} submitted", step_idx + 1),
                            _ => "Step completed".to_string(),
                        };

                        execution.steps[step_idx].status = "completed".to_string();
                        execution.steps[step_idx].output = Some(output_msg);

                        if step_idx == total_steps - 1 {
                            execution.status = "completed".to_string();
                            execution.completed_at = Some(current_timestamp());
                            execution.result = Some(format!(
                                "Pattern '{}' executed successfully for task: {}",
                                pat_name, task_clone
                            ));
                        }

                        let snapshot = execution.clone();
                        drop(executions);

                        let _ = app.emit(
                            "pattern-step-progress",
                            serde_json::json!({
                                "executionId": exec_id,
                                "stepIndex": step_idx,
                                "stepName": execution.steps[step_idx].name,
                                "status": "completed",
                                "output": execution.steps[step_idx].output,
                            }),
                        );
                    }
                }
            } else {
                break;
            }
        }
    });

    Ok(format!(
        "Execution '{}' started using pattern '{}' for task: {}",
        execution_id, pattern.name, task
    ))
}

#[tauri::command]
pub async fn get_pattern_status(execution_id: String) -> Result<PatternStatusResponse, String> {
    let executions = get_executions().lock().map_err(|e| e.to_string())?;

    let execution = executions
        .get(&execution_id)
        .ok_or_else(|| format!("Execution not found: {}", execution_id))?;

    let progress = if execution.status == "completed" {
        1.0
    } else if execution.steps.is_empty() {
        0.0
    } else {
        let completed = execution.steps.iter().filter(|s| s.status == "completed").count();
        completed as f32 / execution.steps.len() as f32
    };

    Ok(PatternStatusResponse {
        execution_id: execution.execution_id.clone(),
        pattern_id: execution.pattern_id.clone(),
        status: execution.status.clone(),
        task: execution.task.clone(),
        started_at: execution.started_at.clone(),
        completed_at: execution.completed_at.clone(),
        result: execution.result.clone(),
        steps: execution.steps.clone(),
        progress,
    })
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PatternStatusResponse {
    execution_id: String,
    pattern_id: String,
    status: String,
    task: String,
    started_at: String,
    completed_at: Option<String>,
    result: Option<String>,
    steps: Vec<ExecutionStep>,
    progress: f32,
}
