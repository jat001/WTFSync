use tauri_plugin_prevent_default::{Flags, PlatformOptions};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
