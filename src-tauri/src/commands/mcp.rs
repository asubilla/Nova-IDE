use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPServer {
    pub name: String,
    pub description: String,
    pub tools: Vec<MCPTool>,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MCPTool {
    pub name: String,
    pub description: String,
    pub parameters: Value,
}

fn builtin_mcp_servers() -> Vec<MCPServer> {
    vec![
        MCPServer {
            name: "filesystem".to_string(),
            description: "Read, write, and manage files and directories".to_string(),
            category: "File Management".to_string(),
            tools: vec![
                MCPTool {
                    name: "read_file".to_string(),
                    description: "Read the contents of a file".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "File path to read" }
                        },
                        "required": ["path"]
                    }),
                },
                MCPTool {
                    name: "write_file".to_string(),
                    description: "Write content to a file".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "File path to write" },
                            "content": { "type": "string", "description": "Content to write" }
                        },
                        "required": ["path", "content"]
                    }),
                },
                MCPTool {
                    name: "list_directory".to_string(),
                    description: "List contents of a directory".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "path": { "type": "string", "description": "Directory path" }
                        },
                        "required": ["path"]
                    }),
                },
                MCPTool {
                    name: "search_files".to_string(),
                    description: "Search for files by pattern".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "directory": { "type": "string", "description": "Search directory" },
                            "pattern": { "type": "string", "description": "Glob pattern" }
                        },
                        "required": ["directory", "pattern"]
                    }),
                },
            ],
        },
        MCPServer {
            name: "git".to_string(),
            description: "Git version control operations".to_string(),
            category: "Version Control".to_string(),
            tools: vec![
                MCPTool {
                    name: "git_status".to_string(),
                    description: "Get the current git status".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "repo_path": { "type": "string", "description": "Repository path" }
                        },
                        "required": ["repo_path"]
                    }),
                },
                MCPTool {
                    name: "git_diff".to_string(),
                    description: "Show changes in the working tree".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "repo_path": { "type": "string", "description": "Repository path" }
                        },
                        "required": ["repo_path"]
                    }),
                },
                MCPTool {
                    name: "git_log".to_string(),
                    description: "Show commit logs".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "repo_path": { "type": "string", "description": "Repository path" },
                            "limit": { "type": "integer", "description": "Max commits", "default": 10 }
                        },
                        "required": ["repo_path"]
                    }),
                },
            ],
        },
        MCPServer {
            name: "terminal".to_string(),
            description: "Execute shell commands and manage terminals".to_string(),
            category: "Execution".to_string(),
            tools: vec![
                MCPTool {
                    name: "execute_command".to_string(),
                    description: "Execute a shell command".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "command": { "type": "string", "description": "Command to execute" },
                            "cwd": { "type": "string", "description": "Working directory" }
                        },
                        "required": ["command"]
                    }),
                },
                MCPTool {
                    name: "list_processes".to_string(),
                    description: "List running processes".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {},
                        "required": []
                    }),
                },
            ],
        },
        MCPServer {
            name: "web".to_string(),
            description: "Web search and URL fetching capabilities".to_string(),
            category: "Internet".to_string(),
            tools: vec![
                MCPTool {
                    name: "fetch_url".to_string(),
                    description: "Fetch content from a URL".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "url": { "type": "string", "description": "URL to fetch" },
                            "format": { "type": "string", "enum": ["text", "html", "markdown"], "default": "text" }
                        },
                        "required": ["url"]
                    }),
                },
                MCPTool {
                    name: "web_search".to_string(),
                    description: "Search the web for information".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "query": { "type": "string", "description": "Search query" }
                        },
                        "required": ["query"]
                    }),
                },
            ],
        },
        MCPServer {
            name: "code_analysis".to_string(),
            description: "Analyze and understand code structure".to_string(),
            category: "Code Intelligence".to_string(),
            tools: vec![
                MCPTool {
                    name: "analyze_syntax".to_string(),
                    description: "Parse and analyze code syntax".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "code": { "type": "string", "description": "Code to analyze" },
                            "language": { "type": "string", "description": "Programming language" }
                        },
                        "required": ["code", "language"]
                    }),
                },
                MCPTool {
                    name: "find_references".to_string(),
                    description: "Find all references to a symbol in the codebase".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "directory": { "type": "string", "description": "Search directory" },
                            "symbol": { "type": "string", "description": "Symbol to find" }
                        },
                        "required": ["directory", "symbol"]
                    }),
                },
            ],
        },
        MCPServer {
            name: "database".to_string(),
            description: "Database query and management operations".to_string(),
            category: "Data".to_string(),
            tools: vec![
                MCPTool {
                    name: "query_sql".to_string(),
                    description: "Execute a SQL query".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "connection_string": { "type": "string", "description": "Database connection string" },
                            "query": { "type": "string", "description": "SQL query" }
                        },
                        "required": ["connection_string", "query"]
                    }),
                },
                MCPTool {
                    name: "list_tables".to_string(),
                    description: "List all tables in the database".to_string(),
                    parameters: serde_json::json!({
                        "type": "object",
                        "properties": {
                            "connection_string": { "type": "string", "description": "Database connection string" }
                        },
                        "required": ["connection_string"]
                    }),
                },
            ],
        },
    ]
}

