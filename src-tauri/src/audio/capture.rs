//! Audio capture using cpal.
//!
//! Mirrors the Swift AVAudioEngine + installTap pattern:
//! ```swift
//! inputNode.installTap(onBus: 0, bufferSize: 2048, format: format) { buffer, _ in
//!     request?.append(buffer)
//!     if let rms = Self.rmsLevel(buffer: buffer) { ... }
//! }
//! ```
//!
//! Uses cpal for cross-platform audio input (ALSA on Linux, WASAPI on Windows).
//! A lock-free ring buffer (ringbuf) transfers samples from the audio callback
//! thread to the consumer (STT pipeline).

use std::sync::mpsc;
use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Stream;
use ringbuf::traits::{Observer, Producer, Split};
use ringbuf::HeapRb;

use super::rms::RmsProcessor;

/// Wrapper around cpal::Stream that is Send+Sync.
///
/// cpal::Stream is !Send on some platforms due to PhantomData<*mut ()>,
/// but in practice the stream handle is safe to move between threads
/// as long as we only drop it (never use its internals across threads).
/// We only store the stream to keep it alive and drop it on stop().
struct SendStream(Option<Stream>);

// SAFETY: We only hold the Stream to keep it alive. The actual audio
// processing happens in callbacks that cpal manages on its own thread.
// We never access the Stream's internals from another thread.
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

/// Configuration for audio capture.
#[derive(Debug, Clone)]
pub struct CaptureConfig {
    /// How long to wait after speech stops before firing silence event.
    pub silence_duration: std::time::Duration,
    /// Whether to mute system audio while capturing (requires muter module).
    pub mute_system: bool,
}

impl Default for CaptureConfig {
    fn default() -> Self {
        Self {
            silence_duration: std::time::Duration::from_secs(2),
            mute_system: false,
        }
    }
}

/// Events emitted from the audio capture callback.
#[derive(Debug, Clone)]
pub enum CaptureEvent {
    /// Audio level update (RMS value, 0.0-1.0 range).
    AudioLevel(f64),
    /// First speech detected in this capture session.
    FirstSpeech,
    /// Silence detected after speech (duration exceeded threshold).
    SilenceDetected,
    /// An error occurred in the audio stream.
    Error(String),
}

/// Audio capture manager.
///
/// Owns a cpal input stream and a ring buffer for passing samples
/// to the STT pipeline. Events (audio level, speech detection) are
/// sent via an mpsc channel.
pub struct AudioCapture {
    stream: SendStream,
    running: Arc<AtomicBool>,
    /// Consumer half of the ring buffer. Read samples from here for STT.
    pub consumer: Option<ringbuf::HeapCons<f32>>,
    /// Receive capture events (audio level, speech, silence).
    pub event_rx: Option<mpsc::Receiver<CaptureEvent>>,
    /// Stop signal for the drainer thread set by the caller after `start`.
    pub drainer_stop_flag: Option<Arc<AtomicBool>>,
    sample_rate: u32,
    channels: u16,
}

impl AudioCapture {
    pub fn new() -> Self {
        Self {
            stream: SendStream(None),
            running: Arc::new(AtomicBool::new(false)),
            consumer: None,
            event_rx: None,
            drainer_stop_flag: None,
            sample_rate: 0,
            channels: 0,
        }
    }

    /// The sample rate of the active capture stream, or 0 if not started.
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// The channel count of the active capture stream.
    pub fn channels(&self) -> u16 {
        self.channels
    }

    /// Start capturing audio from the default input device.
    ///
    /// The callback computes RMS, pushes samples to a ring buffer,
    /// and sends events through the channel.
    pub fn start(&mut self, config: CaptureConfig) -> Result<()> {
        if self.running.load(Ordering::SeqCst) {
            anyhow::bail!("Capture already running");
        }

        let host = cpal::default_host();
        let device = host
            .default_input_device()
            .context("No audio input device available")?;

        log::info!("Audio capture device: {:?}", device.name());

        let supported = device
            .default_input_config()
            .context("No supported input config")?;

        let sample_rate = supported.sample_rate().0;
        let channels = supported.channels();
        self.sample_rate = sample_rate;
        self.channels = channels;

        log::info!(
            "Audio capture config: {}Hz, {} ch, {:?}",
            sample_rate,
            channels,
            supported.sample_format()
        );

        // Ring buffer: ~2 seconds of audio at the device sample rate.
        let ring_size = (sample_rate as usize) * (channels as usize) * 2;
        let rb = HeapRb::<f32>::new(ring_size);
        let (producer, consumer) = rb.split();
        self.consumer = Some(consumer);

        // Event channel.
        let (event_tx, event_rx) = mpsc::channel();
        self.event_rx = Some(event_rx);

        let running = self.running.clone();
        running.store(true, Ordering::SeqCst);

        // Shared state for the callback closure.
        let mut rms_proc =
            RmsProcessor::default().with_silence_duration(config.silence_duration);
        let mut producer = producer;

        let stream_config: cpal::StreamConfig = supported.into();

        let err_tx = event_tx.clone();
        let stream = device.build_input_stream(
            &stream_config,
            move |data: &[f32], _: &cpal::InputCallbackInfo| {
                // Push samples to ring buffer (drop oldest if full).
                let to_write = data.len().min(producer.vacant_len());
                if to_write > 0 {
                    let _ = producer.push_slice(&data[..to_write]);
                }

                // Compute RMS and emit events.
                let result = rms_proc.process_buffer(data);

                // Send audio level at a reasonable rate (~15Hz for 2048-sample buffers at 48kHz).
                let _ = event_tx.send(CaptureEvent::AudioLevel(result.rms));

                if result.first_speech {
                    let _ = event_tx.send(CaptureEvent::FirstSpeech);
                }
                if result.silence_detected {
                    let _ = event_tx.send(CaptureEvent::SilenceDetected);
                }
            },
            move |err| {
                log::error!("Audio capture stream error: {}", err);
                let _ = err_tx.send(CaptureEvent::Error(err.to_string()));
            },
            None, // No timeout
        ).context("Failed to build input stream")?;

        stream.play().context("Failed to start input stream")?;
        self.stream = SendStream(Some(stream));

        log::info!("Audio capture started");
        Ok(())
    }

    /// Stop the capture stream and release resources.
    pub fn stop(&mut self) {
        self.running.store(false, Ordering::SeqCst);
        if let Some(flag) = self.drainer_stop_flag.take() {
            flag.store(true, Ordering::SeqCst);
        }
        // Dropping the stream stops it.
        self.stream.0.take();
        self.consumer.take();
        self.event_rx.take();
        self.sample_rate = 0;
        self.channels = 0;
        log::info!("Audio capture stopped");
    }

    /// Whether the capture stream is currently active.
    pub fn is_running(&self) -> bool {
        self.running.load(Ordering::SeqCst)
    }
}

impl Default for AudioCapture {
    fn default() -> Self {
        Self::new()
    }
}
