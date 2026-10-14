# Miro - compatibility matrix

Where Miro's text insertion actually works, tested rather than assumed.

## How this was produced

Two methods, and the table says which was used for each row:

1. **Automated (this repository).** `src-tauri/src/bin/insertion_probe.rs` calls
   the same `miro_lib::insertion::insert` the application calls, against a real
   external application, and then reads the text back out of that application's
   window and compares it. Run it yourself:

   ```powershell
   cargo run --manifest-path src-tauri/Cargo.toml --bin insertion_probe -- --launch notepad --text "the quick brown fox 123"
   ```

   Exit code 0 means the text arrived intact; 2 means it did not; 1 means the
   probe could not run (no target window, or the text could not be read back -
   which is reported as "unavailable" rather than as a pass).

2. **Manual.** Everything else needs a human: an application with a focused
   text field, a real hotkey press, and eyes on the result. The procedure is at
   the bottom of this file.

## Results

| Application | Method | Result | Notes |
|---|---|---|---|
| Notepad (Windows 11) | automated probe | **not run** | the probe is written and documented, but the Rust core could not be compiled in the environment this was built in (see the note below), so no row here is an observation |
| Chrome / Edge text fields | manual | not verified | `SendInput` Unicode is the well-trodden path for Chromium |
| VS Code | manual | not verified | Electron, same input path as Chromium |
| Microsoft Word | manual | not verified | rich edit control; check that autocorrect does not "fix" words |
| Slack / Discord | manual | not verified | Electron; also the best candidates for the clipboard fallback if injection is ignored |
| Windows Terminal | manual | **expected to be unreliable** | consoles apply their own line editing, and bracketed paste changes what arrives |
| An elevated application | manual | **expected to fail** | Windows UIPI blocks a non-elevated process; Miro reports `insertion_blocked` and offers Copy |

### Why no row is marked as passing

This matrix was written on a machine without Visual Studio Build Tools, using the
admin-free fallback toolchain in `docs/SETUP.md`. The frontend was built and
tested there. The Rust side reached the point where every dependency compiled,
but build-script binaries linked by that fallback configuration fault on start
(`STATUS_ACCESS_VIOLATION`, exit `0xC0000005`), which stops the build before any
application code runs. Since nothing could be executed, nothing is claimed: the
rows above say what is expected and what is tested, never what passed. On a
machine with the recommended MSVC toolchain, run the probe and fill this table
in - the honest result matters more than a green table.

## Manual procedure

For each application:

1. Start Miro (`npm run app:dev`), and leave the Settings window open.
2. Focus the application and click into a text field.
3. Press the configured shortcut, say a sentence, press it again
   (or release, in push-to-talk mode).
4. Check three things:
   - did the text appear where the caret was;
   - did the characters arrive intact (punctuation, capital letters, any
     non-ASCII);
   - did focus stay in the application, with the overlay appearing without
     stealing the caret.
5. Note the outcome in the table above, with the Miro commit and the
   application version, so the result can be trusted later.

To test the clipboard fallback deliberately, hold a known value on the
clipboard (copy a line of text), trigger a dictation into an application that
ignores injected input, and then paste: your original clipboard content should
come back.

To test the elevated case, open an elevated Notepad or terminal and try. Miro
should report that the target refuses typed input rather than silently doing
nothing.
