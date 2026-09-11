// A window around the studio's own web bundle, and the AI bridge that ships
// beside it.
//
// The player shell (`tools/desktop-shell`) registers no commands because a story
// is data a stranger runs. This one registers four: start the bridge, ask how it
// is, stop it, and save the author's provider and API key into the bridge's own
// settings. The first three take no argument at all; the fourth takes two
// values and no path — the file it writes is the one the bridge reported, and
// the executable it runs is resolved from this application's own resource
// directory. Nothing the page sends chooses either.
//
// That is deliberately not `tauri-plugin-shell`. A permission to run programs is
// general; this is specific, and the difference is the entire security argument
// for doing it at all. `capabilities/default.json` still grants `core:default`
// and nothing more.

// Without this the release build opens a console window behind the app on
// Windows. It stays a console build in debug, where the log is the point.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod bridge;

use tauri::{Manager, RunEvent};

fn main() {
    tauri::Builder::default()
        .manage(bridge::BridgeSupervisor::default())
        .setup(|app| {
            // Start it now rather than when the author finds the button. An
            // editor that was configured once should open connected; the panel
            // reads whatever this produced when it is opened, and a studio built
            // without the bridge simply has nothing to start.
            bridge::start_in_background(app.handle(), &app.state::<bridge::BridgeSupervisor>());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            bridge::ai_bridge_start,
            bridge::ai_bridge_status,
            bridge::ai_bridge_stop,
            bridge::ai_bridge_save_settings,
        ])
        .build(tauri::generate_context!())
        .expect("the visual novel studio failed to start")
        .run(|app, event| {
            // A closed studio must not leave a Node process holding the port:
            // the next start would find it taken by something with no window.
            if let RunEvent::Exit = event {
                bridge::shut_down(&app.state::<bridge::BridgeSupervisor>());
            }
        });
}
