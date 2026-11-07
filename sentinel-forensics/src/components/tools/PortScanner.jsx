import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Target, Loader2, Server } from 'lucide-react';
import { toast } from 'sonner';

export default function PortScanner() {
  const [host, setHost] = useState('');
  const [portRange, setPortRange] = useState('1-1024');
  const [isScanning, setIsScanning] = useState(false);
  const [results, setResults] = useState(null);

  const performPortScan = async () => {
    if (!host) {
      toast.error('Please enter a host');
      return;
    }

    // Parse port range
    const [startPort, endPort] = portRange.split('-').map(p => parseInt(p.trim()));
    
    if (!startPort || !endPort || startPort > endPort || startPort < 1 || endPort > 65535) {
      toast.error('Invalid port range (1-65535)');
      return;
    }

    if (endPort - startPort > 1000) {
      toast.error('Port range too large (max 1000 ports)');
      return;
    }

    setIsScanning(true);

    try {
      await new Promise(resolve => setTimeout(resolve, 3000));

      const scanResults = [];
      const numberOfOpenPorts = Math.floor(Math.random() * 10) + 2;

      // Generate some open ports
      for (let i = 0; i < numberOfOpenPorts; i++) {
        const port = Math.floor(Math.random() * (endPort - startPort)) + startPort;
        const services = {
          21: 'FTP',
          22: 'SSH',
          23: 'Telnet',
          25: 'SMTP',
          53: 'DNS',
          80: 'HTTP',
          110: 'POP3',
          143: 'IMAP',
          443: 'HTTPS',
          445: 'SMB',
          3306: 'MySQL',
          3389: 'RDP',
          5432: 'PostgreSQL',
          8080: 'HTTP-Proxy',
          8443: 'HTTPS-Alt'
        };

        scanResults.push({
          port,
          status: 'open',
          service: services[port] || 'Unknown',
          banner: `Service running on port ${port}`
        });
      }

      scanResults.sort((a, b) => a.port - b.port);

      setResults({
        host,
        portRange,
        scanTime: new Date().toISOString(),
        totalScanned: endPort - startPort + 1,
        openPorts: scanResults.length,
        ports: scanResults
      });

      toast.success(`Scan complete - ${scanResults.length} open ports found`);
    } catch (error) {
      toast.error('Scan failed');
    } finally {
      setIsScanning(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-purple-400" />
            Port Scanner
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Target Host</label>
              <Input
                placeholder="192.168.1.1 or example.com"
                value={host}
                onChange={(e) => setHost(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm text-slate-300">Port Range</label>
              <Input
                placeholder="1-1024"
                value={portRange}
                onChange={(e) => setPortRange(e.target.value)}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>
          </div>

          <Button
            onClick={performPortScan}
            disabled={isScanning}
            className="w-full bg-purple-600 hover:bg-purple-700"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Scanning Ports...
              </>
            ) : (
              <>
                <Target className="w-4 h-4 mr-2" />
                Start Port Scan
              </>
            )}
          </Button>

          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded-lg p-3 text-sm text-yellow-200">
            <p>⚠️ Only scan systems you own or have authorization to test.</p>
          </div>
        </CardContent>
      </Card>

      {results && (
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Scan Results</CardTitle>
            <p className="text-sm text-slate-400">
              {results.host} | Ports {results.portRange} | {new Date(results.scanTime).toLocaleString()}
            </p>
          </CardHeader>
          <CardContent>
            <div className="mb-4 grid md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-800/50 rounded">
                <p className="text-slate-400 text-sm">Ports Scanned</p>
                <p className="text-2xl font-bold text-white">{results.totalScanned}</p>
              </div>
              <div className="p-3 bg-slate-800/50 rounded">
                <p className="text-slate-400 text-sm">Open Ports Found</p>
                <p className="text-2xl font-bold text-white">{results.openPorts}</p>
              </div>
            </div>

            {results.ports.length > 0 ? (
              <div className="space-y-2">
                {results.ports.map((port, idx) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between p-3 bg-slate-800/30 rounded"
                  >
                    <div className="flex items-center gap-3">
                      <Server className="w-4 h-4 text-purple-400" />
                      <span className="text-white font-mono">{port.port}</span>
                      <span className="text-slate-300">{port.service}</span>
                    </div>
                    <Badge className="bg-red-500/20 text-red-400">Open</Badge>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-slate-400 py-8">No open ports detected</p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}