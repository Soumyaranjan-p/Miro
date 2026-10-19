# Miro - known limitations

Everything here is a real constraint, not a to-do. Where the limitation is
Windows' rather than Miro's, that is said explicitly, because "it does not work"
and "Windows does not allow it" call for different reactions.

## Input injection

### Elevated and protected windows

Windows blocks input injection from a lower-integrity process to a
higher-integrity one (UIPI). A **non-elevated** Miro therefore cannot type into:

- an application started as administrator (Task Manager, an elevated terminal,
  an installer, Regedit);
- protected processes, some anti-cheat and DRM surfaces.

Miro detects this, reports `insertion_blocked` with the reason, and offers Copy
so the text is not lost. To type into an elevated app you would have to run Miro
elevated as well, which Miro does not do by default and does not recommend:
running elevated would widen what a bug in Miro could touch.

The elevation check is a heuristic (a failed `OpenProcess` query on the target),
so it can be wrong in both directions. When it is wrong in the optimistic
direction, injection is attempted and fails, and you get `insertion_failed`
instead with the same Retry/Copy options.

### Applications that mangle or refuse injected input

These are known-bad for `SendInput` on Windows, and Miro's fallback only helps
sometimes:

| Surface | Behaviour |
|---|---|
| Windows Terminal, some console hosts | keystrokes may arrive, but bracketed-paste and line editing can alter them |
| Games with DirectInput / raw input | often ignore synthetic input entirely |
| Remote Desktop and VMs | input is forwarded to the remote session, where focus may differ |
| Password and secure fields | usually accept the text but may block paste; some block both |
| Applications with their own hotkey hooks | may consume keystrokes before the target control sees them |

Miro tries `SendInput`, then falls back to the clipboard, then reports honestly.
It never claims a successful insertion it did not observe.

### The clipboard fallback changes your clipboard, briefly

The fallback saves the clipboard, pastes, and restores. Two honest caveats:

- **Formats that cannot be duplicated are not restored.** Bitmaps, palettes,
  metafiles and application-private formats are counted, not copied, and the
  count is reported. Your text will survive; an image on the clipboard may not.
- If another application writes to the clipboard during the paste, Miro detects
  the change and **leaves the new content alone** rather than restoring stale
  data over it. Your original clipboard is then gone - the alternative would be
  destroying the newer content.

## Shortcuts

### Modifier-only push-to-talk leaks its modifiers

If you choose a combination like `Ctrl+Alt` for push-to-talk, Miro cannot
register it with Windows, so it uses a low-level keyboard hook. It does **not**
swallow those keys - doing so would leave the application underneath with stuck
or missing modifiers - which means **the application you are dictating into also
sees Ctrl and Alt being pressed**. If that application has a shortcut on those
modifiers, it may fire.

Combinations that include a real key (`Ctrl+Alt+Space`) are registered through
Windows, which consumes the combination, so nothing leaks. Prefer those.

### Single modifier keys are refused

`Ctrl` alone as push-to-talk would fire on ordinary typing. Miro rejects it
rather than letting you configure something that misbehaves.

### Toggle mode needs a real key

Modifier-only combinations cannot start and stop anything that way, so toggle
mode requires a combination with a key and says so in Settings.

### Escape cancellation can be taken

While a recording is in flight Miro registers `Escape` so it can cancel from any
application. If another application already owns Escape, that registration fails;
Miro logs it and the overlay's Cancel button still works.

## Speech recognition

- **CPU only in this build.** whisper.cpp supports CUDA/Vulkan; those Cargo
  features exist but are not enabled, so no GPU is used even if you have one.
- **The English models cannot transcribe other languages.** The language
  selector is fixed to English while one is selected.
- **No punctuation is invented.** If the engine does not punctuate, Miro does
  not guess. Clean-up repairs spacing and capitalisation; it never adds a comma
  or a full stop that was not spoken.
- **Filler-word removal can change meaning if used carelessly.** It is off by
  default for that reason. Terms inside protected words are left alone, but
  removing the word "like" from "I like this" is what you asked for when you
  turn it on.
- **Very short or quiet captures are reported as "no speech detected"** rather
  than being inserted as an empty transcript. A recording that reached the
  engine but produced no words is reported separately, as "nothing was
  recognized".
- **A long recording takes time to transcribe.** The maximum recording length
  (default 300 s) bounds how bad this can get; the overlay shows processing the
  whole time.

## Models

- **The catalogue carries no published digests.** No authoritative integrity
  value could be fetched from the model host while this build was made, so a
  download is verified by exact length plus the file's own header, and both the
  dialog and the verification summary say so. Adding digests to
  `src-tauri/src/models.rs` upgrades that automatically.
- **Model quality varies with size.** `tiny` makes mistakes that `small` does
  not. That is a property of the models, not a bug.
- **A paused download is not verified.** It is a `.part` file until it completes.

## Platform and packaging

- **Windows only.** The audio, focus, injection and clipboard layers are Win32.
- **The overlay's appearance is not covered by automated tests.** Its layout,
  states and themes are rendered in the browser preview and are visually
  verified; the native window's transparency and always-on-top behaviour are
  verified only as far as the process starting and logging its window creation.
- **Multi-monitor placement uses the monitor under the pointer** at the moment
  the overlay appears. Mixed-DPI setups are handled in physical pixels, but
  unusual arrangements (a monitor to the left with negative coordinates, for
  example) deserve a look if you use them.
- **No installer signature.** `npm run app:build` produces an unsigned NSIS
  installer, so Windows SmartScreen will warn on first run.

## Privacy, restated as a limitation

Miro minimises retention and cleans up; it does **not** claim secure erasure.
Buffers are zeroed before they are freed, but a page that was swapped to disk by
the operating system, or a value that passed through a register, is outside what
any user-mode application can promise. If your threat model includes a hostile
process with administrator rights on the same machine, Miro is the wrong tool
for that part of it - no local dictation utility is the right tool for it.
