use serde::{Deserialize, Serialize};
use tauri::{Emitter, State};

use crate::audio::capture::CaptureConfig;
use crate::{AudioState, SttState, TtsState};

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
///
/// Also spawns a drainer thread that downmixes + resamples device audio to
/// 16kHz mono and feeds it into the STT pipeline via shared state.
#[tauri::command]
pub async fn audio_start_capture(
    app: tauri::AppHandle,
    audio_state: State<'_, AudioState>,
    silence_duration_ms: Option<u64>,
    mute_system: Option<bool>,
) -> Result<(), String> {
    use std::sync::atomic::{AtomicBool, Ordering};
    use std::sync::Arc;
    use tauri::Manager;

    let config = CaptureConfig {
        silence_duration: std::time::Duration::from_millis(silence_duration_ms.unwrap_or(2000)),
        mute_system: mute_system.unwrap_or(false),
    };

    let (device_sample_rate, channels, consumer, stop_flag) = {
        let mut capture = audio_state
            .capture
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;

        capture
            .start(config)
            .map_err(|e| format!("Failed to start capture: {}", e))?;

        // Forward capture events to the frontend.
        if let Some(event_rx) = capture.event_rx.take() {
            let app_handle = app.clone();
            std::thread::spawn(move || {
                use crate::audio::capture::CaptureEvent;
                while let Ok(event) = event_rx.recv() {
                    match event {
                        CaptureEvent::AudioLevel(rms) => {
                            let _ =
                                app_handle.emit("audio-level", serde_json::json!({ "rms": rms }));
                        }
                        CaptureEvent::FirstSpeech => {
                            let _ = app_handle
                                .emit("audio-first-speech", serde_json::json!({}));
                        }
                        CaptureEvent::SilenceDetected => {
                            let _ = app_handle
                                .emit("audio-silence-detected", serde_json::json!({}));
                        }
                        CaptureEvent::Error(msg) => {
                            let _ = app_handle
                                .emit("audio-error", serde_json::json!({ "error": msg }));
                        }
                    }
                }
            });
        }

        let stop_flag = Arc::new(AtomicBool::new(false));
        capture.drainer_stop_flag = Some(stop_flag.clone());
        (
            capture.sample_rate(),
            capture.channels(),
            capture.consumer.take(),
            stop_flag,
        )
    };

    // Drainer: device ring buffer → 16kHz mono → STT.
    if let Some(mut consumer) = consumer {
        use ringbuf::traits::Consumer;
        let pipeline_arc = {
            let stt_state = app.state::<crate::SttState>();
            stt_state.pipeline.clone()
        };
        std::thread::spawn(move || {
            let target_rate: u32 = 16_000;
            let ratio = device_sample_rate as f32 / target_rate as f32;
            let mut carry: f32 = 0.0;
            let mut mono_buf: Vec<f32> = Vec::with_capacity(8192);
            let mut raw_buf: Vec<f32> = vec![0.0; 4096];

            while !stop_flag.load(Ordering::SeqCst) {
                let n = consumer.pop_slice(&mut raw_buf);
                if n == 0 {
                    std::thread::sleep(std::time::Duration::from_millis(20));
                    continue;
                }

                // Downmix to mono.
                mono_buf.clear();
                if channels <= 1 {
                    mono_buf.extend_from_slice(&raw_buf[..n]);
                } else {
                    let ch = channels as usize;
                    let frames = n / ch;
                    for f in 0..frames {
                        let mut sum = 0.0f32;
                        for c in 0..ch {
                            sum += raw_buf[f * ch + c];
                        }
                        mono_buf.push(sum / ch as f32);
                    }
                }

                // Linear resample to 16kHz mono.
                let mut resampled =
                    Vec::with_capacity(mono_buf.len() / ratio.max(1.0) as usize + 4);
                let mut pos = carry;
                while (pos as usize) < mono_buf.len() {
                    let i = pos as usize;
                    let frac = pos - i as f32;
                    let a = mono_buf[i];
                    let b = mono_buf.get(i + 1).copied().unwrap_or(a);
                    resampled.push(a + (b - a) * frac);
                    pos += ratio;
                }
                carry = pos - mono_buf.len() as f32;

                if !resampled.is_empty() {
                    if let Ok(mut pipeline) = pipeline_arc.lock() {
                        pipeline.feed_samples(&resampled);
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

/// Synthesize a single complete utterance and enqueue for playback.
///
/// The frontend pre-segments text at sentence/clause boundaries, so each call
/// represents one ready-to-speak chunk. Emits `tts-status` events so the
/// frontend can track pending utterances.
#[tauri::command]
pub async fn tts_enqueue_text(
    app: tauri::AppHandle,
    state: State<'_, TtsState>,
    audio_state: State<'_, AudioState>,
    text: String,
) -> Result<(), String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        let _ = app.emit(
            "tts-status",
            serde_json::json!({ "status": "finished" }),
        );
        return Ok(());
    }

    let _ = app.emit(
        "tts-status",
        serde_json::json!({ "status": "enqueued" }),
    );

    let samples = {
        let engine = state
            .engine
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        engine
            .generate(trimmed)
            .map_err(|e| format!("TTS generation failed: {}", e))?
    };

    {
        let mut playback = audio_state
            .playback
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        playback.enqueue_samples(&samples);
    }

    let _ = app.emit(
        "tts-status",
        serde_json::json!({ "status": "audio_ready" }),
    );
    let _ = app.emit(
        "tts-status",
        serde_json::json!({ "status": "finished" }),
    );

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

// ── Browser launch command ─────────────────────────────────────────────

/// Spawn a Chromium-family browser with remote debugging enabled.
///
/// Uses a dedicated user-data dir under the app data folder so we don't
/// collide with the user's main profile.
#[tauri::command]
pub async fn launch_browser(
    app: tauri::AppHandle,
    browser_path: String,
    debug_port: u16,
) -> Result<(), String> {
    use tauri::Manager;

    let app_data = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to resolve app data dir: {}", e))?;
    let profile_dir = app_data.join("browser-profile");
    std::fs::create_dir_all(&profile_dir)
        .map_err(|e| format!("Failed to create browser profile dir: {}", e))?;

    tokio::process::Command::new(&browser_path)
        .arg(format!("--remote-debugging-port={}", debug_port))
        .arg(format!("--user-data-dir={}", profile_dir.display()))
        .arg("--no-first-run")
        .arg("--no-default-browser-check")
        .arg("about:blank")
        .spawn()
        .map_err(|e| format!("Failed to launch browser: {}", e))?;

    Ok(())
}

/// Check whether a file exists at the given absolute path.
#[tauri::command]
pub fn file_exists(path: String) -> bool {
    std::path::Path::new(&path).exists()
}

// ── STT commands ───────────────────────────────────────────────────────

/// Load the Whisper model from the given ggml binary path.
///
/// Typically called once at app startup with a path like
/// `{appData}/models/ggml-base.en.bin`.
#[tauri::command]
pub async fn stt_load_model(
    state: State<'_, SttState>,
    model_path: String,
) -> Result<(), String> {
    let mut pipeline = state
        .pipeline
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    pipeline
        .load_model(&model_path)
        .map_err(|e| format!("STT model load failed: {}", e))?;
    Ok(())
}

/// Start a new listening session: clears the buffer and marks Listening.
#[tauri::command]
pub async fn stt_start(state: State<'_, SttState>) -> Result<(), String> {
    let mut pipeline = state
        .pipeline
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    pipeline.start_listening();
    Ok(())
}

/// Feed raw 16kHz mono f32 samples into the STT buffer.
#[tauri::command]
pub async fn stt_feed_samples(
    state: State<'_, SttState>,
    samples: Vec<f32>,
) -> Result<(), String> {
    let mut pipeline = state
        .pipeline
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    pipeline.feed_samples(&samples);
    Ok(())
}

/// Run whisper inference on the accumulated buffer and emit the result.
///
/// Emits `transcription-final` { text } on success.
#[tauri::command]
pub async fn stt_finalize(
    app: tauri::AppHandle,
    state: State<'_, SttState>,
) -> Result<String, String> {
    let text = {
        let mut pipeline = state
            .pipeline
            .lock()
            .map_err(|e| format!("Lock error: {}", e))?;
        pipeline
            .get_final_result()
            .unwrap_or_default()
    };

    let _ = app.emit(
        "transcription-final",
        serde_json::json!({ "text": text.clone() }),
    );
    Ok(text)
}

// ── TTS model loading ──────────────────────────────────────────────────

/// Load the Kokoro ONNX model and voices pack.
///
/// `model_path` should point to `kokoro-v1.0.onnx` and `voices_path` to
/// the voices tensor file (`voices.bin`).
#[tauri::command]
pub async fn tts_load_model(
    state: State<'_, TtsState>,
    model_path: String,
    voices_path: String,
    voice_name: Option<String>,
) -> Result<(), String> {
    let mut engine = state
        .engine
        .lock()
        .map_err(|e| format!("Lock error: {}", e))?;
    engine
        .load_model(
            &model_path,
            &voices_path,
            voice_name.as_deref().unwrap_or("af_sky"),
        )
        .map_err(|e| format!("Kokoro model load failed: {}", e))?;
    Ok(())
}
