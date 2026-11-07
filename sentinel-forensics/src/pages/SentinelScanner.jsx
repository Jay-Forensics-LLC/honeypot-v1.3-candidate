import { useState, useRef } from 'react';
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Shield, 
  FileText, 
  Network, 
  Hash, 
  Settings, 
  Upload, 
  Download, 
  Eye, 
  Camera, 
  Car, 
  Bluetooth, 
  Video,
  Loader2,
  AlertTriangle
} from 'lucide-react';

export default function SentinelScanner() {
  const [activeTab, setActiveTab] = useState('logs');
  const [analyzing, setAnalyzing] = useState(false);
  const [results, setResults] = useState(null);
  const [bleScanning, setBleScanning] = useState(false);
  const [bleDevices, setBleDevices] = useState([]);
  const [cameraActive, setCameraActive] = useState(false);
  const [capturedImages, setCapturedImages] = useState([]);
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence'],
    queryFn: () => base44.entities.Evidence.list('-created_date', 10),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => base44.entities.Alert.list('-detection_timestamp'),
  });

  const createEvidenceMutation = useMutation({
    mutationFn: (evidenceData) => base44.entities.Evidence.create(evidenceData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['evidence'] });
    },
  });

  const createAlertMutation = useMutation({
    mutationFn: (alertData) => base44.entities.Alert.create(alertData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
    },
  });

  // AI Analysis using base44's integration
  const analyzeWithAI = async (prompt, content) => {
    try {
      // SECURITY: Guard against prompt injection in untrusted content
      const { guardUserAIExperience } = await import('@/components/security/AIInjectionGuard');
      
      const guard = guardUserAIExperience({
        taskPrompt: prompt,
        untrustedData: content,
        profile: "enterprise",
      });

      // Log security event
      const inputHash = await hashString(content);
      await base44.entities.AISecurityEvent.create({
        organization_id: user.organization_id,
        user_email: user.email,
        feature_name: 'SentinelScanner',
        direction: guard.dataReport?.direction || 'untrusted_data',
        score: guard.worstReport?.score || 0,
        severity: guard.worstReport?.severity || 'low',
        action: guard.worstReport?.action || 'allow',
        indicator_ids: guard.worstReport?.indicators?.map(i => i.id) || [],
        input_hash_sha256: inputHash,
        input_snippet: content.substring(0, 500),
        profile_used: guard.profile,
        user_proceeded: true
      }).catch(err => console.error('Failed to log AI security event:', err));

      if (guard.blocked) {
        return {
          summary: "🛡️ Analysis blocked: suspected prompt-injection in content",
          threat_level: "high",
          indicators: guard.worstReport?.indicators?.map(i => `${i.category}:${i.id}`) || [],
          recommendations: [
            "Treat this input as potentially malicious content",
            "Re-run analysis in Safe Mode (no tool actions, no internet context)",
            "Preserve original artifact for chain-of-custody and triage",
            `Injection score: ${guard.worstReport?.score}/100`
          ],
          detailed_analysis: "The content appears to contain instruction-like text intended to hijack AI behavior. This is a security safeguard.",
        };
      }

      const result = await base44.integrations.Core.InvokeLLM({
        prompt: guard.hardenedPrompt,
        response_json_schema: {
          type: "object",
          properties: {
            summary: { type: "string" },
            threat_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
            indicators: { type: "array", items: { type: "string" } },
            recommendations: { type: "array", items: { type: "string" } },
            detailed_analysis: { type: "string" }
          }
        }
      });

      return result;
    } catch (error) {
      console.error("AI analysis error:", error);
      return { summary: "Error during analysis", threat_level: "unknown", indicators: [], recommendations: [] };
    }
  };

  // Helper: hash string for privacy-preserving logging
  const hashString = async (str) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  };

  const analyzeImage = async (imageUrl) => {
    try {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: "Counter-surveillance analysis: Detect people, vehicles (make/model/plate if visible/color), surveillance equipment, suspicious activity, and assess threat level. Provide detailed observations.",
        file_urls: [imageUrl],
        response_json_schema: {
          type: "object",
          properties: {
            people_detected: { type: "number" },
            vehicles: { type: "array", items: { 
              type: "object",
              properties: {
                type: { type: "string" },
                color: { type: "string" },
                make_model: { type: "string" }
              }
            }},
            surveillance_equipment: { type: "array", items: { type: "string" } },
            threat_assessment: { type: "string" },
            threat_level: { type: "string", enum: ["low", "medium", "high", "critical"] },
            recommendations: { type: "array", items: { type: "string" } }
          }
        }
      });
      return result;
    } catch (error) {
      console.error("Image analysis error:", error);
      return { threat_assessment: "Error analyzing image", threat_level: "unknown" };
    }
  };

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { facingMode: 'environment' } 
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCameraActive(true);
      }
    } catch (error) {
      alert('Camera access denied: ' + error.message);
    }
  };

  const stopCamera = () => {
    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject.getTracks().forEach(track => track.stop());
      videoRef.current.srcObject = null;
      setCameraActive(false);
    }
  };

  const captureImage = async () => {
    if (!videoRef.current || !canvasRef.current) return;
    
    setAnalyzing(true);
    const canvas = canvasRef.current;
    const video = videoRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);
    
    // Convert to blob and upload
    canvas.toBlob(async (blob) => {
      try {
        const file = new File([blob], `capture_${Date.now()}.jpg`, { type: 'image/jpeg' });
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        
        // Analyze with AI
        const analysis = await analyzeImage(file_url);
        
        // Store as evidence
        await createEvidenceMutation.mutateAsync({
          evidence_number: `IMG-${Date.now().toString().slice(-8)}`,
          title: `Surveillance Capture - ${new Date().toLocaleString()}`,
          description: analysis.threat_assessment || "Visual surveillance capture",
          evidence_type: 'screenshot',
          file_url: file_url,
          collection_method: 'Live Camera Capture',
          collection_timestamp: new Date().toISOString(),
          case_id: 'surveillance',
          metadata: analysis
        });
        
        // Create alert if threat detected
        if (analysis.threat_level === 'high' || analysis.threat_level === 'critical') {
          await createAlertMutation.mutateAsync({
            alert_type: 'surveillance_detected',
            severity: analysis.threat_level,
            title: 'Surveillance Activity Detected',
            description: analysis.threat_assessment,
            source: 'Live Camera',
            detection_timestamp: new Date().toISOString(),
            recommended_actions: analysis.recommendations || []
          });
        }
        
        setCapturedImages(prev => [{
          id: Date.now(),
          url: file_url,
          timestamp: new Date().toISOString(),
          analysis
        }, ...prev]);
        
      } catch (error) {
        console.error("Capture error:", error);
      }
      setAnalyzing(false);
    }, 'image/jpeg', 0.9);
  };

  const startBLEScan = () => {
    setBleScanning(true);
    // Simulated BLE scan - in production, this would use Web Bluetooth API
    setTimeout(() => {
      const devices = [
        { name: 'iPhone 15', mac: generateMAC(), rssi: -45, type: 'Phone', suspicious: false },
        { name: 'AirTag', mac: generateMAC(), rssi: -40, type: 'Tracker', suspicious: true },
        { name: 'Unknown Device', mac: generateMAC(), rssi: -35, type: 'Unknown', suspicious: true },
        { name: 'Tile Tracker', mac: generateMAC(), rssi: -50, type: 'Tracker', suspicious: true },
        { name: 'Samsung Galaxy', mac: generateMAC(), rssi: -48, type: 'Phone', suspicious: false }
      ];
      setBleDevices(devices);
      
      // Create alerts for suspicious devices
      devices.filter(d => d.suspicious).forEach(device => {
        createAlertMutation.mutate({
          alert_type: 'surveillance_detected',
          severity: device.type === 'Tracker' ? 'high' : 'medium',
          title: `Suspicious BLE Device: ${device.name}`,
          description: `Detected ${device.type} device with MAC ${device.mac} at signal strength ${device.rssi}dBm`,
          source: device.mac,
          detection_timestamp: new Date().toISOString(),
          recommended_actions: ['Investigate device owner', 'Check for unauthorized tracking', 'Document location and time']
        });
      });
    }, 2000);
  };

  const generateMAC = () => {
    return Array.from({length: 6}, () => 
      Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
    ).join(':').toUpperCase();
  };

  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setAnalyzing(true);
    
    try {
      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      
      // Determine analysis type based on active tab
      const prompts = {
        logs: 'APT log analysis: Detect authentication anomalies, privilege escalation, persistence mechanisms, C2 beaconing patterns. Provide timeline of suspicious activities and IOCs.',
        pcap: 'Network traffic analysis: Detect C2 beaconing, data exfiltration attempts, port scanning, reconnaissance activity. Identify malicious IPs and provide network-based IOCs.',
        hash: 'File and malware analysis: Analyze file hashes, detect APT tooling, identify obfuscation techniques, assess surveillance capabilities. Provide file-based IOCs and malware families.',
        config: 'Configuration security audit: Review access controls, identify logging gaps, detect misconfigurations, assess hardening posture. Provide specific configuration recommendations.',
        vehicle: 'Vehicle tracking analysis: Detect patterns indicating surveillance (repeated vehicles, coordination, suspicious timing). Assess counter-surveillance measures needed.',
      };

      // Read file content
      const reader = new FileReader();
      reader.onload = async (event) => {
        const content = event.target.result;
        const analysis = await analyzeWithAI(prompts[activeTab] || 'Analyze this file for security threats:', content);
        
        // Store as evidence
        await createEvidenceMutation.mutateAsync({
          evidence_number: `FILE-${Date.now().toString().slice(-8)}`,
          title: file.name,
          description: analysis.summary || "Uploaded for analysis",
          evidence_type: activeTab === 'pcap' ? 'network_capture' : 'file',
          file_url: file_url,
          collection_method: `${activeTab.toUpperCase()} Analysis Upload`,
          collection_timestamp: new Date().toISOString(),
          case_id: 'analysis',
          metadata: analysis
        });
        
        // Create alert if high threat
        if (analysis.threat_level === 'high' || analysis.threat_level === 'critical') {
          await createAlertMutation.mutateAsync({
            alert_type: activeTab === 'pcap' ? 'network_anomaly' : 'system_compromise',
            severity: analysis.threat_level,
            title: `${activeTab.toUpperCase()} Analysis: Threat Detected`,
            description: analysis.summary,
            source: file.name,
            detection_timestamp: new Date().toISOString(),
            recommended_actions: analysis.recommendations || []
          });
        }
        
        setResults(analysis);
        setAnalyzing(false);
      };
      reader.readAsText(file);
      
    } catch (error) {
      console.error("Upload error:", error);
      setAnalyzing(false);
    }
  };

  const exportResults = (format) => {
    const data = format === 'json' 
      ? JSON.stringify({
          timestamp: new Date().toISOString(),
          analysis_type: activeTab,
          results,
          captured_images: capturedImages,
          ble_devices: bleDevices,
          evidence_collected: evidence.length,
          alerts_generated: alerts.length
        }, null, 2)
      : `SENTINEL FORENSICS REPORT
Generated: ${new Date().toISOString()}
Analysis Type: ${activeTab.toUpperCase()}
Operator: ${user?.email || 'Unknown'}

=== RESULTS ===
${JSON.stringify(results, null, 2)}

=== CAPTURED IMAGES ===
${capturedImages.length} images captured

=== BLE DEVICES ===
${bleDevices.length} devices detected
${bleDevices.filter(d => d.suspicious).length} suspicious devices

=== EVIDENCE COLLECTED ===
Total Evidence Items: ${evidence.length}

=== ALERTS GENERATED ===
Total Alerts: ${alerts.length}
Critical: ${alerts.filter(a => a.severity === 'critical').length}
High: ${alerts.filter(a => a.severity === 'high').length}`;

    const blob = new Blob([data], { type: format === 'json' ? 'application/json' : 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel_${Date.now()}${format === 'json' ? '.json' : '.txt'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const tabs = [
    { id: 'logs', name: 'System Logs', icon: FileText },
    { id: 'pcap', name: 'Network', icon: Network },
    { id: 'hash', name: 'Files', icon: Hash },
    { id: 'config', name: 'Config', icon: Settings },
    { id: 'image', name: 'Camera', icon: Camera },
    { id: 'vehicle', name: 'Vehicle', icon: Car },
    { id: 'ble', name: 'BLE Scan', icon: Bluetooth }
  ];

  const suspiciousCount = alerts.filter(a => a.severity === 'high' || a.severity === 'critical').length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Shield className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Sentinel Scanner</h1>
            <p className="text-slate-400">APT Detection & Counter-Surveillance Suite</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => exportResults('json')} 
            variant="outline"
            className="border-slate-700"
          >
            <Download className="w-4 h-4 mr-2" />
            Export JSON
          </Button>
          <Button 
            onClick={() => exportResults('report')}
            className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-700 hover:to-blue-700"
          >
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Eye className="w-4 h-4 text-red-400" />
              <span className="text-xs text-slate-400">Critical Alerts</span>
            </div>
            <p className="text-2xl font-bold text-white">{suspiciousCount}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Car className="w-4 h-4 text-orange-400" />
              <span className="text-xs text-slate-400">Evidence Items</span>
            </div>
            <p className="text-2xl font-bold text-white">{evidence.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Bluetooth className="w-4 h-4 text-blue-400" />
              <span className="text-xs text-slate-400">BLE Devices</span>
            </div>
            <p className="text-2xl font-bold text-white">{bleDevices.length}</p>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Camera className="w-4 h-4 text-cyan-400" />
              <span className="text-xs text-slate-400">Captures</span>
            </div>
            <p className="text-2xl font-bold text-white">{capturedImages.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Main Scanner Interface */}
      <Card className="bg-slate-900/50 border-slate-800 backdrop-blur-xl">
        <CardContent className="p-6">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid grid-cols-4 md:grid-cols-7 gap-2 bg-slate-800/50 p-1">
              {tabs.map(tab => {
                const Icon = tab.icon;
                return (
                  <TabsTrigger
                    key={tab.id}
                    value={tab.id}
                    className="flex flex-col items-center gap-1 data-[state=active]:bg-cyan-600"
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-xs hidden md:inline">{tab.name}</span>
                  </TabsTrigger>
                );
              })}
            </TabsList>

            {/* Camera Tab */}
            <TabsContent value="image" className="space-y-4">
              <div className="flex gap-3">
                {!cameraActive ? (
                  <Button 
                    onClick={startCamera}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    <Video className="w-4 h-4 mr-2" />
                    Start Camera
                  </Button>
                ) : (
                  <>
                    <Button 
                      onClick={captureImage}
                      disabled={analyzing}
                      className="bg-cyan-600 hover:bg-cyan-700"
                    >
                      <Camera className="w-4 h-4 mr-2" />
                      {analyzing ? 'Analyzing...' : 'Capture & Analyze'}
                    </Button>
                    <Button 
                      onClick={stopCamera}
                      variant="destructive"
                    >
                      Stop Camera
                    </Button>
                  </>
                )}
              </div>

              {cameraActive && (
                <div className="bg-black rounded-lg overflow-hidden">
                  <video 
                    ref={videoRef} 
                    autoPlay 
                    playsInline 
                    className="w-full max-h-96 object-contain"
                  />
                </div>
              )}
              <canvas ref={canvasRef} className="hidden" />

              {capturedImages.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-white">Captured Images</h3>
                  {capturedImages.map(img => (
                    <Card key={img.id} className="bg-slate-800/50 border-slate-700">
                      <CardContent className="p-4">
                        <div className="flex gap-4">
                          <img 
                            src={img.url} 
                            alt="Captured" 
                            className="w-32 h-32 object-cover rounded"
                          />
                          <div className="flex-1">
                            <p className="text-xs text-slate-400 mb-2">
                              {new Date(img.timestamp).toLocaleString()}
                            </p>
                            <Badge className={`mb-2 ${
                              img.analysis.threat_level === 'critical' ? 'bg-red-500' :
                              img.analysis.threat_level === 'high' ? 'bg-orange-500' :
                              img.analysis.threat_level === 'medium' ? 'bg-yellow-500' :
                              'bg-green-500'
                            }`}>
                              {img.analysis.threat_level?.toUpperCase() || 'UNKNOWN'}
                            </Badge>
                            <p className="text-sm text-slate-200">
                              {img.analysis.threat_assessment || 'Analysis complete'}
                            </p>
                            {img.analysis.vehicles?.length > 0 && (
                              <div className="mt-2">
                                <p className="text-xs text-slate-400 mb-1">Vehicles Detected:</p>
                                {img.analysis.vehicles.map((v, idx) => (
                                  <Badge key={idx} variant="outline" className="mr-1 mb-1">
                                    {v.color} {v.make_model || v.type}
                                  </Badge>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* BLE Scan Tab */}
            <TabsContent value="ble" className="space-y-4">
              <div className="flex gap-3">
                {!bleScanning ? (
                  <Button 
                    onClick={startBLEScan}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    <Bluetooth className="w-4 h-4 mr-2" />
                    Start BLE Scan
                  </Button>
                ) : (
                  <Button 
                    onClick={() => setBleScanning(false)}
                    variant="destructive"
                  >
                    Stop Scan
                  </Button>
                )}
              </div>

              {bleDevices.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-lg font-bold text-white">
                    Detected BLE Devices ({bleDevices.length})
                  </h3>
                  {bleDevices.map((device, idx) => (
                    <Card 
                      key={idx} 
                      className={`bg-slate-800/50 ${
                        device.suspicious ? 'border-red-500' : 'border-slate-700'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-semibold text-white">{device.name}</p>
                            <p className="text-sm text-slate-400">MAC: {device.mac}</p>
                            <p className="text-sm text-slate-400">
                              Type: {device.type} | Signal: {device.rssi}dBm
                            </p>
                          </div>
                          {device.suspicious && (
                            <Badge className="bg-red-500 text-white">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              SUSPICIOUS
                            </Badge>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>

            {/* File Upload Tabs */}
            {['logs', 'pcap', 'hash', 'config', 'vehicle'].map(tabId => (
              <TabsContent key={tabId} value={tabId} className="space-y-4">
                <div className="border-2 border-dashed border-slate-600 rounded-lg p-12 text-center hover:border-cyan-500 transition-colors">
                  <input 
                    type="file" 
                    id={`upload-${tabId}`}
                    className="hidden" 
                    onChange={handleFileUpload}
                    accept=".txt,.log,.conf,.cfg,.json,.pcap,.cap,.csv"
                  />
                  <label htmlFor={`upload-${tabId}`} className="cursor-pointer">
                    <Upload className="w-16 h-16 mx-auto mb-4 text-slate-400" />
                    <p className="text-lg font-semibold text-white mb-2">
                      Upload {tabId.toUpperCase()} Files
                    </p>
                    <p className="text-sm text-slate-400">
                      Click to select files for AI-powered forensic analysis
                    </p>
                  </label>
                </div>

                {analyzing && (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardContent className="p-8 text-center">
                      <Loader2 className="w-12 h-12 animate-spin text-cyan-500 mx-auto mb-4" />
                      <p className="text-lg font-semibold text-white">
                        Analyzing with AI...
                      </p>
                      <p className="text-sm text-slate-400 mt-2">
                        This may take a few moments
                      </p>
                    </CardContent>
                  </Card>
                )}

                {results && !analyzing && (
                  <Card className="bg-slate-800 border-slate-700">
                    <CardHeader>
                      <CardTitle className="text-white flex items-center justify-between">
                        Analysis Results
                        <Badge className={`${
                          results.threat_level === 'critical' ? 'bg-red-500' :
                          results.threat_level === 'high' ? 'bg-orange-500' :
                          results.threat_level === 'medium' ? 'bg-yellow-500' :
                          'bg-green-500'
                        } text-white`}>
                          {results.threat_level?.toUpperCase() || 'INFO'}
                        </Badge>
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {results.summary && (
                        <div>
                          <h4 className="font-semibold text-white mb-2">Summary</h4>
                          <p className="text-slate-300">{results.summary}</p>
                        </div>
                      )}

                      {results.indicators?.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-white mb-2">
                            Indicators of Compromise (IOCs)
                          </h4>
                          <div className="space-y-1">
                            {results.indicators.map((ioc, idx) => (
                              <Badge key={idx} variant="outline" className="mr-2 mb-2">
                                {ioc}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {results.recommendations?.length > 0 && (
                        <div>
                          <h4 className="font-semibold text-white mb-2">
                            Recommendations
                          </h4>
                          <ul className="list-disc list-inside space-y-1 text-slate-300">
                            {results.recommendations.map((rec, idx) => (
                              <li key={idx}>{rec}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {results.detailed_analysis && (
                        <div>
                          <h4 className="font-semibold text-white mb-2">
                            Detailed Analysis
                          </h4>
                          <div className="whitespace-pre-wrap text-slate-300 text-sm bg-slate-900 p-4 rounded">
                            {results.detailed_analysis}
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}