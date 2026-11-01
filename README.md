# Miro

**Speak naturally. Type everywhere.**

Miro is a local-first voice typing utility for Windows. Press a shortcut, speak,
and the transcript is typed into whatever application you were already in.
Transcription runs on your machine with whisper.cpp; audio and transcripts live
in memory and are never written to disk.

## What it does

- **Global shortcut dictation.** Hold-to-talk (default: hold `Ctrl + M`, watched
  by a keyboard hook that catches both press and release while leaving the keys
  free for the focused app), plus one-press mode keys: Normal (default
  `Ctrl+Alt`). All rebindable from the Shortcuts page, with real conflict
  detection that refuses a combination instead of failing silently.
- **Local transcription.** whisper.cpp with a quantised `small.en` model by
  default; smaller, larger and multilingual models are opt-in downloads you
  confirm.
- **Adaptive noise suppression.** Spectral-subtraction filtering runs on every
  recording before transcription, reducing steady background noise (fans,
  keyboards, room tone) so whisper doesn't hallucinate words from noise.
- **Voice activity detection.** Before transcription, Miro checks that the
  capture actually contains speech; true silence is rejected immediately instead
  of being handed to the engine.
- **Types into the app you were in.** Unicode `SendInput` first, with a
  clipboard fallback that saves and restores your clipboard. A transcript that
  fails to insert stays reachable: copy it, or paste it later yourself.
- **A floating overlay** that shows recording, processing and errors, sits above
  other windows, and never steals focus from the app you are typing into.
- **Normal mode.** Everything works: dictation, stats, preferences. Your
  shortcut and settings persist across restarts.
- **Microphone checks before it records.** The device list is verified before
  capture starts, recording keeps rolling for one second after you release the
  key so word endings are not cut, and every failure names itself (no device,
  permission refused, empty audio) instead of a blank "detecting…".
- **Microphone disconnect recovery.** If your mic is unplugged mid-dictation,
  Miro waits up to ten seconds for it to reconnect and resumes — it does not
  throw away your recording.
- **Live partial transcription.** While you speak, Miro re-recognizes the
  capture buffer every 1.5 seconds and shows provisional words in the overlay,
  so you can see progress without waiting for the full dictation to finish.
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
- No persistent storage of audio or transcripts — everything is zeroized after
  use.

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

**Last full run (2026-10-31):** every one of the above is clean — Rust unit tests
pass (2 ignored, platform-gated), `cargo clippy -D warnings` and `eslint
--max-warnings=0` report nothing, and the production bundle builds. The two
ignored tests were also run for real: one feeds a synthetic spoken sentence
through a downloaded `tiny.en` model ("the quick brown fox…" is transcribed
correctly on CPU in ~2 s), the other captures two seconds from the real
microphone and logs samples, peak and sample-rate. The privacy audit reports no
stray audio or transcript files.

## How the pieces fit

```
hotkey ─► session ─► audio (own thread)
              │             ├─ noise suppression (spectral subtraction)
              │             ├─ voice activity detection (20 ms energy gate)
              │             └─ resample to 16 kHz mono
              │                                     │
              │                             engine (whisper.cpp, own thread)
              │                                     │
              │                             textproc (deterministic clean-up)
              │                                     │
              └──► overlay events ◄─────────────────┘
                         (no text, only
                          counts and codes)
              │
              │                         insertion into the remembered window
              ▼                                     │
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

## Known limitations

- **Single speech engine.** whisper.cpp only; no Parakeet, Apple SFSpeech or
  cloud alternatives.
- **English-optimized default.** The style prompt and default model are English;
  multilingual models work but the style prompt may not match.
- **Live transcription is CPU-intensive.** Partial recognition runs every 1.5 s
  while you speak; on slow CPUs this can add load.
- **Clipboard fallback for difficult targets.** Elevated apps, some terminals
  and password fields may refuse injected keystrokes; Miro falls back to
  clipboard paste (Ctrl+V) when that happens.
- **Manual testing recommended.** This build has not been exercised with a
  physical microphone in this repository's environment.