#[tauri::command]
pub async fn search_mcp_tools(query: String) -> Result<Vec<MCPServer>, String> {
    let servers = builtin_mcp_servers();
    let query_lower = query.to_lowercase();

    let filtered: Vec<MCPServer> = servers
        .into_iter()
        .filter(|server| {
            let name_match = server.name.to_lowercase().contains(&query_lower);
            let desc_match = server.description.to_lowercase().contains(&query_lower);
            let category_match = server.category.to_lowercase().contains(&query_lower);
            let tool_match = server
                .tools
                .iter()
                .any(|t| {
                    t.name.to_lowercase().contains(&query_lower)
                        || t.description.to_lowercase().contains(&query_lower)
                });
            name_match || desc_match || category_match || tool_match
        })
        .collect();

    Ok(filtered)
}

#[tauri::command]
pub async fn execute_mcp_tool(
    server: String,
    tool: String,
    args: Value,
) -> Result<Value, String> {
    let servers = builtin_mcp_servers();
    let server_ref = servers
        .iter()
        .find(|s| s.name == server)
        .ok_or_else(|| format!("Unknown MCP server: {}", server))?;

    let _tool_ref = server_ref
        .tools
        .iter()
        .find(|t| t.name == tool)
        .ok_or_else(|| format!("Unknown tool '{}' on server '{}'", tool, server))?;

    match (server.as_str(), tool.as_str()) {
        ("filesystem", "read_file") => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| "Missing 'path' parameter".to_string())?;
            let content = std::fs::read_to_string(path)
                .map_err(|e| format!("Failed to read file: {}", e))?;
            Ok(serde_json::json!({
                "success": true,
                "content": content,
                "path": path,
            }))
        }
        ("filesystem", "write_file") => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| "Missing 'path' parameter".to_string())?;
            let content = args["content"]
                .as_str()
                .ok_or_else(|| "Missing 'content' parameter".to_string())?;
            std::fs::write(path, content)
                .map_err(|e| format!("Failed to write file: {}", e))?;
            Ok(serde_json::json!({
                "success": true,
                "message": format!("File written: {}", path),
            }))
        }
        ("filesystem", "list_directory") => {
            let path = args["path"]
                .as_str()
                .ok_or_else(|| "Missing 'path' parameter".to_string())?;
            let entries: Vec<String> = std::fs::read_dir(path)
                .map_err(|e| format!("Failed to read directory: {}", e))?
                .filter_map(|e| e.ok())
                .map(|e| e.file_name().to_string_lossy().to_string())
                .collect();
            Ok(serde_json::json!({
                "success": true,
                "entries": entries,
                "path": path,
            }))
        }
        ("filesystem", "search_files") => {
            let directory = args["directory"]
                .as_str()
                .ok_or_else(|| "Missing 'directory' parameter".to_string())?;
            let pattern = args["pattern"]
                .as_str()
                .ok_or_else(|| "Missing 'pattern' parameter".to_string())?;
            let mut matches = Vec::new();
            if let Ok(walk) = std::fs::read_dir(directory) {
                for entry in walk.filter_map(|e| e.ok()) {
                    let name = entry.file_name().to_string_lossy().to_string();
                    if name.contains(pattern) {
                        matches.push(entry.path().to_string_lossy().to_string());
                    }
                }
            }
            Ok(serde_json::json!({
                "success": true,
                "matches": matches,
            }))
        }
        ("terminal", "execute_command") => {
            let command = args["command"]
                .as_str()
                .ok_or_else(|| "Missing 'command' parameter".to_string())?;
            let cwd = args["cwd"].as_str().unwrap_or(".");
            let output = std::process::Command::new("cmd")
                .args(["/C", command])
                .current_dir(cwd)
                .output()
                .map_err(|e| format!("Failed to execute command: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            Ok(serde_json::json!({
                "success": output.status.success(),
                "stdout": stdout,
                "stderr": stderr,
                "exit_code": output.status.code(),
            }))
        }
        ("terminal", "list_processes") => {
            let output = std::process::Command::new("cmd")
                .args(["/C", "tasklist"])
                .output()
                .map_err(|e| format!("Failed to list processes: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(serde_json::json!({
                "success": true,
                "output": stdout,
            }))
        }
        _ => Err(format!(
            "Tool execution not implemented for {}/{}",
            server, tool
        )),
    }
}

#[tauri::command]
pub async fn list_mcp_categories() -> Result<Vec<String>, String> {
    let servers = builtin_mcp_servers();
    let mut categories: Vec<String> = servers
        .into_iter()
        .map(|s| s.category)
        .collect::<std::collections::HashSet<_>>()
        .into_iter()
        .collect();
    categories.sort();
    Ok(categories)
}
