//! Starting, watching and stopping the AI bridge that ships beside the studio.
//!
//! The bridge is a Node process. An installed studio cannot ask its author to
//! open a terminal, so the window asks for it here instead — through three
//! commands that take **no arguments**. Nothing the page sends chooses a path,
//! a binary or a flag: the executable is resolved from this application's own
//! resource directory and nowhere else.
//!
//! That is why there is no `tauri-plugin-shell` and no `shell:allow-execute`.
//! A capability to run programs would be a general one; this is a specific one,
//! and the difference is the whole security argument. (App commands invoked from
//! a local origin need no capability entry at all — see
//! `tauri::webview`'s invoke path, which checks the ACL only for plugin
//! commands, remote origins, or an app that defined its own manifest.)

use std::io::{BufRead, BufReader};
use std::path::PathBuf;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Manager, Runtime, State};

/// Where staging puts the packaged bridge inside the bundle.
///
/// The whole relative path, because that is what Tauri reproduces. A
/// `bundle.resources` entry is copied to the path it was named by —
/// `tauri_utils::resources::resource_relpath` keeps every component — so files
/// staged at `src-tauri/resources/ai-bridge/` install to
/// `<resources>/resources/ai-bridge/`, not to `<resources>/ai-bridge/`.
/// Resolving the short name found nothing in an installed studio while every
/// test passed, because no test installs one. `scripts/lib/stage-studio.ts`
/// holds the other half of this string, and a test compares the two.
const RESOURCE_DIR: &str = "resources/ai-bridge";
const NODE_EXECUTABLE: &str = if cfg!(windows) { "node.exe" } else { "node" };
const ENTRYPOINT: &str = "bridge/cli.mjs";

/// How long to wait for the pairing block before calling it a failure.
///
/// The bridge prints it once it is listening. A cold start on a slow disk is
/// seconds; a bridge that has not printed it in half a minute is not coming.
const READY_TIMEOUT: Duration = Duration::from_secs(30);
const POLL: Duration = Duration::from_millis(50);

/// Time for the reader threads to drain the pipes after the process exits.
///
/// `try_wait` reports the exit before those threads have necessarily seen the
/// last line, and the last line is the one that says why. Reporting without it
/// produces "stopped immediately" over a message that explained itself.
const DRAIN: Duration = Duration::from_millis(250);

/// Enough of the bridge's own output to explain a failure, and no more.
const MAX_DIAGNOSTIC_BYTES: usize = 8 * 1024;

/// Said when the installation has no bridge in it, by both things that run one.
const MISSING_BRIDGE: &str = "This installation does not include the AI bridge. Reinstall the studio, \
                              or start a bridge yourself and pair it in the AI panel.";

/// `CREATE_NO_WINDOW`: without it a console flashes over the studio on every
/// start, and again on every saved key.
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;

/// What the window is told. The token is here because pairing is the point:
/// the author should not have to copy it out of a console they never opened.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeReport {
    /// This installation carries a bridge at all.
    ///
    /// A studio built without the package is a supported shape — it pairs with a
    /// bridge the author runs — and the panel must offer that manual path rather
    /// than a start button that can only fail. Resolved from the files on disk
    /// each time it is asked, not remembered, because it is a fact about the
    /// installation and not about the run.
    pub installed: bool,
    /// The bridge is listening and has published its pairing details.
    pub ready: bool,
    /// A process exists, whether or not it has finished starting.
    pub running: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    /// Why it is not usable, in the bridge's own words.
    pub error: Option<String>,
    /// The settings file, as the bridge itself reported it.
    ///
    /// Not computed here. The bridge derives it from the account's own
    /// directories and prints it on every start — including the start it
    /// refuses, which is the one where the author needs it. Deriving it a
    /// second time in Rust would be two answers to one question, and this
    /// project has already paid for that mistake more than once.
    pub settings_path: Option<String>,
}

