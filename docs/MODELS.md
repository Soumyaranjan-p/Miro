# Miro - speech models

Miro transcribes locally with whisper.cpp. That needs a model file on your disk.
Nothing is ever downloaded without your explicit confirmation.

## The catalogue

Settings shows this list, with the real size of each file read from the source
before you commit to anything.

| Model | Languages | Parameters | Quantisation | Approx. size | Notes |
|---|---|---|---|---|---|
| `tiny.en` | English | 39 M | q5_1 | ~32 MB | fastest, noticeably less accurate |
| `base.en` | English | 74 M | q5_1 | ~60 MB | **the default**: best speed/accuracy balance for dictation |
| `small.en` | English | 244 M | q5_1 | ~190 MB | better punctuation and names, roughly 2-3x slower |
| `medium.en` | English | 769 M | q5_0 | ~540 MB | high accuracy, needs a fast CPU |
| `tiny` | Multilingual | 39 M | q5_1 | ~32 MB | language detection, low accuracy |
| `base` | Multilingual | 74 M | q5_1 | ~60 MB | good starting point for non-English |
| `small` | Multilingual | 244 M | q5_1 | ~190 MB | the practical multilingual choice |
| `large-v3-turbo` | Multilingual | 809 M | q5_0 | ~570 MB | best quality per second, still heavy |

All of them come from `huggingface.co/ggerganov/whisper.cpp` and are MIT
licensed. (The same files previously lived under `ggml-org`, which is no longer
publicly reachable; the mirror in the repo's original location is what Miro and
the download buttons point at.) English-only (`*.en`) models are faster and
slightly more accurate for
English; they cannot be told to transcribe another language, and the language
selector in Settings is fixed to English while one is selected.

## Downloading

1. Open **Settings → Speech model**.
2. Press **Download** next to a model. Miro asks the source for the file size
   first - that is why the button says *Checking size* for a moment.
3. A confirmation panel appears with the model name, the size the source
   reported, the exact URL, the licence and the digest (if one is published).
   Nothing is downloaded before you press Download on that panel.
4. Progress is shown live. **Cancel** stops the transfer and keeps the partial
   file, so pressing **Resume** later continues from where it stopped.
5. When the transfer finishes, the file is verified before it is used (see
   below) and renamed from `<name>.part` to `<name>`.

Downloads happen on a background task; the interface stays responsive and you
can close Settings while one runs.

## Verification - exactly what is checked

Miro verifies a model file in three layers, and reports which of them applied:

| Layer | Always? | What it proves |
|---|---|---|
| Exact byte count, checked against the length the source declared | yes | the transfer completed and was not truncated |
| File header (`ggml`/`GGUF` magic) | yes | the file is a model container, not an HTML error page or a stray file |
| SHA-256 comparison | **only when a digest is known for that file** | the bytes are the expected bytes |

**Current limitation, stated plainly:** the shipped catalogue in
`src-tauri/src/models.rs` contains no digests, because no authoritative digest
could be obtained from the model host while this build was made (its API
requires authentication). Until digests are added there, a download is verified
by length and header, and both the confirmation panel and
`models::Verification::summary()` say `no digest available` rather than implying
otherwise. If you have a digest you trust, the same function accepts it:
`models::verify_file(path, Some(expected_len), Some(expected_sha256))`.

A model file that fails verification is deleted rather than kept, and the error
in the overlay says which check failed.

## Installing a model by hand (offline machines)

Miro never needs the network if the file is already there.

1. On a machine with internet access, download the model file from
   `https://huggingface.co/ggerganov/whisper.cpp` - use the file names from the
   table above (for example `ggml-base.en-q5_1.bin`).
2. Copy it into Miro's models folder. In Settings → Speech model, press
   **Open folder**; the path is
   `%APPDATA%\app.miro.dictation\models\`.
3. Return to Settings: the model now shows as installed, because Miro verifies
   whatever is in that folder rather than trusting its own bookkeeping.
4. Select it with **Use**.

A file with the wrong name is ignored; a file with the right name but a bad
header is listed as **Damaged**, with a delete button.

## Disk usage and removal

Each model is a single file. **Delete** next to an installed model removes both
the model and any partial download of it. Nothing else references the file, so
that is the whole cleanup.

## Why these files are safe to keep in the repository's data directory

They are public model weights, not your data. They contain no personal
information, and Miro treats them as replaceable: deleting one costs a
re-download, nothing more.
