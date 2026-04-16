mod audio;
mod commands;
mod credentials;
mod screen;
mod stt;
mod tts;

use std::sync::Mutex;

use audio::capture::AudioCapture;
use audio::playback::AudioPlayback;
use stt::pipeline::SttPipeline;
use tts::kokoro::KokoroEngine;
use tts::stream::TtsStream;

/// Shared audio state managed by Tauri.
pub struct AudioState {
    pub capture: Mutex<AudioCapture>,
    pub playback: Mutex<AudioPlayback>,
}

/// Shared TTS state managed by Tauri.
pub struct TtsState {
    pub engine: Mutex<KokoroEngine>,
    pub stream: Mutex<TtsStream>,
}

/// Shared STT state managed by Tauri.
pub struct SttState {
    pub pipeline: Mutex<SttPipeline>,
}

pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AudioState {
            capture: Mutex::new(AudioCapture::new()),
            playback: Mutex::new(AudioPlayback::new()),
        })
        .manage(TtsState {
            engine: Mutex::new(KokoroEngine::new()),
            stream: Mutex::new(TtsStream::new()),
        })
        .manage(SttState {
            pipeline: Mutex::new(SttPipeline::new()),
        })
        .invoke_handler(tauri::generate_handler![
            commands::greet,
            commands::execute_shell,
            commands::encrypt_data,
            commands::decrypt_data,
            commands::audio_start_capture,
            commands::audio_stop_capture,
            commands::tts_begin_stream,
            commands::tts_feed_chunk,
            commands::tts_finish_stream,
            commands::tts_stop,
            commands::capture_screenshot,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
