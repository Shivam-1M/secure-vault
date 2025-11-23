// --- File: src-tauri/src/core_logic.rs ---
// We've moved all the functions and structs into this file.

// --- Imports ---
use aes_gcm::{
    aead::{Aead, KeyInit},
    Aes256Gcm, Nonce,
};
use argon2::Argon2;
use rand::{seq::IndexedRandom, Rng};
use serde::{Deserialize, Serialize};
use std::fs::File;
use std::io::{Read, Write};

use zxcvbn::zxcvbn;

// --- Data Structures ---
#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Entry {
    pub title: String,
    pub username: String,
    pub password_hash: String, // In a real app, this might be encrypted field
    pub url: String,
    pub notes: String,
    pub folder: String,
}

#[derive(Serialize, Deserialize, Debug, PartialEq, Clone)]
pub struct Vault {
    pub entries: Vec<Entry>,
}

// --- Helper Functions (Crypto) ---

fn derive_key(password: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let argon2 = Argon2::default();
    let mut key_bytes = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), salt, &mut key_bytes)
        .map_err(|e| format!("Failed to derive key: {}", e))?;
    Ok(key_bytes)
}

// --- Tauri Commands ---

#[tauri::command]
pub fn generate_password(
    length: usize,
    use_uppercase: bool,
    use_numbers: bool,
    use_symbols: bool,
    exclude_chars: String,
) -> String {
    let mut charset = "abcdefghijklmnopqrstuvwxyz".to_string();
    if use_uppercase {
        charset.push_str("ABCDEFGHIJKLMNOPQRSTUVWXYZ");
    }
    if use_numbers {
        charset.push_str("0123456789");
    }
    if use_symbols {
        charset.push_str("!@#$%^&*()_+-=[]{}");
    }

    // Filter out excluded characters
    let charset: String = charset
        .chars()
        .filter(|c| !exclude_chars.contains(*c))
        .collect();

    if charset.is_empty() {
        return "Error: Empty charset".to_string();
    }

    let mut rng = rand::rng(); // Changed from rand::rng() to rand::thread_rng() for correctness
    let password_chars: Vec<char> = charset.chars().collect();

    // Sample with replacement
    (0..length)
        .map(|_| {
            *password_chars
                .choose(&mut rng)
                .expect("Charset should not be empty")
        })
        .collect()
}

#[tauri::command]
pub fn generate_passphrase(word_count: usize, separator: String) -> String {
    let mut rng = rand::rng();
    if crate::wordlist::WORDLIST.is_empty() {
        return "Error: Wordlist is empty".to_string();
    }
    (0..word_count)
        .map(|_| {
            *crate::wordlist::WORDLIST
                .choose(&mut rng)
                .expect("Wordlist should not be empty")
        })
        .collect::<Vec<&str>>()
        .join(&separator)
}

#[tauri::command]
pub fn check_password_strength(password: String) -> u8 {
    let estimate = zxcvbn(&password, &[]);
    estimate.score() as u8
}

#[tauri::command]
pub fn save_vault(path: String, password: String, vault: Vault) -> Result<(), String> {
    // 1. Serialize the vault
    let plaintext_json = serde_json::to_string(&vault).map_err(|e| e.to_string())?;

    // 2. Generate Salt
    let salt: [u8; 16] = rand::rng().random();

    // 3. Derive Key
    let key = derive_key(&password, &salt)?;

    // 4. Encrypt
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce_bytes: [u8; 12] = rand::rng().random();
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ciphertext = cipher
        .encrypt(nonce, plaintext_json.as_bytes())
        .map_err(|e| e.to_string())?;

    // 5. Write to file (Format: Salt + Nonce + Ciphertext)
    let mut file = File::create(path).map_err(|e| e.to_string())?;
    file.write_all(&salt).map_err(|e| e.to_string())?;
    file.write_all(&nonce_bytes).map_err(|e| e.to_string())?;
    file.write_all(&ciphertext).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn load_vault(path: String, password: String) -> Result<Vault, String> {
    // 1. Read file
    let mut file = File::open(path).map_err(|e| e.to_string())?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer).map_err(|e| e.to_string())?;

    if buffer.len() < 16 + 12 {
        return Err("File too short to be a valid vault".to_string());
    }

    // 2. Extract parts
    let salt = &buffer[0..16];
    let nonce_bytes = &buffer[16..28];
    let ciphertext = &buffer[28..];

    // 3. Derive Key
    let key = derive_key(&password, salt)?;

    // 4. Decrypt
    let cipher = Aes256Gcm::new_from_slice(&key).map_err(|e| e.to_string())?;
    let nonce = Nonce::from_slice(nonce_bytes);
    let plaintext_bytes = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|_| "Decryption failed. Wrong password?".to_string())?;

    // 5. Deserialize
    let vault: Vault = serde_json::from_slice(&plaintext_bytes).map_err(|e| e.to_string())?;

    Ok(vault)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_check_password_strength() {
        assert_eq!(check_password_strength("password".to_string()), 0);
        assert_eq!(
            check_password_strength("correct horse battery staple".to_string()),
            4
        );
    }

    #[test]
    fn test_generate_password_exclusions() {
        let password = generate_password(100, false, true, false, "0123456789".to_string());
        assert!(!password.chars().any(|c| c.is_numeric()));
    }
}
