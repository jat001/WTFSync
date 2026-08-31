use tauri::Manager;
use tauri_plugin_prevent_default::{Flags, PlatformOptions};

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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
