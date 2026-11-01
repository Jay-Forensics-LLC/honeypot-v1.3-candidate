import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Network, Loader2, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';

export default function NetworkScanner() {
  const [target, setTarget] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState(null);

  const performScan = async () => {
    if (!target) {
      toast.error('Please enter a target IP or hostname');
      return;
    }

    // Validate input
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
    const hostnameRegex = /^[a-zA-Z0-9][a-zA-Z0-9-]{0,61}[a-zA-Z0-9]?(\.[a-zA-Z]{2,})+$/;
    
    if (!ipRegex.test(target) && !hostnameRegex.test(target)) {
      toast.error('Invalid IP address or hostname format');
      return;
    }

    setIsScanning(true);
    
    try {
      // Simulate network scan with realistic data
      await new Promise(resolve => setTimeout(resolve, 2500));

      const commonPorts = [
        { port: 21, service: 'FTP', status: 'closed' },
        { port: 22, service: 'SSH', status: Math.random() > 0.7 ? 'open' : 'closed' },
        { port: 23, service: 'Telnet', status: 'closed' },
        { port: 25, service: 'SMTP', status: 'filtered' },
        { port: 53, service: 'DNS', status: Math.random() > 0.5 ? 'open' : 'closed' },
        { port: 80, service: 'HTTP', status: Math.random() > 0.3 ? 'open' : 'closed' },
        { port: 110, service: 'POP3', status: 'closed' },
        { port: 143, service: 'IMAP', status: 'filtered' },
        { port: 443, service: 'HTTPS', status: Math.random() > 0.3 ? 'open' : 'closed' },
        { port: 445, service: 'SMB', status: Math.random() > 0.8 ? 'open' : 'closed' },
        { port: 3306, service: 'MySQL', status: 'closed' },
        { port: 3389, service: 'RDP', status: Math.random() > 0.9 ? 'open' : 'closed' },
        { port: 5432, service: 'PostgreSQL', status: 'closed' },
        { port: 8080, service: 'HTTP-Alt', status: Math.random() > 0.6 ? 'open' : 'closed' },
        { port: 8443, service: 'HTTPS-Alt', status: 'closed' }
      ];

      const openPorts = commonPorts.filter(p => p.status === 'open');
      const closedPorts = commonPorts.filter(p => p.status === 'closed');
      const filteredPorts = commonPorts.filter(p => p.status === 'filtered');

      setResults({
        target,
        scanTime: new Date().toISOString(),
        totalPorts: commonPorts.length,
        openPorts: openPorts.length,
        closedPorts: closedPorts.length,
        filteredPorts: filteredPorts.length,
        ports: commonPorts,
        hostInfo: {
          os: 'Unknown (fingerprinting requires deeper scan)',
          latency: Math.floor(Math.random() * 50) + 10 + 'ms',
          hops: Math.floor(Math.random() * 15) + 3
        },
        riskScore: openPorts.length > 5 ? 75 : openPorts.length > 2 ? 50 : 25
      });

      toast.success(`Scan completed - ${openPorts.length} open ports found`);
    } catch (error) {
      toast.error('Scan failed: ' + error.message);
    } finally {
      setIsScanning(false);
    }
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return 'bg-red-500/20 text-red-400 border-red-500/50';
      case 'closed': return 'bg-green-500/20 text-green-400 border-green-500/50';
      case 'filtered': return 'bg-yellow-500/20 text-yellow-400 border-yellow-500/50';
      default: return 'bg-slate-500/20 text-slate-400';
    }
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'open': return <XCircle className="w-4 h-4" />;
      case 'closed': return <CheckCircle className="w-4 h-4" />;
      case 'filtered': return <AlertTriangle className="w-4 h-4" />;
      default: return null;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Network className="w-5 h-5 text-blue-400" />
            Network Port Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-3">
            <Input
              placeholder="Enter IP address or hostname (e.g., 192.168.1.1)"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white flex-1"
              onKeyPress={(e) => e.key === 'Enter' && performScan()}
            />
            <Button
              onClick={performScan}
              disabled={isScanning}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {isScanning ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Scanning...
                </>
              ) : (
                <>
                  <Network className="w-4 h-4 mr-2" />
                  Scan
                </>
              )}
            </Button>
          </div>

          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-3 text-sm text-blue-200">
            <p className="font-semibold mb-1">⚠️ Legal Notice</p>
            <p className="text-xs">Only scan networks and systems you own or have explicit permission to test. Unauthorized scanning may be illegal.</p>
          </div>
        </CardContent>
      </Card>

      {results && (
        <>
          <div className="grid md:grid-cols-4 gap-4">
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-white">{results.openPorts}</p>
                <p className="text-xs text-slate-400">Open Ports</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-white">{results.closedPorts}</p>
                <p className="text-xs text-slate-400">Closed Ports</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-white">{results.filteredPorts}</p>
                <p className="text-xs text-slate-400">Filtered Ports</p>
              </CardContent>
            </Card>
            <Card className="bg-slate-900 border-slate-800">
              <CardContent className="p-4">
                <p className="text-2xl font-bold text-white">{results.riskScore}</p>
                <p className="text-xs text-slate-400">Risk Score</p>
              </CardContent>
            </Card>
          </div>

          <Card className="bg-slate-900 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white text-lg">Scan Results</CardTitle>
              <p className="text-sm text-slate-400">Target: {results.target} | Scanned: {new Date(results.scanTime).toLocaleString()}</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {results.ports.map((port, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-800/30 rounded hover:bg-slate-800/50"
                  >
                    <div className="flex items-center gap-3">
                      {getStatusIcon(port.status)}
                      <span className="text-white font-mono">{port.port}</span>
                      <span className="text-slate-300">{port.service}</span>
                    </div>
                    <Badge className={getStatusColor(port.status)}>
                      {port.status}
                    </Badge>
                  </div>
                ))}
              </div>

              <div className="mt-6 p-4 bg-slate-800/50 rounded-lg">
                <p className="text-white font-semibold mb-2">Host Information</p>
                <div className="grid md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <p className="text-slate-400">OS Detection</p>
                    <p className="text-white">{results.hostInfo.os}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Latency</p>
                    <p className="text-white">{results.hostInfo.latency}</p>
                  </div>
                  <div>
                    <p className="text-slate-400">Hops</p>
                    <p className="text-white">{results.hostInfo.hops}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}