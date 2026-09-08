// A window around a prebuilt web bundle. Nothing else.
//
// No commands are registered, so the page has no IPC surface to call: a story is
// data the reader plays, and the desktop shell must not become a way for one to
// reach the machine it plays on. Adding a command here is a deliberate act, and
// it needs a matching entry in `capabilities/default.json` before it can be
// invoked at all.

// Without this the release build opens a console window behind the app on
// Windows. It stays a console build in debug, where the log is the point.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("the visual novel player failed to start");
}