/// Cloneable, because the work is done off the UI thread.
///
/// Starting the bridge blocks for as long as the bridge takes to listen. Doing
/// that inside an async command holds a runtime thread for up to thirty
/// seconds; the clone is what lets the whole thing move to `spawn_blocking`.
#[derive(Clone, Default)]
pub struct BridgeSupervisor {
    child: Arc<Mutex<Option<Child>>>,
    report: Arc<Mutex<BridgeReport>>,
    /// Held for the length of a start, so two of them cannot overlap.
    ///
    /// The studio starts the bridge as it opens; the AI panel asks again when an
    /// author gets there. Without this the second call would either spawn a
    /// rival process fighting for the port, or report "not running" about a
    /// bridge that was seconds from ready. Instead it waits for the first and
    /// reads its result.
    starting: Arc<Mutex<()>>,
}

impl BridgeSupervisor {
    fn snapshot(&self) -> BridgeReport {
        self.report.lock().expect("bridge report lock").clone()
    }

    /// Whether the process we started is still alive, updating the report when
    /// it is not.
    ///
    /// The report is written by threads reading the bridge's output, and those
    /// say nothing when the process simply dies — the pipes close and the last
    /// state stands. So a crashed bridge went on reporting itself ready, and the
    /// panel went on offering a pairing to a socket that had gone. Asking the
    /// operating system is the only answer that cannot be stale.
    fn reconcile(&self) -> bool {
        let mut child = self.child.lock().expect("bridge child lock");
        let exited = match child.as_mut() {
            None => return false,
            Some(running) => match running.try_wait() {
                Ok(None) => return true,
                Ok(Some(status)) => format!("The AI bridge stopped ({status})."),
                Err(error) => format!("Lost track of the AI bridge: {error}"),
            },
        };
        *child = None;
        let mut report = self.report.lock().expect("bridge report lock");
        // The pairing details go with it: they name a socket nobody is holding,
        // and handing them out again would pair the editor to nothing.
        *report = BridgeReport {
            error: Some(match report.error.clone() {
                // Whatever it said on the way out explains more than the exit code.
                Some(said) if !said.is_empty() => said,
                _ => exited,
            }),
            settings_path: report.settings_path.clone(),
            ..BridgeReport::default()
        };
        false
    }
}

fn resource_path<R: Runtime>(app: &AppHandle<R>, relative: &str) -> Result<PathBuf, String> {
    app.path()
        .resolve(
            format!("{RESOURCE_DIR}/{relative}"),
            tauri::path::BaseDirectory::Resource,
        )
        .map_err(|error| format!("could not locate {relative} in this installation: {error}"))
}

/// The runtime and the bridge this installation ships, if it ships them.
fn bridge_paths<R: Runtime>(app: &AppHandle<R>) -> Result<(PathBuf, PathBuf), String> {
    Ok((resource_path(app, NODE_EXECUTABLE)?, resource_path(app, ENTRYPOINT)?))
}

fn bridge_installed<R: Runtime>(app: &AppHandle<R>) -> bool {
    matches!(bridge_paths(app), Ok((node, entry)) if node.exists() && entry.exists())
}

/// Keeps the last `MAX_DIAGNOSTIC_BYTES` of what the bridge said.
///
/// The tail rather than the head: the line that explains a failure is the last
/// one, and an unbounded buffer is a memory leak fed by a process we do not
/// control.
fn push_diagnostic(buffer: &mut String, line: &str) {
    buffer.push_str(line);
    buffer.push('\n');
    if buffer.len() > MAX_DIAGNOSTIC_BYTES {
        let cut = buffer.len() - MAX_DIAGNOSTIC_BYTES;
        *buffer = buffer[cut..].to_string();
    }
}

