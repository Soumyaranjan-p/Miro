// Prevents an extra console window on Windows in release builds.
// Debug builds keep the console so `npm run tauri dev` shows log output.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    miro_lib::run()
}
