# Windows Deploy & Test Guide

## Prerequisites on the Windows machine

Install once:

1. **Node.js 20+** — https://nodejs.org/
2. **Rust (MSVC toolchain)** — https://rustup.rs/ → accept defaults, which installs `stable-x86_64-pc-windows-msvc`.
3. **Visual Studio Build Tools** — install the **Desktop development with C++** workload (required by the MSVC linker and Tauri's native compilation).
4. **WebView2 Runtime** — pre-installed on Windows 11 and most Windows 10. If missing: https://developer.microsoft.com/microsoft-edge/webview2/
5. **Git for Windows** — https://git-scm.com/download/win

Verify:

```powershell
node --version   # v20+
rustc --version  # 1.75+
git --version
```

## One-time clone

```powershell
git clone https://github.com/Gahroot/Pal.git
cd Pal
npm install
```

## Build + run (dev mode, fastest iteration)

```powershell
npm run tauri dev
```

This compiles Rust in debug mode, boots Vite, and launches the app. Hot-reload works for the frontend; Rust changes require Ctrl+C and restart.

## Build the installer (for actual install/testing)

```powershell
npm run tauri build
```

Artifacts land in:

- `src-tauri\target\release\tama-windows.exe` — raw binary
- `src-tauri\target\release\bundle\msi\Tama_0.1.0_x64_en-US.msi` — MSI installer
- `src-tauri\target\release\bundle\nsis\Tama_0.1.0_x64-setup.exe` — NSIS installer

Double-click either installer to install Tama system-wide.

## First-run checklist

1. Launch Tama. A tray icon should appear; the main window is hidden by default.
2. Press **Alt+Space** — the floating panel should appear centered on screen.
3. Open **Settings → AI** and paste an API key for any provider (Moonshot / Xiaomi / Zhipu / MiniMax). Click **Validate**.
   - This exercises the Windows Credential Manager path for key storage. If it fails here, the rest of the app won't work — grab the log from `%APPDATA%\com.tama.windows\logs\` if any.
4. Pick a model, close Settings, ask a question. Response should stream as markdown.
5. Try a tool-requiring prompt, e.g. "list files in C:\\". The agent should call `execute_shell` and show PowerShell output.
6. Try **Alt+Space** from another app to confirm the global shortcut works.

## Optional: enable voice (STT + TTS) on the Windows machine

Default builds compile lean — no whisper, no Kokoro ONNX — so the WSL dev
loop and the first Windows smoke test stay quick. To turn on real voice:

### 1. Install native build deps (one-time)

```powershell
# LLVM (for whisper-rs bindgen). Install LLVM 16+:
winget install LLVM.LLVM
# Add to PATH if the installer didn't: "C:\Program Files\LLVM\bin".
```

Verify: `clang --version` should print in PowerShell.

### 2. Download the model files

```powershell
$models = "$env:APPDATA\com.tama.windows\models"
New-Item -ItemType Directory -Force $models | Out-Null

# Whisper small-en (~150MB, fast + accurate for English)
Invoke-WebRequest https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.en.bin `
  -OutFile "$models\ggml-base.en.bin"

# Kokoro TTS model + voices
Invoke-WebRequest https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx `
  -OutFile "$models\kokoro-v1.0.onnx"
Invoke-WebRequest https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin `
  -OutFile "$models\voices-v1.0.bin"
```

The app auto-loads anything in `%APPDATA%\com.tama.windows\models\` on startup.

### 3. Rebuild with the `voice` feature

```powershell
cd src-tauri
cargo build --release --features voice
cd ..
npm run tauri build -- --features voice
```

### Current voice status

- **Whisper STT** — fully wired under `--features voice`. Mic capture → 16kHz mono → whisper → `transcription-final` event. Tested in `src-tauri/src/stt/pipeline.rs`.
- **Kokoro TTS** — ONNX loading works under `--features voice`, but the phonemizer + inference glue is still placeholder (returns silence proportional to text length). Audio playback, streaming, and frontend telemetry are all wired — drop in the real inference in `src-tauri/src/tts/kokoro.rs::generate` to finish.

Without `--features voice`, voice commands return stub responses and TTS plays silence — the rest of the app is unaffected.

- **Audio muter is stubbed** (`src-tauri/src/audio/muter.rs`) — system audio won't duck during voice capture.

Text chat + tool use + credential encryption + global shortcut + system tray + screenshots + scheduler + all 24 agent tools work in the default build.

## Troubleshooting

**"linker `link.exe` not found"** → VS Build Tools missing the C++ workload. Re-run the VS Build Tools installer and check "Desktop development with C++".

**Installer build fails with WiX error** → Tauri 2 downloads WiX on first build. If blocked by corporate proxy, set `TAURI_WIX_SOURCE` or use the NSIS bundle only: edit `src-tauri/tauri.conf.json` and add `"bundle": { "targets": ["nsis"] }`.

**App opens but Alt+Space does nothing** → another app is holding the shortcut. Change the binding in `src-tauri/src/lib.rs` (global-shortcut setup) or quit the conflicting app.

**"Failed to write key to Windows Credential Manager"** → run once as admin to see if it's a permissions issue, then revert. The key lives under Control Panel → Credential Manager → Windows Credentials → `com.tama.encryption-key`.

## Pulling updates on the Windows box

```powershell
cd Pal
git pull
npm install        # if package.json changed
npm run tauri dev  # or rebuild installer
```
