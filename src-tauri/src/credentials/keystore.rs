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

// ── Windows implementation ──────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn load_key() -> Result<[u8; 32]> {
    // TODO: Implement using windows-rs:
    // use windows::Win32::Security::Credentials::{CredReadW, CRED_TYPE_GENERIC};
    //
    // let mut cred_ptr = std::ptr::null_mut();
    // unsafe {
    //     CredReadW(credential_name, CRED_TYPE_GENERIC, 0, &mut cred_ptr)?;
    //     let cred = &*cred_ptr;
    //     let blob = std::slice::from_raw_parts(
    //         cred.CredentialBlob, cred.CredentialBlobSize as usize
    //     );
    //     // Copy 32 bytes from blob
    //     CredFree(cred_ptr as _);
    // }
    anyhow::bail!("Windows credential loading not yet implemented")
}

#[cfg(target_os = "windows")]
fn store_key(_key: &[u8; 32]) -> Result<()> {
    // TODO: Implement using windows-rs:
    // use windows::Win32::Security::Credentials::{CredWriteW, CRED_TYPE_GENERIC, CREDENTIALW};
    anyhow::bail!("Windows credential storing not yet implemented")
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
