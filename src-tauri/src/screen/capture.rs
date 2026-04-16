//! Screen capture module.
//!
//! Mirrors the Swift ScreenshotTool pattern using platform-native APIs:
//! - macOS: CGWindowListCreateImage (in the Swift original)
//! - Windows: Desktop Duplication API (TODO)
//! - Linux: scrot / gnome-screenshot fallback for development
//!
//! Output is JPEG or PNG encoded via the `image` crate.
//! Images wider than 2560px are downscaled to reduce token usage.

use anyhow::{Context, Result};
use image::DynamicImage;

/// Maximum width before downscaling.
const MAX_WIDTH: u32 = 2560;

/// Capture a screenshot of the specified display.
///
/// # Arguments
/// - `display`: Display index (0 = primary). Currently ignored on Linux.
/// - `format`: "jpeg" or "png".
/// - `quality`: JPEG quality 1-100 (ignored for PNG).
///
/// # Returns
/// Tuple of (encoded_bytes, width, height).
pub fn capture_screen(display: u32, format: &str, quality: u8) -> Result<(Vec<u8>, u32, u32)> {
    let img = capture_raw(display)?;

    // Downscale if too wide.
    let img = if img.width() > MAX_WIDTH {
        let scale = MAX_WIDTH as f64 / img.width() as f64;
        let new_h = (img.height() as f64 * scale) as u32;
        log::info!(
            "Downscaling screenshot from {}x{} to {}x{}",
            img.width(),
            img.height(),
            MAX_WIDTH,
            new_h
        );
        img.resize(MAX_WIDTH, new_h, image::imageops::FilterType::Lanczos3)
    } else {
        img
    };

    let width = img.width();
    let height = img.height();
    let encoded = encode_image(&img, format, quality)?;

    Ok((encoded, width, height))
}

/// Encode a DynamicImage to bytes in the requested format.
fn encode_image(img: &DynamicImage, format: &str, quality: u8) -> Result<Vec<u8>> {
    let mut buf = Vec::new();
    let mut cursor = std::io::Cursor::new(&mut buf);

    match format.to_lowercase().as_str() {
        "jpeg" | "jpg" => {
            let encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(&mut cursor, quality);
            img.write_with_encoder(encoder)
                .context("Failed to encode JPEG")?;
        }
        "png" => {
            let encoder = image::codecs::png::PngEncoder::new(&mut cursor);
            img.write_with_encoder(encoder)
                .context("Failed to encode PNG")?;
        }
        _ => anyhow::bail!("Unsupported image format: {}", format),
    }

    Ok(buf)
}

/// Platform-specific raw screen capture.
#[cfg(target_os = "windows")]
fn capture_raw(_display: u32) -> Result<DynamicImage> {
    // TODO: Implement using Desktop Duplication API (DXGI) via windows-rs:
    // 1. Create ID3D11Device + IDXGIOutputDuplication
    // 2. AcquireNextFrame
    // 3. Map the texture to CPU-readable memory
    // 4. Convert BGRA to RGBA DynamicImage
    //
    // For now, fall back to a simple approach or error.
    anyhow::bail!(
        "Windows screen capture not yet implemented. \
         Needs windows-rs with DXGI Desktop Duplication API."
    )
}

#[cfg(not(target_os = "windows"))]
fn capture_raw(display: u32) -> Result<DynamicImage> {
    // Linux fallback: use scrot or gnome-screenshot.
    use std::process::Command;

    let tmp_path = format!("/tmp/tama_screenshot_{}.png", uuid::Uuid::new_v4());

    // Try scrot first (common on X11).
    let result = Command::new("scrot").arg(&tmp_path).output();

    match result {
        Ok(output) if output.status.success() => {
            let img = image::open(&tmp_path).context("Failed to open screenshot")?;
            let _ = std::fs::remove_file(&tmp_path);
            return Ok(img);
        }
        _ => {}
    }

    // Try gnome-screenshot.
    let result = Command::new("gnome-screenshot")
        .args(["-f", &tmp_path])
        .output();

    match result {
        Ok(output) if output.status.success() => {
            let img = image::open(&tmp_path).context("Failed to open screenshot")?;
            let _ = std::fs::remove_file(&tmp_path);
            return Ok(img);
        }
        _ => {}
    }

    // Try grim (Wayland).
    let result = Command::new("grim").arg(&tmp_path).output();

    match result {
        Ok(output) if output.status.success() => {
            let img = image::open(&tmp_path).context("Failed to open screenshot")?;
            let _ = std::fs::remove_file(&tmp_path);
            return Ok(img);
        }
        _ => {}
    }

    let _ = display; // suppress unused warning
    anyhow::bail!(
        "No screenshot tool available. Install scrot, gnome-screenshot, or grim."
    )
}
