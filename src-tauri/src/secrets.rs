//! Secret storage for the cloud backend.
//!
//! The API key is the only secret Miro keeps. It never enters `config.json`:
//! it lives in Windows Credential Manager, and the rest of the application
//! asks this module for it only when a cloud restructure is about to run.
//!
//! `SecretStore` is a trait so the consent and gating logic can be tested
//! without touching the real credential store.

use std::collections::HashMap;
use std::sync::Mutex;

use zeroize::Zeroize;

use crate::errors::{Failure, Result};

/// Service name shown in Windows Credential Manager.
pub const SERVICE: &str = "app.miro.dictation";
/// The one account this build stores.
pub const CLOUD_API_KEY_ACCOUNT: &str = "intent-cloud-api-key";
/// A conservative ceiling; Windows caps a generic credential at 5 * 512 bytes.
const MAX_KEY_BYTES: usize = 512;

pub trait SecretStore: Send + Sync {
    fn get(&self, account: &str) -> Result<Option<String>>;
    fn set(&self, account: &str, value: &str) -> Result<()>;
    fn delete(&self, account: &str) -> Result<()>;
}

/// The application-facing handle, managed by Tauri.
pub struct Secrets {
    store: Box<dyn SecretStore>,
}

impl Secrets {
    pub fn new() -> Self {
        Self {
            store: Box::new(WindowsCredentialStore),
        }
    }

    pub fn with_store(store: Box<dyn SecretStore>) -> Self {
        Self { store }
    }

    pub fn cloud_key(&self) -> Result<Option<String>> {
        self.store.get(CLOUD_API_KEY_ACCOUNT)
    }

    /// True only when a non-empty key can actually be read.
    pub fn cloud_key_present(&self) -> bool {
        self.cloud_key()
            .ok()
            .flatten()
            .map(|key| !key.trim().is_empty())
            .unwrap_or(false)
    }

    pub fn set_cloud_key(&self, key: &str) -> Result<()> {
        let key = key.trim();
        if key.is_empty() {
            return Err(Failure::CloudKeyMissing);
        }
        if key.len() > MAX_KEY_BYTES {
            return Err(Failure::Keychain("the API key is too long".into()));
        }
        self.store.set(CLOUD_API_KEY_ACCOUNT, key)
    }

    pub fn clear_cloud_key(&self) -> Result<()> {
        self.store.delete(CLOUD_API_KEY_ACCOUNT)
    }
}

impl Default for Secrets {
    fn default() -> Self {
        Self::new()
    }
}

#[cfg(windows)]
pub struct WindowsCredentialStore;

#[cfg(windows)]
impl SecretStore for WindowsCredentialStore {
    fn get(&self, account: &str) -> Result<Option<String>> {
        use std::ffi::c_void;
        use windows::core::PCWSTR;
        use windows::Win32::Security::Credentials::{CredFree, CredReadW, CREDENTIALW, CRED_TYPE_GENERIC};

        let target = wide_target(account);
        let mut credential: *mut CREDENTIALW = std::ptr::null_mut();
        let result =
            unsafe { CredReadW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None, &mut credential) };

        match result {
            Ok(()) => {
                if credential.is_null() {
                    return Ok(None);
                }
                let stored = unsafe { &*credential };
                let bytes = unsafe {
                    std::slice::from_raw_parts(
                        stored.CredentialBlob,
                        stored.CredentialBlobSize as usize,
                    )
                };
                let value = String::from_utf8_lossy(bytes).into_owned();
                unsafe { CredFree(credential as *const c_void) };
                Ok(Some(value))
            }
            Err(error) if is_not_found(&error) => Ok(None),
            Err(error) => Err(Failure::Keychain(format!("read: {error}"))),
        }
    }

    fn set(&self, account: &str, value: &str) -> Result<()> {
        use windows::core::PWSTR;
        use windows::Win32::Security::Credentials::{
            CredWriteW, CREDENTIALW, CRED_PERSIST_LOCAL_MACHINE, CRED_TYPE_GENERIC,
        };

        let mut target = wide_target(account);
        let mut user = wide("miro");
        let mut blob = value.as_bytes().to_vec();
        let credential = CREDENTIALW {
            Type: CRED_TYPE_GENERIC,
            TargetName: PWSTR(target.as_mut_ptr()),
            CredentialBlobSize: blob.len() as u32,
            CredentialBlob: blob.as_mut_ptr(),
            Persist: CRED_PERSIST_LOCAL_MACHINE,
            UserName: PWSTR(user.as_mut_ptr()),
            ..Default::default()
        };

        let result = unsafe { CredWriteW(&credential, 0) };
        blob.zeroize();
        result.map_err(|error| Failure::Keychain(format!("write: {error}")))
    }

    fn delete(&self, account: &str) -> Result<()> {
        use windows::core::PCWSTR;
        use windows::Win32::Security::Credentials::{CredDeleteW, CRED_TYPE_GENERIC};

        let target = wide_target(account);
        match unsafe { CredDeleteW(PCWSTR(target.as_ptr()), CRED_TYPE_GENERIC, None) } {
            Ok(()) => Ok(()),
            Err(error) if is_not_found(&error) => Ok(()),
            Err(error) => Err(Failure::Keychain(format!("delete: {error}"))),
        }
    }
}

