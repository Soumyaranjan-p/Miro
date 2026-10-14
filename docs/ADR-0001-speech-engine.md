# ADR-0001: Local speech recognition engine

- **Status:** accepted
- **Date:** 2026-10-12
- **Context:** Miro must turn microphone audio into text on the user's machine,
  with no account, no cloud API, and no LLM runtime in the path. The engine sits
  behind `src-tauri/src/engine/mod.rs`, so this decision is reversible without
  touching the dictation flow.

## Requirements that actually decide this

1. **Offline, always.** No network call during dictation, ever.
2. **In-memory audio.** The engine should accept `&[f32]` samples so no temp
   file is needed at all. (A temp file is permitted by the spec, but only as an
   escape hatch; avoiding it entirely is strictly better for privacy.)
3. **Windows x64, no admin.** It must build and run on a machine without Visual
   Studio, because that is the machine we have to verify on.
4. **Runs off the UI thread** and finishes a 5-30 second utterance in a time a
   person will tolerate.
5. **Licensing that matches a local-first desktop app** (permissive, no runtime
   telemetry, no redistribution traps).
6. **An honest failure mode.** If the engine is not built in, Miro must say so
   rather than produce a fake transcript.

## Candidates

| Candidate | Windows build | CPU speed | GPU | RAM (base model) | Model format / size | Licence | Offline | In-memory f32 |
|---|---|---|---|---|---|---|---|---|
| **whisper.cpp via `whisper-rs`** | C++ needs CMake + a C/C++ compiler; prebuilt crates not required | Good; it is the most widely tuned Whisper implementation | optional CUDA / Vulkan / Metal / CoreML | ~400 MB working set for `base` | GGML / GGUF, `base.en` q5_1 ≈ 60 MB | MIT (whisper.cpp and the models) | yes | **yes** (`&[f32]` into `whisper_full`) |
| sherpa-onnx | prebuilt binaries, but bindings + runtime plumbing to maintain | Good (ONNX Runtime) | CPU-focused; DirectML builds exist | similar | ONNX, comparable | Apache-2.0 | yes | yes |
| Vosk | prebuilt `libvosk.dll`, easy to ship | Fast for small models | CPU only | lower | its own model archive, ~40 MB small English | Apache-2.0 | yes | yes |
| Bundled sidecar (`whisper-cli.exe`) | no compile step at all | same as whisper.cpp | same | same | same | MIT | yes | **no** - the CLI wants a WAV path, so every dictation would write a temp file |
| Cloud APIs | n/a | n/a | n/a | n/a | n/a | n/a | **no** | n/a |

## Decision

**whisper.cpp, through the `whisper-rs` crate, behind the default-on Cargo
feature `engine-whisper`.**

Reasons, in order of weight:

1. It is the only candidate that takes samples directly in memory *and* has
   mature Windows support, which removes the temp-file path from the design
   entirely rather than merely managing it.
2. The Whisper model family gives a usable quality ladder (tiny → large) that
   users can climb without changing engines, and per-model licensing is MIT.
3. `whisper-rs` is a thin binding: no vendor SDK, no licence server, no runtime
   download, no telemetry.
4. GPU support exists if a user later wants it (CUDA/Vulkan features), but is
   not required for the default path.

## Consequences

- **A C++ toolchain is required to build Miro.** This is the single biggest
  cost of the decision. `docs/SETUP.md` documents both the recommended MSVC path
  and the admin-free fallback used in this environment (LLVM-MinGW for binutils,
  Zig for C/C++, CMake from PyPI).
- The engine is a Cargo feature rather than an unconditional dependency, so
  `cargo build --no-default-features` still produces a working application that
  reports `engine_unavailable` when asked to transcribe. That keeps the honest
  failure mode while letting the rest of the app build on a machine without a
  C++ compiler.
- Model files are the user's to obtain. Miro asks the source for the size before
  offering a download, verifies the byte count and the file's own header, and
  compares a SHA-256 **when a digest is known for that file**.
  *Current limitation, stated plainly:* the shipped catalogue carries no
  digests, because no authoritative digest could be fetched from the model host
  while this build was made (the host's API requires authentication). Until
  digests are added to `src-tauri/src/models.rs`, verification is
  length + header, and both the download dialog and `Verification::summary()`
  say exactly that rather than implying a checksum was checked.
- A quantised (`q5_1`) English `base` model is the default: ~60 MB, fast enough
  on a laptop CPU, and accurate enough for dictation. Larger and multilingual
  models are opt-in in Settings.

## Alternatives reconsidered later

- If a future Windows target cannot ship a C++ compiler at all, **sherpa-onnx**
  is the natural fallback: it keeps the same `SpeechEngine` contract and only
  `engine/*` changes.
- **A sidecar** is rejected for the default path because it forces a temp WAV
  per dictation, which is a strictly worse privacy posture than none at all.
