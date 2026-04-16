//! Speech-to-text pipeline placeholder.
//!
//! Mirrors the Swift VoiceWakeRuntime silence detection polling logic
//! where audio buffers are accumulated and periodically transcribed.
//!
//! TODO: Integrate whisper-rs when C++ build tools are available.
//! The structure accepts 16kHz mono f32 samples, which is what
//! whisper.cpp expects.

/// Pipeline state.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SttState {
    /// Not actively processing.
    Idle,
    /// Receiving audio and accumulating samples.
    Listening,
    /// Running inference on accumulated audio.
    Processing,
}

/// Placeholder STT pipeline.
///
/// When whisper-rs is integrated, this will:
/// 1. Accept 16kHz mono f32 samples via `feed_samples`
/// 2. Run whisper inference for partial results during listening
/// 3. Run final inference when silence is detected
pub struct SttPipeline {
    state: SttState,
    /// Accumulated 16kHz mono f32 samples.
    buffer: Vec<f32>,
    /// Target sample rate for the model (whisper expects 16kHz).
    target_sample_rate: u32,
}

impl SttPipeline {
    pub fn new() -> Self {
        Self {
            state: SttState::Idle,
            // Pre-allocate for ~30 seconds of 16kHz mono audio.
            buffer: Vec::with_capacity(16_000 * 30),
            target_sample_rate: 16_000,
        }
    }

    /// Current pipeline state.
    pub fn state(&self) -> SttState {
        self.state
    }

    /// Target sample rate for the STT model.
    pub fn target_sample_rate(&self) -> u32 {
        self.target_sample_rate
    }

    /// Begin a new listening session.
    pub fn start_listening(&mut self) {
        self.buffer.clear();
        self.state = SttState::Listening;
        log::debug!("STT pipeline: listening");
    }

    /// Feed audio samples into the pipeline.
    ///
    /// Samples should be 16kHz mono f32. If the capture device uses a
    /// different sample rate, resample before calling this method (use
    /// the `rubato` crate).
    pub fn feed_samples(&mut self, samples: &[f32]) {
        if self.state != SttState::Listening {
            return;
        }
        self.buffer.extend_from_slice(samples);
    }

    /// Get a partial transcription result (streaming).
    ///
    /// TODO: Run whisper inference on the current buffer.
    /// For now, returns None.
    pub fn get_partial_result(&self) -> Option<String> {
        if self.state != SttState::Listening || self.buffer.is_empty() {
            return None;
        }
        // TODO: Integrate whisper-rs when C++ build tools available.
        // Would run: whisper_full(ctx, params, &self.buffer, self.buffer.len())
        // and extract partial tokens.
        None
    }

    /// Get the final transcription result.
    ///
    /// TODO: Run whisper inference on the complete buffer.
    /// For now, returns None.
    pub fn get_final_result(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            return None;
        }
        self.state = SttState::Processing;
        log::debug!(
            "STT pipeline: processing {} samples ({:.1}s)",
            self.buffer.len(),
            self.buffer.len() as f64 / self.target_sample_rate as f64
        );

        // TODO: Integrate whisper-rs when C++ build tools available.
        // Would run full inference and return the complete transcription.
        // let result = whisper_full(ctx, params, &self.buffer, self.buffer.len());
        // let text = whisper_full_get_segment_text(ctx, 0..n_segments).join(" ");

        self.state = SttState::Idle;
        None
    }

    /// Reset the pipeline, clearing all buffered audio.
    pub fn reset(&mut self) {
        self.buffer.clear();
        self.state = SttState::Idle;
        log::debug!("STT pipeline: reset");
    }

    /// Number of samples currently buffered.
    pub fn buffered_samples(&self) -> usize {
        self.buffer.len()
    }

    /// Duration of buffered audio in seconds.
    pub fn buffered_duration_secs(&self) -> f64 {
        self.buffer.len() as f64 / self.target_sample_rate as f64
    }
}

impl Default for SttPipeline {
    fn default() -> Self {
        Self::new()
    }
}
