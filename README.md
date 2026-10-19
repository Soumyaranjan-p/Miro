# Miro

**Speak naturally. Type everywhere.**

Miro is a local-first voice typing utility for Windows. Press a shortcut, speak,
and the transcript is typed into whatever application you were already in.
Transcription runs on your machine with whisper.cpp; audio and transcripts live
in memory and are never written to disk.

<!-- The interface in one line: a floating overlay that never takes focus, and a
     settings window that only contains settings. -->

## What it does

- **Global shortcut.** Toggle mode (press to start, press to stop) or
  push-to-talk (hold to talk). Configurable, with real conflict detection.
- **Local transcription.** whisper.cpp with a quantised `small.en` model by
  default; smaller, larger and multilingual models are opt-in downloads you
  confirm.
- **Types into the app you were in.** Unicode `SendInput` first, with a
  clipboard fallback that saves and restores your clipboard.
- **A floating overlay** that shows recording, processing and errors, sits above
  other windows, and never steals focus from the app you are typing into.
- **Honest failures.** Missing model, refused input, blocked microphone,
  changed focus: each is reported with what to do about it, and never
  papered over.

## What it deliberately does not do

- No account, no cloud, no subscription, no telemetry.
- No history, no database, no transcript cache - there is no screen to see
  previous dictations because there is nothing to see.
- No AI text editing in this version. Clean-up is a fixed set of rules.

## Quick start

```powershell
npm install
npm run app:dev        # development: frontend hot reload, Rust restarts on change
npm run app:build      # release build + installer
```

Requirements, the no-administrator-rights build path, and the traps to avoid are
in **[docs/SETUP.md](docs/SETUP.md)**.

Checks:

```powershell
.\scripts\verify.ps1              # typecheck, lint, tests, builds, privacy audit
.\scripts\privacy-audit.ps1       # no audio or transcript files anywhere
```

## Where things are

| Path | Contents |
|---|---|
| `src/` | React + TypeScript for both windows: `main.tsx` (settings), `overlay.tsx` (overlay) |
| `src/lib/` | IPC contract, overlay state machine, formatting, error copy, theme |
| `src-tauri/src/session.rs` | the dictation flow: hotkey → record → transcribe → insert → clear |
| `src-tauri/src/audio/` | cpal capture, level frames, and the resampler to 16 kHz mono |
| `src-tauri/src/engine/` | the speech engine boundary and the whisper.cpp backend |
| `src-tauri/src/insertion/` | focus tracking, `SendInput`, clipboard fallback with restore |
| `src-tauri/src/hotkeys.rs` | global shortcut parsing, registration, conflict reporting |
| `src-tauri/src/privacy.rs` | temp-file sweep, buffer zeroing, the retry window |
| `docs/` | decisions and limits: [ADR-0001](docs/ADR-0001-speech-engine.md), [PRIVACY](docs/PRIVACY.md), [MODELS](docs/MODELS.md), [COMPATIBILITY](docs/COMPATIBILITY.md), [KNOWN LIMITATIONS](docs/KNOWN-LIMITATIONS.md) |
| `scripts/` | verification, privacy audit, icon generation, toolchain setup |

## How the pieces fit

```
hotkey ─► session ─► audio (own thread) ─► resample to 16 kHz mono
             │                                     │
             │                                     ▼
             │                          engine (whisper.cpp, own thread)
             │                                     │
             │                                     ▼
             │                          textproc (deterministic clean-up)
             ▼                                     │
        overlay events  ◄──────────────  insertion into the remembered window
        (no text, only                          │
         counts and codes)                      ▼
                                        clear buffers / retry window
```

Two properties fall out of that shape and are worth stating:

1. **The webviews never receive transcript text.** The overlay gets character
   counts, timings and error codes. Copy and Retry are commands that act on the
   text inside Rust.
2. **Every path ends by clearing the buffers** - inserted, cancelled, failed, or
   after the retry window closes.

## Licence

MIT. The bundled engine is whisper.cpp (MIT) and the models are MIT-licensed
Whisper weights published by the whisper.cpp project.
