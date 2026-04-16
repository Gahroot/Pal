use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::audio::capture::CaptureConfig;
use crate::{AudioState, TtsState};

/// Placeholder greeting command for testing
#[tauri::command]
pub fn greet(name: &str) -> String {
    format!("Hello, {}! Tama is running.", name)
}

/// Execute a shell command (PowerShell on Windows, bash on Linux for dev)
#[tauri::command]
pub async fn execute_shell(
    command: String,
    timeout_ms: Option<u64>,
    working_dir: Option<String>,
) -> Result<ShellResult, String> {
    let timeout = std::time::Duration::from_millis(timeout_ms.unwrap_or(120_000));

    let shell = if cfg!(target_os = "windows") {
        "powershell.exe"
    } else {
        "bash"
    };

    let shell_args = if cfg!(target_os = "windows") {
        vec![
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-Command".to_string(),
            command.clone(),
        ]
    } else {
        vec!["-c".to_string(), command.clone()]
    };

    let mut cmd = tokio::process::Command::new(shell);
    cmd.args(&shell_args)
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    if let Some(ref dir) = working_dir {
        cmd.current_dir(dir);
    }

    // Strip sensitive env vars
    let sensitive_suffixes = ["_SECRET", "_PASSWORD", "_KEY", "_TOKEN", "_API_KEY"];
    for (key, _) in std::env::vars() {
        if sensitive_suffixes.iter().any(|s| key.ends_with(s)) {
            cmd.env_remove(&key);
        }
    }
    cmd.env("TERM", "dumb");

    let child = cmd
        .spawn()
        .map_err(|e| format!("Failed to spawn shell: {}", e))?;

    match tokio::time::timeout(timeout, child.wait_with_output()).await {
        Ok(Ok(output)) => {
            let stdout = String::from_utf8_lossy(&output.stdout).to_string();
            let stderr = String::from_utf8_lossy(&output.stderr).to_string();
            let combined = if stderr.is_empty() {
                stdout
            } else {
                format!("{}\n{}", stdout, stderr)
            };

            // Truncate: keep first 200 + last 200 lines if too long
            let lines: Vec<&str> = combined.lines().collect();
            let truncated = if lines.len() > 400 {
                let first = lines[..200].join("\n");
                let last = lines[lines.len() - 200..].join("\n");
                format!(
                    "{}\n\n... [{} lines truncated] ...\n\n{}",
                    first,
                    lines.len() - 400,
                    last
                )
            } else {
                combined
            };

            // Cap at 10MB
            let capped = if truncated.len() > 10_000_000 {
                truncated[..10_000_000].to_string()
            } else {
                truncated
            };

            Ok(ShellResult {
                exit_code: output.status.code().unwrap_or(-1),
                output: capped,
                timed_out: false,
            })
        }
        Ok(Err(e)) => Err(format!("Shell execution failed: {}", e)),
        Err(_) => Ok(ShellResult {
            exit_code: -1,
            output: format!("Command timed out after {}ms", timeout.as_millis()),
            timed_out: true,
        }),
    }
}

#[derive(Serialize, Deserialize)]
pub struct ShellResult {
    pub exit_code: i32,
    pub output: String,
    pub timed_out: bool,
}

/// Encrypt data with ChaCha20-Poly1305 using the keystore-managed key.
#[tauri::command]
pub async fn encrypt_data(plaintext: String) -> Result<String, String> {
    let key = crate::credentials::keystore::get_or_create_key()
        .map_err(|e| format!("Failed to get encryption key: {}", e))?;

    let encrypted = crate::credentials::encryption::encrypt(plaintext.as_bytes(), &key)
        .map_err(|e| format!("Encryption failed: {}", e))?;

    use base64::Engine;
    Ok(base64::engine::general_purpose::STANDARD.encode(&encrypted))
}

/// Decrypt data with ChaCha20-Poly1305 using the keystore-managed key.
#[tauri::command]
pub async fn decrypt_data(ciphertext: String) -> Result<String, String> {
    let key = crate::credentials::keystore::get_or_create_key()
        .map_err(|e| format!("Failed to get encryption key: {}", e))?;

    use base64::Engine;
    let data = base64::engine::general_purpose::STANDARD
        .decode(&ciphertext)
        .map_err(|e| format!("Base64 decode failed: {}", e))?;

    let plaintext = crate::credentials::encryption::decrypt(&data, &key)
        .map_err(|e| format!("Decryption failed: {}", e))?;

    String::from_utf8(plaintext).map_err(|e| format!("UTF-8 decode failed: {}", e))
}

// ── Audio commands ──────────────────────────────────────────────────────

