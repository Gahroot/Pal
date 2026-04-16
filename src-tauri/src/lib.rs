mod audio;
mod commands;
mod credentials;
mod screen;
mod stt;
mod tts;

use std::sync::{Arc, Mutex};

use audio::capture::AudioCapture;
use audio::playback::AudioPlayback;
use stt::pipeline::SttPipeline;
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager,
};
use tauri_plugin_global_shortcut::{Code, Modifiers, Shortcut, ShortcutState};
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
///
/// `pipeline` is wrapped in an Arc so the audio drainer thread can clone it
/// at start, freeing itself from the Tauri state lifetime.
pub struct SttState {
    pub pipeline: Arc<Mutex<SttPipeline>>,
}

/// Toggle the floating panel window visibility.
///
/// If hidden: show + focus. If visible: hide.
fn toggle_panel(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        match window.is_visible() {
            Ok(true) => {
                let _ = window.hide();
                let _ = app.emit("panel-toggle", serde_json::json!({ "visible": false }));
            }
            _ => {
                let _ = window.show();
                let _ = window.set_focus();
                let _ = app.emit("panel-toggle", serde_json::json!({ "visible": true }));
            }
        }
    }
}

pub fn run() {
    let alt_space = Shortcut::new(Some(Modifiers::ALT), Code::Space);
    let shortcut_for_handler = alt_space;

    tauri::Builder::default()
        .plugin(
            tauri_plugin_global_shortcut::Builder::new()
                .with_handler(move |app, shortcut, event| {
                    if shortcut == &shortcut_for_handler && event.state() == ShortcutState::Pressed
                    {
                        toggle_panel(app);
                    }
                })
                .build(),
        )
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
            pipeline: Arc::new(Mutex::new(SttPipeline::new())),
        })
        .setup(move |app| {
            // Register Alt+Space global shortcut.
            use tauri_plugin_global_shortcut::GlobalShortcutExt;
            if let Err(e) = app.global_shortcut().register(alt_space) {
                log::error!("Failed to register Alt+Space shortcut: {}", e);
            }

            // Build system tray icon + menu.
            let show_item = MenuItem::with_id(app, "show", "Show Tama", true, None::<&str>)?;
            let hide_item = MenuItem::with_id(app, "hide", "Hide Tama", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &hide_item, &quit_item])?;

            let _tray = TrayIconBuilder::with_id("main")
                .tooltip("Tama")
                .icon(app.default_window_icon().cloned().unwrap())
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id().as_ref() {
                    "show" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.show();
                            let _ = window.set_focus();
                        }
                    }
                    "hide" => {
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.hide();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        toggle_panel(tray.app_handle());
                    }
                })
                .build(app)?;

            Ok(())
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
            commands::tts_enqueue_text,
            commands::tts_finish_stream,
            commands::tts_stop,
            commands::tts_load_model,
            commands::capture_screenshot,
            commands::launch_browser,
            commands::file_exists,
            commands::stt_load_model,
            commands::stt_start,
            commands::stt_feed_samples,
            commands::stt_finalize,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