/// Reads the pairing block out of the bridge's own startup output.
pub fn parse_pairing_line(line: &str) -> Option<(&'static str, String)> {
    for (prefix, field) in [
        ("URL: ", "url"),
        ("Token: ", "token"),
        ("Settings: ", "settings"),
    ] {
        if let Some(rest) = line.strip_prefix(prefix) {
            let value = rest.trim();
            if !value.is_empty() {
                return Some((field, value.to_string()));
            }
        }
    }
    None
}

#[tauri::command]
pub async fn ai_bridge_status<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BridgeSupervisor>,
) -> Result<BridgeReport, String> {
    // Not the stored answer: the stored answer survives the process it describes.
    state.reconcile();
    let installed = bridge_installed(&app);
    Ok(BridgeReport { installed, ..state.snapshot() })
}

#[tauri::command]
pub async fn ai_bridge_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BridgeSupervisor>,
) -> Result<BridgeReport, String> {
    let (node, entry) = bridge_paths(&app)?;
    let supervisor = (*state).clone();
    // Reaching a report at all means the files were there: `spawn_bridge`
    // refuses otherwise, so there is nothing to re-check.
    installed(blocking(move || ensure_running(&node, &entry, &supervisor)).await)
}

/// Stamps a report from a path that only succeeds on an installation that has
/// the bridge, so the window is never told a working bridge is not installed.
fn installed(result: Result<BridgeReport, String>) -> Result<BridgeReport, String> {
    result.map(|report| BridgeReport { installed: true, ..report })
}

/// Starts the bridge as the studio opens, without blocking the window.
///
/// An author who has configured this once should find the AI panel connected,
/// not holding a button that they have to press every time they open the studio.
/// Nothing here is reported to anyone: whatever happens ends up in the report,
/// and the panel reads that when it is opened.
pub fn start_in_background<R: Runtime>(app: &AppHandle<R>, state: &BridgeSupervisor) {
    let Ok((node, entry)) = bridge_paths(app) else { return };
    // A studio built without the package: nothing to start, and the panel will
    // offer manual pairing instead.
    if !node.exists() || !entry.exists() {
        return;
    }
    let supervisor = state.clone();
    thread::spawn(move || {
        let _ = ensure_running(&node, &entry, &supervisor);
    });
}

/// Runs blocking work off the async runtime and unwraps the join.
async fn blocking<F>(work: F) -> Result<BridgeReport, String>
where
    F: FnOnce() -> Result<BridgeReport, String> + Send + 'static,
{
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("the AI bridge task did not finish: {error}"))?
}

/// Starts the bridge unless it is already up, and never twice at once.
///
/// The lock is taken before the liveness check, not after: two callers that both
/// looked first would both find nothing and both spawn.
pub fn ensure_running(
    node: &std::path::Path,
    entry: &std::path::Path,
    state: &BridgeSupervisor,
) -> Result<BridgeReport, String> {
    let _turn = state.starting.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    if state.reconcile() {
        // Up already — including the case where this call waited for the start
        // that brought it up.
        return Ok(state.snapshot());
    }
    spawn_bridge(node, entry, state)
}

