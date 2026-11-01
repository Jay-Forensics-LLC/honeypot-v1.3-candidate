import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Fingerprint, AlertTriangle, CheckCircle } from "lucide-react";

export default function DeviceFingerprinting() {
  const [fingerprint, setFingerprint] = useState(null);
  const [anomalyScore, setAnomalyScore] = useState(0);
  const [analyzing, setAnalyzing] = useState(false);
  const queryClient = useQueryClient();

  const createDeviceLogMutation = useMutation({
    mutationFn: (logData) => base44.entities.DeviceLog.create(logData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['device-logs'] });
    },
  });

  const generateFingerprint = async () => {
    setAnalyzing(true);
    
    // Canvas fingerprinting
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    ctx.textBaseline = 'top';
    ctx.font = '14px Arial';
    ctx.fillText('Sentinel Forensics', 2, 2);
    const canvasData = canvas.toDataURL();
    
    // WebGL fingerprinting
    const gl = canvas.getContext('webgl');
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const webglData = gl ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : 'none';
    
    // Collect device characteristics
    const fp = {
      hardware_id: await generateHardwareId(),
      os_type: navigator.platform,
      browser: navigator.userAgent,
      screen_resolution: `${screen.width}x${screen.height}`,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      language: navigator.language,
      plugins: Array.from(navigator.plugins || []).map(p => p.name),
      canvas_fingerprint: await hashString(canvasData),
      webgl_fingerprint: await hashString(webglData),
      connection_type: navigator.connection?.effectiveType || 'unknown',
      device_memory: navigator.deviceMemory || 'unknown',
      hardware_concurrency: navigator.hardwareConcurrency || 'unknown',
      battery_level: await getBatteryLevel()
    };
    
    setFingerprint(fp);
    
    // Calculate anomaly score using ML-like heuristics
    const score = calculateAnomalyScore(fp);
    setAnomalyScore(score);
    
    // Log to database
    await createDeviceLogMutation.mutateAsync({
      device_id: fp.hardware_id,
      device_fingerprint: fp,
      anomaly_score: score,
      anomaly_type: score > 70 ? 'fingerprint_mismatch' : 'normal',
      timestamp: new Date().toISOString()
    });
    
    // Create alert if high anomaly score
    if (score > 70) {
      await base44.entities.Alert.create({
        alert_type: 'device_tampering',
        severity: score > 85 ? 'critical' : 'high',
        title: 'Device Fingerprint Anomaly Detected',
        description: `Unusual device characteristics detected. Anomaly score: ${score}/100. Possible spoofing or VM detection.`,
        source: fp.hardware_id,
        detection_timestamp: new Date().toISOString(),
        recommended_actions: [
          'Verify device identity',
          'Check for virtualization',
          'Review recent access patterns',
          'Enable enhanced monitoring'
        ]
      });
    }
    
    setAnalyzing(false);
  };

  const generateHardwareId = async () => {
    const components = [
      navigator.userAgent,
      navigator.language,
      screen.colorDepth,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
      navigator.hardwareConcurrency
    ].join('|');
    
    return await hashString(components);
  };

  const hashString = async (str) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const getBatteryLevel = async () => {
    if ('getBattery' in navigator) {
      try {
        const battery = await navigator.getBattery();
        return battery.level;
      } catch (e) {
        return 'unknown';
      }
    }
    return 'unknown';
  };

  const calculateAnomalyScore = (fp) => {
    let score = 0;
    
    // Check for common spoofing indicators
    if (fp.browser.includes('HeadlessChrome') || fp.browser.includes('PhantomJS')) score += 40;
    if (fp.plugins.length === 0) score += 15;
    if (fp.webgl_fingerprint.includes('none')) score += 20;
    if (fp.screen_resolution === '800x600' || fp.screen_resolution === '1024x768') score += 10;
    if (fp.timezone === 'UTC') score += 15;
    if (fp.device_memory === 'unknown') score += 10;
    if (fp.hardware_concurrency && fp.hardware_concurrency < 2) score += 10;
    if (fp.battery_level === 'unknown') score += 5;
    
    // Check for VM indicators
    const vmIndicators = ['VirtualBox', 'VMware', 'QEMU', 'Parallels'];
    if (vmIndicators.some(vm => fp.browser.includes(vm))) score += 30;
    
    return Math.min(score, 100);
  };

  useEffect(() => {
    generateFingerprint();
  }, []);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Fingerprint className="w-5 h-5 text-purple-400" />
          Device Fingerprinting & Anomaly Detection
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-slate-400 mb-1">Anomaly Score</p>
            <div className="flex items-center gap-3">
              <div className="text-3xl font-bold text-white">{anomalyScore}/100</div>
              {anomalyScore < 30 && (
                <Badge className="bg-green-500/20 text-green-400">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Normal
                </Badge>
              )}
              {anomalyScore >= 30 && anomalyScore < 70 && (
                <Badge className="bg-yellow-500/20 text-yellow-400">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  Suspicious
                </Badge>
              )}
              {anomalyScore >= 70 && (
                <Badge className="bg-red-500/20 text-red-400 animate-pulse">
                  <AlertTriangle className="w-3 h-3 mr-1" />
                  High Risk
                </Badge>
              )}
            </div>
          </div>
          <Button
            onClick={generateFingerprint}
            disabled={analyzing}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {analyzing ? 'Analyzing...' : 'Re-scan Device'}
          </Button>
        </div>

        {fingerprint && (
          <div className="space-y-3">
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <h4 className="text-sm font-semibold text-slate-300 mb-3">Device Profile</h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <span className="text-slate-500">Hardware ID:</span>
                  <p className="text-slate-300 font-mono truncate">{fingerprint.hardware_id.substring(0, 16)}...</p>
                </div>
                <div>
                  <span className="text-slate-500">OS:</span>
                  <p className="text-slate-300">{fingerprint.os_type}</p>
                </div>
                <div>
                  <span className="text-slate-500">Screen:</span>
                  <p className="text-slate-300">{fingerprint.screen_resolution}</p>
                </div>
                <div>
                  <span className="text-slate-500">Timezone:</span>
                  <p className="text-slate-300">{fingerprint.timezone}</p>
                </div>
                <div>
                  <span className="text-slate-500">Cores:</span>
                  <p className="text-slate-300">{fingerprint.hardware_concurrency}</p>
                </div>
                <div>
                  <span className="text-slate-500">Memory:</span>
                  <p className="text-slate-300">{fingerprint.device_memory} GB</p>
                </div>
                <div>
                  <span className="text-slate-500">Connection:</span>
                  <p className="text-slate-300">{fingerprint.connection_type}</p>
                </div>
                <div>
                  <span className="text-slate-500">Battery:</span>
                  <p className="text-slate-300">{fingerprint.battery_level !== 'unknown' ? `${(fingerprint.battery_level * 100).toFixed(0)}%` : 'N/A'}</p>
                </div>
              </div>
            </div>

            {anomalyScore > 50 && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-4">
                <h4 className="text-sm font-semibold text-red-400 mb-2">⚠️ Anomaly Indicators Detected</h4>
                <ul className="text-xs text-red-300 space-y-1">
                  {fingerprint.plugins.length === 0 && <li>• No browser plugins detected (suspicious)</li>}
                  {fingerprint.browser.includes('Headless') && <li>• Headless browser detected</li>}
                  {fingerprint.device_memory === 'unknown' && <li>• Device memory unavailable</li>}
                  {fingerprint.battery_level === 'unknown' && <li>• Battery API blocked</li>}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}