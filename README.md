<div align="center">
  <img src="public/logo.png" alt="FlashCode Logo" width="84" height="84" />
  <h1>FlashCode</h1>
  <p>Fast, minimalist, intelligent desktop IDE for embedded systems development.</p>

  <p>
    <a href="https://github.com/harxhithc/flashcode/releases/latest">
      <img src="https://img.shields.io/github/v/release/harxhithc/flashcode?style=flat-square&color=eab308&label=release" alt="Latest Release" />
    </a>
    <a href="LICENSE">
      <img src="https://img.shields.io/github/license/harxhithc/flashcode?style=flat-square&color=27272a" alt="License: GPL-3.0" />
    </a>
    <img src="https://img.shields.io/badge/platform-Linux%20%7C%20Windows-27272a?style=flat-square" alt="Platform: Linux | Windows" />
    <img src="https://img.shields.io/badge/stack-Tauri%20v2%20%E2%80%A2%20SolidJS%20%E2%80%A2%20Rust-06b6d4?style=flat-square" alt="Stack: Tauri v2, SolidJS, Rust" />
    <a href="https://github.com/harxhithc/flashcode/actions/workflows/release.yml">
      <img src="https://img.shields.io/github/actions/workflow/status/harxhithc/flashcode/release.yml?style=flat-square&label=build" alt="Release Build Status" />
    </a>
  </p>

  <p>
    <a href="#features">Features</a> •
    <a href="#downloads">Downloads</a> •
    <a href="#keyboard-shortcuts">Shortcuts</a> •
    <a href="#development">Development</a>
  </p>
</div>

---

## Features

- **Focused Editor** — Multi-file Monaco Editor with local Arduino sketchbook management, adjacent `.ino` / `.h` / `.cpp` navigation, and built-in example sketches.
- **One-Click Compile & Flash** — Verify and upload sketches via `arduino-cli` with board/FQBN selection, custom board options, and integrated Boards & Library Managers.
- **Serial Monitor & Plotter** — Live port discovery, interactive serial console, board reset, automatic monitor pause/resume around flashing, multi-window port lock handoff, and real-time Serial Plotter.
- **Flash Agent (AI Copilot)** — Inline autocomplete and compiler error translation powered by your own API keys or 100% offline with Local Ollama.
- **Signed Auto-Updates** — Cryptographically verified (Ed25519) updates with hardware-safety guards during compile/upload and release channel controls.
- **Clean In-App Uninstall** — Built-in full uninstaller in Settings to remove the app and local data cleanly.

## Ecosystem Support

| Category | Supported |
| --- | --- |
| **Boards & MCUs** | Arduino (AVR, MegaAVR, SAMD, Renesas UNO, Mbed Nano), ESP32, ESP8266, RP2040, STM32, Teensy |
| **AI Providers** | Groq, Google Gemini, OpenAI, Anthropic Claude, NVIDIA NIM, Local Ollama (offline) |

## Downloads

Installers are available on the [Latest Release](https://github.com/harxhithc/flashcode/releases/latest) page:

| OS | Packages |
| --- | --- |
| **Linux** | `.AppImage`, `.deb` |
| **Windows** | `.exe` (NSIS installer) |

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Save / Save As | `Ctrl+S` / `Ctrl+Shift+S` |
| Open File | `Ctrl+O` |
| New File / New Window | `Ctrl+N` / `Ctrl+Shift+N` |
| Close Tab / Close Sketch | `Ctrl+W` / `Ctrl+Shift+W` |
| Verify (Compile) | `Ctrl+B` or `Ctrl+R` |
| Upload (Flash) | `Ctrl+U` |
| Toggle Fullscreen | `F11` |

> On macOS, use `Cmd` in place of `Ctrl`.

## Development

<details>
<summary><strong>Prerequisites & local setup commands</strong></summary>

### Prerequisites

- **Node.js** 20+ & **pnpm** 9+
- **Rust** (stable toolchain)
- **arduino-cli** on `PATH` (or `~/.local/bin/arduino-cli`)
- **Linux system packages**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libudev-dev`

### Run & Build

```bash
# Install dependencies
pnpm install

# Start desktop app in dev mode
pnpm tauri dev

# Build production installer
pnpm tauri build
```

### Architecture

- **Desktop & Engine**: Tauri v2, Rust, Tokio, `arduino-cli`
- **Frontend**: SolidJS, TypeScript, Tailwind CSS v4, Monaco Editor

</details>

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
