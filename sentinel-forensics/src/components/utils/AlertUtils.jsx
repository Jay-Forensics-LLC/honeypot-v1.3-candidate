/**
 * Alert Creation Utilities
 * Ensures all alert data is properly formatted before creation
 */

/**
 * Safely create an alert with validated data
 * @param {Object} alertData - Alert data object
 * @returns {Object} Validated alert data
 */
export function validateAlertData(alertData) {
  return {
    alert_type: String(alertData.alert_type || 'system_compromise'),
    severity: String(alertData.severity || 'medium'),
    title: String(alertData.title || 'Security Alert'),
    description: String(alertData.description || 'No description provided'),
    source: String(alertData.source || 'Unknown'),
    detection_timestamp: alertData.detection_timestamp || new Date().toISOString(),
    status: String(alertData.status || 'new'),
    threat_score: Number(alertData.threat_score) || 50,
    affected_systems: Array.isArray(alertData.affected_systems) 
      ? alertData.affected_systems.map(s => String(s)).filter(s => s && s !== 'null' && s !== 'undefined')
      : [],
    recommended_actions: Array.isArray(alertData.recommended_actions)
      ? alertData.recommended_actions.map(a => String(a)).filter(a => a && a !== 'null' && a !== 'undefined')
      : [],
    resolution_notes: alertData.resolution_notes ? String(alertData.resolution_notes) : undefined
  };
}

/**
 * Safely format system name for alerts
 * @param {any} system - System identifier (could be object, string, number)
 * @returns {string} Formatted system name
 */
export function formatSystemName(system) {
  if (!system) return 'Unknown System';
  
  if (typeof system === 'string') return system;
  if (typeof system === 'number') return `System-${system}`;
  if (typeof system === 'object' && system.name) return String(system.name);
  if (typeof system === 'object' && system.hostname) return String(system.hostname);
  if (typeof system === 'object' && system.id) return `System-${system.id}`;
  
  return 'Unknown System';
}

/**
 * Extract system names from various data structures
 * @param {any} data - Data that might contain system information
 * @returns {Array<string>} Array of system names
 */
export function extractAffectedSystems(data) {
  const systems = [];
  
  if (Array.isArray(data)) {
    data.forEach(item => {
      systems.push(formatSystemName(item));
    });
  } else if (typeof data === 'object' && data !== null) {
    if (data.honeypot_name) systems.push(String(data.honeypot_name));
    if (data.device_name) systems.push(String(data.device_name));
    if (data.hostname) systems.push(String(data.hostname));
    if (data.ip_address) systems.push(String(data.ip_address));
    if (data.system_name) systems.push(String(data.system_name));
  } else if (data) {
    systems.push(formatSystemName(data));
  }
  
  return systems.filter(s => s && s !== 'Unknown System');
}

export default {
  validateAlertData,
  formatSystemName,
  extractAffectedSystems
};