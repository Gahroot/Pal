//! Audio playback using cpal.
//!
//! Mirrors the Swift AVAudioPlayerNode + prewarmEngine pattern:
//! ```swift
//! func prewarmEngine() { engine.prepare(); try engine.start() }
//! func ensureEngineRunning() { if !engine.isRunning { engine.prepare(); try engine.start() } }
//! ```
//!
//! The output stream is started immediately ("pre-warmed") to avoid first-buffer
//! latency. When the ring buffer is empty the callback writes silence.

use std::sync::Arc;
use std::sync::atomic::{AtomicBool, Ordering};

use anyhow::{Context, Result};
use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
use cpal::Stream;
use ringbuf::traits::{Consumer, Observer, Producer, Split};
use ringbuf::HeapRb;

/// Wrapper around cpal::Stream that is Send+Sync.
/// See capture.rs for safety rationale.
struct SendStream(Option<Stream>);
unsafe impl Send for SendStream {}
unsafe impl Sync for SendStream {}

/// Audio playback manager.
///
/// Owns a cpal output stream and a ring buffer that producers can
/// push samples into. The output callback reads from the ring buffer
/// and fills the output with silence when empty.
pub struct AudioPlayback {
    stream: SendStream,
    producer: Option<ringbuf::HeapProd<f32>>,
    playing: Arc<AtomicBool>,
    has_data: Arc<AtomicBool>,
    sample_rate: u32,
    channels: u16,
}

impl AudioPlayback {
    pub fn new() -> Self {
        Self {
            stream: SendStream(None),
            producer: None,
            playing: Arc::new(AtomicBool::new(false)),
            has_data: Arc::new(AtomicBool::new(false)),
            sample_rate: 0,
            channels: 0,
        }
    }

    /// Start the playback stream (pre-warm). This opens the default output
    /// device and starts writing silence until samples are enqueued.
    pub fn start(&mut self, sample_rate: u32, channels: u16) -> Result<()> {
        if self.playing.load(Ordering::SeqCst) {
            anyhow::bail!("Playback already running");
        }

        let host = cpal::default_host();
        let device = host
            .default_output_device()
            .context("No audio output device available")?;

        log::info!("Audio playback device: {:?}", device.name());

        let stream_config = cpal::StreamConfig {
            channels,
            sample_rate: cpal::SampleRate(sample_rate),
            buffer_size: cpal::BufferSize::Default,
        };

        self.sample_rate = sample_rate;
        self.channels = channels;

        // Ring buffer: ~4 seconds of audio.
        let ring_size = (sample_rate as usize) * (channels as usize) * 4;
        let rb = HeapRb::<f32>::new(ring_size);
        let (producer, mut consumer) = rb.split();
        self.producer = Some(producer);

        let playing = self.playing.clone();
        playing.store(true, Ordering::SeqCst);
        let has_data = self.has_data.clone();

        let stream = device.build_output_stream(
            &stream_config,
            move |data: &mut [f32], _: &cpal::OutputCallbackInfo| {
                let read = consumer.pop_slice(data);
                // Fill remainder with silence.
                for sample in &mut data[read..] {
                    *sample = 0.0;
                }
                // Track whether we have meaningful data flowing.
                has_data.store(read > 0, Ordering::Relaxed);
            },
            move |err| {
                log::error!("Audio playback stream error: {}", err);
            },
            None,
        ).context("Failed to build output stream")?;

        stream.play().context("Failed to start output stream")?;
        self.stream = SendStream(Some(stream));

        log::info!(
            "Audio playback started (pre-warmed): {}Hz, {} ch",
            sample_rate,
            channels
        );
        Ok(())
    }

    /// Enqueue samples for playback. Drops excess if the buffer is full.
    pub fn enqueue_samples(&mut self, samples: &[f32]) {
        if let Some(ref mut producer) = self.producer {
            let to_write = samples.len().min(producer.vacant_len());
            if to_write > 0 {
                let _ = producer.push_slice(&samples[..to_write]);
            }
            if to_write < samples.len() {
                log::warn!(
                    "Playback buffer full, dropped {} samples",
                    samples.len() - to_write
                );
            }
        }
    }

    /// Whether the output stream is actively playing non-silence data.
    pub fn is_playing(&self) -> bool {
        self.playing.load(Ordering::SeqCst) && self.has_data.load(Ordering::Relaxed)
    }

    /// Whether the stream is started (even if playing silence).
    pub fn is_started(&self) -> bool {
        self.playing.load(Ordering::SeqCst)
    }

    /// Stop playback and release resources.
    pub fn stop(&mut self) {
        self.playing.store(false, Ordering::SeqCst);
        self.has_data.store(false, Ordering::Relaxed);
        self.stream.0.take();
        self.producer.take();
        self.sample_rate = 0;
        self.channels = 0;
        log::info!("Audio playback stopped");
    }
}

impl Default for AudioPlayback {
    fn default() -> Self {
        Self::new()
    }
}
