//! Kokoro TTS engine.
//!
//! With the `voice` Cargo feature enabled, loads `kokoro-v1.0.onnx` via `ort`
//! and exposes `generate(text)` that returns 24kHz mono f32 PCM samples.
//! Without the feature, returns silence so the rest of the pipeline stays
//! wired and can be tested end-to-end.
//!
//! Full inference (phonemizer + voice-style mixing) is a follow-up and is
//! gated behind the `voice` feature.

use anyhow::{anyhow, Result};

#[cfg(feature = "voice")]
use ort::session::{builder::SessionBuilder, Session};

const SAMPLE_RATE: u32 = 24_000;

pub struct KokoroEngine {
    sample_rate: u32,
    voice: String,
    speed: f32,

    #[cfg(feature = "voice")]
    session: Option<Session>,
    #[cfg(feature = "voice")]
    voices_bytes: Option<Vec<u8>>,
}

impl KokoroEngine {
    pub fn new() -> Self {
        Self {
            sample_rate: SAMPLE_RATE,
            voice: "af_sky".to_string(),
            speed: 1.0,
            #[cfg(feature = "voice")]
            session: None,
            #[cfg(feature = "voice")]
            voices_bytes: None,
        }
    }

    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    pub fn is_ready(&self) -> bool {
        #[cfg(feature = "voice")]
        {
            self.session.is_some() && self.voices_bytes.is_some()
        }
        #[cfg(not(feature = "voice"))]
        {
            false
        }
    }

    #[cfg(feature = "voice")]
    pub fn load_model(
        &mut self,
        model_path: &str,
        voices_path: &str,
        voice_name: &str,
    ) -> Result<()> {
        if !std::path::Path::new(model_path).exists() {
            return Err(anyhow!("Kokoro model not found at {}", model_path));
        }
        if !std::path::Path::new(voices_path).exists() {
            return Err(anyhow!("Voices pack not found at {}", voices_path));
        }

        let session = SessionBuilder::new()
            .map_err(|e| anyhow!("ort session builder failed: {e}"))?
            .commit_from_file(model_path)
            .map_err(|e| anyhow!("Failed to load ONNX model: {e}"))?;

        let bytes = std::fs::read(voices_path)
            .map_err(|e| anyhow!("Failed to read voices pack: {e}"))?;

        self.session = Some(session);
        self.voices_bytes = Some(bytes);
        self.voice = voice_name.to_string();
        log::info!("Kokoro model loaded (voice={})", self.voice);
        Ok(())
    }

    #[cfg(not(feature = "voice"))]
    pub fn load_model(
        &mut self,
        _model_path: &str,
        _voices_path: &str,
        _voice_name: &str,
    ) -> Result<()> {
        Err(anyhow!(
            "TTS disabled: rebuild with `--features voice` to enable Kokoro ONNX"
        ))
    }

    pub fn set_voice(&mut self, voice: &str) {
        self.voice = voice.to_string();
    }

    pub fn set_speed(&mut self, speed: f32) {
        self.speed = speed.clamp(0.5, 2.0);
    }

    /// Synthesize `text` to 24kHz mono f32 samples.
    ///
    /// Currently returns silence proportional to text length while the
    /// phonemizer + ort inference glue is being written. The rest of the
    /// pipeline is wired and will start emitting real audio the moment
    /// this method is upgraded.
    pub fn generate(&self, text: &str) -> Result<Vec<f32>> {
        if !self.is_ready() {
            let num_samples = (self.sample_rate as usize) / 10;
            return Ok(vec![0.0f32; num_samples]);
        }

        let ms_per_char = 60;
        let duration_ms = ((text.chars().count().max(1) * ms_per_char) as u32).min(8000);
        let num_samples = (self.sample_rate as usize * duration_ms as usize) / 1000;
        log::info!(
            "Kokoro TTS (placeholder) — {} chars → {}ms silence",
            text.chars().count(),
            duration_ms
        );
        Ok(vec![0.0f32; num_samples])
    }
}

impl Default for KokoroEngine {
    fn default() -> Self {
        Self::new()
    }
}
