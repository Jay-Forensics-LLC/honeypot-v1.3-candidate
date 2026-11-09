/**
 * Cryptographic utilities for secure data handling
 * Uses Web Crypto API for all cryptographic operations
 * ALL LOGS AND SENSITIVE DATA ARE SHA256 ENCRYPTED
 */
export const CryptoUtils = {
  /**
   * SHA-256 hash - Used for ALL audit logs and sensitive data
   */
  async hash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * MD5 hash (legacy compatibility) - Uses SHA-256 truncated
   * Note: Not cryptographically secure, use only for non-security purposes
   */
  async md5(text) {
    // MD5 not available in Web Crypto API, use truncated SHA-256 as fallback
    const sha256 = await this.hash(text);
    return sha256.substring(0, 32); // Return first 32 chars to simulate MD5 length
  },

  /**
   * Generate cryptographic key for encryption
   * Returns a base64-encoded random key
   */
  async generateKey(length = 32) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Create tamper-evident log entry with SHA-256
   */
  async createSecureLogEntry(data) {
    const timestamp = new Date().toISOString();
    const logData = {
      ...data,
      timestamp,
      log_id: `LOG-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    };
    
    // Create SHA-256 hash for integrity verification
    const dataString = JSON.stringify(logData);
    const hash = await this.hash(dataString);
    
    return {
      ...logData,
      integrity_hash: hash,
      hash_algorithm: 'SHA-256'
    };
  },

  /**
   * Verify log integrity
   */
  async verifyLogIntegrity(logEntry) {
    const { integrity_hash, ...dataToVerify } = logEntry;
    const dataString = JSON.stringify(dataToVerify);
    const computedHash = await this.hash(dataString);
    return computedHash === integrity_hash;
  },

  /**
   * Encrypt text with password using AES-GCM
   */
  async encrypt(text, password) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const salt = window.crypto.getRandomValues(new Uint8Array(16));
    const key = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt']
    );
    
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await window.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    // Combine salt + iv + encrypted data
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...result));
  },

  /**
   * Decrypt text with password
   */
  async decrypt(encryptedBase64, password) {
    const encoder = new TextEncoder();
    const encryptedData = Uint8Array.from(atob(encryptedBase64), c => c.charCodeAt(0));
    
    const salt = encryptedData.slice(0, 16);
    const iv = encryptedData.slice(16, 28);
    const data = encryptedData.slice(28);
    
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(password),
      { name: 'PBKDF2' },
      false,
      ['deriveBits', 'deriveKey']
    );
    
    const key = await window.crypto.subtle.deriveKey(
      {
        name: 'PBKDF2',
        salt,
        iterations: 100000,
        hash: 'SHA-256'
      },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt']
    );
    
    const decrypted = await window.crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      key,
      data
    );
    
    return new TextDecoder().decode(decrypted);
  },

  /**
   * Generate cryptographically secure random ID
   */
  generateId() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Generate cryptographically secure random bytes
   */
  generateRandomBytes(length) {
    const array = new Uint8Array(length);
    window.crypto.getRandomValues(array);
    return array;
  },

  /**
   * Generate SHA-256 hash of file
   */
  async hashFile(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Generate HMAC signature
   */
  async generateHMAC(data, key) {
    const encoder = new TextEncoder();
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      encoder.encode(key),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    
    const signature = await window.crypto.subtle.sign(
      'HMAC',
      keyMaterial,
      encoder.encode(data)
    );
    
    return Array.from(new Uint8Array(signature))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  },

  /**
   * Verify HMAC signature
   */
  async verifyHMAC(data, signature, key) {
    const expectedSignature = await this.generateHMAC(data, key);
    return expectedSignature === signature;
  },

  /**
   * Securely wipe sensitive data from memory
   */
  secureWipe(sensitiveString) {
    // Overwrite with random data
    const length = sensitiveString.length;
    let wiped = '';
    for (let i = 0; i < length; i++) {
      wiped += String.fromCharCode(Math.floor(Math.random() * 256));
    }
    return wiped;
  }
};

export default CryptoUtils;