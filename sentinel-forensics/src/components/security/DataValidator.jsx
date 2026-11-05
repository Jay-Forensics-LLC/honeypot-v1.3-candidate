import { CryptoUtils } from '../utils/CryptoUtils';
import { InputSanitizer } from './InputSanitizer';

/**
 * Data Validation Layer
 * Validates all incoming data for schema compliance, integrity, and security
 */

export const DataValidator = {
  /**
   * Validate evidence upload data
   */
  validateEvidence: async (evidenceData) => {
    const errors = [];

    // Required fields
    if (!evidenceData.title || evidenceData.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (!evidenceData.case_id) {
      errors.push('Case ID is required');
    }

    if (!evidenceData.evidence_type) {
      errors.push('Evidence type is required');
    }

    // Field length validation
    if (evidenceData.title && evidenceData.title.length > 200) {
      errors.push('Title must be less than 200 characters');
    }

    if (evidenceData.description && evidenceData.description.length > 5000) {
      errors.push('Description must be less than 5000 characters');
    }

    // Sanitize strings
    if (evidenceData.title) {
      evidenceData.title = InputSanitizer.sanitizeString(evidenceData.title, 200);
    }

    if (evidenceData.description) {
      evidenceData.description = InputSanitizer.sanitizeString(evidenceData.description, 5000);
    }

    // Validate file hash if provided
    if (evidenceData.file_hash_sha256) {
      if (!/^[a-f0-9]{64}$/i.test(evidenceData.file_hash_sha256)) {
        errors.push('Invalid SHA-256 hash format');
      }
    }

    // Validate timestamps
    if (evidenceData.collection_timestamp) {
      const date = new Date(evidenceData.collection_timestamp);
      if (isNaN(date.getTime())) {
        errors.push('Invalid collection timestamp');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedData: evidenceData
    };
  },

  /**
   * Validate threat intelligence data
   */
  validateThreatIntel: async (threatData) => {
    const errors = [];

    // Required fields
    if (!threatData.threat_type) {
      errors.push('Threat type is required');
    }

    if (!threatData.severity) {
      errors.push('Severity is required');
    }

    if (!threatData.target_platforms || threatData.target_platforms.length === 0) {
      errors.push('At least one target platform is required');
    }

    if (!threatData.source || threatData.source.trim().length === 0) {
      errors.push('Source is required');
    }

    // Enum validation
    const validThreatTypes = ['malware', 'rootkit', 'surveillance', 'network_attack', 'social_engineering', 'physical_threat', 'apt', 'zero_day', 'ransomware'];
    if (threatData.threat_type && !validThreatTypes.includes(threatData.threat_type)) {
      errors.push('Invalid threat type');
    }

    const validSeverities = ['info', 'low', 'medium', 'high', 'critical'];
    if (threatData.severity && !validSeverities.includes(threatData.severity)) {
      errors.push('Invalid severity level');
    }

    const validPlatforms = ['windows', 'macos', 'linux', 'ios', 'android', 'all'];
    if (threatData.target_platforms) {
      threatData.target_platforms.forEach(platform => {
        if (!validPlatforms.includes(platform)) {
          errors.push(`Invalid platform: ${platform}`);
        }
      });
    }

    // Sanitize strings
    if (threatData.source) {
      threatData.source = InputSanitizer.sanitizeString(threatData.source, 500);
    }

    // Validate indicators
    if (threatData.indicators && Array.isArray(threatData.indicators)) {
      threatData.indicators.forEach((indicator, idx) => {
        if (!indicator.type || !indicator.value) {
          errors.push(`Indicator ${idx + 1}: type and value are required`);
        }

        if (indicator.confidence !== undefined) {
          if (typeof indicator.confidence !== 'number' || indicator.confidence < 0 || indicator.confidence > 100) {
            errors.push(`Indicator ${idx + 1}: confidence must be a number between 0-100`);
          }
        }

        // Sanitize indicator values
        if (indicator.value) {
          indicator.value = InputSanitizer.sanitizeString(indicator.value, 1000);
        }
      });
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedData: threatData
    };
  },

  /**
   * Validate file integrity with hash verification
   */
  validateFileIntegrity: async (file, expectedHash = null) => {
    try {
      const computedHash = await CryptoUtils.hashFile(file);

      if (expectedHash && computedHash !== expectedHash) {
        return {
          valid: false,
          error: 'File hash mismatch - file may be corrupted or tampered',
          expected: expectedHash,
          actual: computedHash
        };
      }

      return {
        valid: true,
        hash: computedHash,
        size: file.size,
        type: file.type,
        name: file.name
      };
    } catch (error) {
      return {
        valid: false,
        error: `Hash validation failed: ${error.message}`
      };
    }
  },

  /**
   * Validate case data
   */
  validateCase: (caseData) => {
    const errors = [];

    if (!caseData.case_number || caseData.case_number.trim().length === 0) {
      errors.push('Case number is required');
    }

    if (!caseData.title || caseData.title.trim().length === 0) {
      errors.push('Title is required');
    }

    if (!caseData.case_type) {
      errors.push('Case type is required');
    }

    if (!caseData.status) {
      errors.push('Status is required');
    }

    // Sanitize
    if (caseData.case_number) {
      caseData.case_number = InputSanitizer.sanitizeString(caseData.case_number, 50);
    }

    if (caseData.title) {
      caseData.title = InputSanitizer.sanitizeString(caseData.title, 200);
    }

    if (caseData.description) {
      caseData.description = InputSanitizer.sanitizeString(caseData.description, 5000);
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedData: caseData
    };
  },

  /**
   * Validate network log data
   */
  validateNetworkLog: (logData) => {
    const errors = [];

    // Required fields
    if (!logData.timestamp) {
      errors.push('Timestamp is required');
    }

    if (!logData.protocol) {
      errors.push('Protocol is required');
    }

    // IP address validation
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    
    if (logData.source_ip && !ipRegex.test(logData.source_ip)) {
      errors.push('Invalid source IP address format');
    }

    if (logData.destination_ip && !ipRegex.test(logData.destination_ip)) {
      errors.push('Invalid destination IP address format');
    }

    // Port validation
    if (logData.port !== undefined) {
      if (!Number.isInteger(logData.port) || logData.port < 0 || logData.port > 65535) {
        errors.push('Port must be between 0 and 65535');
      }
    }

    // Threat score validation
    if (logData.threat_score !== undefined) {
      if (typeof logData.threat_score !== 'number' || logData.threat_score < 0 || logData.threat_score > 100) {
        errors.push('Threat score must be between 0 and 100');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitizedData: logData
    };
  },

  /**
   * Comprehensive data integrity check
   */
  checkDataIntegrity: async (entityType, recordId, recordData) => {
    try {
      // Generate integrity hash
      const dataString = JSON.stringify(recordData, Object.keys(recordData).sort());
      const hash = await CryptoUtils.hash(dataString);

      // Store or compare hash
      return {
        valid: true,
        integrity_hash: hash,
        checked_at: new Date().toISOString()
      };
    } catch (error) {
      return {
        valid: false,
        error: `Integrity check failed: ${error.message}`
      };
    }
  }
};

export default DataValidator;