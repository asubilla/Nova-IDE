use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MCPServer {
    pub name: String,
    pub description: String,
    pub tools: Vec<MCPTool>,
    pub category: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
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
            let output = Command::new("cmd")
                .args(["/C", "tasklist"])
                .output()
                .map_err(|e| format!("Failed to list processes: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            Ok(serde_json::json!({
                "success": true,
                "output": stdout,
            }))
        }
        ("git", "git_status") => {
            let repo_path = args["repo_path"]
                .as_str()
                .ok_or_else(|| "Missing 'repo_path' parameter".to_string())?;
            let result = super::git::git_status(repo_path.to_string())?;
            Ok(serde_json::to_value(result)
                .map_err(|e| format!("Failed to serialize result: {}", e))?)
        }
        ("git", "git_diff") => {
            let repo_path = args["repo_path"]
                .as_str()
                .ok_or_else(|| "Missing 'repo_path' parameter".to_string())?;
            let result = super::git::git_diff(repo_path.to_string())?;
            Ok(serde_json::to_value(result)
                .map_err(|e| format!("Failed to serialize result: {}", e))?)
        }
        ("git", "git_log") => {
            let repo_path = args["repo_path"]
                .as_str()
                .ok_or_else(|| "Missing 'repo_path' parameter".to_string())?;
            let limit = args["limit"].as_u64().unwrap_or(10);
            let output = Command::new("git")
                .args(["log", &format!("--oneline -{}", limit)])
                .current_dir(repo_path)
                .output()
                .map_err(|e| format!("Failed to run git log: {}", e))?;
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            if !output.status.success() {
                let stderr = String::from_utf8_lossy(&output.stderr).to_string();
                return Err(format!("git log failed: {}", stderr));
            }
            Ok(serde_json::json!({
                "success": true,
                "output": stdout,
            }))
        }
        ("web", "fetch_url") => {
            let url = args["url"]
                .as_str()
                .ok_or_else(|| "Missing 'url' parameter".to_string())?;
            let client = reqwest::Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .map_err(|e| format!("Failed to create HTTP client: {}", e))?;
            let response = client
                .get(url)
                .header("User-Agent", "NovaIDE/1.0")
                .send()
                .await
                .map_err(|e| format!("Failed to fetch URL: {}", e))?;
            let status = response.status().as_u16();
            let body = response
                .text()
                .await
                .map_err(|e| format!("Failed to read response: {}", e))?;
            Ok(serde_json::json!({
                "success": true,
                "status": status,
                "body": body,
                "url": url,
            }))
        }
        ("web", "web_search") => {
            Ok(serde_json::json!({
                "success": false,
                "error": "Search requires API key configuration. Please configure a search API key in Settings.",
            }))
        }
        ("code_analysis", "analyze_syntax") => {
            let code = args["code"]
                .as_str()
                .ok_or_else(|| "Missing 'code' parameter".to_string())?;
            let language = args["language"]
                .as_str()
                .ok_or_else(|| "Missing 'language' parameter".to_string())?;
            let mut issues: Vec<String> = Vec::new();
            let mut line_num = 0;
            for line in code.lines() {
                line_num += 1;
                let trimmed = line.trim();
                if trimmed.is_empty() || trimmed.starts_with("//") || trimmed.starts_with('#') {
                    continue;
                }
                if (language == "javascript" || language == "typescript")
                    && trimmed.contains("console.log")
                {
                    issues.push(format!("Line {}: console.log statement found", line_num));
                }
                if trimmed.ends_with(';')
                    || trimmed.ends_with('{')
                    || trimmed.ends_with('}')
                    || trimmed.ends_with(',')
                {
                } else if !trimmed.starts_with("//")
                    && !trimmed.starts_with("/*")
                    && !trimmed.starts_with('*')
                    && !trimmed.is_empty()
                    && trimmed.len() > 3
                    && !trimmed.ends_with(':')
                    && !trimmed.ends_with('(')
                    && !trimmed.ends_with(')')
                    && !trimmed.starts_with("import")
                    && !trimmed.starts_with("export")
                {
                    issues.push(format!(
                        "Line {}: possible missing semicolon or incomplete statement",
                        line_num
                    ));
                }
            }
            Ok(serde_json::json!({
                "success": true,
                "language": language,
                "lines_analyzed": line_num,
                "issues": issues,
                "issue_count": issues.len(),
            }))
        }
        ("code_analysis", "find_references") => {
            let directory = args["directory"]
                .as_str()
                .ok_or_else(|| "Missing 'directory' parameter".to_string())?;
            let symbol = args["symbol"]
                .as_str()
                .ok_or_else(|| "Missing 'symbol' parameter".to_string())?;
            let mut results: Vec<serde_json::Value> = Vec::new();
            if let Ok(entries) = std::fs::read_dir(directory) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    if path.is_file() {
                        if let Ok(content) = std::fs::read_to_string(&path) {
                            for (i, line) in content.lines().enumerate() {
                                if line.contains(symbol) {
                                    results.push(serde_json::json!({
                                        "file": path.to_string_lossy(),
                                        "line": i + 1,
                                        "content": line.trim(),
                                    }));
                                }
                            }
                        }
                    }
                }
            }
            Ok(serde_json::json!({
                "success": true,
                "symbol": symbol,
                "references": results,
                "count": results.len(),
            }))
        }
        ("database", "query_sql") | ("database", "list_tables") => {
            Ok(serde_json::json!({
                "success": false,
                "error": "Database not configured. Please configure a database connection in Settings.",
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
