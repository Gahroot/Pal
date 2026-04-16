//! Speech-to-text pipeline.
//!
//! With the `voice` Cargo feature enabled, uses whisper.cpp bindings
//! (whisper-rs) to transcribe 16kHz mono f32 audio. Without the feature,
//! this compiles as a no-op stub that returns `None` so the rest of the
//! app (audio capture, frontend wiring) keeps working.

use anyhow::{anyhow, Result};

#[cfg(feature = "voice")]
use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SttState {
    Idle,
    Listening,
    Processing,
}

pub struct SttPipeline {
    state: SttState,
    /// Accumulated 16kHz mono f32 samples.
    buffer: Vec<f32>,
    /// Target sample rate for the model (whisper expects 16kHz).
    target_sample_rate: u32,

    #[cfg(feature = "voice")]
    ctx: Option<WhisperContext>,

    #[cfg(feature = "voice")]
    language: Option<String>,
}

impl SttPipeline {
    pub fn new() -> Self {
        Self {
            state: SttState::Idle,
            buffer: Vec::with_capacity(16_000 * 30),
            target_sample_rate: 16_000,
            #[cfg(feature = "voice")]
            ctx: None,
            #[cfg(feature = "voice")]
            language: Some("en".to_string()),
        }
    }

    #[cfg(feature = "voice")]
    pub fn load_model(&mut self, path: &str) -> Result<()> {
        if !std::path::Path::new(path).exists() {
            return Err(anyhow!("Whisper model not found at {}", path));
        }
        let ctx = WhisperContext::new_with_params(path, WhisperContextParameters::default())
            .map_err(|e| anyhow!("Failed to load whisper model: {e}"))?;
        self.ctx = Some(ctx);
        log::info!("Whisper model loaded from {}", path);
        Ok(())
    }

    #[cfg(not(feature = "voice"))]
    pub fn load_model(&mut self, _path: &str) -> Result<()> {
        Err(anyhow!(
            "STT disabled: rebuild with `--features voice` to enable whisper-rs"
        ))
    }

    pub fn is_loaded(&self) -> bool {
        #[cfg(feature = "voice")]
        {
            self.ctx.is_some()
        }
        #[cfg(not(feature = "voice"))]
        {
            false
        }
    }

    pub fn state(&self) -> SttState {
        self.state
    }

    pub fn target_sample_rate(&self) -> u32 {
        self.target_sample_rate
    }

    pub fn start_listening(&mut self) {
        self.buffer.clear();
        self.state = SttState::Listening;
    }

    pub fn feed_samples(&mut self, samples: &[f32]) {
        if self.state != SttState::Listening {
            return;
        }
        self.buffer.extend_from_slice(samples);
    }

    #[cfg(feature = "voice")]
    pub fn get_partial_result(&self) -> Option<String> {
        if self.state != SttState::Listening || self.buffer.len() < self.target_sample_rate as usize
        {
            return None;
        }
        let ctx = self.ctx.as_ref()?;
        let mut state = ctx.create_state().ok()?;
        let params = build_params(self.language.as_deref());
        state.full(params, &self.buffer).ok()?;
        Some(extract_text(&state))
    }

    #[cfg(not(feature = "voice"))]
    pub fn get_partial_result(&self) -> Option<String> {
        None
    }

    #[cfg(feature = "voice")]
    pub fn get_final_result(&mut self) -> Option<String> {
        if self.buffer.is_empty() {
            self.state = SttState::Idle;
            return None;
        }
        self.state = SttState::Processing;
        let result = self.ctx.as_ref().and_then(|ctx| {
            let mut state = ctx.create_state().ok()?;
            let params = build_params(self.language.as_deref());
            state.full(params, &self.buffer).ok()?;
            Some(extract_text(&state))
        });
        self.buffer.clear();
        self.state = SttState::Idle;
        result
    }

    #[cfg(not(feature = "voice"))]
    pub fn get_final_result(&mut self) -> Option<String> {
        self.buffer.clear();
        self.state = SttState::Idle;
        None
    }

    pub fn reset(&mut self) {
        self.buffer.clear();
        self.state = SttState::Idle;
    }

    pub fn buffered_samples(&self) -> usize {
        self.buffer.len()
    }

    pub fn buffered_duration_secs(&self) -> f64 {
        self.buffer.len() as f64 / self.target_sample_rate as f64
    }
}

impl Default for SttPipeline {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(feature = "voice")]
fn build_params(language: Option<&str>) -> FullParams<'_, '_> {
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });
    params.set_n_threads(
        std::thread::available_parallelism()
            .map(|n| n.get())
            .unwrap_or(4)
            .min(8) as i32,
    );
    params.set_translate(false);
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);
    params.set_suppress_blank(true);
    if let Some(lang) = language {
        params.set_language(Some(lang));
    }
    params
}

#[cfg(feature = "voice")]
fn extract_text(state: &whisper_rs::WhisperState) -> String {
    let n = state.full_n_segments().unwrap_or(0);
    let mut out = String::new();
    for i in 0..n {
        if let Ok(seg) = state.full_get_segment_text(i) {
            out.push_str(&seg);
        }
    }
    out.trim().to_string()
}
