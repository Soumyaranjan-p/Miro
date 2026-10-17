# Miro - privacy notes

This document is the authoritative description of what Miro does with your
voice and your words. Where the product and this file disagree, this file is
right and the code is wrong.

The short version: **audio and transcripts live in memory, and only in memory.**
Miro has no history, no database, no account, and - apart from the model
download you explicitly confirm - no network access at all.

---

## What Miro never does

- **No audio file.** Samples live in a `Vec<f32>`, are converted to 16 kHz mono
  in memory, and are passed straight to the engine as a slice.
- **No transcript file.** Text lives in a `String`. It is zeroed before it is
  dropped, whether it was inserted, cancelled, or abandoned.
- **No database, no history, no cache.** There is no history table, no JSONL
  journal, no "recent dictations" file, and no history screen. There is nowhere
  for a transcript to be kept even if a future change wanted to.
- **No cloud.** No account, no subscription, no API key, no Ollama, no
  llama.cpp. The engine is whisper.cpp, compiled into the application, and basic
  dictation never touches anything else.
- **No telemetry, analytics or crash reporting.** No third-party SDK exists in
  the dependency tree for these purposes.
- **No content in logs.** See "Logging" below - this is enforced by the type
  system rather than by care.
- **No keystroke logging.** See "The keyboard hook" below.

## What is on disk, exhaustively

| Path | Contents | Sensitive? |
|---|---|---|
| `%APPDATA%\app.miro.dictation\config.json` | shortcut, mode, microphone id, model id, language, clean-up options, theme, overlay position, start-on-login, maximum recording length | no |
| `%APPDATA%\app.miro.dictation\config.invalid.json` | a previous settings file that failed to parse, kept aside instead of being silently replaced | no |
| `%APPDATA%\app.miro.dictation\models\*.bin` | model files you chose to download | no - public model weights |
| `%APPDATA%\app.miro.dictation\models\*.part` | a download you paused or cancelled, resumable | no |
| `src-tauri/icons/*` (repository) | generated application artwork | no |

There is no log file. Miro writes diagnostics to **stderr only**, which means
they exist for the lifetime of the process and nowhere else.

## Memory handling

- Buffers are zeroed with `privacy::zeroize_string` / `audio::zeroize` before
  being dropped: after an insertion, after a cancel, when a retry window closes,
  when a download is cancelled, and on shutdown.
- A transcript that could not be inserted stays available for **20 seconds** so
  Retry and Copy can work, then it is cleared and the overlay is hidden. The
  window is closed by a timer, not by the user remembering to dismiss it.
- **What Miro does not claim:** these are not cryptographic guarantees. A
  zeroed buffer can still have lived in a page that was swapped to disk by the
  operating system, and a value may briefly have existed in a register. Miro
  does not use `mlock`/`VirtualLock`, so the honest phrasing is
  *"minimized retention and cleaned up"* - not "securely erased".
- Audio never leaves the process except as engine input, and the transcript
  never leaves the Rust process at all: the overlay window receives only counts,
  timings and error codes, never text. Copy and Retry are commands that act on
  the text inside Rust.

## Logging

`src-tauri/src/logging.rs` defines a closed `Event` enum. Every loggable fact is
a variant with typed fields: a device label, a sample count, a model id, an
error code. There is no `Event::Custom(String)` and no free-form logging macro
in the crate. **It is not possible to log a transcript through this API** - not
because the code is careful, but because the API cannot express it.

whisper.cpp's own logging is routed to a callback that discards it, and every
`print_*` flag on the transcription parameters is off, so segment text has no
route to stderr either.

## The keyboard hook, disclosed

Push-to-talk with a combination that contains a real key (for example
`Ctrl+Alt+Space`) uses Windows' normal global hotkey registration. No hook is
installed and Windows consumes the combination for Miro.

Push-to-talk with **modifiers only** (for example `Ctrl+Alt`) is different:
Windows cannot register such a shortcut, so Miro installs a low-level keyboard
hook (`WH_KEYBOARD_LL`) to see the key-down and key-up edges it needs. While
that hook exists:

- it compares each key against the configured combination and keeps a set of
  currently-held virtual key codes;
- it never records sequences, never measures timing, never inspects characters,
  and never writes anything anywhere;
- it is removed when you change mode or shortcut, and when Miro exits;
- combinations that contain a real key never install it.

This is a real privilege, so it is off unless you choose that mode, and the
Settings window says so when you do. If you would rather not have a hook on your
system at all, use toggle mode or a push-to-talk combination with a real key.

## Network

The only request Miro can make is the model download you confirm yourself:

- host: `huggingface.co` (redirecting to its CDN), path
  `/ggerganov/whisper.cpp/resolve/main/<file>` (the files were previously
  published under `ggml-org`, which is no longer publicly reachable);
- user agent: `Miro/<version>`, which is all the server learns about you beyond
  your IP address;
- a `HEAD` request first, to show you the real file size before you agree;
- `Range` requests, so a paused download resumes instead of restarting.

Nothing else in the application has network code. The webviews are locked down
to match: `src-tauri/capabilities/default.json` grants them exactly two
permissions - listen for events and stop listening - and the CSP in
`tauri.conf.json` allows only `'self'`, the `ipc:` bridge and inline styles. The
webview has no filesystem, shell, dialog or HTTP capability, so a compromised
page inside Miro could not read a file or open a connection.

## Temporary files

The normal dictation path creates none: the engine receives samples in memory
and the clipboard fallback writes only to the clipboard.

`privacy::temp_path` exists as the single sanctioned location for a temp file
should a future feature genuinely need one, and `privacy::sweep_temp` runs on
every start to remove anything left by a crash (removed/failed counts are
reported in Settings, so the claim is checkable). Anything Miro creates there is
named `miro-*`.

## Verifying all of this yourself

```powershell
.\scripts\privacy-audit.ps1
```

It scans the app data directory, the local app data directory and the OS temp
directory, and reports any audio, transcript or `miro-*`-named file it finds. It
reads file names, sizes and timestamps only - never contents - so running it
cannot itself expose a transcript. It exits non-zero when it finds something.
