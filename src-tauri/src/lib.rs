mod commands;

use commands::ai::{list_providers, save_api_key, send_ai_message, test_connection};
use commands::agents::{execute_workflow, get_agent_logs, kill_agent, list_agents, spawn_agent};
use commands::browser::{browser_act, browser_inspect, browser_navigate, browser_screenshot};
use commands::filesystem::{list_dir, read_file, write_file};
use commands::git::{git_commit, git_diff, git_status};
use commands::healing::{get_healing_log, get_healing_stats, trigger_heal};
use commands::mcp::{execute_mcp_tool, list_mcp_categories, search_mcp_tools};
use commands::orchestration::{execute_pattern, get_pattern_status, list_patterns};
use commands::settings::{get_settings, reset_settings, update_settings};
use commands::terminal::{send_input, spawn_terminal};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            read_file,
            write_file,
            list_dir,
            spawn_terminal,
            send_input,
            git_status,
            git_diff,
            git_commit,
            send_ai_message,
            list_providers,
            save_api_key,
            test_connection,
            spawn_agent,
            kill_agent,
            list_agents,
            execute_workflow,
            get_agent_logs,
            search_mcp_tools,
            execute_mcp_tool,
            list_mcp_categories,
            browser_navigate,
            browser_screenshot,
            browser_inspect,
            browser_act,
            get_healing_log,
            trigger_heal,
            get_healing_stats,
            list_patterns,
            execute_pattern,
            get_pattern_status,
            get_settings,
            update_settings,
            reset_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
