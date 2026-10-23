# Miro

**Speak naturally. Type everywhere.**

Miro is a local-first voice typing utility for Windows. Press a shortcut, speak,
and the transcript is typed into whatever application you were already in.
Transcription runs on your machine with whisper.cpp; audio and transcripts live
in memory and are never written to disk.

<!-- The interface in one line: a floating overlay that never takes focus, and a
     settings window that only contains settings. -->

## What it does

- **Three global shortcuts.** Hold-to-talk dictation (default: the right `Ctrl`
  key — a lone key that most apps leave free, caught by its own keyboard hook),
  plus one-press mode keys: Normal (default `Ctrl+Alt`) and Incident (default
  `Ctrl+Alt+Space`). All rebindable from the Shortcuts page, with real conflict
  detection that refuses a combination instead of failing silently. The page
  also shows how each key reached Miro: an OS registration or the keyboard hook.
- **Local transcription.** whisper.cpp with a quantised `small.en` model by
  default; smaller, larger and multilingual models are opt-in downloads you
  confirm.
- **Types into the app you were in.** Unicode `SendInput` first, with a
  clipboard fallback that saves and restores your clipboard. A transcript that
  fails to insert stays reachable: copy it, or paste it later yourself.
- **A floating overlay** that shows recording, processing and errors, sits above
  other windows, and never steals focus from the app you are typing into.
- **Two modes.** Normal is everything working; Incident pauses dictation and
  puts Miro on guard. Your mode, shortcut and preferences persist.
- **A Miro that reacts.** The Home page shows the live companion: eyes that
  follow your cursor, a squish when clicked (twice fast and it flips, three
  times fast and it gets dizzy), hearts when hovered, sleep when ignored. It
  reacts to the app's mode from either direction — mode buttons or the
  `Ctrl+Alt` / `Ctrl+Alt+Space` hotkeys — and glows alert red in Incident
  mode. The interface is set in Inter, bundled locally
  (`@fontsource-variable/inter`). A small, static drawing of the same artwork
  is the sidebar profile picture, and the icons a headless browser captures
  from that artwork.
- **Microphone checks before it records.** The device list is verified before
  capture starts, recording keeps recording for a beat after you release the
  key so word endings are not cut, buffers that are too short or silent are
  refused locally, and every failure names itself (no device, permission
  refused, empty audio) instead of a blank "detecting…".
- **Statistics, numerals only.** Dictations per day, words, speaking speed and
  where time went by mode — aggregated numbers on page and disk (`stats.json`
  holds counts, never a word of text).
- **Honest failures.** Missing model, refused input, blocked microphone,
  changed focus: each is reported with what to do about it, and never
  papered over.

## What it deliberately does not do

- No account, no cloud, no subscription, no telemetry.
- No transcript history. A finished transcript lives in memory for the copy /
  retry window only, then it is gone; Miro has no screen to read old dictations
  because there is nothing to read.
- No AI text editing in this version. Clean-up is a fixed set of rules.

## Quick start

```powershell
npm install
npm run app:dev        # development: frontend hot reload, Rust restarts on change
npm run app:build      # release build + installer
```

Requirements, the no-administrator-rights build path, and the traps to avoid are
in **[docs/SETUP.md](docs/SETUP.md)**.

Checks — run as one pass or piece by piece:

```powershell
.\scripts\verify.ps1              # typecheck, lint, tests, builds, privacy audit
.\scripts\verify.ps1 -Fast        # the same gate, skipping the release build
.\scripts\privacy-audit.ps1       # no audio or transcript files anywhere

# the individual commands verify.ps1 drives:
npx tsc --noEmit                  # frontend types
npx eslint src --max-warnings=0   # frontend lint
npx vitest run                    # frontend tests
cargo fmt -- --check              # rust formatting
cargo clippy --lib --bins -- -D warnings
cargo test --lib                  # rust tests
npm run build                     # production webview bundles
```

**Last full run (2026-10-22):** every one of the above is clean — 155 Rust unit
tests pass (2 ignored, platform-gated) and 26 frontend tests pass, `clippy
-D warnings` and `eslint --max-warnings=0` report nothing, and the production
bundle builds. The two ignored tests were also run for real: one feeds a
synthetic spoken sentence through a downloaded `tiny.en` model ("the quick
brown fox…" is transcribed correctly on CPU in ~2 s), the other captures two
seconds from the real microphone and logs samples, peak and sample-rate. The
privacy audit reports no stray audio or transcript files.

## Where things are

| Path | Contents |
|---|---|
| `src/` | React + TypeScript for the two windows: `main.tsx` (the app shell), `overlay.tsx` (overlay) |
| `src/components/shell/` | the desktop app's pages: Home, Statistics, Shortcuts, Settings |
| `public/miro-mascot.html` | the live companion: its own SVG artwork and animation script, dropped in as designed (`window.Miro.setMode` is the app's hook into it) |
| `public/miro-avatar.svg` | the same mascot as a small static drawing — the sidebar profile picture |
| `src/lib/fox/` + `LiveFox.tsx` | the previous procedural canvas painter; kept for the icon harness |
| `icon-harness.html` + `src/icon-harness.ts` | still available to re-render the canvas painter; `public/miro-avatar.svg` is now the icon source `generate-icons.py` scales |
| `src/lib/` | IPC contract, overlay state machine, formatting, error copy, theme |
| `src-tauri/src/session.rs` | the dictation flow: hotkey → record → transcribe → insert → clear |
| `src-tauri/src/stats.rs` | per-day dictation/words/mode-time counters; `stats.json` keeps numerals only |
| `src-tauri/src/keyboard_hook.rs` | the low-level hook that catches lone keys (the right `Ctrl`) and push-to-talk release |
| `src-tauri/src/audio/` | cpal capture, level frames, and the resampler to 16 kHz mono |
| `src-tauri/src/engine/` | the speech engine boundary and the whisper.cpp backend |
| `src-tauri/src/insertion/` | focus tracking, `SendInput`, clipboard fallback with restore |
| `src-tauri/src/hotkeys.rs` | shortcut parsing, plugin + hook registration, conflict reporting |
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
