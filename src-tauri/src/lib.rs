use std::path::Path;

use tauri::Manager;
use tauri_plugin_fs::FsExt;
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_prevent_default::{Flags, PlatformOptions};

/// Open a directory in the system file manager.
///
/// Unlike the opener plugin's `open_path` IPC command, this is not gated by the
/// static capability scope (which can only list fixed paths), so directories
/// chosen by the user at runtime (e.g. watch paths) can be opened. The path
/// must exist and be a directory.
#[tauri::command]
fn open_directory(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Err(format!("not a directory: {path}"));
    }
    app.opener()
        .open_path(path.as_str(), None::<&str>)
        .map_err(|e| e.to_string())
}

/// Grant the fs plugin runtime access to the given directories.
///
/// The fs plugin's capability scope can only list fixed paths, so directories
/// chosen by the user at runtime (watch paths) are added here. `allow_directory`
/// registers glob patterns for the directory and, when `recursive`, everything
/// under it; matching happens at access time, so files and subdirectories
/// created later are covered automatically. Entries that fail (e.g. a path that
/// no longer exists) are collected and reported without aborting the rest.
#[tauri::command]
fn grant_fs_directories(app: tauri::AppHandle, paths: Vec<String>) -> Vec<String> {
    let scope = app.fs_scope();
    let mut failed = Vec::new();
    for path in paths {
        if scope.is_allowed(&path) {
            continue;
        }
        if scope.allow_directory(&path, true).is_err() {
            failed.push(path);
        }
    }
    failed
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Keep first so duplicate instances exit as early as possible.
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            let _ = app
                .get_webview_window("main")
                .expect("no main window")
                .set_focus();
        }))
        // Window behavior plugins.
        .plugin(
            tauri_plugin_prevent_default::Builder::new()
                .with_flags(Flags::debug())
                .platform(
                    PlatformOptions::new()
                        .general_autofill(false)
                        .password_autosave(false),
                )
                .build(),
        )
        .plugin(tauri_plugin_window_state::Builder::default().build())
        // Utility plugins, sorted alphabetically.
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            open_directory,
            grant_fs_directories
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
