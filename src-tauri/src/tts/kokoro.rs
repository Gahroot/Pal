//! Kokoro TTS engine placeholder.
//!
//! Mirrors the Swift KokoroManager pattern:
//! ```swift
//! func generateAudioBufferOffMain(text: String) async -> AVAudioPCMBuffer? { ... }
//! ```
//!
//! TODO: Integrate the actual Kokoro ONNX model via ort crate when
//! C++ build tools are available.

use anyhow::Result;

/// Placeholder Kokoro TTS engine.
///
/// When fully implemented, this will load the Kokoro ONNX model and
/// generate speech audio from text. For now it returns silence.
pub struct KokoroEngine {
    /// Output sample rate (Kokoro generates at 24kHz).
    sample_rate: u32,
}

impl KokoroEngine {
    pub fn new() -> Self {
        Self { sample_rate: 24_000 }
    }

    /// The sample rate of generated audio.
    pub fn sample_rate(&self) -> u32 {
        self.sample_rate
    }

    /// Generate audio samples from text.
    ///
    /// TODO: Load and run the Kokoro ONNX model.
    /// For now, returns a short silence buffer (100ms).
    pub fn generate(&self, text: &str) -> Result<Vec<f32>> {
        log::debug!("KokoroEngine::generate(text={:?}) - placeholder", text);
        // Return 100ms of silence at 24kHz.
        let num_samples = (self.sample_rate as usize) / 10;
        Ok(vec![0.0f32; num_samples])
    }

    /// Check if the model is loaded and ready.
    ///
    /// TODO: Will return true once the ONNX model is loaded.
    pub fn is_ready(&self) -> bool {
        false
    }
}

impl Default for KokoroEngine {
    fn default() -> Self {
        Self::new()
    }
}
