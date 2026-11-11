import { logForensicEvent, ForensicEventTypes } from '../forensics/ForensicLogger';
import { securityEventStorage } from '../storage/AppendOnlyStorage';

/**
 * DEVICE INTEGRITY CHECKER
 * Detects OS, MAC spoofing, device cloning on app activation
 */
class DeviceIntegrityChecker {
  constructor() {
    this.deviceFingerprint = null;
    this.checks = {
      os: null,
      macSpoofing: null,
      deviceCloning: null,
      virtualMachine: null
    };
  }

  /**
   * Run all integrity checks on app activation
   */
  async runIntegrityChecks() {
    console.log('🔍 Running device integrity checks...');

    const results = {
      timestamp: Date.now(),
      checks: {},
      alerts: [],
      fingerprint: null
    };

    // OS Detection
    results.checks.os = this.detectOS();

    // Generate device fingerprint
    results.fingerprint = await this.generateFingerprint();
    this.deviceFingerprint = results.fingerprint;

    // Check for MAC spoofing
    results.checks.macSpoofing = await this.checkMacSpoofing();

    // Check for device cloning
    results.checks.deviceCloning = await this.checkDeviceCloning(results.fingerprint);

    // Check for VM
    results.checks.virtualMachine = this.detectVirtualMachine();

    // Compile alerts
    if (results.checks.macSpoofing.suspicious) {
      results.alerts.push({
        severity: 'high',
        type: 'MAC Spoofing Detected',
        message: results.checks.macSpoofing.reason
      });
    }

    if (results.checks.deviceCloning.suspicious) {
      results.alerts.push({
        severity: 'critical',
        type: 'Device Cloning Detected',
        message: results.checks.deviceCloning.reason
      });
    }

    if (results.checks.virtualMachine.detected) {
      results.alerts.push({
        severity: 'medium',
        type: 'Virtual Machine Detected',
        message: 'Running in a virtual environment'
      });
    }

    // Store in append-only storage
    await securityEventStorage.append({
      eventType: 'device_integrity_check',
      data: results
    });

    // Log to forensic logger
    await logForensicEvent(ForensicEventTypes.CONFIG_CHANGE, {
      type: 'device_integrity_check',
      alertCount: results.alerts.length,
      fingerprint: results.fingerprint.hash
    });

    return results;
  }

  /**
   * Detect operating system
   */
  detectOS() {
    const userAgent = navigator.userAgent;
    const platform = navigator.platform;
    
    let os = 'Unknown';
    let version = null;

    if (/Windows NT 10/.test(userAgent)) {
      os = 'Windows';
      version = '10/11';
    } else if (/Windows NT 6\.3/.test(userAgent)) {
      os = 'Windows';
      version = '8.1';
    } else if (/Mac OS X/.test(userAgent)) {
      os = 'macOS';
      const match = userAgent.match(/Mac OS X ([\d_]+)/);
      if (match) {
        version = match[1].replace(/_/g, '.');
      }
    } else if (/Linux/.test(userAgent)) {
      os = 'Linux';
    } else if (/Android/.test(userAgent)) {
      os = 'Android';
      const match = userAgent.match(/Android ([\d.]+)/);
      if (match) version = match[1];
    } else if (/iPhone|iPad|iPod/.test(userAgent)) {
      os = 'iOS';
      const match = userAgent.match(/OS ([\d_]+)/);
      if (match) {
        version = match[1].replace(/_/g, '.');
      }
    }

    return {
      os,
      version,
      platform,
      userAgent,
      detected: os !== 'Unknown'
    };
  }

  /**
   * Generate device fingerprint
   */
  async generateFingerprint() {
    const components = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      timezoneOffset: new Date().getTimezoneOffset(),
      plugins: Array.from(navigator.plugins || []).map(p => p.name).join(','),
      canvas: await this.getCanvasFingerprint(),
      webgl: this.getWebGLFingerprint(),
      audio: await this.getAudioFingerprint()
    };

    const fingerprintString = JSON.stringify(components);
    const hash = await this.hashString(fingerprintString);

