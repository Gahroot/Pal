//! Screen capture module.
//!
//! Uses the `xcap` crate which wraps platform-native APIs:
//! - Windows: DXGI Desktop Duplication / GDI
//! - Linux: X11 / Wayland
//! - macOS: CoreGraphics (not targeted)
//!
//! Output is JPEG or PNG encoded via the `image` crate.
//! Images wider than 2560px are downscaled to reduce vision token usage.

use anyhow::{anyhow, Context, Result};
use image::{DynamicImage, RgbaImage};

/// Maximum width before downscaling.
const MAX_WIDTH: u32 = 2560;

/// Capture a screenshot of the specified display.
pub fn capture_screen(display: u32, format: &str, quality: u8) -> Result<(Vec<u8>, u32, u32)> {
    let img = capture_raw(display)?;

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

fn capture_raw(display: u32) -> Result<DynamicImage> {
    let monitors = xcap::Monitor::all().map_err(|e| anyhow!("Failed to list monitors: {e}"))?;
    if monitors.is_empty() {
        anyhow::bail!("No monitors found");
    }

    let monitor = monitors
        .get(display as usize)
        .or_else(|| monitors.iter().find(|m| m.is_primary()))
        .or_else(|| monitors.first())
        .ok_or_else(|| anyhow!("Display index {} not available", display))?;

    let captured = monitor
        .capture_image()
        .map_err(|e| anyhow!("Monitor capture failed: {e}"))?;

    // xcap uses a different `image` crate version than we do; rebuild the
    // buffer via raw bytes so the types unify.
    let (w, h) = captured.dimensions();
    let raw: Vec<u8> = captured.into_raw();
    let rgba = RgbaImage::from_raw(w, h, raw)
        .ok_or_else(|| anyhow!("Failed to reinterpret captured buffer"))?;
    Ok(DynamicImage::ImageRgba8(rgba))
}
