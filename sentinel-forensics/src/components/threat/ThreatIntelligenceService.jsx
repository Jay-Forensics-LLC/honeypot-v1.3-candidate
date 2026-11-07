import { base44 } from '@/api/base44Client';
import { logForensicEvent, ForensicEventTypes } from '../forensics/ForensicLogger';
import { securityEventStorage } from '../storage/AppendOnlyStorage';
import { validateThreatData } from './ThreatSchemaValidator';
import { mapThreatData } from './ThreatDataMapper';

/**
 * THREAT INTELLIGENCE SERVICE
 * Real external API integrations with forensic logging
 */
class ThreatIntelligenceService {
  constructor() {
    this.rateLimits = new Map();
    this.cache = new Map();
    this.cacheTTL = 3600000; // 1 hour
  }

  /**
   * Enrich IP address with threat intelligence
   */
  async enrichIP(ipAddress) {
    const cacheKey = `ip:${ipAddress}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const results = await Promise.allSettled([
      this.checkAbuseIPDB(ipAddress),
      this.checkVirusTotal(ipAddress),
      this.checkAlienVault(ipAddress)
    ]);

    const enrichment = {
      ip: ipAddress,
      sources: {},
      timestamp: Date.now(),
      threatScore: 0
    };

    // Process results
    if (results[0].status === 'fulfilled') {
      enrichment.sources.abuseipdb = results[0].value;
    }
    if (results[1].status === 'fulfilled') {
      enrichment.sources.virustotal = results[1].value;
    }
    if (results[2].status === 'fulfilled') {
      enrichment.sources.alienvault = results[2].value;
    }

    // Validate and normalize
    const validated = validateThreatData(enrichment);
    const normalized = mapThreatData(validated);

    // Calculate aggregate threat score
    normalized.threatScore = this.calculateThreatScore(normalized);

    // Store in append-only storage
    await securityEventStorage.append({
      eventType: 'threat_intel_ip',
      data: normalized
    });

    // Log to forensic logger
    await logForensicEvent(ForensicEventTypes.ALERT_TRIGGERED, {
      type: 'threat_intelligence_enrichment',
      target: ipAddress,
      threatScore: normalized.threatScore
    });

    this.setCache(cacheKey, normalized);
    return normalized;
  }

  /**
   * Check AbuseIPDB
   */
  async checkAbuseIPDB(ip) {
    try {
      const response = await base44.functions.invoke('abuseipdb', { 
        ipAddress: ip 
      });
      
      return {
        provider: 'AbuseIPDB',
        malicious: response.data?.abuseConfidenceScore > 50,
        score: response.data?.abuseConfidenceScore || 0,
        reports: response.data?.totalReports || 0,
        details: response.data
      };
    } catch (error) {
      console.error('AbuseIPDB check failed:', error);
      return { provider: 'AbuseIPDB', error: error.message };
    }
  }

  /**
   * Check VirusTotal
   */
  async checkVirusTotal(ip) {
    try {
      const response = await base44.functions.invoke('virusTotal', {
        indicator: ip,
        type: 'ip'
      });

      const positives = response.data?.positives || 0;
      const total = response.data?.total || 0;

      return {
        provider: 'VirusTotal',
        malicious: positives > 0,
        score: total > 0 ? (positives / total) * 100 : 0,
        positives,
        total,
        details: response.data
      };
    } catch (error) {
      console.error('VirusTotal check failed:', error);
      return { provider: 'VirusTotal', error: error.message };
    }
  }

  /**
   * Check AlienVault OTX
   */
  async checkAlienVault(ip) {
    try {
      const response = await base44.functions.invoke('alienVaultOTX', {
        indicator: ip,
        type: 'ip'
      });

      return {
        provider: 'AlienVault OTX',
        malicious: response.data?.pulse_count > 0,
        pulseCount: response.data?.pulse_count || 0,
        details: response.data
      };
    } catch (error) {
      console.error('AlienVault check failed:', error);
      return { provider: 'AlienVault OTX', error: error.message };
    }
  }

  /**
   * Enrich domain with threat intelligence
   */
  async enrichDomain(domain) {
    const cacheKey = `domain:${domain}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) return cached;

    const results = await Promise.allSettled([
      this.checkURLScan(domain),
      this.checkVirusTotalDomain(domain)
    ]);

    const enrichment = {
      domain,
      sources: {},
      timestamp: Date.now()
    };

    if (results[0].status === 'fulfilled') {
      enrichment.sources.urlscan = results[0].value;
    }
    if (results[1].status === 'fulfilled') {
      enrichment.sources.virustotal = results[1].value;
    }

    const validated = validateThreatData(enrichment);
    const normalized = mapThreatData(validated);
    normalized.threatScore = this.calculateThreatScore(normalized);

    await securityEventStorage.append({
      eventType: 'threat_intel_domain',
      data: normalized
    });

    await logForensicEvent(ForensicEventTypes.ALERT_TRIGGERED, {
      type: 'threat_intelligence_enrichment',
      target: domain,
      threatScore: normalized.threatScore
    });

    this.setCache(cacheKey, normalized);
    return normalized;
  }

  /**
   * Check URLScan.io
   */
  async checkURLScan(domain) {
    try {
      const response = await base44.functions.invoke('urlscan', {
        url: domain
      });

      return {
        provider: 'URLScan',
        malicious: response.data?.verdicts?.overall?.malicious || false,
        score: response.data?.verdicts?.overall?.score || 0,
        details: response.data
      };
    } catch (error) {
      console.error('URLScan check failed:', error);
      return { provider: 'URLScan', error: error.message };
    }
  }

  /**
   * Check VirusTotal for domain
   */
  async checkVirusTotalDomain(domain) {
    try {
      const response = await base44.functions.invoke('virusTotal', {
        indicator: domain,
        type: 'domain'
      });

      const positives = response.data?.positives || 0;
      const total = response.data?.total || 0;

      return {
        provider: 'VirusTotal',
        malicious: positives > 0,
        score: total > 0 ? (positives / total) * 100 : 0,
        positives,
        total,
        details: response.data
      };
    } catch (error) {
      return { provider: 'VirusTotal', error: error.message };
    }
  }

  /**
   * Calculate aggregate threat score
   */
  calculateThreatScore(data) {
    const scores = [];
    
    if (data.sources) {
      Object.values(data.sources).forEach(source => {
        if (source.score !== undefined) {
          scores.push(source.score);
        }
      });
    }

    if (scores.length === 0) return 0;
    
    // Weight average
    const average = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.round(average);
  }

  /**
   * Cache helpers
   */
  getFromCache(key) {
    const cached = this.cache.get(key);
    if (!cached) return null;
    
    if (Date.now() - cached.timestamp > this.cacheTTL) {
      this.cache.delete(key);
      return null;
    }
    
    return cached.data;
  }

  setCache(key, data) {
    this.cache.set(key, {
      data,
      timestamp: Date.now()
    });
  }

  clearCache() {
    this.cache.clear();
  }
}

export const threatIntelligenceService = new ThreatIntelligenceService();