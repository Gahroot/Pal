//! Encryption key storage.
//!
//! Mirrors the Swift Keychain pattern for storing the encryption key:
//! - macOS: Keychain Services (in the Swift original)
//! - Windows: CredRead/CredWrite via windows-rs
//! - Linux: file-based storage at ~/.tama/encryption.key (for dev)
//!
//! The key is 32 bytes for ChaCha20-Poly1305.

use anyhow::{Context, Result};

/// The credential name used for storing the encryption key.
#[cfg(target_os = "windows")]
const CREDENTIAL_NAME: &str = "com.tama.encryption-key";

/// Get the existing encryption key, or create and store a new one.
///
/// Returns a 32-byte key suitable for ChaCha20-Poly1305.
pub fn get_or_create_key() -> Result<[u8; 32]> {
    // Try to load existing key.
    if let Ok(key) = load_key() {
        return Ok(key);
    }

    // Generate a new random key.
    let mut key = [0u8; 32];
    use rand::RngCore;
    rand::rngs::OsRng.fill_bytes(&mut key);

    // Store it.
    store_key(&key)?;
    log::info!("Generated and stored new encryption key");

    Ok(key)
}

// ── Windows implementation (Windows Credential Manager via keyring) ─────

#[cfg(target_os = "windows")]
fn keyring_entry() -> Result<keyring::Entry> {
    // User scope is the OS account — matches where Swift keychain lives on macOS.
    keyring::Entry::new(CREDENTIAL_NAME, "encryption-key")
        .context("Failed to open keyring entry")
}

#[cfg(target_os = "windows")]
fn load_key() -> Result<[u8; 32]> {
    use base64::Engine;
    let entry = keyring_entry()?;
    let encoded = entry
        .get_password()
        .context("Failed to read key from Windows Credential Manager")?;
    let data = base64::engine::general_purpose::STANDARD
        .decode(&encoded)
        .context("Keyring payload is not valid base64")?;
    if data.len() != 32 {
        anyhow::bail!("Invalid key in credential store: expected 32 bytes, got {}", data.len());
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&data);
    Ok(key)
}

#[cfg(target_os = "windows")]
fn store_key(key: &[u8; 32]) -> Result<()> {
    use base64::Engine;
    let entry = keyring_entry()?;
    let encoded = base64::engine::general_purpose::STANDARD.encode(key);
    entry
        .set_password(&encoded)
        .context("Failed to write key to Windows Credential Manager")?;
    Ok(())
}

// ── Linux implementation (file-based for development) ───────────────────

#[cfg(not(target_os = "windows"))]
fn load_key() -> Result<[u8; 32]> {
    let path = key_file_path()?;
    let data = std::fs::read(&path).context("Failed to read encryption key file")?;
    if data.len() != 32 {
        anyhow::bail!(
            "Invalid key file: expected 32 bytes, got {}",
            data.len()
        );
    }
    let mut key = [0u8; 32];
    key.copy_from_slice(&data);
    Ok(key)
}

#[cfg(not(target_os = "windows"))]
fn store_key(key: &[u8; 32]) -> Result<()> {
    let path = key_file_path()?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).context("Failed to create ~/.tama directory")?;
    }

    // Write with restrictive permissions.
    std::fs::write(&path, key).context("Failed to write encryption key file")?;

    // Set permissions to owner-only (600).
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
            .context("Failed to set key file permissions")?;
    }

    log::info!("Stored encryption key at {:?}", path);
    Ok(())
}

#[cfg(not(target_os = "windows"))]
fn key_file_path() -> Result<std::path::PathBuf> {
    let home = std::env::var("HOME").context("HOME environment variable not set")?;
    Ok(std::path::PathBuf::from(home).join(".tama").join("encryption.key"))
}