/// Starts the bridge and waits for it to publish a pairing block.
///
/// Split from the command so it can be exercised against a real bridge without
/// a window: everything interesting here — the readiness wait, the failure
/// path, the diagnostics — is what a supervisor gets wrong, and none of it
/// needs Tauri.
pub fn spawn_bridge(
    node: &std::path::Path,
    entry: &std::path::Path,
    state: &BridgeSupervisor,
) -> Result<BridgeReport, String> {
    if !node.exists() || !entry.exists() {
        return Err(MISSING_BRIDGE.to_string());
    }

    let mut command = Command::new(node);
    command
        .arg(entry)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut spawned = command
        .spawn()
        .map_err(|error| format!("could not start the AI bridge: {error}"))?;

    let stdout = spawned.stdout.take();
    let stderr = spawned.stderr.take();

    *state.report.lock().expect("bridge report lock") = BridgeReport {
        running: true,
        ..BridgeReport::default()
    };

    if let Some(stdout) = stdout {
        let report = Arc::clone(&state.report);
        thread::spawn(move || {
            let mut diagnostic = String::new();
            for line in BufReader::new(stdout).lines().map_while(Result::ok) {
                let mut report = report.lock().expect("bridge report lock");
                match parse_pairing_line(&line) {
                    Some(("url", value)) => report.url = Some(value),
                    Some(("token", value)) => report.token = Some(value),
                    Some(("settings", value)) => report.settings_path = Some(value),
                    _ => push_diagnostic(&mut diagnostic, &line),
                }
                if report.url.is_some() && report.token.is_some() {
                    report.ready = true;
                    report.error = None;
                }
                if !report.ready {
                    report.error = Some(diagnostic.trim().to_string()).filter(|s| !s.is_empty());
                }
            }
        });
    }

    if let Some(stderr) = stderr {
        let report = Arc::clone(&state.report);
        thread::spawn(move || {
            let mut diagnostic = String::new();
            for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                push_diagnostic(&mut diagnostic, &line);
                let mut report = report.lock().expect("bridge report lock");
                // Anything on stderr while it is starting is why it did not.
                if !report.ready {
                    report.error = Some(diagnostic.trim().to_string());
                }
            }
        });
    }

    let deadline = Instant::now() + READY_TIMEOUT;
    loop {
        if state.snapshot().ready {
            *state.child.lock().expect("bridge child lock") = Some(spawned);
            return Ok(state.snapshot());
        }
        match spawned.try_wait() {
            Ok(Some(status)) => {
                // Exited before publishing a pairing block. Its own message is
                // the only useful thing we have; the bridge writes a clear one
                // for a missing key or an unprotected settings folder.
                thread::sleep(DRAIN);
                let mut report = state.report.lock().expect("bridge report lock");
                report.running = false;
                report.ready = false;
                // `settings_path` deliberately survives: a refusal is exactly
                // when the author needs to know which file to fix.
                let detail = report.error.clone().unwrap_or_default();
                let message = if detail.is_empty() {
                    format!("The AI bridge stopped immediately ({status}).")
                } else {
                    detail
                };
                report.error = Some(message.clone());
                return Err(message);
            }
            Ok(None) => {}
            Err(error) => return Err(format!("lost track of the AI bridge: {error}")),
        }
        if Instant::now() >= deadline {
            let _ = spawned.kill();
            let mut report = state.report.lock().expect("bridge report lock");
            report.running = false;
            let message = "The AI bridge did not finish starting.".to_string();
            report.error = Some(message.clone());
            return Err(message);
        }
        thread::sleep(POLL);
    }
}

/// Hands the author's provider and key to the bridge, and starts it again.
///
/// The studio does not write the settings file, does not know its format and
/// does not know where it is. It runs the bridge once with `--save-key`, which
/// seals the key for this Windows account and selects the provider, then starts
/// the bridge normally. One program owns the settings, and it is the one that
/// reads them.
///
/// The key travels on that process's standard input. It is never an argument:
/// every process on Windows can read every other process's command line, so an
/// API key passed that way is readable by anything running as the author —
/// which is most of what sealing it protects against.
#[tauri::command]
pub async fn ai_bridge_save_settings<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BridgeSupervisor>,
    provider: String,
    api_key: String,
) -> Result<BridgeReport, String> {
    let provider = match provider.as_str() {
        "openai" | "gemini" => provider,
        other => return Err(format!("{other} is not a provider this panel can configure.")),
    };
    if api_key.trim().is_empty() {
        return Err("The API key is empty.".to_string());
    }

    let (node, entry) = bridge_paths(&app)?;
    let supervisor = (*state).clone();
    installed(
        blocking(move || {
            save_key(&node, &entry, &provider, api_key.trim())?;
            // A running bridge read the old settings at startup and will not read
            // them again, so the new key only takes effect on a fresh process.
            stop_bridge(&supervisor);
            ensure_running(&node, &entry, &supervisor)
        })
        .await,
    )
}

