// --- File: src-tauri/src/main.rs ---
// This is the main entry point for the Tauri application.

// Prevents an additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // This makes the `generate_password` command available to the front end.
        .invoke_handler(tauri::generate_handler![
            secure_vault_lib::core_logic::generate_password,
            secure_vault_lib::core_logic::check_password_strength,
            secure_vault_lib::core_logic::generate_passphrase,
            secure_vault_lib::core_logic::save_vault,
            secure_vault_lib::core_logic::load_vault
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
