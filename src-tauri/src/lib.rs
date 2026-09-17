mod commands;

use commands::filesystem::{list_dir, read_file, write_file};
use commands::git::{git_commit, git_diff, git_status};
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
            git_commit
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
