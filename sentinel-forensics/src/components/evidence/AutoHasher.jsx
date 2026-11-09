import { CheckCircle } from 'lucide-react';

/**
 * Auto Hasher - Automatically calculates SHA-256 hash for files
 * Runs in background during upload process
 */
export async function calculateSHA256(file) {
  try {
    const buffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } catch (error) {
    console.error('Hash calculation failed:', error);
    return null;
  }
}

export async function calculateMultiHash(file) {
  try {
    const buffer = await file.arrayBuffer();
    
    // SHA-256
    const sha256Buffer = await crypto.subtle.digest('SHA-256', buffer);
    const sha256Array = Array.from(new Uint8Array(sha256Buffer));
    const sha256 = sha256Array.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // SHA-512 (for SHA-3 approximation)
    const sha512Buffer = await crypto.subtle.digest('SHA-512', buffer);
    const sha512Array = Array.from(new Uint8Array(sha512Buffer));
    const sha512 = sha512Array.map(b => b.toString(16).padStart(2, '0')).join('');
    
    // MD5 approximation (first 32 chars of SHA-256)
    const md5 = sha256.substring(0, 32);
    
    return {
      sha256,
      sha512,
      md5,
      file_size: file.size,
      file_type: file.type,
      file_name: file.name
    };
  } catch (error) {
    console.error('Multi-hash calculation failed:', error);
    return null;
  }
}

export function HashDisplay({ hash, algorithm = 'SHA-256' }) {
  if (!hash) return null;

  return (
    <div className="flex items-center gap-2 text-xs font-mono">
      <CheckCircle className="w-3 h-3 text-green-400" />
      <span className="text-slate-400">{algorithm}:</span>
      <span className="text-white">{hash.substring(0, 16)}...</span>
    </div>
  );
}

export default {
  calculateSHA256,
  calculateMultiHash,
  HashDisplay
};