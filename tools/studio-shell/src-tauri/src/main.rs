// A window around the studio's own web bundle. Nothing else, yet.
//
// The player shell (`tools/desktop-shell`) registers no commands because a story
// is data a stranger runs. The studio's reason is different and weaker: the page
// here is the engine's own, so the danger is not the content but the surface —
// every command added is one more thing that has to keep working across
// installs, and none is needed to open the editor.
//
// The AI bridge is what will change this. It is a Node process the author cannot
// be asked to start by hand, so the studio will have to spawn one; see
// `tools/studio-shell/README.md`.

// Without this the release build opens a console window behind the app on
// Windows. It stays a console build in debug, where the log is the point.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("the visual novel studio failed to start");
}
