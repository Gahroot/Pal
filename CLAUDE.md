# Pal (tama-windows)

Windows desktop AI assistant built with Tauri 2 + React 19 + Rust. System-tray app that pops up with `Alt+Space`, chats with multiple LLM providers, runs 23 tools (shell, files, browser automation), and has a local voice pipeline (Whisper STT + Kokoro TTS).

## Project Structure

```
src/                          # React 19 + TypeScript frontend
  ├── components/             # UI: FloatingPanel, ChatView, TabBar, Lists, Settings, Notifications
  ├── services/
  │   ├── ai/                 # Agent loop + LLM provider adapters
  │   ├── tools/              # 23 tool implementations the agent can call
  │   ├── voice/              # Frontend voice session wiring
  │   ├── scheduler/          # Reminders + recurring routines
  │   └── stores/             # Data persistence layer
  ├── stores/                 # Zustand state (panel, chat, mascot)
  ├── hooks/                  # Streaming animation, auto-scroll, audio events
  ├── types/                  # Shared TypeScript types
  ├── lib/                    # Small shared utilities
  └── main.tsx                # App entry

src-tauri/                    # Rust backend (Tauri 2)
  └── src/
      ├── audio/              # Mic capture + playback via cpal
      ├── stt/                # Whisper.cpp speech-to-text
      ├── tts/                # Kokoro ONNX text-to-speech
      ├── credentials/        # ChaCha20-Poly1305 encrypted API keys
      ├── screen/             # Screenshot capture
      ├── shell/              # PowerShell exec w/ process tree mgmt
      ├── commands.rs         # Tauri commands exposed to frontend
      └── lib.rs / main.rs    # Entry
```

## Organization Rules

**Keep code organized and modularized:**
- React components → `src/components/`, one component per file, group related ones in subfolders (e.g. `ChatView/`, `Settings/`)
- Agent tools → `src/services/tools/`, one file per tool
- LLM providers → `src/services/ai/`, one file per provider
- Zustand stores → `src/stores/`, one store per domain
- Rust modules → `src-tauri/src/<domain>/`, keep domain logic behind a `mod.rs` boundary
- Tauri commands exposed to JS → `src-tauri/src/commands.rs`
- Shared types → `src/types/` (TS) or the owning Rust module

**Modularity principles:**
- Single responsibility per file
- Clear, descriptive file names
- Group related functionality together
- Avoid monolithic files

## Code Quality - Zero Tolerance

After editing ANY frontend file, run:

```bash
npm run lint
npx tsc -b
```

After editing ANY Rust file in `src-tauri/`, run:

```bash
cd src-tauri && cargo check && cargo clippy -- -D warnings
```

Fix ALL errors/warnings before continuing.

If changes require the Tauri app to be restarted (not hot-reloadable — Rust code, `tauri.conf.json`, global shortcuts, tray):
1. Restart dev server: `npm run tauri dev`
2. Read server output/logs
3. Fix ALL warnings/errors before continuing
