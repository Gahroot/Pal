//! System audio muter.
//!
//! Mirrors the Swift SystemAudioMuter pattern:
//! - muteSystemOutput(): mute the default output device
//! - unmuteSystemOutput(): restore only if we were the ones who muted
//! - Track `did_mute` to avoid unmuting user-intentional mutes
//!
//! On Windows: uses IAudioEndpointVolume via windows-rs.
//! On Linux: stub (muting not needed for development).
//!
//! Retained for future wiring from `AudioCapture::start` when `mute_system`
//! is set. Currently unused, hence the allow.

#![allow(dead_code)]

/// System audio muter that tracks whether it caused the mute.
pub struct SystemAudioMuter {
    /// Whether this instance is responsible for the current mute state.
    did_mute: bool,
}

impl SystemAudioMuter {
    pub fn new() -> Self {
        Self { did_mute: false }
    }

    /// Mute the system audio output.
    ///
    /// On Windows, uses IAudioEndpointVolume COM interface.
    /// On Linux, this is a no-op stub for development.
    pub fn mute(&mut self) -> anyhow::Result<()> {
        #[cfg(target_os = "windows")]
        {
            self.mute_windows()?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            log::debug!("SystemAudioMuter::mute() - no-op on this platform");
        }

        self.did_mute = true;
        Ok(())
    }

    /// Unmute the system audio output, but only if we were the ones who muted.
    pub fn unmute(&mut self) -> anyhow::Result<()> {
        if !self.did_mute {
            log::debug!("SystemAudioMuter::unmute() - skipping, we didn't mute");
            return Ok(());
        }

        #[cfg(target_os = "windows")]
        {
            self.unmute_windows()?;
        }

        #[cfg(not(target_os = "windows"))]
        {
            log::debug!("SystemAudioMuter::unmute() - no-op on this platform");
        }

        self.did_mute = false;
        Ok(())
    }

    /// Whether this muter instance is currently responsible for a mute.
    pub fn is_muted_by_us(&self) -> bool {
        self.did_mute
    }

    // ── Windows implementation ──────────────────────────────────────────

    #[cfg(target_os = "windows")]
    fn mute_windows(&self) -> anyhow::Result<()> {
        // TODO: Implement using windows-rs crate:
        // 1. CoCreateInstance for MMDeviceEnumerator
        // 2. GetDefaultAudioEndpoint(eRender, eConsole)
        // 3. Activate IAudioEndpointVolume
        // 4. Check GetMute() first (don't mute if user already muted)
        // 5. SetMute(true)
        //
        // use windows::Win32::Media::Audio::{
        //     IAudioEndpointVolume, IMMDeviceEnumerator, MMDeviceEnumerator,
        //     eRender, eConsole,
        // };
        // use windows::Win32::System::Com::{CoCreateInstance, CLSCTX_ALL};
        log::info!("SystemAudioMuter: muting system audio (Windows)");
        anyhow::bail!("Windows audio muting not yet implemented - needs windows-rs crate")
    }

    #[cfg(target_os = "windows")]
    fn unmute_windows(&self) -> anyhow::Result<()> {
        log::info!("SystemAudioMuter: unmuting system audio (Windows)");
        anyhow::bail!("Windows audio unmuting not yet implemented - needs windows-rs crate")
    }
}

impl Default for SystemAudioMuter {
    fn default() -> Self {
        Self::new()
    }
}
