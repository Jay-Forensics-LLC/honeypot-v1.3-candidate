/**
 * Generate a unique device fingerprint
 * Used for "Remember this device" functionality
 */
export const DeviceFingerprint = {
  async generate() {
    const components = {
      userAgent: navigator.userAgent,
      language: navigator.language,
      platform: navigator.platform,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      screenResolution: `${screen.width}x${screen.height}`,
      colorDepth: screen.colorDepth,
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory || 'unknown',
      
      // Canvas fingerprint
      canvas: await this.getCanvasFingerprint(),
      
      // WebGL fingerprint
      webgl: this.getWebGLFingerprint(),
      
      // Audio context fingerprint
      audio: await this.getAudioFingerprint()
    };

    // Create hash of all components
    const dataString = JSON.stringify(components);
    const encoder = new TextEncoder();
    const data = encoder.encode(dataString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    return {
      fingerprint,
      components
    };
  },

  async getCanvasFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      ctx.textBaseline = 'top';
      ctx.font = '14px Arial';
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = '#f60';
      ctx.fillRect(125, 1, 62, 20);
      ctx.fillStyle = '#069';
      ctx.fillText('Sentinel Forensics', 2, 15);
      ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
      ctx.fillText('Sentinel Forensics', 4, 17);
      return canvas.toDataURL();
    } catch {
      return 'canvas-not-supported';
    }
  },

  getWebGLFingerprint() {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      if (!gl) return 'webgl-not-supported';
      
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      return {
        vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
        renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
      };
    } catch {
      return 'webgl-not-supported';
    }
  },

  async getAudioFingerprint() {
    try {
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const analyser = audioContext.createAnalyser();
      const gainNode = audioContext.createGain();
      const scriptProcessor = audioContext.createScriptProcessor(4096, 1, 1);

      gainNode.gain.value = 0;
      oscillator.type = 'triangle';
      oscillator.connect(analyser);
      analyser.connect(scriptProcessor);
      scriptProcessor.connect(gainNode);
      gainNode.connect(audioContext.destination);

      return new Promise((resolve) => {
        scriptProcessor.onaudioprocess = function(bins) {
          const output = bins.outputBuffer.getChannelData(0);
          const hash = output.slice(0, 100).join('');
          oscillator.stop();
          scriptProcessor.disconnect();
          analyser.disconnect();
          gainNode.disconnect();
          resolve(hash.substring(0, 50));
        };

        oscillator.start(0);
      });
    } catch {
      return 'audio-not-supported';
    }
  },

  getDeviceName() {
    const ua = navigator.userAgent;
    if (/mobile/i.test(ua)) return 'Mobile Device';
    if (/tablet/i.test(ua)) return 'Tablet';
    if (/Windows/.test(ua)) return 'Windows PC';
    if (/Mac/.test(ua)) return 'Mac';
    if (/Linux/.test(ua)) return 'Linux PC';
    return 'Unknown Device';
  }
};

export default DeviceFingerprint;