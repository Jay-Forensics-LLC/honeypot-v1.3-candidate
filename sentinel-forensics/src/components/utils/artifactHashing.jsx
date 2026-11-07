/**
 * PHASE 0: Unified Hashing + Manifest Framework
 * 
 * SHA-256 hashing utilities for artifact integrity and tamper detection.
 * Every output gets a hash; every manifest includes input snapshot references.
 */

/**
 * Generate SHA-256 hash of any data structure
 * @param {any} data - Data to hash (will be JSON stringified)
 * @returns {Promise<string>} - Hex-encoded SHA-256 hash
 */
export async function hashArtifact(data) {
  try {
    // Normalize data to deterministic JSON string
    const normalized = JSON.stringify(data, Object.keys(data).sort());
    
    // Convert to UTF-8 bytes
    const encoder = new TextEncoder();
    const dataBytes = encoder.encode(normalized);
    
    // Generate SHA-256 hash using Web Crypto API
    const hashBuffer = await crypto.subtle.digest('SHA-256', dataBytes);
    
    // Convert to hex string
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return hashHex;
  } catch (error) {
    console.error('Hashing failed:', error);
    throw new Error('Failed to generate artifact hash');
  }
}

/**
 * Verify artifact integrity by comparing hash
 * @param {any} data - Data to verify
 * @param {string} expectedHash - Expected SHA-256 hash
 * @returns {Promise<boolean>} - True if hash matches
 */
export async function verifyArtifactHash(data, expectedHash) {
  try {
    const actualHash = await hashArtifact(data);
    return actualHash === expectedHash;
  } catch (error) {
    console.error('Hash verification failed:', error);
    return false;
  }
}

/**
 * Generate manifest for analytics run
 * @param {Object} params - Run parameters
 * @returns {Promise<Object>} - Manifest with hashes and metadata
 */
export async function generateManifest(params) {
  const {
    findings = [],
    visualizations = [],
    inputSnapshot = {},
    modelMetadata = {},
    executionTimeMs = 0,
    tokenUsage = 0
  } = params;
  
  // Hash findings and visualizations
  const findingsHash = await hashArtifact(findings);
  const visualizationsHash = await hashArtifact(visualizations);
  const inputHash = await hashArtifact(inputSnapshot);
  
  return {
    version: '1.0',
    generated_at: new Date().toISOString(),
    input_hash: inputHash,
    findings_hash: findingsHash,
    visualizations_hash: visualizationsHash,
    findings_count: findings.length,
    visualizations_count: visualizations.length,
    execution_time_ms: executionTimeMs,
    token_usage: tokenUsage,
    model_metadata: modelMetadata,
    integrity_verified: true
  };
}

/**
 * Hash individual finding for immutability
 * @param {Object} finding - Finding object
 * @returns {Promise<string>} - SHA-256 hash
 */
export async function hashFinding(finding) {
  // Only hash the content fields, not approval metadata
  const contentToHash = {
    finding_type: finding.finding_type,
    title: finding.title,
    description: finding.description,
    confidence: finding.confidence,
    evidence_references: finding.evidence_references,
    rationale: finding.rationale,
    created_at: finding.created_at
  };
  
  return hashArtifact(contentToHash);
}

/**
 * Hash visualization for immutability
 * @param {Object} visualization - Visualization object
 * @returns {Promise<string>} - SHA-256 hash
 */
export async function hashVisualization(visualization) {
  const contentToHash = {
    visualization_type: visualization.visualization_type,
    title: visualization.title,
    data_snapshot: visualization.data_snapshot,
    metadata: visualization.metadata,
    created_at: visualization.created_at
  };
  
  return hashArtifact(contentToHash);
}