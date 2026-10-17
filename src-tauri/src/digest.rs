//! SHA-256, via the Windows cryptography API (CNG).
//!
//! Why not a crate: the only thing Miro needs a hash for is verifying a model
//! file it just downloaded, and Windows provides SHA-256 once, signed and
//! serviced by the platform. Adding a cryptography dependency for that would be
//! more code to audit, not less.
//!
//! The known-answer test at the bottom is the whole point: it pins the FIPS
//! 180-4 vector for "abc", so a mistake in the FFI plumbing cannot pass silently.

use std::fs;
use std::io::Read;
use std::path::Path;

use windows::Win32::Foundation::NTSTATUS;
use windows::Win32::Security::Cryptography::{
    BCryptCloseAlgorithmProvider, BCryptCreateHash, BCryptDestroyHash, BCryptFinishHash,
    BCryptHashData, BCryptOpenAlgorithmProvider, BCRYPT_ALG_HANDLE, BCRYPT_HASH_HANDLE,
    BCRYPT_OPEN_ALGORITHM_PROVIDER_FLAGS, BCRYPT_SHA256_ALGORITHM,
};

use crate::errors::{Failure, Result};

const SHA256_LENGTH: usize = 32;

/// An incremental SHA-256 that owns its CNG handles.
pub struct Sha256 {
    algorithm: BCRYPT_ALG_HANDLE,
    hash: BCRYPT_HASH_HANDLE,
    finished: bool,
}

/// CNG reports its outcome as an `NTSTATUS`: zero or positive is success, a
/// negative value is the error code. windows 0.62 hands the raw status back
/// instead of a `Result`, so it is translated once, here.
fn status_ok(status: NTSTATUS, what: &str) -> Result<()> {
    if status.0 >= 0 {
        Ok(())
    } else {
        Err(Failure::Internal(format!(
            "{what}: NTSTATUS 0x{:08X}",
            status.0 as u32
        )))
    }
}

impl Sha256 {
    pub fn new() -> Result<Self> {
        let mut algorithm = BCRYPT_ALG_HANDLE::default();
        status_ok(
            unsafe {
                BCryptOpenAlgorithmProvider(
                    &mut algorithm,
                    BCRYPT_SHA256_ALGORITHM,
                    None,
                    BCRYPT_OPEN_ALGORITHM_PROVIDER_FLAGS(0),
                )
            },
            "open sha256 provider",
        )?;

        let mut hash = BCRYPT_HASH_HANDLE::default();
        // A null object buffer lets CNG allocate the working state itself.
        let created = unsafe { BCryptCreateHash(algorithm, &mut hash, None, None, 0) };
        if let Err(error) = status_ok(created, "create sha256 state") {
            unsafe {
                let _ = BCryptCloseAlgorithmProvider(algorithm, 0);
            }
            return Err(error);
        }

        Ok(Self {
            algorithm,
            hash,
            finished: false,
        })
    }

    pub fn update(&mut self, data: &[u8]) -> Result<()> {
        if data.is_empty() {
            return Ok(());
        }
        status_ok(
            unsafe { BCryptHashData(self.hash, data, 0) },
            "sha256 update",
        )
    }

    pub fn finish(mut self) -> Result<[u8; SHA256_LENGTH]> {
        let mut digest = [0u8; SHA256_LENGTH];
        status_ok(
            unsafe { BCryptFinishHash(self.hash, &mut digest, 0) },
            "sha256 finish",
        )?;
        self.finished = true;
        Ok(digest)
    }
}

impl Drop for Sha256 {
    fn drop(&mut self) {
        unsafe {
            let _ = BCryptDestroyHash(self.hash);
            let _ = BCryptCloseAlgorithmProvider(self.algorithm, 0);
        }
    }
}

pub fn to_hex(bytes: &[u8]) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let mut out = String::with_capacity(bytes.len() * 2);
    for byte in bytes {
        out.push(HEX[(byte >> 4) as usize] as char);
        out.push(HEX[(byte & 0x0f) as usize] as char);
    }
    out
}

pub fn sha256_bytes(data: &[u8]) -> Result<String> {
    let mut hasher = Sha256::new()?;
    hasher.update(data)?;
    Ok(to_hex(&hasher.finish()?))
}

/// Hashes a file in 1 MiB chunks, so verifying a 1 GB model does not need 1 GB
/// of memory.
pub fn sha256_file(path: &Path) -> Result<String> {
    let mut file = fs::File::open(path).map_err(|e| Failure::ModelFileMissing(e.to_string()))?;
    let mut hasher = Sha256::new()?;
    let mut buffer = vec![0u8; 1024 * 1024];

    loop {
        let read = file
            .read(&mut buffer)
            .map_err(|e| Failure::Internal(format!("read for hashing: {e}")))?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read])?;
    }

    Ok(to_hex(&hasher.finish()?))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    /// FIPS 180-4 / RFC 6234 vectors.
    #[test]
    fn known_answers_match_the_standard() {
        assert_eq!(
            sha256_bytes(b"").unwrap(),
            "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
        assert_eq!(
            sha256_bytes(b"abc").unwrap(),
            "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
        );
        assert_eq!(
            sha256_bytes(b"abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq").unwrap(),
            "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1"
        );
    }

    #[test]
    fn incremental_updates_equal_a_single_update() {
        let mut hasher = Sha256::new().unwrap();
        hasher.update(b"ab").unwrap();
        hasher.update(b"").unwrap();
        hasher.update(b"c").unwrap();
        let incremental = to_hex(&hasher.finish().unwrap());

        assert_eq!(incremental, sha256_bytes(b"abc").unwrap());
    }

    #[test]
    fn a_long_message_spanning_many_chunks_is_hashed_correctly() {
        // One million 'a' characters is the classic long-message vector.
        let data = vec![b'a'; 1_000_000];
        assert_eq!(
            sha256_bytes(&data).unwrap(),
            "cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0"
        );
    }

    #[test]
    fn hashing_a_file_matches_hashing_its_bytes() {
        let path =
            std::env::temp_dir().join(format!("miro-digest-test-{}.bin", std::process::id()));
        let mut file = fs::File::create(&path).unwrap();
        file.write_all(b"the quick brown fox").unwrap();
        drop(file);

        assert_eq!(
            sha256_file(&path).unwrap(),
            sha256_bytes(b"the quick brown fox").unwrap()
        );
        let _ = fs::remove_file(&path);
    }

    #[test]
    fn hex_encoding_is_lowercase_and_padded() {
        assert_eq!(to_hex(&[0x00, 0x0f, 0xff]), "000fff");
    }
}
