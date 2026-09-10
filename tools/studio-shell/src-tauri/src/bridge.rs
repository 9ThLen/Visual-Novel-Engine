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
    /// The settings file, as the bridge itself reported it.
    ///
    /// Not computed here. The bridge derives it from the account's own
    /// directories and prints it on every start — including the start it
    /// refuses, which is the one where the author needs it. Deriving it a
    /// second time in Rust would be two answers to one question, and this
    /// project has already paid for that mistake more than once.
    pub settings_path: Option<String>,
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

/// Sets one `KEY=value` in a settings file, leaving the rest of it alone.
///
/// The file the bridge writes on its first run is entirely commented out, so
/// the line to change is usually `#OPENAI_API_KEY=`. Both forms are replaced in
/// place — appending instead would leave the commented original above a live
/// value, which reads as though the file has two answers.
pub fn apply_setting(contents: &str, key: &str, value: &str) -> String {
    let mut replaced = false;
    let mut lines: Vec<String> = contents
        .lines()
        .map(|line| {
            let candidate = line.trim_start().trim_start_matches('#').trim_start();
            if !replaced && candidate.starts_with(&format!("{key}=")) {
                replaced = true;
                format!("{key}={value}")
            } else {
                line.to_string()
            }
        })
        .collect();
    if !replaced {
        lines.push(format!("{key}={value}"));
    }
    let mut out = lines.join("\n");
    out.push('\n');
    out
}

/// Writes the author's provider and key into the bridge's own settings file,
/// then starts the bridge again so they take effect.
///
/// The key travels page → command → file. It is never stored by the window and
/// never leaves this machine: the bridge is the only thing that uses it. The
/// path is not chosen by the caller — it is the one the bridge reported, so a
/// page cannot aim this at a file of its choosing.
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
    let key = api_key.trim();
    if key.is_empty() {
        return Err("The API key is empty.".to_string());
    }

    let path = state
        .snapshot()
        .settings_path
        .ok_or("The bridge has not reported where its settings live. Start it once first.")?;
    let path = std::path::PathBuf::from(path);
    let contents = std::fs::read_to_string(&path)
        .map_err(|error| format!("could not read the bridge settings: {error}"))?;

    let variable = if provider == "gemini" { "GEMINI_API_KEY" } else { "OPENAI_API_KEY" };
    let updated = apply_setting(
        &apply_setting(&contents, "AI_BRIDGE_PROVIDER", &provider),
        variable,
        key,
    );
    write_private(&path, &updated)
        .map_err(|error| format!("could not save the bridge settings: {error}"))?;

    // A running bridge read the old file at startup and will not read it again.
    stop_bridge(&state);
    let node = resource_path(&app, NODE_EXECUTABLE)?;
    let entry = resource_path(&app, ENTRYPOINT)?;
    spawn_bridge(&node, &entry, &state)
}

/// Writes owner-only where the platform expresses that in the file mode.
///
/// On Windows the mode is ignored and the directory's ACL applies instead — the
/// bridge sets and verifies that before it writes anything into the folder, and
/// refuses to run when it cannot.
#[cfg(unix)]
fn write_private(path: &std::path::Path, contents: &str) -> std::io::Result<()> {
    use std::io::Write;
    use std::os::unix::fs::OpenOptionsExt;
    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .mode(0o600)
        .open(path)?;
    file.write_all(contents.as_bytes())
}

#[cfg(not(unix))]
fn write_private(path: &std::path::Path, contents: &str) -> std::io::Result<()> {
    std::fs::write(path, contents)
}

fn stop_bridge(state: &BridgeSupervisor) {
    if let Some(mut child) = state.child.lock().expect("bridge child lock").take() {
        let _ = child.kill();
        let _ = child.wait();
    }
}

#[tauri::command]
pub async fn ai_bridge_stop(state: State<'_, BridgeSupervisor>) -> Result<BridgeReport, String> {
    stop_bridge(&state);
    let mut report = state.report.lock().expect("bridge report lock");
    *report = BridgeReport::default();
    Ok(report.clone())
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
    fn sets_a_commented_template_line_in_place() {
        // The file the bridge writes is entirely commented out. Appending would
        // leave `#OPENAI_API_KEY=` above a live value, which reads as two
        // answers to one question.
        let template = "# a comment\n#AI_BRIDGE_PROVIDER=openai\n#OPENAI_API_KEY=\n";
        let out = apply_setting(template, "OPENAI_API_KEY", "sk-real");
        assert_eq!(out, "# a comment\n#AI_BRIDGE_PROVIDER=openai\nOPENAI_API_KEY=sk-real\n");
        assert!(!out.contains("#OPENAI_API_KEY"));
    }

    #[test]
    fn replaces_a_value_that_is_already_live() {
        let out = apply_setting("OPENAI_API_KEY=old\nAI_BRIDGE_PORT=8787\n", "OPENAI_API_KEY", "new");
        assert_eq!(out, "OPENAI_API_KEY=new\nAI_BRIDGE_PORT=8787\n");
    }

    #[test]
    fn appends_a_key_the_file_never_mentioned() {
        let out = apply_setting("AI_BRIDGE_PORT=8787\n", "GEMINI_API_KEY", "g-real");
        assert_eq!(out, "AI_BRIDGE_PORT=8787\nGEMINI_API_KEY=g-real\n");
    }

    #[test]
    fn leaves_a_similarly_named_setting_alone() {
        // `OPENAI_API_KEY` must not be confused with `OPENAI_API_KEY_BACKUP`.
        let out = apply_setting("#OPENAI_API_KEY_BACKUP=keep\n", "OPENAI_API_KEY", "sk-real");
        assert!(out.contains("#OPENAI_API_KEY_BACKUP=keep"));
        assert!(out.contains("OPENAI_API_KEY=sk-real"));
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

        let contents = std::fs::read_to_string(&settings).expect("readable");
        let updated = apply_setting(&contents, "OPENAI_API_KEY", "sk-test-not-used");
        write_private(std::path::Path::new(&settings), &updated).expect("writable");

        let after = BridgeSupervisor::default();
        let report = spawn_bridge(&node, &entry, &after).expect("the key should be enough");
        assert!(report.ready, "not ready: {report:?}");
        assert_eq!(report.url.as_deref(), Some("ws://127.0.0.1:8874"));
        shut_down(&after);
        let _ = std::fs::remove_dir_all(&home);
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
