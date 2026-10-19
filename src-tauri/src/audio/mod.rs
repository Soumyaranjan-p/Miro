//! Microphone capture.
//!
//! Shape of this module, and why:
//!   * A capture lives on its own thread. The cpal stream is created, started
//!     and dropped there, because WASAPI wants the stream torn down on the
//!     thread that owns it, and because the UI thread must never touch audio.
//!   * The audio callback does the minimum: normalize samples to f32, publish
//!     the current level into atomics, and append the raw interleaved samples
//!     (at the device's native rate) to the recording buffer. Downmixing and
//!     resampling to 16 kHz happen once, after recording stops.
//!   * A pump loop turns those atomics into ~50 level frames per second for the
//!     overlay. Frames are numbers, never audio.
//!   * Nothing here knows about files. The only output is `Vec<f32>` in memory.
//!
//! One short mutex (the recording buffer) is taken inside the audio callback.
//! It is essentially uncontended - the pump reads atomics, not the buffer -
//! which is why this is acceptable rather than heroic. It is a deliberate
//! trade of textbook real-time purity for a simpler, auditable data path.

pub mod resample;

use std::sync::atomic::{AtomicBool, AtomicU32};
use std::sync::mpsc::{channel, Receiver, Sender};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::{Data, SampleFormat, StreamConfig};

use crate::errors::{Failure, Result};
use resample::{downmix_to_mono, peak, rms, Resampler, TARGET_SAMPLE_RATE};

/// Level frames per second sent to the overlay (spec asks for 30-60 Hz).
const LEVEL_HZ: u64 = 50;
/// Below this windowed RMS a window counts as silence rather than speech.
const SILENCE_RMS: f32 = 0.002;
/// Clips shorter than this can never be speech, however loud.
const MIN_SPEECH_MS: u128 = 250;
/// Fewer audible 20 ms windows than this, and the audio is a stray click or
/// background hum rather than a voice: real speech needs at least ~60 ms of
/// sound. Judged as an absolute count, not a share of the clip, so a short
/// utterance followed by a pause still passes.
const MIN_LOUD_WINDOWS: usize = 3;
/// How long the audio thread may take to wrap up (downmix, resample, checks)
/// once a stop was asked for, before the supervisor declares it hung.
const STOP_GRACE: Duration = Duration::from_secs(30);
/// Peak level a quiet recording is amplified to before the engine sees it.
const TARGET_PEAK: f32 = 0.6;
/// Ceiling on that amplification, so a noise-only clip is never inflated
/// into something that looks like speech.
const MAX_GAIN: f32 = 32.0;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DeviceInfo {
    pub id: String,
    pub label: String,
    pub is_default: bool,
    pub sample_rate: Option<u32>,
    pub channels: Option<u16>,
}

#[derive(Debug, Clone, Copy, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LevelFrame {
    pub level: f32,
    pub peak: f32,
}

#[derive(Debug)]
pub enum CaptureOutcome {
    /// Audio is ready. `limit_reached` means the safety limit stopped it.
    Recorded {
        samples: Vec<f32>,
        duration_ms: u128,
        limit_reached: bool,
        device_label: String,
    },
    Cancelled,
    Probed,
    Failed(Failure),
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum CaptureMode {
    /// Keep the audio, for dictation.
    Record,
    /// Only publish levels; used by the microphone test in Settings.
    Probe,
}

/// Lock-free hand-off of the current level to the pump.
#[derive(Clone)]
pub struct LevelSink {
    level: Arc<AtomicU32>,
    peak: Arc<AtomicU32>,
}

impl LevelSink {
    fn new() -> Self {
        Self {
            level: Arc::new(AtomicU32::new(0.0f32.to_bits())),
            peak: Arc::new(AtomicU32::new(0.0f32.to_bits())),
        }
    }

    pub fn frame(&self) -> LevelFrame {
        LevelFrame {
            level: f32::from_bits(self.level.load(std::sync::atomic::Ordering::Relaxed)),
            peak: f32::from_bits(self.peak.load(std::sync::atomic::Ordering::Relaxed)),
        }
    }

    fn publish(&self, level: f32, peak_value: f32) {
        self.level
            .store(level.to_bits(), std::sync::atomic::Ordering::Relaxed);
        self.peak
            .store(peak_value.to_bits(), std::sync::atomic::Ordering::Relaxed);
    }

