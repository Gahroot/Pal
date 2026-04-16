# Pal - Your Desktop AI Assistant for Windows

Ever seen those slick macOS AI assistants that float over your screen, let you talk to them, run commands, browse the web, and automate your workflow with a single hotkey? Yeah, Windows never got one of those. Until now.

**Pal** is a full-featured AI assistant that lives in your system tray and pops up with `Alt+Space`. It's a ground-up Windows port of [tama-agent](https://github.com/KenKaiii/tama-agent) — rebuilt from Swift/AppKit into Tauri + React + Rust so it actually runs on your PC.

## What it does

**Chat with any LLM provider** — not just OpenAI or Claude. Pal is built for the models you actually want to use:
- Kimi K2.5 (Moonshot)
- MiMo V2 Pro (Xiaomi)
- GLM-4 Plus (Zhipu)
- MiniMax M2.7

Just paste your API key and go. Adding a new provider is one config entry.

**It's not just a chatbot.** Pal has 23 tools that let the AI actually *do things* on your machine:
- Run PowerShell commands
- Read, write, and edit your files
- Search your codebase with regex
- Take screenshots and point at things on screen
- Automate Chrome/Edge/Brave via DevTools Protocol
- Fetch web pages and search the internet
- Create reminders and scheduled routines
- Manage task checklists

**Voice mode** — hold the hotkey, speak naturally, and Pal responds with text-to-speech. The voice pipeline uses Whisper for speech recognition (supports Chinese and English) and Kokoro for natural-sounding TTS. Everything runs locally on your machine, no cloud STT/TTS needed.

**Streaming markdown** — responses render in real-time with syntax-highlighted code blocks, copy buttons, tables, and all the formatting you'd expect. The typing animation runs at 800 characters per second with a blinking cursor.

## Why it's useful

If you're a developer, power user, or just someone who wants an AI that can actually interact with your system instead of being trapped in a browser tab — this is it.

The key difference from ChatGPT/Claude web interfaces:
1. **It's always one hotkey away.** `Alt+Space` from any app, ask your question, dismiss. No context switching.
2. **It can execute.** "List all TypeScript files in this project" actually runs the command and shows you results. "Edit line 42 of config.ts" actually edits the file.
3. **It remembers your schedule.** "Remind me to check the deploy in 30 minutes" sets a real Windows notification. "Run a weather check every 2 hours" creates a recurring routine.
4. **It's private.** Voice recognition and text-to-speech run on-device. Your API keys are encrypted with ChaCha20-Poly1305. Nothing phones home except the LLM API calls you explicitly make.
5. **It's tiny.** ~15MB installed. No Electron bloat.

## Tech stack

- **Frontend:** React 19 + TypeScript + Tailwind 4 + shadcn/ui (Radix primitives)
- **Backend:** Rust via Tauri 2.0
- **Audio:** cpal (WASAPI on Windows, ALSA on Linux)
- **STT:** Whisper.cpp via whisper-rs (local, multilingual)
- **TTS:** Kokoro via ONNX Runtime (local, multiple voices)
- **Encryption:** ChaCha20-Poly1305 with keys in Windows Credential Manager
- **Browser automation:** Chrome DevTools Protocol over WebSocket

## Getting started

```bash
# Clone
git clone https://github.com/Gahroot/Pal.git
cd Pal

# Install frontend deps
npm install

# Dev mode (runs both Vite + Tauri)
npm run tauri dev

# Build for production
npm run tauri build
```

You'll need:
- Node.js 20+
- Rust 1.70+
- On Windows: Visual Studio Build Tools (for C++ compiler)
- On Linux (dev only): `libgtk-3-dev libwebkit2gtk-4.1-dev libssl-dev libasound2-dev`

## Project structure

```
Pal/
├── src/                          # React frontend (74 files)
│   ├── components/               # UI: FloatingPanel, ChatView, TabBar, Lists, Settings
│   ├── services/                 # Agent loop, LLM providers, 23 tools, data stores
│   ├── stores/                   # Zustand state (panel, chat, mascot)
│   └── hooks/                    # Streaming animation, auto-scroll, audio events
├── src-tauri/                    # Rust backend (18 files)
│   └── src/
│       ├── audio/                # Microphone capture + TTS playback via cpal
│       ├── stt/                  # Speech-to-text pipeline (Whisper)
│       ├── tts/                  # Text-to-speech (Kokoro ONNX) + streaming queue
│       ├── credentials/          # Encrypted credential storage
│       ├── screen/               # Screenshot capture
│       └── shell/                # PowerShell execution with process tree management
├── package.json
└── src-tauri/Cargo.toml
```

## Credits

This is a Windows port of [tama-agent](https://github.com/KenKaiii/tama-agent) by KenKaiii. The original is a beautiful native macOS app built in Swift. Pal reimplements the same architecture, tools, voice pipeline, and UX in a cross-platform stack while keeping feature parity.

## License

MIT
