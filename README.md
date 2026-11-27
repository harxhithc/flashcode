# FlashCode

Fast, minimalist, intelligent desktop IDE for embedded systems development.

## Features

- **Focused Editor** — Multi-file Monaco Editor with local Arduino sketchbook management, adjacent `.ino` / `.h` / `.cpp` file navigation, and built-in example sketches.
- **Zero-Friction Compile & Flash** — One-click Verify and Upload powered by `arduino-cli`, with board/FQBN selection, custom board configuration options, and integrated Boards & Library Managers.
- **Broad Board Support** — Supports Arduino (AVR, MegaAVR, SAMD, Renesas UNO, Mbed Nano), ESP32, ESP8266, RP2040, STM32, and Teensy boards.
- **Serial Monitor & Plotter** — Live port discovery, interactive serial console, board reset, automatic monitor pause/resume during flashing, multi-window port lock handoff, and real-time Serial Plotter.
- **Flash Agent (AI Copilot)** — Bring-your-own-key or 100% offline AI for inline autocomplete and compiler error translation with support for Groq, Google Gemini, OpenAI, Anthropic Claude, NVIDIA NIM, and Local Ollama.
- **Signed Auto-Updates & Clean Uninstall** — Cryptographically signed updates (Ed25519) with hardware-safety guards during compile/upload, release channel toggles, and a built-in full uninstaller in Settings.

## Downloads

Pre-built installers are available on the [Releases](https://github.com/harxhithc/flashcode/releases) page:

- **Linux**: `.AppImage`, `.deb`
- **Windows**: `.exe` (NSIS installer)

## Keyboard Shortcuts

| Action | Shortcut |
| --- | --- |
| Save / Save As | `Ctrl+S` / `Ctrl+Shift+S` (`Cmd` on macOS) |
| Open File | `Ctrl+O` |
| New File / New Window | `Ctrl+N` / `Ctrl+Shift+N` |
| Close Tab / Close Sketch | `Ctrl+W` / `Ctrl+Shift+W` |
| Verify (Compile) | `Ctrl+B` or `Ctrl+R` |
| Upload (Flash) | `Ctrl+U` |
| Toggle Fullscreen | `F11` |

## Tech Stack

- **Desktop & Engine**: Tauri v2, Rust, Tokio, `arduino-cli`
- **Frontend**: SolidJS, TypeScript, Tailwind CSS v4, Monaco Editor

## Development

### Prerequisites

- Node.js 20+ & `pnpm` 9+
- Rust (stable toolchain)
- `arduino-cli` installed on `PATH` (or `~/.local/bin/arduino-cli`)
- **Linux system packages**: `libwebkit2gtk-4.1-dev`, `libappindicator3-dev`, `librsvg2-dev`, `patchelf`, `libudev-dev`

### Run Locally

```bash
pnpm install
pnpm tauri dev
```

### Build Installer

```bash
pnpm tauri build
```

## License

Licensed under the [GNU General Public License v3.0](LICENSE).
