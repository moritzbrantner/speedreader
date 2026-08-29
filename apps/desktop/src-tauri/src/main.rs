#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::load_reader_state,
            commands::open_document,
            commands::save_reader_state
        ])
        .run(tauri::generate_context!())
        .expect("failed to run speedreader desktop");
}
