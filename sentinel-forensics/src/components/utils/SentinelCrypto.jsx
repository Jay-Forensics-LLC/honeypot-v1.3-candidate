/**
 * Sentinel Forensics Cryptographic Utilities
 * Provides SHA-256 hashing, Merkle trees, and integrity verification
 * ALL forensic data is cryptographically secured
 */

const SentinelCrypto = {
  /**
   * SHA-256 hash generation
   */
  async sha256(data) {
    const encoder = new TextEncoder();
    const dataBuffer = typeof data === 'string' ? encoder.encode(data) : data;
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', dataBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Generate cryptographically secure ID
   */
  generateId() {
    const array = new Uint8Array(16);
    window.crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Create Merkle tree from observations
   * Used for tamper-evident forensic evidence
   */
  async createMerkleTree(observations) {
    if (!observations || observations.length === 0) {
      return { root: null, tree: [] };
    }

    // Create leaf nodes (hash each observation)
    let currentLevel = await Promise.all(
      observations.map(async (obs) => {
        const obsString = JSON.stringify({
          observation_id: obs.observation_id,
          timestamp: obs.timestamp,
          data_hash: obs.data_hash
        });
        return await this.sha256(obsString);
      })
    );

    const tree = [currentLevel];

    // Build tree upwards
    while (currentLevel.length > 1) {
      const nextLevel = [];
      
      for (let i = 0; i < currentLevel.length; i += 2) {
        if (i + 1 < currentLevel.length) {
          // Combine pairs
          const combined = currentLevel[i] + currentLevel[i + 1];
          const hash = await this.sha256(combined);
          nextLevel.push(hash);
        } else {
          // Odd one out, hash with itself
          const combined = currentLevel[i] + currentLevel[i];
          const hash = await this.sha256(combined);
          nextLevel.push(hash);
        }
      }
      
      currentLevel = nextLevel;
      tree.push(currentLevel);
    }

    return {
      root: currentLevel[0],
      tree: tree
    };
  },

  /**
   * Verify Merkle tree integrity
   */
  async verifyMerkleTree(observations, expectedRoot) {
    const merkleTree = await this.createMerkleTree(observations);
    return merkleTree.root === expectedRoot;
  },

  /**
   * Create tamper-evident log entry with SHA-256
   */
  async createSecureLogEntry(data) {
    const timestamp = new Date().toISOString();
    const logData = {
      ...data,
      timestamp,
      log_id: `LOG-${Date.now()}-${this.generateId().substring(0, 8)}`
    };
    
    const dataString = JSON.stringify(logData);
    const hash = await this.sha256(dataString);
    
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
    const computedHash = await this.sha256(dataString);
    return computedHash === integrity_hash;
  },

  /**
   * Generate hash of file
   */
  async hashFile(file) {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  },

  /**
   * Create chain-of-custody entry
   */
  async createCustodyEntry(action, actorId, previousHash = null) {
    const entry = {
      timestamp: new Date().toISOString(),
      action,
      actor_id: actorId,
      previous_hash: previousHash
    };
    
    const entryString = JSON.stringify(entry);
    const hash = await this.sha256(entryString);
    
    return {
      ...entry,
      integrity_hash: hash
    };
  },

  /**
   * Verify chain-of-custody
   */
  async verifyCustodyChain(chain) {
    if (!chain || chain.length === 0) return true;

    for (let i = 0; i < chain.length; i++) {
      const entry = chain[i];
      const { integrity_hash, ...entryData } = entry;
      const entryString = JSON.stringify(entryData);
      const computedHash = await this.sha256(entryString);
      
      if (computedHash !== integrity_hash) {
        return false;
      }

      // Check link to previous
      if (i > 0) {
        const previousEntry = chain[i - 1];
        if (entry.previous_hash !== previousEntry.integrity_hash) {
          return false;
        }
      }
    }

    return true;
  },

  /**
   * AES-GCM encryption for sensitive data
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
    
    const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    result.set(salt, 0);
    result.set(iv, salt.length);
    result.set(new Uint8Array(encrypted), salt.length + iv.length);
    
    return btoa(String.fromCharCode(...result));
  },

  /**
   * AES-GCM decryption
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
  }
};

export default SentinelCrypto;