/// Runs the bridge's own `--save-key`, writing the key to its standard input.
pub fn save_key(
    node: &std::path::Path,
    entry: &std::path::Path,
    provider: &str,
    key: &str,
) -> Result<(), String> {
    use std::io::Write;

    if !node.exists() || !entry.exists() {
        return Err(MISSING_BRIDGE.to_string());
    }

    let mut command = Command::new(node);
    command
        .arg(entry)
        .arg("--save-key")
        .arg(provider)
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }

    let mut spawned = command
        .spawn()
        .map_err(|error| format!("could not save the key: {error}"))?;
    spawned
        .stdin
        .take()
        .ok_or_else(|| "could not hand the key to the AI bridge".to_string())?
        .write_all(key.as_bytes())
        .map_err(|error| format!("could not hand the key to the AI bridge: {error}"))?;

    let finished = spawned
        .wait_with_output()
        .map_err(|error| format!("could not save the key: {error}"))?;
    if finished.status.success() {
        return Ok(());
    }
    // The bridge's own words again: it explains a key Windows would not seal,
    // or a settings file it could not write.
    let said = String::from_utf8_lossy(&finished.stderr);
    let said = said.trim();
    Err(if said.is_empty() {
        format!("The AI bridge could not save the key ({}).", finished.status)
    } else {
        said.to_string()
    })
}

fn stop_bridge(state: &BridgeSupervisor) {
    if let Some(mut child) = state.child.lock().expect("bridge child lock").take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
pub async fn ai_bridge_stop<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BridgeSupervisor>,
) -> Result<BridgeReport, String> {
    stop_bridge(&state);
    let mut report = state.report.lock().expect("bridge report lock");
    *report = BridgeReport::default();
    Ok(BridgeReport { installed: bridge_installed(&app), ..report.clone() })
}

