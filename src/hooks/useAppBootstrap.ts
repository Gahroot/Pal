/**
 * App bootstrap hook — runs one-time startup side effects.
 *
 * - Initializes the schedule store and starts the polling timer so reminders
 *   fire on time.
 * - Listens for the `panel-toggle` event emitted by the Rust global-shortcut
 *   handler (Alt+Space) and the tray icon, mirroring panelStore visibility.
 * - Attempts to auto-load the Whisper STT model and Kokoro TTS model from
 *   `{appDataDir}/models/`. Failures are non-fatal: voice mode simply stays
 *   disabled until the files are in place.
 */

import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { appDataDir, join } from '@tauri-apps/api/path';
import { exists } from '@tauri-apps/plugin-fs';
import { scheduleStore } from '../services/stores/schedule-store.ts';
import { usePanelStore } from '../stores/panelStore.ts';

export function useAppBootstrap(): void {
  useEffect(() => {
    let cancelled = false;
    const unlisteners: Array<() => void> = [];

    (async () => {
      // 1. Schedule store — load persisted jobs and start the 30s poll loop.
      try {
        await scheduleStore.init();
        scheduleStore.start();
      } catch (e) {
        console.error('[Bootstrap] Schedule store init failed:', e);
      }

      if (cancelled) return;

      // 2. Panel toggle from backend (Alt+Space, tray click).
      try {
        const unlisten = await listen<{ visible: boolean }>('panel-toggle', (event) => {
          const store = usePanelStore.getState();
          if (event.payload.visible && !store.isVisible) {
            store.present();
          } else if (!event.payload.visible && store.isVisible) {
            store.dismiss();
          }
        });
        unlisteners.push(unlisten);
      } catch (e) {
        console.error('[Bootstrap] panel-toggle listener failed:', e);
      }

      if (cancelled) return;

      // 3. Auto-load voice models if present on disk.
      try {
        const base = await appDataDir();
        const modelsDir = await join(base, 'models');
        const whisperPath = await join(modelsDir, 'ggml-base.en.bin');
        const kokoroPath = await join(modelsDir, 'kokoro-v1.0.onnx');
        const voicesPath = await join(modelsDir, 'voices-v1.0.bin');

        if (await exists(whisperPath)) {
          try {
            await invoke('stt_load_model', { modelPath: whisperPath });
            console.info('[Bootstrap] Whisper model loaded');
          } catch (e) {
            console.warn('[Bootstrap] Whisper load failed:', e);
          }
        } else {
          console.info(`[Bootstrap] No Whisper model at ${whisperPath} — voice input disabled`);
        }

        if ((await exists(kokoroPath)) && (await exists(voicesPath))) {
          try {
            await invoke('tts_load_model', {
              modelPath: kokoroPath,
              voicesPath,
              voiceName: 'af_sky',
            });
            console.info('[Bootstrap] Kokoro TTS model loaded');
          } catch (e) {
            console.warn('[Bootstrap] Kokoro load failed:', e);
          }
        } else {
          console.info(`[Bootstrap] No Kokoro model in ${modelsDir} — TTS will be silent`);
        }
      } catch (e) {
        console.error('[Bootstrap] Model auto-load failed:', e);
      }
    })();

    return () => {
      cancelled = true;
      scheduleStore.stop();
      for (const u of unlisteners) u();
    };
  }, []);
}