    return {
      hash,
      components,
      timestamp: Date.now()
    };
  }

  /**
   * Check for MAC address spoofing
   */
  async checkMacSpoofing() {
    const checks = {
      suspicious: false,
      reason: null,
      indicators: []
    };

    // Check 1: Inconsistent network interfaces
    if ('connection' in navigator) {
      const connection = navigator.connection;
      if (connection.type === 'none' && navigator.onLine) {
        checks.indicators.push('Connection type mismatch');
      }
    }

    // Check 2: Browser fingerprint inconsistencies
    const fp = this.deviceFingerprint?.components;
    if (fp) {
      // Check for impossible combinations
      if (fp.platform.includes('Win') && fp.userAgent.includes('Mac')) {
        checks.suspicious = true;
        checks.reason = 'Platform/User-Agent mismatch detected';
        checks.indicators.push('OS spoofing');
      }
    }

    // Check 3: WebRTC leak detection
    try {
      const ips = await this.getWebRTCIPs();
      if (ips.length === 0 && navigator.onLine) {
        checks.indicators.push('WebRTC blocked or spoofed');
      }
    } catch (error) {
      // WebRTC not available
    }

    if (checks.indicators.length > 2) {
      checks.suspicious = true;
      checks.reason = `Multiple spoofing indicators: ${checks.indicators.join(', ')}`;
    }

    return checks;
  }

  /**
   * Check for device cloning
   */
  async checkDeviceCloning(fingerprint) {
    const checks = {
      suspicious: false,
      reason: null
    };

    try {
      // Load previous fingerprints from storage
      const previousFingerprints = await this.loadPreviousFingerprints();

      if (previousFingerprints.length > 0) {
        const lastFingerprint = previousFingerprints[previousFingerprints.length - 1];

        // Compare hashes
        if (lastFingerprint.hash === fingerprint.hash) {
          // Same fingerprint - good
          return checks;
        }

        // Check for suspicious changes
        const changes = this.compareFingerprints(lastFingerprint.components, fingerprint.components);

        // Hardware changes are suspicious
        if (changes.includes('hardwareConcurrency') || changes.includes('deviceMemory')) {
          checks.suspicious = true;
          checks.reason = 'Hardware configuration changed unexpectedly';
        }

        // Multiple core components changed
        if (changes.length > 5) {
          checks.suspicious = true;
          checks.reason = `Multiple device characteristics changed: ${changes.length} components`;
        }
      }

      // Store current fingerprint
      await this.storeFingerprint(fingerprint);
    } catch (error) {
      console.error('Device cloning check failed:', error);
    }

    return checks;
  }

  /**
   * Detect virtual machine
   */
  detectVirtualMachine() {
    const indicators = [];

    // Check user agent for VM indicators
    const vmStrings = ['VMware', 'VirtualBox', 'QEMU', 'Parallels'];
    for (const vm of vmStrings) {
      if (navigator.userAgent.includes(vm)) {
        indicators.push(`User-Agent contains ${vm}`);
      }
    }

    // Check for VM-typical hardware
    if (navigator.hardwareConcurrency === 1) {
      indicators.push('Single CPU core (common in VMs)');
    }

    // Check screen resolution (VMs often use specific resolutions)
    const commonVMResolutions = [
      '1024x768', '800x600', '1280x1024'
    ];
    const resolution = `${screen.width}x${screen.height}`;
    if (commonVMResolutions.includes(resolution)) {
      indicators.push(`Common VM resolution: ${resolution}`);
    }

    return {
      detected: indicators.length > 0,
      confidence: indicators.length > 1 ? 'high' : 'low',
      indicators
    };
  }

  /**
   * Helper: Get WebRTC IPs
   */
  async getWebRTCIPs() {
    return new Promise((resolve) => {
      const ips = [];
      const pc = new RTCPeerConnection({ iceServers: [] });
      
      pc.createDataChannel('');
      pc.createOffer().then(offer => pc.setLocalDescription(offer));

      pc.onicecandidate = (ice) => {
        if (!ice || !ice.candidate || !ice.candidate.candidate) {
          resolve(ips);
          return;
        }
        
        const parts = ice.candidate.candidate.split(' ');
        const ip = parts[4];
        if (ip && !ips.includes(ip)) ips.push(ip);
      };

      setTimeout(() => resolve(ips), 1000);
    });
  }

  /**
   * Helper: Canvas fingerprint
   */
  async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const text = 'Sentinel<Canvas>Fingerprint123';
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.fillText(text, 2, 2);
      return canvas.toDataURL();
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: WebGL fingerprint
   */
  getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return null;

      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return null;

      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Audio fingerprint
   */
  async getAudioFingerprint() {
    try {
      const context = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = context.createOscillator();
      const analyser = context.createAnalyser();
      const gain = context.createGain();
      
      oscillator.connect(analyser);
      analyser.connect(gain);
      gain.connect(context.destination);
      
      oscillator.start(0);
      const data = new Float32Array(analyser.frequencyBinCount);
      analyser.getFloatFrequencyData(data);
      
      oscillator.stop();
      context.close();
      
      return Array.from(data.slice(0, 30)).join(',');
    } catch (error) {
      return null;
    }
  }

  /**
   * Helper: Hash string
   */
  async hashString(str) {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Compare fingerprints
   */
  compareFingerprints(old, current) {
    const changes = [];
    for (const key in current) {
      if (old[key] !== current[key]) {
        changes.push(key);
      }
    }
    return changes;
  }

  /**
   * Storage helpers
   */
  async loadPreviousFingerprints() {
    try {
      const stored = localStorage.getItem('device_fingerprints');
      return stored ? JSON.parse(stored) : [];
    } catch (error) {
      return [];
    }
  }

  async storeFingerprint(fingerprint) {
    try {
      const fingerprints = await this.loadPreviousFingerprints();
      fingerprints.push(fingerprint);
      
      // Keep last 10
      if (fingerprints.length > 10) {
        fingerprints.shift();
      }
      
      localStorage.setItem('device_fingerprints', JSON.stringify(fingerprints));
    } catch (error) {
      console.error('Failed to store fingerprint:', error);
    }
  }
}

export const deviceIntegrityChecker = new DeviceIntegrityChecker();