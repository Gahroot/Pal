//! RMS (Root Mean Square) audio level computation with adaptive noise floor.
//!
//! Ported from the Swift VoiceWakeRuntime / TalkModeRuntime pattern:
//!   - noiseFloorRMS starts at 1e-4
//!   - Adaptive alpha: fast (0.08) when quiet, slow (0.01) when loud
//!   - Speech threshold = max(minSpeechRMS, noiseFloor * speechBoostFactor)

use std::time::Instant;

/// Result of processing an audio buffer through the RMS pipeline.
#[derive(Debug, Clone)]
pub struct RmsResult {
    /// Raw RMS value of the buffer.
    pub rms: f64,
    /// Whether the buffer is classified as speech.
    pub is_speech: bool,
    /// True only once: the first time speech is detected in a session.
    pub first_speech: bool,
    /// True when silence has been detected after speech occurred.
    pub silence_detected: bool,
}

/// Adaptive RMS processor with noise floor tracking and speech detection.
///
/// Mirrors the Swift implementation in VoiceWakeRuntime.swift:
/// ```swift
/// let alpha: Double = rms < self.noiseFloorRMS ? 0.08 : 0.01
/// self.noiseFloorRMS = max(1e-7, self.noiseFloorRMS + (rms - self.noiseFloorRMS) * alpha)
/// let threshold = max(self.minSpeechRMS, self.noiseFloorRMS * self.speechBoostFactor)
/// ```
pub struct RmsProcessor {
    /// Current adaptive noise floor estimate.
    pub noise_floor: f64,
    /// Minimum RMS to consider as speech (absolute floor).
    pub min_speech_rms: f64,
    /// Multiplier above noise floor to set speech threshold.
    pub speech_boost_factor: f64,
    /// Fast adaptation rate (when RMS is below noise floor).
    pub noise_alpha_fast: f64,
    /// Slow adaptation rate (when RMS is above noise floor).
    pub noise_alpha_slow: f64,
    /// Last time speech energy was detected.
    pub last_speech_time: Option<Instant>,
    /// Whether the first-speech event has already been fired.
    pub first_speech_fired: bool,
    /// Whether any speech has been detected in this session.
    pub has_spoken: bool,
    /// Duration of silence (after speech) before declaring silence detected.
    silence_duration: std::time::Duration,
}

impl Default for RmsProcessor {
    fn default() -> Self {
        Self {
            noise_floor: 1e-4,
            min_speech_rms: 5e-4,
            speech_boost_factor: 3.0,
            noise_alpha_fast: 0.08,
            noise_alpha_slow: 0.01,
            last_speech_time: None,
            first_speech_fired: false,
            has_spoken: false,
            silence_duration: std::time::Duration::from_secs(2),
        }
    }
}

impl RmsProcessor {
    /// Create a new processor with a custom silence duration.
    pub fn with_silence_duration(mut self, dur: std::time::Duration) -> Self {
        self.silence_duration = dur;
        self
    }

    /// Compute the RMS (root mean square) of a sample buffer.
    pub fn compute_rms(samples: &[f32]) -> f64 {
        if samples.is_empty() {
            return 0.0;
        }
        let sum_sq: f64 = samples.iter().map(|&s| (s as f64) * (s as f64)).sum();
        (sum_sq / samples.len() as f64).sqrt()
    }

    /// Update the adaptive noise floor using the current RMS value.
    ///
    /// Uses fast alpha (0.08) when RMS is below noise floor (quiet environment
    /// adapts quickly downward) and slow alpha (0.01) when above (avoids
    /// tracking speech energy as noise).
    pub fn update_noise_floor(&mut self, rms: f64) {
        let alpha = if rms < self.noise_floor {
            self.noise_alpha_fast
        } else {
            self.noise_alpha_slow
        };
        self.noise_floor = f64::max(1e-7, self.noise_floor + (rms - self.noise_floor) * alpha);
    }

    /// Current speech threshold: the higher of the absolute minimum and the
    /// adaptive noise floor scaled by the boost factor.
    pub fn speech_threshold(&self) -> f64 {
        f64::max(self.min_speech_rms, self.noise_floor * self.speech_boost_factor)
    }

    /// Check whether the given RMS value exceeds the speech threshold.
    pub fn is_speech(&self, rms: f64) -> bool {
        rms >= self.speech_threshold()
    }

    /// Process a buffer of audio samples and return an `RmsResult`.
    pub fn process_buffer(&mut self, samples: &[f32]) -> RmsResult {
        let rms = Self::compute_rms(samples);
        self.update_noise_floor(rms);

        let is_speech = self.is_speech(rms);
        let now = Instant::now();

        let mut first_speech = false;
        if is_speech {
            self.last_speech_time = Some(now);
            self.has_spoken = true;
            if !self.first_speech_fired {
                self.first_speech_fired = true;
                first_speech = true;
            }
        }

        // Silence detection: speech occurred previously, and we've been quiet
        // for longer than the silence window.
        let silence_detected = if self.has_spoken && !is_speech {
            self.last_speech_time
                .map(|t| now.duration_since(t) >= self.silence_duration)
                .unwrap_or(false)
        } else {
            false
        };

        RmsResult {
            rms,
            is_speech,
            first_speech,
            silence_detected,
        }
    }

    /// Reset the processor state for a new session, keeping the noise floor.
    pub fn reset(&mut self) {
        self.last_speech_time = None;
        self.first_speech_fired = false;
        self.has_spoken = false;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_compute_rms_silence() {
        let silence = vec![0.0f32; 1024];
        assert_eq!(RmsProcessor::compute_rms(&silence), 0.0);
    }

    #[test]
    fn test_compute_rms_signal() {
        // A constant signal of 0.5 should have RMS of 0.5
        let signal = vec![0.5f32; 1024];
        let rms = RmsProcessor::compute_rms(&signal);
        assert!((rms - 0.5).abs() < 1e-6);
    }

    #[test]
    fn test_speech_detection() {
        let mut proc = RmsProcessor::default();
        // Loud signal should be detected as speech
        let loud = vec![0.1f32; 1024];
        let result = proc.process_buffer(&loud);
        assert!(result.is_speech);
        assert!(result.first_speech);
    }

    #[test]
    fn test_noise_floor_adapts_down() {
        let mut proc = RmsProcessor::default();
        // Feed very quiet samples to push noise floor down
        let quiet = vec![1e-6_f32; 1024];
        for _ in 0..100 {
            proc.process_buffer(&quiet);
        }
        assert!(proc.noise_floor < 1e-4);
    }

    #[test]
    fn test_empty_samples() {
        assert_eq!(RmsProcessor::compute_rms(&[]), 0.0);
    }
}
