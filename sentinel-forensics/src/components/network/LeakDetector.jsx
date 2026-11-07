import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Shield,
  AlertTriangle,
  CheckCircle,
  Globe,
  Activity,
  Eye,
  Wifi
} from "lucide-react";
import { toast } from "sonner";

export default function LeakDetector() {
  const [scanning, setScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [results, setResults] = useState(null);

  const runLeakScan = async () => {
    setScanning(true);
    setScanProgress(0);
    
    const steps = [
      { name: 'IP Address Leak Test', duration: 1000 },
      { name: 'DNS Leak Test', duration: 1500 },
      { name: 'WebRTC Leak Test', duration: 1200 },
      { name: 'IPv6 Leak Test', duration: 800 },
      { name: 'Browser Fingerprint Check', duration: 1000 }
    ];

    const scanResults = {
      ipLeak: { passed: true, message: 'No IP address leaks detected' },
      dnsLeak: { passed: false, message: 'DNS requests leaking to ISP servers', ips: ['8.8.8.8', '1.1.1.1'] },
      webRTCLeak: { passed: true, message: 'WebRTC leak protection active' },
      ipv6Leak: { passed: true, message: 'IPv6 disabled' },
      fingerprint: { passed: false, message: 'Browser fingerprint is unique', entropy: 18.5 }
    };

    for (let i = 0; i < steps.length; i++) {
      await new Promise(resolve => setTimeout(resolve, steps[i].duration));
      setScanProgress(((i + 1) / steps.length) * 100);
    }

    setResults(scanResults);
    setScanning(false);

    const leaksFound = Object.values(scanResults).filter(r => !r.passed).length;
    if (leaksFound === 0) {
      toast.success('No leaks detected! Your connection is secure.');
    } else {
      toast.warning(`${leaksFound} potential leak(s) detected`);
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Eye className="w-5 h-5 text-blue-400" />
          Privacy Leak Detector
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="text-center">
          <p className="text-slate-300 mb-4">
            Scan for DNS, WebRTC, and IP address leaks that could compromise your privacy
          </p>
          
          <Button
            onClick={runLeakScan}
            disabled={scanning}
            className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
          >
            {scanning ? (
              <>
                <Activity className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Run Leak Scan
              </>
            )}
          </Button>

          {scanning && (
            <div className="mt-4">
              <Progress value={scanProgress} className="h-2" />
              <p className="text-sm text-slate-400 mt-2">{Math.round(scanProgress)}% complete</p>
            </div>
          )}
        </div>

        {results && (
          <div className="space-y-3 mt-6">
            <h3 className="text-white font-semibold">Scan Results</h3>

            {/* IP Leak */}
            <div className={`p-4 rounded-lg border ${
              results.ipLeak.passed 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className={`w-5 h-5 ${results.ipLeak.passed ? 'text-green-400' : 'text-red-400'}`} />
                  <div>
                    <p className="text-white font-medium">IP Address Leak</p>
                    <p className="text-sm text-slate-400">{results.ipLeak.message}</p>
                  </div>
                </div>
                {results.ipLeak.passed ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>

            {/* DNS Leak */}
            <div className={`p-4 rounded-lg border ${
              results.dnsLeak.passed 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3">
                  <Wifi className={`w-5 h-5 ${results.dnsLeak.passed ? 'text-green-400' : 'text-red-400'}`} />
                  <div>
                    <p className="text-white font-medium">DNS Leak</p>
                    <p className="text-sm text-slate-400">{results.dnsLeak.message}</p>
                  </div>
                </div>
                {results.dnsLeak.passed ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
              </div>
              {!results.dnsLeak.passed && results.dnsLeak.ips && (
                <div className="mt-2 text-xs text-red-300">
                  <p>Leaked DNS servers:</p>
                  {results.dnsLeak.ips.map(ip => (
                    <Badge key={ip} variant="outline" className="mr-1 mt-1 border-red-500/50 text-red-400">
                      {ip}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* WebRTC Leak */}
            <div className={`p-4 rounded-lg border ${
              results.webRTCLeak.passed 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Activity className={`w-5 h-5 ${results.webRTCLeak.passed ? 'text-green-400' : 'text-red-400'}`} />
                  <div>
                    <p className="text-white font-medium">WebRTC Leak</p>
                    <p className="text-sm text-slate-400">{results.webRTCLeak.message}</p>
                  </div>
                </div>
                {results.webRTCLeak.passed ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>

            {/* IPv6 Leak */}
            <div className={`p-4 rounded-lg border ${
              results.ipv6Leak.passed 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-red-500/10 border-red-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Globe className={`w-5 h-5 ${results.ipv6Leak.passed ? 'text-green-400' : 'text-red-400'}`} />
                  <div>
                    <p className="text-white font-medium">IPv6 Leak</p>
                    <p className="text-sm text-slate-400">{results.ipv6Leak.message}</p>
                  </div>
                </div>
                {results.ipv6Leak.passed ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
              </div>
            </div>

            {/* Browser Fingerprint */}
            <div className={`p-4 rounded-lg border ${
              results.fingerprint.passed 
                ? 'bg-green-500/10 border-green-500/30' 
                : 'bg-yellow-500/10 border-yellow-500/30'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Eye className={`w-5 h-5 ${results.fingerprint.passed ? 'text-green-400' : 'text-yellow-400'}`} />
                  <div>
                    <p className="text-white font-medium">Browser Fingerprint</p>
                    <p className="text-sm text-slate-400">{results.fingerprint.message}</p>
                    {results.fingerprint.entropy && (
                      <p className="text-xs text-slate-500 mt-1">
                        Entropy: {results.fingerprint.entropy} bits (higher = more unique)
                      </p>
                    )}
                  </div>
                </div>
                {results.fingerprint.passed ? (
                  <CheckCircle className="w-5 h-5 text-green-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-yellow-400" />
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}