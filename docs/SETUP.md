# Miro - getting set up

Two supported ways to build Miro on Windows. Pick the first one unless you have
a reason not to; the second exists because it is the one this repository was
verified with, on a machine without administrator rights.

Everything below assumes Windows 10/11 x64.

---

## 1. Recommended: Visual Studio Build Tools

Miro is a Tauri 2 application with a C++ component (whisper.cpp), so it needs a
Rust toolchain, a C/C++ toolchain, CMake and the WebView2 runtime.

1. **WebView2 runtime** - preinstalled on current Windows 11 and on updated
   Windows 10. If Miro's window shows up blank, install the *Evergreen Runtime*
   from Microsoft.
2. **Rust** - <https://rustup.rs>, keeping the default `x86_64-pc-windows-msvc`
   toolchain.
3. **Visual Studio Build Tools 2022** with the **Desktop development with C++**
   workload. That provides `cl.exe`, `link.exe`, `rc.exe` and CMake.
4. **Node.js 20 or newer** (the frontend is Vite + React + TypeScript).

Then:

```powershell
npm install
npm run app:dev          # launches the app with frontend hot reload
```

`npm run app:dev` is the development loop: Vite serves the webviews with
hot module replacement, and Rust changes trigger a recompile and restart. You
never rebuild an installer to see a frontend change.

To produce a release build:

```powershell
npm run app:build        # bundles with NSIS into src-tauri/target/release/bundle
npx tauri build --no-bundle   # just the executable
```

---

## 2. Fallback: no administrator rights

> **Status of this path, honestly.** It was used to build and verify this
> repository's frontend, and to take the Rust dependency tree all the way to a
> full compile. It does **not** currently produce a running application on this
> machine: build-script binaries linked by this configuration fault on start
> (`STATUS_ACCESS_VIOLATION`, exit `0xC0000005`), so the build stops before any
> Miro code executes. The pieces below are all necessary and all verified
> individually; the combination is not yet reliable. If you have a choice, use
> the MSVC path in section 1.

This path replaces the MSVC pieces with portable, user-scope equivalents.
Nothing is installed system-wide and no UAC prompt appears.

```powershell
.\scripts\setup-toolchain.ps1     # installs everything below, idempotently
. .\scripts\toolchain\env.ps1     # puts it on PATH for this shell
npm install
npm run app:dev
```

What `setup-toolchain.ps1` installs, and why each piece is needed:

| Piece | Installed by | Why |
|---|---|---|
| Rust, `x86_64-pc-windows-gnu` | rustup (user scope) | the MSVC target needs `link.exe`; the GNU target links with its own `gcc` |
| Zig | `pip install ziglang` | a C **and** C++ compiler for whisper.cpp, with no admin |
| CMake + Ninja | `pip install cmake ninja` | whisper.cpp's build system |
| LLVM-MinGW (portable zip) | this script, into `%USERPROFILE%\.miro-toolchain` | `llvm-dlltool`, `llvm-as`, `llvm-rc`: Rust's GNU target needs them, and the copies rustup ships cannot run standalone |
| `libclang` | `pip install libclang` | `bindgen`, used by `whisper-rs-sys` |
| Jinja-free Python packages only | pip | nothing is installed system-wide |

`scripts/toolchain/env.ps1` is the piece that makes this work in practice. It:

- prepends LLVM-MinGW's tools (with the DLLs they need) so `dlltool` works;
- prepends the Rust toolchain's own `self-contained` directory so
  `x86_64-w64-mingw32-gcc` and `ld` come from there;
- **removes any other MinGW from this shell's PATH.** A 32-bit MinGW earlier in
  `PATH` produces `dlltool: Invalid bfd target` or a bare
  `dlltool: CreateProcess`, which look like Miro bugs but are not;
- points `CC`/`CXX`/`AR` and `CMAKE_TOOLCHAIN_FILE` at Zig;
- points `LIBCLANG_PATH` at the pip `libclang` wheel.

### Known traps on this path

| Symptom | Cause | Fix |
|---|---|---|
| `dlltool: Invalid bfd target` | a 32-bit MinGW from `C:\MinGW` is earlier on `PATH` | dot-source `env.ps1` before building |
| `dlltool: CreateProcess` | rustup's bundled `dlltool` has no assembler beside it | run `scripts\setup-toolchain.ps1`; `env.ps1` then prefers LLVM-MinGW's |
| `failed to add native library ...bcryptprimitives.dll_imports.lib` | same as above, one step later | same fix |
| `unable to find libclang` | `bindgen` cannot find `libclang.dll` | `python -m pip install --user libclang`; `env.ps1` sets `LIBCLANG_PATH` |
| `CMake Error: could not find CMAKE_C_COMPILER` | Zig not on `PATH` for the build | check `env.ps1` printed a `cc/cxx` line |

### Building without the engine

whisper.cpp is behind a default-on Cargo feature, so the rest of the app builds
even with no C++ compiler at all:

```powershell
cargo build --manifest-path src-tauri/Cargo.toml --no-default-features
```

That build runs, opens its windows, records audio and inserts text - and refuses
to transcribe, reporting `engine_unavailable` in the overlay and in Settings.
It is a debugging aid, not a shipping configuration.

---

## 3. Running the checks

```powershell
.\scripts\verify.ps1              # typecheck, lint, tests, build, clippy, privacy audit
.\scripts\verify.ps1 -Fast        # skip the release build
.\scripts\verify.ps1 -FrontendOnly
```

Individual pieces, if you prefer:

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
cargo test   --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## 4. Where Miro keeps things

| Path | Contents |
|---|---|
| `%APPDATA%\app.miro.dictation\config.json` | your settings: shortcut, mode, microphone, model, language, clean-up, theme, start-on-login |
| `%APPDATA%\app.miro.dictation\models\` | model files you downloaded, plus `*.part` for a paused download |
| `src-tauri/icons/` | generated by `python scripts/generate-icons.py` |

That is the complete list. Audio and transcripts are never written anywhere.
`scripts/privacy-audit.ps1` checks that claim from the outside.
