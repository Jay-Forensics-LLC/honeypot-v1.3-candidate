/**
 * Evidence Locker Cryptography Utilities
 * Client-side AES-256-GCM encryption with PBKDF2 key derivation
 * 
 * SECURITY: All encryption happens in the browser
 * Server only stores ciphertext, never sees plaintext or keys
 */

const PBKDF2_ITERATIONS = 310000; // OWASP recommended minimum for 2024
const SALT_LENGTH = 16; // 128 bits
const IV_LENGTH = 12; // 96 bits for GCM
const KEY_LENGTH = 256; // AES-256

export class EvidenceLockerCrypto {
  /**
   * Derive encryption key from passphrase using PBKDF2
   */
  static async deriveKey(passphrase, salt) {
    const encoder = new TextEncoder();
    const passphraseKey = await crypto.subtle.importKey(
      'raw',
      encoder.encode(passphrase),
      'PBKDF2',
      false,
      ['deriveBits', 'deriveKey']
    );

    return await crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt: salt,
        iterations: PBKDF2_ITERATIONS,
        hash: 'SHA-256'
      },
      passphraseKey,
      { name: 'AES-GCM', length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /**
   * Encrypt file with AES-256-GCM
   * Returns: { ciphertext: ArrayBuffer, salt: Uint8Array, iv: Uint8Array }
   */
  static async encryptFile(file, passphrase) {
    // Generate random salt and IV
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));

    // Derive key from passphrase
    const key = await this.deriveKey(passphrase, salt);

    // Read file as ArrayBuffer
    const plaintext = await file.arrayBuffer();

    // Encrypt
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv },
      key,
      plaintext
    );

    return {
      ciphertext,
      salt,
      iv,
      originalName: file.name,
      originalSize: file.size,
      originalType: file.type
    };
  }

  /**
   * Decrypt file with AES-256-GCM
   * Returns: Blob with original file data
   */
  static async decryptFile(ciphertext, salt, iv, passphrase, originalType) {
    try {
      // Derive key from passphrase
      const key = await this.deriveKey(passphrase, salt);

      // Decrypt
      const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: iv },
        key,
        ciphertext
      );

      // Return as Blob
      return new Blob([plaintext], { type: originalType });
    } catch (error) {
      throw new Error('Decryption failed. Incorrect passphrase or corrupted data.');
    }
  }

  /**
   * Compute SHA-256 hash of data
   */
  static async sha256(data) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Compute hash of plaintext file
   */
  static async hashFile(file) {
    const arrayBuffer = await file.arrayBuffer();
    return await this.sha256(arrayBuffer);
  }

  /**
   * Encode binary data to base64
   */
  static arrayBufferToBase64(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  /**
   * Decode base64 to binary data
   */
  static base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }

  /**
   * Create encrypted artifact metadata
   */
  static createArtifactMetadata(file, tags = [], notes = '', prevHash = null) {
    return {
      filename: file.name,
      size: file.size,
      type: file.type,
      tags: tags,
      notes: notes,
      timestamp: new Date().toISOString(),
      prev_hash: prevHash
    };
  }

  /**
   * Validate passphrase strength
   */
  static validatePassphrase(passphrase) {
    const errors = [];

    if (passphrase.length < 12) {
      errors.push('Passphrase must be at least 12 characters');
    }

    if (!/[A-Z]/.test(passphrase)) {
      errors.push('Passphrase must contain at least one uppercase letter');
    }

    if (!/[a-z]/.test(passphrase)) {
      errors.push('Passphrase must contain at least one lowercase letter');
    }

    if (!/[0-9]/.test(passphrase)) {
      errors.push('Passphrase must contain at least one number');
    }

    if (!/[^A-Za-z0-9]/.test(passphrase)) {
      errors.push('Passphrase must contain at least one special character');
    }

    return {
      valid: errors.length === 0,
      errors,
      strength: this.calculateStrength(passphrase)
    };
  }

  /**
   * Calculate passphrase strength (0-100)
   */
  static calculateStrength(passphrase) {
    let strength = 0;

    // Length score (up to 40 points)
    strength += Math.min(passphrase.length * 2, 40);

    // Character variety (up to 40 points)
    if (/[a-z]/.test(passphrase)) strength += 10;
    if (/[A-Z]/.test(passphrase)) strength += 10;
    if (/[0-9]/.test(passphrase)) strength += 10;
    if (/[^A-Za-z0-9]/.test(passphrase)) strength += 10;

    // Entropy bonus (up to 20 points)
    const uniqueChars = new Set(passphrase).size;
    strength += Math.min(uniqueChars, 20);

    return Math.min(strength, 100);
  }
}

export default EvidenceLockerCrypto;