/// Start audio capture from the default microphone.
///
/// Emits events to the frontend:
/// - "audio-level": { rms: f64 }
/// - "audio-first-speech": {}
/// - "audio-silence-detected": {}
#[tauri::command]
pub async fn audio_start_capture(
    app: tauri::AppHandle,
    state: State<'_, AudioState>,
    silence_duration_ms: Option<u64>,
    mute_system: Option<bool>,
) -> Result<(), String> {
    let config = CaptureConfig {
        silence_duration: std::time::Duration::from_millis(silence_duration_ms.unwrap_or(2000)),
        mute_system: mute_system.unwrap_or(false),
    };

    let mut capture = state
        .capture
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;

    capture
        .start(config)
        .map_err(|e| format!("Failed to start capture: {}", e))?;

    // Spawn a background task to forward capture events to the frontend.
    if let Some(event_rx) = capture.event_rx.take() {
        let app_handle = app.clone();
        std::thread::spawn(move || {
            use crate::audio::capture::CaptureEvent;
            while let Ok(event) = event_rx.recv() {
                match event {
                    CaptureEvent::AudioLevel(rms) => {
                        let _ = app_handle.emit("audio-level", serde_json::json!({ "rms": rms }));
                    }
                    CaptureEvent::FirstSpeech => {
                        let _ = app_handle.emit("audio-first-speech", serde_json::json!({}));
                    }
                    CaptureEvent::SilenceDetected => {
                        let _ = app_handle.emit("audio-silence-detected", serde_json::json!({}));
                    }
                    CaptureEvent::Error(msg) => {
                        let _ = app_handle
                            .emit("audio-error", serde_json::json!({ "error": msg }));
                    }
                }
            }
        });
    }

    Ok(())
}

/// Stop audio capture.
#[tauri::command]
pub async fn audio_stop_capture(state: State<'_, AudioState>) -> Result<(), String> {
    let mut capture = state
        .capture
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    capture.stop();
    Ok(())
}

// ── TTS commands ────────────────────────────────────────────────────────

/// Begin a new TTS stream. Resets the text buffer.
#[tauri::command]
pub async fn tts_begin_stream(
    state: State<'_, TtsState>,
    audio_state: State<'_, AudioState>,
) -> Result<(), String> {
    let mut stream = state
        .stream
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    stream.reset();

    // Pre-warm the playback engine.
    let engine = state
        .engine
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    let mut playback = audio_state
        .playback
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    if !playback.is_started() {
        playback
            .start(engine.sample_rate(), 1)
            .map_err(|e| format!("Failed to start playback: {}", e))?;
    }

    Ok(())
}

/// Feed a text chunk from the LLM stream into the TTS pipeline.
///
/// Automatically synthesizes and enqueues ready utterances for playback.
#[tauri::command]
pub async fn tts_feed_chunk(
    state: State<'_, TtsState>,
    audio_state: State<'_, AudioState>,
    text: String,
) -> Result<(), String> {
    let chunks = {
        let mut stream = state
            .stream
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        stream.feed_chunk(&text);
        stream.drain_buffer()
    };

    // Synthesize and enqueue each chunk.
    if !chunks.is_empty() {
        let engine = state
            .engine
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        let mut playback = audio_state
            .playback
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        for chunk in chunks {
            match engine.generate(&chunk) {
                Ok(samples) => playback.enqueue_samples(&samples),
                Err(e) => log::error!("TTS generation failed for chunk: {}", e),
            }
        }
    }

    Ok(())
}

/// Signal end of the LLM stream. Flush remaining text through TTS.
#[tauri::command]
pub async fn tts_finish_stream(
    state: State<'_, TtsState>,
    audio_state: State<'_, AudioState>,
) -> Result<(), String> {
    let chunks = {
        let mut stream = state
            .stream
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        stream.finish()
    };

    if !chunks.is_empty() {
        let engine = state
            .engine
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        let mut playback = audio_state
            .playback
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        for chunk in chunks {
            match engine.generate(&chunk) {
                Ok(samples) => playback.enqueue_samples(&samples),
                Err(e) => log::error!("TTS generation failed for chunk: {}", e),
            }
        }
    }

    Ok(())
}

/// Stop TTS playback immediately.
#[tauri::command]
pub async fn tts_stop(
    state: State<'_, TtsState>,
    audio_state: State<'_, AudioState>,
) -> Result<(), String> {
    {
        let mut stream = state
            .stream
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        stream.reset();
    }
    {
        let mut playback = audio_state
            .playback
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        playback.stop();
    }
    Ok(())
}

// ── Screen capture command ──────────────────────────────────────────────

/// Capture a screenshot and return it as base64-encoded image data.
#[tauri::command]
pub async fn capture_screenshot(
    display: Option<u32>,
    format: Option<String>,
    quality: Option<u8>,
) -> Result<ScreenshotResult, String> {
    let (data, width, height) = crate::screen::capture::capture_screen(
        display.unwrap_or(0),
        format.as_deref().unwrap_or("jpeg"),
        quality.unwrap_or(80),
    )
    .map_err(|e| format!("Screenshot failed: {}", e))?;

    use base64::Engine;
    let encoded = base64::engine::general_purpose::STANDARD.encode(&data);

    Ok(ScreenshotResult {
        data: encoded,
        width,
        height,
        format: format.unwrap_or_else(|| "jpeg".to_string()),
    })
}

#[derive(Serialize, Deserialize)]
pub struct ScreenshotResult {
    pub data: String,
    pub width: u32,
    pub height: u32,
    pub format: String,
}