/// Kills the bridge when the studio goes away.
///
/// Without this a closed studio leaves a Node process holding the port, and the
/// next start finds it taken by something the author cannot see.
pub fn shut_down(state: &BridgeSupervisor) {
    stop_bridge(state);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_the_pairing_block_the_bridge_prints() {
        assert_eq!(
            parse_pairing_line("URL: ws://127.0.0.1:8787"),
            Some(("url", "ws://127.0.0.1:8787".to_string()))
        );
        assert_eq!(
            parse_pairing_line("Token: a1b4629de14b8e147316a1241468f20d"),
            Some(("token", "a1b4629de14b8e147316a1241468f20d".to_string()))
        );
    }

    #[test]
    fn ignores_everything_else_the_bridge_says() {
        // The startup block also carries a provider, an image backend and the
        // allowed origins. None of them is a pairing detail.
        for line in [
            "Provider: OpenAI API",
            "Allowed origins: http://localhost:8081",
            "",
            "URL:",
            "Token:",
        ] {
            assert_eq!(parse_pairing_line(line), None, "matched {line:?}");
        }
    }

    #[test]
    fn keeps_the_tail_of_a_talkative_failure() {
        // The line that explains a failure is the last one, and the process
        // producing them is not ours to trust with our memory.
        let mut buffer = String::new();
        for index in 0..20_000 {
            push_diagnostic(&mut buffer, &format!("line {index}"));
        }
        assert!(buffer.len() <= MAX_DIAGNOSTIC_BYTES + 32);
        assert!(buffer.ends_with("line 19999\n"));
    }

    /// Drives a real bridge, when one is pointed at.
    ///
    /// `cargo test` alone skips these: CI does not build Rust and the bundle is
    /// not in the source tree. Run them against a built bridge with
    ///
    ///   VNE_TEST_BRIDGE_ENTRY=…/tools/ai-bridge/dist/cli.mjs \\
    ///   VNE_TEST_BRIDGE_HOME=/tmp/some-empty-dir cargo test -- --nocapture
    ///
    /// The supervisor's readiness wait and failure path are the parts a window
    /// cannot be asked to discover for us.
    fn real_bridge() -> Option<(std::path::PathBuf, std::path::PathBuf)> {
        let entry = std::env::var("VNE_TEST_BRIDGE_ENTRY").ok()?;
        let node = which_node()?;
        let entry = std::path::PathBuf::from(entry);
        if !entry.exists() {
            return None;
        }
        Some((node, entry))
    }

    fn which_node() -> Option<std::path::PathBuf> {
        let output = Command::new("which").arg("node").output().ok()?;
        let path = String::from_utf8(output.stdout).ok()?;
        let path = std::path::PathBuf::from(path.trim());
        path.exists().then_some(path)
    }

    #[test]
    fn reaches_ready_and_reports_the_pairing_details() {
        let Some((node, entry)) = real_bridge() else {
            eprintln!("skipped: set VNE_TEST_BRIDGE_ENTRY to a built cli.mjs");
            return;
        };
        std::env::set_var("OPENAI_API_KEY", "sk-test-not-used");
        std::env::set_var("AI_BRIDGE_PROVIDER", "openai");
        std::env::set_var("AI_BRIDGE_PORT", "8871");

        let state = BridgeSupervisor::default();
        let report = spawn_bridge(&node, &entry, &state).expect("the bridge should start");
        assert!(report.ready, "not ready: {report:?}");
        assert_eq!(report.url.as_deref(), Some("ws://127.0.0.1:8871"));
        assert!(
            report.token.as_deref().is_some_and(|t| t.len() == 48),
            "token was {:?}",
            report.token
        );
        assert!(report.error.is_none(), "error was {:?}", report.error);

        shut_down(&state);
        assert!(state.child.lock().unwrap().is_none());
    }

    #[test]
    fn hands_back_the_bridge_own_words_when_it_refuses_to_start() {
        // A missing API key stops the bridge on purpose. The window has no other
        // way to learn why, so the supervisor must carry the message out.
        let Some((node, entry)) = real_bridge() else {
            eprintln!("skipped: set VNE_TEST_BRIDGE_ENTRY to a built cli.mjs");
            return;
        };
        std::env::remove_var("OPENAI_API_KEY");
        std::env::set_var("AI_BRIDGE_PROVIDER", "openai");
        std::env::set_var("AI_BRIDGE_PORT", "8872");

        let state = BridgeSupervisor::default();
        let error = spawn_bridge(&node, &entry, &state).expect_err("it should refuse");
        assert!(error.contains("OPENAI_API_KEY"), "said: {error}");
        assert!(!state.snapshot().ready);
    }

    #[test]
    fn a_refused_start_still_reports_where_the_settings_are() {
        // That refusal is exactly when the author needs the path: it is what the
        // panel writes the key into next.
        let Some((node, entry)) = real_bridge() else {
            eprintln!("skipped: set VNE_TEST_BRIDGE_ENTRY to a built cli.mjs");
            return;
        };
        let home = std::env::temp_dir().join(format!("vne-bridge-refusal-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::env::set_var("VNE_BRIDGE_HOME", &home);
        std::env::remove_var("OPENAI_API_KEY");
        std::env::set_var("AI_BRIDGE_PROVIDER", "openai");
        std::env::set_var("AI_BRIDGE_PORT", "8873");

        let state = BridgeSupervisor::default();
        spawn_bridge(&node, &entry, &state).expect_err("no key, so no bridge");
        let report = state.snapshot();
        assert!(report.settings_path.is_some(), "no settings path in {report:?}");
        assert!(std::path::Path::new(report.settings_path.as_ref().unwrap()).exists());
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn a_key_written_into_that_file_is_what_starts_the_bridge() {
        // The whole loop the panel drives: refuse, learn the path, write the
        // key, start. Nothing here needs a window.
        let Some((node, entry)) = real_bridge() else {
            eprintln!("skipped: set VNE_TEST_BRIDGE_ENTRY to a built cli.mjs");
            return;
        };
        let home = std::env::temp_dir().join(format!("vne-bridge-loop-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&home);
        std::env::set_var("VNE_BRIDGE_HOME", &home);
        std::env::remove_var("OPENAI_API_KEY");
        std::env::set_var("AI_BRIDGE_PROVIDER", "openai");
        std::env::set_var("AI_BRIDGE_PORT", "8874");

        let state = BridgeSupervisor::default();
        spawn_bridge(&node, &entry, &state).expect_err("no key yet");
        let settings = state.snapshot().settings_path.expect("the bridge said where");

        save_key(&node, &entry, "openai", "sk-test-not-used").expect("the bridge should take it");
        // Sealed, not written here: the settings file must not hold the key.
        let contents = std::fs::read_to_string(&settings).expect("readable");
        assert!(!contents.contains("sk-test-not-used"), "key left in {settings}");

        let after = BridgeSupervisor::default();
        let report = spawn_bridge(&node, &entry, &after).expect("the key should be enough");
        assert!(report.ready, "not ready: {report:?}");
        assert_eq!(report.url.as_deref(), Some("ws://127.0.0.1:8874"));
        shut_down(&after);
        let _ = std::fs::remove_dir_all(&home);
    }

    #[test]
    fn stops_reporting_a_bridge_that_died() {
        // The reported failure: the report is written by threads reading the
        // bridge's pipes, and a process that dies says nothing. The last state
        // stood, so the panel kept offering a pairing to a socket that had gone.
        let state = BridgeSupervisor::default();
        *state.report.lock().unwrap() = BridgeReport {
            installed: true,
            ready: true,
            running: true,
            url: Some("ws://127.0.0.1:8787".to_string()),
            token: Some("a-token".to_string()),
            settings_path: Some("C:\\settings".to_string()),
            error: None,
        };
        let corpse = Command::new(if cfg!(windows) { "cmd" } else { "true" })
            .args(if cfg!(windows) { vec!["/c", "exit", "0"] } else { vec![] })
            .stdout(Stdio::null())
            .stderr(Stdio::null())
            .spawn()
            .expect("a process that exits at once");
        *state.child.lock().unwrap() = Some(corpse);
        // Give it a moment to actually be gone; `try_wait` reports what is true
        // now, not what is about to be.
        for _ in 0..200 {
            if !state.reconcile() {
                break;
            }
            thread::sleep(POLL);
        }

        let report = state.snapshot();
        assert!(!report.running && !report.ready, "still claims a bridge: {report:?}");
        assert_eq!(report.url, None, "handed out a dead socket");
        assert_eq!(report.token, None);
        assert!(report.error.is_some(), "said nothing about why");
        // The one thing worth keeping: it is where the author fixes the key.
        assert_eq!(report.settings_path.as_deref(), Some("C:\\settings"));
    }

    #[test]
    fn says_nothing_about_a_bridge_that_was_never_started() {
        let state = BridgeSupervisor::default();
        assert!(!state.reconcile());
        assert_eq!(state.snapshot().error, None);
    }

    #[test]
    fn refuses_a_bundle_that_is_not_installed() {
        let state = BridgeSupervisor::default();
        let error = spawn_bridge(
            std::path::Path::new("/nowhere/node"),
            std::path::Path::new("/nowhere/cli.mjs"),
            &state,
        )
        .expect_err("there is nothing to run");
        assert!(error.contains("does not include the AI bridge"), "said: {error}");
    }

    #[test]
    fn a_short_failure_is_kept_whole() {
        let mut buffer = String::new();
        push_diagnostic(&mut buffer, "OPENAI_API_KEY is not set");
        assert_eq!(buffer, "OPENAI_API_KEY is not set\n");
    }
}
