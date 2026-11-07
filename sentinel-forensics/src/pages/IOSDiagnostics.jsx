import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Smartphone, 
  CheckCircle, 
  XCircle, 
  AlertTriangle,
  RefreshCw,
  Copy,
  Download
} from 'lucide-react';
import { toast } from 'sonner';
import { base44 } from '@/api/base44Client';

/**
 * iOS Diagnostics Page
 * Comprehensive iOS compatibility testing and debugging
 */
export default function IOSDiagnostics() {
  const [diagnostics, setDiagnostics] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    // Capture console logs
    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = (...args) => {
      setLogs(prev => [...prev, { type: 'log', message: args.join(' '), time: new Date().toISOString() }]);
      originalLog(...args);
    };

    console.error = (...args) => {
      setLogs(prev => [...prev, { type: 'error', message: args.join(' '), time: new Date().toISOString() }]);
      originalError(...args);
    };

    console.warn = (...args) => {
      setLogs(prev => [...prev, { type: 'warn', message: args.join(' '), time: new Date().toISOString() }]);
      originalWarn(...args);
    };

    return () => {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    };
  }, []);

  const runDiagnostics = async () => {
    setIsRunning(true);
    const results = [];

    try {
      // Test 1: Device Detection
      const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
      results.push({
        test: 'iOS Detection',
        status: isIOS ? 'passed' : 'info',
        message: isIOS ? 'iOS device detected' : 'Not an iOS device',
        details: navigator.userAgent
      });

      // Test 2: iOS Version
      const iOSVersion = navigator.userAgent.match(/iPhone OS ([\d_]+)/)?.[1]?.replace(/_/g, '.');
      results.push({
        test: 'iOS Version',
        status: iOSVersion ? 'passed' : 'warning',
        message: iOSVersion || 'Could not detect version',
        details: `Version: ${iOSVersion || 'Unknown'}`
      });

      // Test 3: Viewport
      results.push({
        test: 'Viewport Size',
        status: 'passed',
        message: `${window.innerWidth}x${window.innerHeight}`,
        details: `Device Pixel Ratio: ${window.devicePixelRatio}`
      });

      // Test 4: Network Status
      const isOnline = navigator.onLine;
      results.push({
        test: 'Network Status',
        status: isOnline ? 'passed' : 'failed',
        message: isOnline ? 'Online' : 'Offline'
      });

      // Test 5: LocalStorage
      try {
        localStorage.setItem('test', 'test');
        localStorage.removeItem('test');
        results.push({
          test: 'LocalStorage',
          status: 'passed',
          message: 'Available'
        });
      } catch (error) {
        results.push({
          test: 'LocalStorage',
          status: 'failed',
          message: 'Blocked or unavailable',
          details: error.message
        });
      }

      // Test 6: Fetch API
      try {
        await fetch('https://jsonplaceholder.typicode.com/posts/1');
        results.push({
          test: 'Fetch API',
          status: 'passed',
          message: 'Working'
        });
      } catch (error) {
        results.push({
          test: 'Fetch API',
          status: 'failed',
          message: 'Failed',
          details: error.message
        });
      }

      // Test 7: Base44 Auth
      try {
        const user = await base44.auth.me();
        results.push({
          test: 'Base44 Authentication',
          status: user ? 'passed' : 'warning',
          message: user ? `Logged in as ${user.email}` : 'Not authenticated',
          details: user ? `Role: ${user.role}` : ''
        });
      } catch (error) {
        results.push({
          test: 'Base44 Authentication',
          status: 'failed',
          message: 'Auth failed',
          details: error.message
        });
      }

      // Test 8: Entity Query
      try {
        const cases = await base44.entities.Case.list('-created_date', 1);
        results.push({
          test: 'Entity Query (Case)',
          status: 'passed',
          message: `Query successful (${cases?.length || 0} records)`
        });
      } catch (error) {
        results.push({
          test: 'Entity Query (Case)',
          status: 'failed',
          message: 'Query failed',
          details: error.message
        });
      }

      // Test 9: React Rendering
      results.push({
        test: 'React Rendering',
        status: 'passed',
        message: 'Components rendering',
        details: `Render count: ${results.length + 1}`
      });

      // Test 10: CSS Support
      const supportsCSSGrid = CSS.supports('display', 'grid');
      const supportsFlex = CSS.supports('display', 'flex');
      results.push({
        test: 'CSS Features',
        status: supportsCSSGrid && supportsFlex ? 'passed' : 'warning',
        message: `Grid: ${supportsCSSGrid}, Flex: ${supportsFlex}`
      });

      setDiagnostics(results);
      toast.success(`Diagnostics complete: ${results.filter(r => r.status === 'passed').length}/${results.length} passed`);

    } catch (error) {
      console.error('Diagnostics failed:', error);
      toast.error('Diagnostics failed: ' + error.message);
    } finally {
      setIsRunning(false);
    }
  };

  const copyLogs = () => {
    const logText = logs.map(l => `[${l.time}] ${l.type.toUpperCase()}: ${l.message}`).join('\n');
    navigator.clipboard.writeText(logText);
    toast.success('Logs copied to clipboard');
  };

  const downloadReport = () => {
    const report = {
      timestamp: new Date().toISOString(),
      userAgent: navigator.userAgent,
      diagnostics,
      logs: logs.slice(-50)
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ios-diagnostics-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Report downloaded');
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2 flex items-center gap-3">
            <Smartphone className="w-8 h-8 text-blue-400" />
            iOS Diagnostics
          </h1>
          <p className="text-slate-400">Comprehensive iOS compatibility testing</p>
        </div>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Device Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <p className="text-slate-400">User Agent:</p>
                <p className="text-white font-mono text-xs break-all">{navigator.userAgent}</p>
              </div>
              <div>
                <p className="text-slate-400">Viewport:</p>
                <p className="text-white">{window.innerWidth} x {window.innerHeight}</p>
              </div>
              <div>
                <p className="text-slate-400">Pixel Ratio:</p>
                <p className="text-white">{window.devicePixelRatio}</p>
              </div>
              <div>
                <p className="text-slate-400">Connection:</p>
                <p className="text-white">{navigator.connection?.effectiveType || 'Unknown'}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Run Diagnostics</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={runDiagnostics}
              disabled={isRunning}
              className="w-full bg-gradient-to-r from-blue-600 to-purple-600"
            >
              {isRunning ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Running Tests...
                </>
              ) : (
                <>
                  <Smartphone className="w-4 h-4 mr-2" />
                  Run iOS Compatibility Tests
                </>
              )}
            </Button>

            {diagnostics.length > 0 && (
              <div className="space-y-2 mt-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-semibold text-white">Test Results</h3>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={copyLogs}>
                      <Copy className="w-4 h-4 mr-2" />
                      Copy Logs
                    </Button>
                    <Button size="sm" variant="outline" onClick={downloadReport}>
                      <Download className="w-4 h-4 mr-2" />
                      Download Report
                    </Button>
                  </div>
                </div>

                {diagnostics.map((result, idx) => (
                  <div key={idx} className="flex items-start justify-between bg-slate-800/50 p-4 rounded-lg">
                    <div className="flex items-start gap-3 flex-1">
                      {result.status === 'passed' ? (
                        <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                      ) : result.status === 'failed' ? (
                        <XCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-white">{result.test}</p>
                        <p className="text-xs text-slate-400">{result.message}</p>
                        {result.details && (
                          <p className="text-xs text-slate-500 mt-1 font-mono break-all">{result.details}</p>
                        )}
                      </div>
                    </div>
                    <Badge className={
                      result.status === 'passed' ? 'bg-green-500/20 text-green-400' :
                      result.status === 'failed' ? 'bg-red-500/20 text-red-400' :
                      'bg-yellow-500/20 text-yellow-400'
                    }>
                      {result.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {logs.length > 0 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Console Logs ({logs.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="bg-slate-950 rounded-lg p-4 max-h-96 overflow-y-auto">
                {logs.slice(-20).map((log, idx) => (
                  <div key={idx} className="text-xs mb-1">
                    <span className={
                      log.type === 'error' ? 'text-red-400' :
                      log.type === 'warn' ? 'text-yellow-400' :
                      'text-slate-400'
                    }>
                      [{new Date(log.time).toLocaleTimeString()}] {log.type.toUpperCase()}:
                    </span>
                    <span className="text-slate-300 ml-2">{log.message}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}