    fn clear(&self) {
        self.publish(0.0, 0.0);
    }
}

/// A cloneable handle for stopping a capture from another thread (the session
/// supervisor owns the outcome, the interface owns the stop button).
#[derive(Clone)]
pub struct CaptureControl {
    stop: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    levels: LevelSink,
}

impl CaptureControl {
    pub fn stop(&self) {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    pub fn cancel(&self) {
        self.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    pub fn is_stopping(&self) -> bool {
        self.stop.load(std::sync::atomic::Ordering::SeqCst)
    }

    pub fn levels(&self) -> &LevelSink {
        &self.levels
    }
}

/// A running capture. Dropping it abandons the recording.
pub struct Capture {
    stop: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    levels: LevelSink,
    finished: Receiver<CaptureOutcome>,
    thread: Option<thread::JoinHandle<()>>,
    joined: bool,
}

impl Capture {
    pub fn levels(&self) -> &LevelSink {
        &self.levels
    }

    /// A handle that can stop this capture without taking ownership of it.
    pub fn control(&self) -> CaptureControl {
        CaptureControl {
            stop: Arc::clone(&self.stop),
            cancel: Arc::clone(&self.cancel),
            levels: self.levels.clone(),
        }
    }

    /// Asks the capture to finish and hand over what it has.
    pub fn stop(&self) {
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
    }

    pub fn is_stopping(&self) -> bool {
        self.stop.load(std::sync::atomic::Ordering::SeqCst)
    }

    /// Waits for the capture thread's verdict. Blocks until the recording
    /// stops on its own (the caller's `stop()`, a cancellation, or the
    /// max-seconds limit) - it does not stop anything itself, so a supervisor
    /// can park a thread here for the life of a recording.
    pub fn wait(mut self) -> CaptureOutcome {
        if self.joined {
            return CaptureOutcome::Cancelled;
        }
        // The capture thread reports back when the recording ends, which is
        // whenever the user asks for it - a dictation far longer than any
        // fixed timeout is a normal thing to wait through, not a hung thread.
        // So a deadline runs only from the moment a stop is in flight: after
        // that the thread just owes the wrap-up (downmix, resample, checks),
        // which gets a generous grace period.
        let mut grace_started: Option<Instant> = None;
        let outcome = loop {
            match self.finished.recv_timeout(Duration::from_secs(1)) {
                Ok(outcome) => break outcome,
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {
                    if self.is_stopping()
                        && grace_started
                            .get_or_insert_with(Instant::now)
                            .elapsed()
                            >= STOP_GRACE
                    {
                        break CaptureOutcome::Failed(Failure::Internal(
                            "the audio thread did not report back in time".into(),
                        ));
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                    break CaptureOutcome::Failed(Failure::Internal(
                        "the audio thread did not report back in time".into(),
                    ));
                }
            }
        };
        if let Some(handle) = self.thread.take() {
            let _ = handle.join();
        }
        self.joined = true;
        self.levels.clear();
        outcome
    }
}

impl Drop for Capture {
    fn drop(&mut self) {
        // Never leave a microphone open because a caller forgot to stop it.
        self.cancel.store(true, std::sync::atomic::Ordering::SeqCst);
        self.stop.store(true, std::sync::atomic::Ordering::SeqCst);
    }
}

struct Shared {
    /// Raw interleaved f32 at the device's native rate and channel count.
    /// Converted to mono 16 kHz (the engine's input contract) after stopping.
    samples: Mutex<Vec<f32>>,
    started: Instant,
    limit_ms: u128,
    limit_reached: AtomicBool,
    stream_error: Mutex<Option<Failure>>,
    /// Diagnostics: how many times the device callback ran and how many raw
    /// samples it handed over, counted without taking the buffer mutex.
    packets: AtomicU32,
    callback_samples: AtomicU32,
}

fn map_cpal_error(err: &cpal::Error) -> Failure {
    match err.kind() {
        cpal::ErrorKind::PermissionDenied => Failure::MicPermissionDenied,
        cpal::ErrorKind::DeviceNotAvailable => Failure::MicMissing,
        cpal::ErrorKind::UnsupportedConfig => Failure::MicUnsupportedFormat(err.to_string()),
        cpal::ErrorKind::UnsupportedOperation => Failure::MicMissing,
        _ => Failure::Internal(format!("audio backend: {err}")),
    }
}

/// Stream-error kinds that do not end a capture.
///
/// cpal 0.18 raises WASAPI capture discontinuities (the
/// `DATA_DISCONTINUITY` flag on one packet) as `Xrun` while the stream stays
/// live and keeps delivering audio - a cpal-0.18 change; earlier releases
/// never surfaced it. cpal's own examples treat `Xrun` as log-and-continue,
/// and so does Miro: a single glitched packet is not a reason to discard a
/// recording that is otherwise healthy.
fn is_transient_stream_error(kind: cpal::ErrorKind) -> bool {
    matches!(kind, cpal::ErrorKind::Xrun)
}

fn open_device(host: &cpal::Host, wanted: Option<&str>) -> Result<(cpal::Device, String)> {
    let Some(wanted) = wanted.map(str::trim).filter(|s| !s.is_empty()) else {
        return match host.default_input_device() {
            Some(device) => {
                let label = device.to_string();
                Ok((device, label))
            }
            None => Err(Failure::MicMissing),
        };
    };

    let devices = host.input_devices().map_err(|_| Failure::MicMissing)?;
    for device in devices {
        let id = device.id().map(|id| id.to_string()).unwrap_or_default();
        let label = device.to_string();
        if id == wanted || label == wanted {
            return Ok((device, label));
        }
    }
    Err(Failure::MicMissing)
}

/// Normalizes one interleaved buffer of any cpal format into f32 in -1..1.
///
/// Written as an explicit match rather than a generic `Sample` bound: the
/// conversion maths is then visible, testable and impossible to get subtly
/// wrong for unsigned formats.
fn append_as_f32(target: &mut Vec<f32>, format: SampleFormat, data: &Data) {
    match format {
        SampleFormat::F32 => {
            if let Some(slice) = data.as_slice::<f32>() {
                target.extend_from_slice(slice);
            }
        }
        SampleFormat::I16 => {
            if let Some(slice) = data.as_slice::<i16>() {
                target.extend(slice.iter().map(|v| *v as f32 / 32_768.0));
            }
        }
        SampleFormat::U16 => {
            if let Some(slice) = data.as_slice::<u16>() {
                target.extend(slice.iter().map(|v| (*v as f32 - 32_768.0) / 32_768.0));
            }
        }
        SampleFormat::I32 => {
            if let Some(slice) = data.as_slice::<i32>() {
                target.extend(slice.iter().map(|v| *v as f32 / 2_147_483_648.0));
            }
        }
        SampleFormat::I8 => {
            if let Some(slice) = data.as_slice::<i8>() {
                target.extend(slice.iter().map(|v| *v as f32 / 128.0));
            }
        }
        SampleFormat::U8 => {
            if let Some(slice) = data.as_slice::<u8>() {
                target.extend(slice.iter().map(|v| (*v as f32 - 128.0) / 128.0));
            }
        }
        // Formats cpal can report but Miro does not convert (I24/U24 and any
        // future addition) are rejected when the stream is opened instead.
        _ => {}
    }
}

fn is_supported_format(format: SampleFormat) -> bool {
    matches!(
        format,
        SampleFormat::F32
            | SampleFormat::I16
            | SampleFormat::U16
            | SampleFormat::I32
            | SampleFormat::I8
            | SampleFormat::U8
    )
}

fn open_stream(
    device: &cpal::Device,
    config: &StreamConfig,
    format: SampleFormat,
    keep_audio: bool,
    shared: Arc<Shared>,
    levels: LevelSink,
) -> Result<cpal::Stream> {
    if !is_supported_format(format) {
        return Err(Failure::MicUnsupportedFormat(format!(
            "sample format {format:?}"
        )));
    }

    let mut scratch: Vec<f32> = Vec::new();
    let mut xrun_logged = false;
    let device_rate = config.sample_rate;
    let device_channels = config.channels;
    let error_shared = Arc::clone(&shared);

    device
        .build_input_stream_raw(
            *config,
            format,
            move |data: &Data, _info: &cpal::InputCallbackInfo| {
                scratch.clear();
                append_as_f32(&mut scratch, format, data);

                let packets = shared
                    .packets
                    .fetch_add(1, std::sync::atomic::Ordering::Relaxed)
                    + 1;
                shared
                    .callback_samples
                    .fetch_add(scratch.len() as u32, std::sync::atomic::Ordering::Relaxed);

                if packets == 1 {
                    // One line only: what the device actually delivers first,
                    // so a broken config shows instead of silently emptying.
                    eprintln!(
                        "[miro-audio] first callback: {} frames, {} Hz, {} ch, format {format:?}",
                        scratch.len() / device_channels.max(1) as usize,
                        device_rate,
                        device_channels
                    );
                }

                if scratch.is_empty() {
                    return;
                }

                levels.publish(rms(&scratch), peak(&scratch));

                // A probe only needs levels; never accumulate audio for it.
                if !keep_audio {
                    return;
                }

                // Store raw samples; downmix and resample after recording stops.
                match shared.samples.lock() {
                    Ok(mut buffer) => buffer.extend_from_slice(&scratch),
                    Err(poisoned) => poisoned.into_inner().extend_from_slice(&scratch),
                }
            },
            move |err| {
                // Log the first transient glitch once; repeat warnings on the
                // audio thread would cost more than the glitch itself.
                if is_transient_stream_error(err.kind()) {
                    if !xrun_logged {
                        xrun_logged = true;
                        eprintln!(
                            "[miro-audio] transient stream glitch (recording continues): {err:?}"
                        );
                    }
                    return;
                }
                if let Ok(mut slot) = error_shared.stream_error.lock() {
                    if slot.is_none() {
                        *slot = Some(match err.kind() {
                            cpal::ErrorKind::DeviceNotAvailable => Failure::MicDisconnected,
                            cpal::ErrorKind::PermissionDenied => Failure::MicPermissionDenied,
                            _ => Failure::Internal(format!("audio stream: {err}")),
                        });
                    }
                }
            },
            None,
        )
        .map_err(|err| map_cpal_error(&err))
}

/// Starts a capture on its own thread. Returns once the stream is live, or with
/// the reason it could not start.
pub fn start(
    device: Option<String>,
    max_seconds: u32,
    mode: CaptureMode,
    on_level: Option<Arc<dyn Fn(LevelFrame) + Send + Sync>>,
) -> Result<Capture> {
    let stop = Arc::new(AtomicBool::new(false));
    let cancel = Arc::new(AtomicBool::new(false));
    let levels = LevelSink::new();
    let (tx, finished) = channel::<CaptureOutcome>();
    let (ready_tx, ready_rx) = channel::<std::result::Result<(), Failure>>();

    let thread_stop = Arc::clone(&stop);
    let thread_cancel = Arc::clone(&cancel);
    let thread_levels = levels.clone();

    let thread = thread::Builder::new()
        .name("miro-audio".to_string())
        .spawn(move || {
            let outcome = run_capture(
                device,
                max_seconds,
                mode,
                thread_stop,
                thread_cancel,
                thread_levels,
                on_level,
                &ready_tx,
            );
            let _ = tx.send(outcome);
        })
        .map_err(|e| Failure::Internal(format!("spawn audio thread: {e}")))?;

    match ready_rx.recv_timeout(Duration::from_secs(10)) {
        Ok(Ok(())) => Ok(Capture {
            stop,
            cancel,
            levels,
            finished,
            thread: Some(thread),
            joined: false,
        }),
        Ok(Err(failure)) => {
            let _ = thread.join();
            Err(failure)
        }
        Err(_) => Err(Failure::Internal(
            "the audio device did not start in time".into(),
        )),
    }
}

#[allow(clippy::too_many_arguments)]
fn run_capture(
    device: Option<String>,
    max_seconds: u32,
    mode: CaptureMode,
    stop: Arc<AtomicBool>,
    cancel: Arc<AtomicBool>,
    levels: LevelSink,
    on_level: Option<Arc<dyn Fn(LevelFrame) + Send + Sync>>,
    ready: &Sender<std::result::Result<(), Failure>>,
) -> CaptureOutcome {
    let host = cpal::default_host();
    let (device, label) = match open_device(&host, device.as_deref()) {
        Ok(pair) => pair,
        Err(failure) => {
            let _ = ready.send(Err(clone_failure(&failure)));
            return CaptureOutcome::Failed(failure);
        }
    };

    let (config, format, sample_rate, channels) = match device.default_input_config() {
        Ok(supported) => {
            let format = supported.sample_format();
            let channels = supported.channels();
            let sample_rate = supported.sample_rate();
            let config: StreamConfig = supported.config();
            (config, format, sample_rate, channels)
        }
        Err(err) => {
            let failure = map_cpal_error(&err);
            let _ = ready.send(Err(clone_failure(&failure)));
            return CaptureOutcome::Failed(failure);
        }
    };

    if sample_rate == 0 || channels == 0 {
        let failure =
            Failure::MicUnsupportedFormat(format!("{sample_rate} Hz, {channels} channels"));
        let _ = ready.send(Err(clone_failure(&failure)));
        return CaptureOutcome::Failed(failure);
    }

    let shared = Arc::new(Shared {
        samples: Mutex::new(Vec::with_capacity(
            sample_rate as usize * channels as usize * 4,
        )),
        started: Instant::now(),
        limit_ms: max_seconds as u128 * 1000,
        limit_reached: AtomicBool::new(false),
        stream_error: Mutex::new(None),
        packets: AtomicU32::new(0),
        callback_samples: AtomicU32::new(0),
    });

    let stream = match open_stream(
        &device,
        &config,
        format,
        mode == CaptureMode::Record,
        Arc::clone(&shared),
        levels.clone(),
    ) {
        Ok(stream) => stream,
        Err(failure) => {
            let _ = ready.send(Err(clone_failure(&failure)));
            return CaptureOutcome::Failed(failure);
        }
    };

    if let Err(err) = stream.play() {
        let failure = map_cpal_error(&err);
        let _ = ready.send(Err(clone_failure(&failure)));
        return CaptureOutcome::Failed(failure);
    }

    let _ = ready.send(Ok(())); // The pump doubles as the supervisor: it watches the clock, the stop flag
                                // and the error callback, and publishes levels while it does.
    let frame_interval = Duration::from_millis(1000 / LEVEL_HZ);
    let mut failure: Option<Failure> = None;
    loop {
        thread::sleep(frame_interval);

        if let Ok(slot) = shared.stream_error.lock() {
            if let Some(stored) = slot.as_ref() {
                failure = Some(clone_failure(stored));
            }
        }
        if failure.is_some() || stop.load(std::sync::atomic::Ordering::SeqCst) {
            break;
        }

        if mode == CaptureMode::Record && shared.started.elapsed().as_millis() >= shared.limit_ms {
            shared
                .limit_reached
                .store(true, std::sync::atomic::Ordering::SeqCst);
            break;
        }

        if let Some(callback) = on_level.as_ref() {
            callback(levels.frame());
        }
    }

    // No callbacks run after this point, so the buffer is ours to read.
    drop(stream);
    let duration_ms = shared.started.elapsed().as_millis();
    let packets = shared.packets.load(std::sync::atomic::Ordering::Relaxed);
    let callback_samples = shared
        .callback_samples
        .load(std::sync::atomic::Ordering::Relaxed);
    let raw = take_samples(&shared); // interleaved, at the device's native rate

    // Diagnostics: compare what the callbacks delivered with what ended up in
    // the recording buffer, then what survives downmix and resampling.
    let expected = sample_rate as u128 * channels as u128 * duration_ms / 1000;
    eprintln!(
        "[miro-audio] stop after {duration_ms} ms: {packets} callbacks, \
         {callback_samples} raw samples delivered, buffer holds {} (expected ~{expected})",
        raw.len()
    );

    let cancelled = cancel.load(std::sync::atomic::Ordering::SeqCst);

    if cancelled || mode == CaptureMode::Probe {
        discard(raw);
        // A probe is a normal ending, not a cancellation.
        return if mode == CaptureMode::Probe {
            CaptureOutcome::Probed
        } else {
            CaptureOutcome::Cancelled
        };
    }

    if let Some(failure) = failure {
        discard(raw);
        return CaptureOutcome::Failed(failure);
    }

    // Downmix and resample once, now that recording is over. Diagnostics run
    // first: per-channel level and the first-channel cross-correlation, to
    // catch a mic array whose channels are recorded in opposite polarity.
    let channel_rms: Vec<f32> = (0..channels as usize)
        .map(|c| {
            let column: Vec<f32> = raw
                .iter()
                .skip(c)
                .step_by(channels as usize)
                .copied()
                .collect();
            rms(&column)
        })
        .collect();
    let channel_corr = channel_cross_correlation(&raw, channels);
    let mut mono = downmix_to_mono(&raw, channels);
    if channel_corr < -0.5 {
        // Anti-correlated channels cancel in the average, turning speech into
        // near-silence. Prefer whichever single channel carries most energy.
        let loudest = channel_rms
            .iter()
            .enumerate()
            .max_by(|a, b| a.1.total_cmp(b.1))
            .map(|(index, _)| index)
            .unwrap_or(0);
        eprintln!(
            "[miro-audio] downmix: channels are anti-correlated ({channel_corr:.3}); \
             keeping channel {loudest} instead of averaging"
        );
        mono = raw
            .iter()
            .skip(loudest)
            .step_by(channels as usize)
            .copied()
            .collect();
    }
    eprintln!(
        "[miro-audio] downmix: {} -> {} samples ({} ch); per-channel rms {:?}; corr {:.3}",
        raw.len(),
        mono.len(),
        channels,
        channel_rms,
        channel_corr
    );
    discard(raw);
    let mut resampler = Resampler::new(sample_rate);
    let mut resampled = resampler.process(&mono, false);
    resampled.extend(resampler.process(&[], true)); // flush the tail
    discard(mono);
    normalize_peak(&mut resampled);
    let expected_16k = TARGET_SAMPLE_RATE as u128 * duration_ms / 1000;
    eprintln!(
        "[miro-audio] resampled: {} samples at {} Hz (expected ~{expected_16k})",
        resampled.len(),
        TARGET_SAMPLE_RATE
    );

    if has_no_speech(&resampled, duration_ms) {
        eprintln!(
            "[miro-audio] audio_empty: {} samples, {duration_ms} ms, loud windows {} of {} \
             (need {}, speech rms cutoff {}) - nothing over the speech floor",
            resampled.len(),
            loud_windows(&resampled),
            resampled.len() / (TARGET_SAMPLE_RATE as usize / 50).max(1),
            MIN_LOUD_WINDOWS,
            SILENCE_RMS
        );
        discard(resampled);
        return CaptureOutcome::Failed(Failure::AudioEmpty);
    }

    CaptureOutcome::Recorded {
        samples: resampled,
        duration_ms,
        limit_reached: shared
            .limit_reached
            .load(std::sync::atomic::Ordering::SeqCst),
        device_label: label,
    }
}

fn take_samples(shared: &Shared) -> Vec<f32> {
    match shared.samples.lock() {
        Ok(mut buffer) => std::mem::take(&mut *buffer),
        Err(poisoned) => std::mem::take(&mut *poisoned.into_inner()),
    }
}

/// True when a clip is too short or too quiet to be speech.
///
/// Speech is judged by an absolute count of audible 20 ms windows, not by a
/// share of the whole clip and not by the clip's average level: a few spoken
/// words inside a long recording average out below any whole-clip threshold,
/// so only "was there real sound anywhere" is a fair test. The expected norm
/// is for clips on a healthy mic to enter this function at a natural volume.
pub fn has_no_speech(samples: &[f32], duration_ms: u128) -> bool {
    if samples.is_empty() || duration_ms < MIN_SPEECH_MS {
        return true;
    }
    loud_windows(samples) < MIN_LOUD_WINDOWS
}

/// Brings a quietly recorded clip up to a level the engine can use.
///
/// A laptop mic at a low Windows input level records speech around -50 dBFS;
/// the engine expects ordinary conversation levels. Peak-normalising the
/// clip - with a gain ceiling so a noise-only recording is never inflated
/// into something that looks like speech - puts a quiet voice back inside
/// the engine's comfort zone. A clip that is already loud enough is left
/// exactly as recorded.
fn normalize_peak(samples: &mut [f32]) {
    let measured = peak(samples);
    if measured > 1e-6 && measured < TARGET_PEAK {
        let gain = (TARGET_PEAK / measured).min(MAX_GAIN);
        eprintln!(
            "[miro-audio] normalize: peak {measured:.4} x{gain:.1} -> peak {:.4}",
            (measured * gain).min(TARGET_PEAK)
        );
        for sample in samples.iter_mut() {
            *sample = (*sample * gain).clamp(-1.0, 1.0);
        }
    }
}

/// Count of 20 ms windows over the speech RMS threshold.
fn loud_windows(samples: &[f32]) -> usize {
    let window = (TARGET_SAMPLE_RATE as usize / 50).max(1); // 20 ms
    samples
        .chunks(window)
        .filter(|chunk| rms(chunk) > SILENCE_RMS)
        .count()
}

/// Enumerates input devices for the settings window.
pub fn list_input_devices() -> Vec<DeviceInfo> {
    let host = cpal::default_host();
    let default_id = host
        .default_input_device()
        .and_then(|device| device.id().ok())
        .map(|id| id.to_string());

    let mut out = Vec::new();
    if let Ok(devices) = host.input_devices() {
        for device in devices {
            let id = device.id().map(|id| id.to_string()).unwrap_or_default();
            let label = device.to_string();
            let config = device.default_input_config().ok();
            out.push(DeviceInfo {
                is_default: default_id.as_deref() == Some(id.as_str()),
                id,
                label,
                sample_rate: config.as_ref().map(|c| c.sample_rate()),
                channels: config.as_ref().map(|c| c.channels()),
            });
        }
    }
    out
}

/// Used by the status strip so Settings can say what Miro actually found.
pub fn microphone_state() -> (MicrophoneState, Option<String>) {
    let host = cpal::default_host();
    match host.default_input_device() {
        None => (MicrophoneState::Missing, None),
        Some(device) => {
            let label = device.to_string();
            match device.default_input_config() {
                Ok(_) => (MicrophoneState::Available, Some(label)),
                Err(err) => {
                    let state = match map_cpal_error(&err) {
                        Failure::MicPermissionDenied => MicrophoneState::PermissionDenied,
                        _ => MicrophoneState::Missing,
                    };
                    (state, Some(label))
                }
            }
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum MicrophoneState {
    Unknown,
    Available,
    Missing,
    PermissionDenied,
}

/// Pearson-style correlation between channels 0 and 1 of an interleaved
/// buffer, in -1..1. Diagnostics only; 0 when channels are fewer than two.
fn channel_cross_correlation(raw: &[f32], channels: u16) -> f32 {
    if channels < 2 {
        return 0.0;
    }
    let (mut a, mut b) = (0.0f64, 0.0f64);
    for frame in raw.chunks_exact(channels as usize) {
        a += frame[0] as f64;
        b += frame[1] as f64;
    }
    a /= raw.len() as f64 / channels as f64;
    b /= raw.len() as f64 / channels as f64;
    let (mut ab, mut a2, mut b2) = (0.0f64, 0.0f64, 0.0f64);
    for frame in raw.chunks_exact(channels as usize) {
        let (x, y) = (frame[0] as f64 - a, frame[1] as f64 - b);
        ab += x * y;
        a2 += x * x;
        b2 += y * y;
    }
    if a2 > 0.0 && b2 > 0.0 {
        (ab / (a2 * b2).sqrt()).clamp(-1.0, 1.0) as f32
    } else {
        0.0
    }
}

/// Overwrites audio with zeroes before it is dropped.
pub fn zeroize(buffer: &mut [f32]) {
    for sample in buffer.iter_mut() {
        *sample = 0.0;
    }
}

/// Zeroes and drops a buffer. The only way audio leaves this module.
pub fn discard(mut samples: Vec<f32>) {
    zeroize(&mut samples);
    samples.clear();
}

fn clone_failure(failure: &Failure) -> Failure {
    match failure {
        Failure::MicPermissionDenied => Failure::MicPermissionDenied,
        Failure::MicMissing => Failure::MicMissing,
        Failure::MicDisconnected => Failure::MicDisconnected,
        Failure::MicUnsupportedFormat(detail) => Failure::MicUnsupportedFormat(detail.clone()),
        Failure::Internal(detail) => Failure::Internal(detail.clone()),
        other => Failure::Internal(other.to_string()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Live diagnostic against the real default input device. Not a CI test:
    /// run explicitly when tracing a capture complaint, e.g.
    /// `cargo test --lib audio::tests::live_capture -- --ignored --nocapture`.
    ///
    /// Calls `wait()` immediately, exactly as the session supervisor does, and
    /// asserts the recording ran to its max-seconds limit: a recording that
    /// ends early means `wait()` started stopping the stream instead of
    /// receiving it (the root cause of pile of `audio_empty` failures).
    #[test]
    #[ignore = "takes over the real microphone for ~2 s"]
    fn live_capture_diagnostic() {
        let capture = start(None, 2, CaptureMode::Record, None).expect("capture start");
        let began = Instant::now();
        let outcome = capture.wait();
        let waited_ms = began.elapsed().as_millis();
        assert!(
            waited_ms >= 1200,
            "capture self-stopped after {waited_ms} ms; \
             sleep-and-receive in `wait()` and the supervisor are in conflict"
        );
        match outcome {
            CaptureOutcome::Recorded {
                samples,
                duration_ms,
                ..
            } => {
                eprintln!(
                    "[miro-audio-diag] RECORDED: {} samples, {duration_ms} ms",
                    samples.len()
                );
                discard(samples);
            }
            CaptureOutcome::Failed(failure) => {
                // A silent room legitimately fails the speech gate; the stop
                // and sample counters on stderr are the part that matters.
                eprintln!("[miro-audio-diag] FAILED: {failure:?}");
            }
            other => eprintln!("[miro-audio-diag] other outcome: {other:?}"),
        }
    }

    #[test]
    fn an_xrun_does_not_kill_the_stream_but_a_dead_device_does() {
        assert!(is_transient_stream_error(cpal::ErrorKind::Xrun));
        assert!(!is_transient_stream_error(
            cpal::ErrorKind::DeviceNotAvailable
        ));
        assert!(!is_transient_stream_error(cpal::ErrorKind::BackendError));
    }

    #[test]
    fn silence_is_detected() {
        let quiet = vec![0.0001f32; TARGET_SAMPLE_RATE as usize];
        assert!(has_no_speech(&quiet, 1000));
    }

    #[test]
    fn a_short_clip_is_not_speech() {
        let loud = vec![0.4f32; (TARGET_SAMPLE_RATE as usize) / 10];
        assert!(has_no_speech(&loud, 50));
    }

    #[test]
    fn speech_like_audio_passes() {
        let samples: Vec<f32> = (0..TARGET_SAMPLE_RATE as usize)
            .map(|i| {
                let t = i as f32 / TARGET_SAMPLE_RATE as f32;
                0.2 * (2.0 * std::f32::consts::PI * 180.0 * t).sin()
            })
            .collect();
        assert!(!has_no_speech(&samples, 1000));
    }

    #[test]
    fn a_single_click_does_not_count_as_speech() {
        // One second of near-silence with a single 15 ms burst: a door, not a voice.
        let mut samples = vec![0.0f32; TARGET_SAMPLE_RATE as usize];
        for sample in samples.iter_mut().skip(1000).take(240) {
            *sample = 0.8;
        }
        assert!(has_no_speech(&samples, 1000));
    }

    #[test]
    fn speech_followed_by_a_long_pause_is_still_speech() {
        // One second of speech, then three seconds of quiet before the Stop
        // press: the old whole-clip fraction gate rejected exactly this, and
        // real dictation pauses trip it just the same.
        let mut samples = vec![0.0001f32; TARGET_SAMPLE_RATE as usize * 4];
        for sample in samples[TARGET_SAMPLE_RATE as usize..TARGET_SAMPLE_RATE as usize * 2]
            .iter_mut()
        {
            *sample = 0.2;
        }
        assert!(!has_no_speech(&samples, 4000));
    }

    #[test]
    fn a_faint_voice_in_a_long_quiet_recording_is_speech() {
        // The field failure, rebuilt: ~5 s of a voice barely over the speech
        // floor inside a 30 s recording. The whole-clip RMS came in at
        // ~0.0012, under any average-level cutoff, yet 250 windows carried
        // sound. Only the window count is a fair judge of that clip.
        let window_max = TARGET_SAMPLE_RATE as usize * 17;
        let window_min = TARGET_SAMPLE_RATE as usize * 12;
        let mut samples = vec![0.0f32; TARGET_SAMPLE_RATE as usize * 30];
        for (i, sample) in samples.iter_mut().enumerate().skip(window_min).take(window_max - window_min) {
            *sample = 0.004 * (i as f64 / 40.0).sin() as f32;
        }
        assert!(!has_no_speech(&samples, 30_000));
    }

    #[test]
    fn a_quiet_clip_is_brought_up_to_a_usable_level() {
        let mut samples = vec![0.0f32; 16_000];
        samples[100] = 0.02;
        samples[101] = -0.01;
        normalize_peak(&mut samples);
        let measured = peak(&samples);
        assert!(
            (measured - TARGET_PEAK).abs() < 0.01,
            "peak {measured}, expected ~{TARGET_PEAK}"
        );
    }

    #[test]
    fn a_loud_clip_is_left_alone() {
        let mut samples = vec![0.0f32; 16_000];
        samples[100] = 0.8;
        samples[101] = -0.2;
        let before = samples.clone();
        normalize_peak(&mut samples);
        assert_eq!(samples, before);
    }

    #[test]
    fn a_noise_floor_clip_is_never_amplified_into_speech() {
        let mut samples = vec![0.00001f32; 16_000];
        normalize_peak(&mut samples);
        let measured = peak(&samples);
        assert!(
            measured < 0.01,
            "the gain ceiling must keep noise quiet, got peak {measured}"
        );
    }

    #[test]
    fn anti_correlated_channels_are_reported_negative() {
        // Two channels of the same wave with opposite polarity - the array
        // layout that deletes itself when the channels are averaged.
        let tone: Vec<f32> = (0..9600).map(|i| ((i as f32) / 100.0).sin()).collect();
        let mut raw = Vec::with_capacity(tone.len() * 2);
        for sample in &tone {
            raw.push(*sample);
            raw.push(-*sample);
        }
        assert!(channel_cross_correlation(&raw, 2) < -0.99);
    }

    #[test]
    fn zeroize_leaves_nothing_behind() {
        let mut buffer = vec![0.7f32; 64];
        zeroize(&mut buffer);
        assert!(buffer.iter().all(|s| *s == 0.0));
        discard(buffer);
    }

    #[test]
    fn level_frames_are_plain_numbers() {
        let sink = LevelSink::new();
        assert_eq!(sink.frame().level, 0.0);
        sink.publish(0.5, 0.75);
        let frame = sink.frame();
        assert!((frame.level - 0.5).abs() < 1e-6);
        assert!((frame.peak - 0.75).abs() < 1e-6);
        sink.clear();
        assert_eq!(sink.frame().peak, 0.0);
    }

    #[test]
    fn every_supported_format_is_actually_convertible() {
        for format in [
            SampleFormat::F32,
            SampleFormat::I16,
            SampleFormat::U16,
            SampleFormat::I32,
            SampleFormat::I8,
            SampleFormat::U8,
        ] {
            assert!(
                is_supported_format(format),
                "{format:?} should be convertible"
            );
        }
        assert!(!is_supported_format(SampleFormat::I24));
        assert!(!is_supported_format(SampleFormat::U24));
    }
}
