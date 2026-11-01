import { calculateMultiHash } from '../evidence/AutoHasher';

/**
 * Evidence Hasher Utility
 * Ensures all exported evidence has proper SHA-256 hashing
 */

export async function hashEvidenceBundle(files) {
  const hashes = [];
  
  for (const file of files) {
    const multiHash = await calculateMultiHash(file);
    if (multiHash) {
      hashes.push({
        file_name: file.name,
        sha256: multiHash.sha256,
        sha512: multiHash.sha512,
        md5: multiHash.md5,
        file_size: multiHash.file_size,
        file_type: multiHash.file_type,
        hashed_at: new Date().toISOString()
      });
    }
  }

  // Calculate merkle root of all hashes
  const combinedHash = hashes.map(h => h.sha256).join('');
  const encoder = new TextEncoder();
  const data = encoder.encode(combinedHash);
  const merkleBuffer = await crypto.subtle.digest('SHA-256', data);
  const merkleArray = Array.from(new Uint8Array(merkleBuffer));
  const merkleRoot = merkleArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return {
    files: hashes,
    merkle_root: merkleRoot,
    bundle_timestamp: new Date().toISOString(),
    total_files: files.length,
    total_bytes: hashes.reduce((sum, h) => sum + h.file_size, 0)
  };
}

export function generateHashManifest(bundleData) {
  const lines = [
    '# SENTINEL FORENSICS - EVIDENCE HASH MANIFEST',
    `# Generated: ${bundleData.bundle_timestamp}`,
    `# Total Files: ${bundleData.total_files}`,
    `# Total Size: ${(bundleData.total_bytes / 1024 / 1024).toFixed(2)} MB`,
    `# Merkle Root: ${bundleData.merkle_root}`,
    '',
    '# File Hashes (SHA-256, SHA-512, MD5)',
    ''
  ];

  bundleData.files.forEach(file => {
    lines.push(`## ${file.file_name}`);
    lines.push(`SHA-256: ${file.sha256}`);
    lines.push(`SHA-512: ${file.sha512}`);
    lines.push(`MD5: ${file.md5}`);
    lines.push(`Size: ${file.file_size} bytes`);
    lines.push(`Type: ${file.file_type}`);
    lines.push(`Hashed: ${file.hashed_at}`);
    lines.push('');
  });

  return lines.join('\n');
}

export default {
  hashEvidenceBundle,
  generateHashManifest
};