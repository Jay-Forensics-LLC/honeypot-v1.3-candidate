/**
 * Agent Download Configuration
 * Single source of truth for agent binaries
 * 
 * CANONICAL DOMAIN: jayforensics.com
 */

// Base URL for agent downloads - configurable via env var
const AGENT_DOWNLOAD_BASE_URL = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_AGENT_DOWNLOAD_BASE_URL) 
  || 'https://jayforensics.com';

/**
 * Get agent download URL for a specific platform
 * @param {string} platform - 'windows' | 'macos' | 'linux'
 * @returns {string} Full download URL
 */
export function getAgentDownloadUrl(platform = 'windows') {
  const base = AGENT_DOWNLOAD_BASE_URL.replace(/\/$/, ''); // trim trailing slash
  
  const paths = {
    windows: '/downloads/sentinel-agent-windows.exe',
    macos: '/downloads/sentinel-agent-macos.pkg',
    linux: '/downloads/sentinel-agent-linux.deb'
  };
  
  const path = paths[platform];
  if (!path) {
    console.warn(`[agentDownloads] Unsupported platform: ${platform}`);
    return '';
  }
  
  return `${base}${path}`;
}

/**
 * Get agent metadata for a platform
 */
export function getAgentMetadata(platform = 'windows') {
  const metadata = {
    windows: {
      url: getAgentDownloadUrl('windows'),
      version: '1.0.0',
      sha256: 'PLACEHOLDER_HASH_UPDATE_AFTER_UPLOAD',
      sizeBytes: 5242880,
      updatedAt: '2026-01-21T00:00:00Z'
    },
    macos: {
      url: getAgentDownloadUrl('macos'),
      version: '1.0.0',
      sha256: 'PLACEHOLDER_HASH_UPDATE_AFTER_UPLOAD',
      sizeBytes: 5242880,
      updatedAt: '2026-01-21T00:00:00Z'
    },
    linux: {
      url: getAgentDownloadUrl('linux'),
      version: '1.0.0',
      sha256: 'PLACEHOLDER_HASH_UPDATE_AFTER_UPLOAD',
      sizeBytes: 5242880,
      updatedAt: '2026-01-21T00:00:00Z'
    }
  };
  
  return metadata[platform] || null;
}

// Log the base URL on module load for diagnostics
if (typeof console !== 'undefined') {
  console.info('[agentDownloads] Base URL:', AGENT_DOWNLOAD_BASE_URL);
}