#[cfg(windows)]
fn wide_target(account: &str) -> Vec<u16> {
    wide(&format!("{SERVICE}:{account}"))
}

#[cfg(windows)]
fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

/// `HRESULT_FROM_WIN32(ERROR_NOT_FOUND)`; the credential simply is not there.
#[cfg(windows)]
fn is_not_found(error: &windows::core::Error) -> bool {
    error.code().0 == 0x8007_0490u32 as i32
}

#[cfg(not(windows))]
pub struct WindowsCredentialStore;

#[cfg(not(windows))]
impl SecretStore for WindowsCredentialStore {
    fn get(&self, _account: &str) -> Result<Option<String>> {
        Err(Failure::Keychain("this platform has no credential store".into()))
    }

    fn set(&self, _account: &str, _value: &str) -> Result<()> {
        Err(Failure::Keychain("this platform has no credential store".into()))
    }

    fn delete(&self, _account: &str) -> Result<()> {
        Err(Failure::Keychain("this platform has no credential store".into()))
    }
}

/// In-memory store for tests and the preview harness.
#[derive(Default)]
pub struct MemorySecretStore {
    values: Mutex<HashMap<String, String>>,
}

impl SecretStore for MemorySecretStore {
    fn get(&self, account: &str) -> Result<Option<String>> {
        Ok(self
            .values
            .lock()
            .map_err(|_| Failure::Keychain("the in-memory store was poisoned".into()))?
            .get(account)
            .cloned())
    }

    fn set(&self, account: &str, value: &str) -> Result<()> {
        self.values
            .lock()
            .map_err(|_| Failure::Keychain("the in-memory store was poisoned".into()))?
            .insert(account.to_string(), value.to_string());
        Ok(())
    }

    fn delete(&self, account: &str) -> Result<()> {
        self.values
            .lock()
            .map_err(|_| Failure::Keychain("the in-memory store was poisoned".into()))?
            .remove(account);
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secrets() -> Secrets {
        Secrets::with_store(Box::new(MemorySecretStore::default()))
    }

    #[test]
    fn a_key_round_trips_and_can_be_cleared() {
        let secrets = secrets();
        assert!(!secrets.cloud_key_present());

        secrets.set_cloud_key("  sk-test-123  ").unwrap();
        assert!(secrets.cloud_key_present());
        assert_eq!(secrets.cloud_key().unwrap().as_deref(), Some("sk-test-123"));

        secrets.clear_cloud_key().unwrap();
        assert!(!secrets.cloud_key_present());
        // Clearing twice is not an error: a missing credential is the goal.
        secrets.clear_cloud_key().unwrap();
    }

    #[test]
    fn an_empty_key_is_never_stored() {
        let secrets = secrets();
        assert!(matches!(
            secrets.set_cloud_key("   "),
            Err(Failure::CloudKeyMissing)
        ));
        assert!(!secrets.cloud_key_present());
    }

    #[test]
    fn a_key_larger_than_the_credential_limit_is_refused() {
        let secrets = secrets();
        let oversized = "k".repeat(MAX_KEY_BYTES + 1);
        assert!(matches!(
            secrets.set_cloud_key(&oversized),
            Err(Failure::Keychain(_))
        ));
    }
}