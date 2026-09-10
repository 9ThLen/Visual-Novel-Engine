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
const RESOURCE_DIR: &str = "ai-bridge";
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

/// What the window is told. The token is here because pairing is the point:
/// the author should not have to copy it out of a console they never opened.
#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BridgeReport {
    /// The bridge is listening and has published its pairing details.
    pub ready: bool,
    /// A process exists, whether or not it has finished starting.
    pub running: bool,
    pub url: Option<String>,
    pub token: Option<String>,
    /// Why it is not usable, in the bridge's own words.
    pub error: Option<String>,
}

#[derive(Default)]
pub struct BridgeSupervisor {
    child: Mutex<Option<Child>>,
    report: Arc<Mutex<BridgeReport>>,
}

impl BridgeSupervisor {
    fn snapshot(&self) -> BridgeReport {
        self.report.lock().expect("bridge report lock").clone()
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
    for (prefix, field) in [("URL: ", "url"), ("Token: ", "token")] {
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
pub async fn ai_bridge_status(state: State<'_, BridgeSupervisor>) -> Result<BridgeReport, String> {
    Ok(state.snapshot())
}

#[tauri::command]
pub async fn ai_bridge_start<R: Runtime>(
    app: AppHandle<R>,
    state: State<'_, BridgeSupervisor>,
) -> Result<BridgeReport, String> {
    {
        // Already up: hand back what we know rather than starting a second one,
        // which would bind a taken port and leave the editor paired to neither.
        let mut child = state.child.lock().expect("bridge child lock");
        if let Some(running) = child.as_mut() {
            match running.try_wait() {
                Ok(None) => return Ok(state.snapshot()),
                _ => {
                    *child = None;
                }
            }
        }
    }

    let node = resource_path(&app, NODE_EXECUTABLE)?;
    let entry = resource_path(&app, ENTRYPOINT)?;
    spawn_bridge(&node, &entry, &state)
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
        return Err(
            "This installation does not include the AI bridge. Reinstall the studio, or start a \
             bridge yourself and pair it in the AI panel."
                .to_string(),
        );
    }

    let mut command = Command::new(node);
    command
        .arg(entry)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        // CREATE_NO_WINDOW: without it a console flashes over the studio on
        // every start.
        use std::os::windows::process::CommandExt;
        command.creation_flags(0x0800_0000);
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

#[tauri::command]
pub async fn ai_bridge_stop(state: State<'_, BridgeSupervisor>) -> Result<BridgeReport, String> {
    if let Some(mut child) = state.child.lock().expect("bridge child lock").take() {
        let _ = child.kill();
        let _ = child.wait();
    }
    let mut report = state.report.lock().expect("bridge report lock");
    *report = BridgeReport::default();
    Ok(report.clone())
}

/// Kills the bridge when the studio goes away.
///
/// Without this a closed studio leaves a Node process holding the port, and the
/// next start finds it taken by something the author cannot see.
pub fn shut_down(state: &BridgeSupervisor) {
    if let Some(mut child) = state.child.lock().expect("bridge child lock").take() {
        let _ = child.kill();
        let _ = child.wait();
    }
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
