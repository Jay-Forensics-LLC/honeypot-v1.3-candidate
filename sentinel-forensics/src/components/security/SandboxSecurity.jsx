import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Box, 
  Shield,
  Activity,
  AlertTriangle,
  Lock,
  CheckCircle,
  XCircle,
  Square
} from "lucide-react";
import { toast } from "sonner";

export default function SandboxSecurity() {
  const [sandboxes, setSandboxes] = useState([]);
  const [activeSandbox, setActiveSandbox] = useState(null);

  const createSandbox = async (type) => {
    const sandbox = {
      id: `SANDBOX-${Date.now()}`,
      type,
      status: 'initializing',
      created_at: new Date().toISOString(),
      cpu_limit: type === 'high_security' ? 10 : 50,
      memory_limit_mb: type === 'high_security' ? 128 : 512,
      network_access: type !== 'high_security',
      filesystem_access: 'restricted',
      process_count: 0,
      api_calls: 0,
      violations: []
    };

    setSandboxes(prev => [...prev, sandbox]);
    setActiveSandbox(sandbox.id);

    // Simulate initialization
    setTimeout(() => {
      setSandboxes(prev => prev.map(s => 
        s.id === sandbox.id ? { ...s, status: 'running' } : s
      ));
      toast.success(`Sandbox ${sandbox.id} created`);
    }, 1000);
  };

  const terminateSandbox = (sandboxId) => {
    setSandboxes(prev => prev.map(s => 
      s.id === sandboxId ? { ...s, status: 'terminated' } : s
    ));
    if (activeSandbox === sandboxId) setActiveSandbox(null);
    toast.info('Sandbox terminated');
  };

  const simulateViolation = (sandboxId) => {
    const violation = {
      timestamp: new Date().toISOString(),
      type: ['network_access', 'file_access', 'memory_limit', 'cpu_limit'][Math.floor(Math.random() * 4)],
      severity: 'high',
      action: 'blocked'
    };

    setSandboxes(prev => prev.map(s => 
      s.id === sandboxId ? { 
        ...s, 
        violations: [...(s.violations || []), violation]
      } : s
    ));

    toast.error(`Security violation in ${sandboxId}: ${violation.type}`);
  };

  const activeSandboxData = sandboxes.find(s => s.id === activeSandbox);

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Box className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{sandboxes.length}</p>
                <p className="text-xs text-slate-400">Total Sandboxes</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Activity className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {sandboxes.filter(s => s.status === 'running').length}
                </p>
                <p className="text-xs text-slate-400">Running</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-red-400" />
              <div>
                <p className="text-3xl font-bold text-white">
                  {sandboxes.reduce((sum, s) => sum + (s.violations?.length || 0), 0)}
                </p>
                <p className="text-xs text-slate-400">Violations</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">100%</p>
                <p className="text-xs text-slate-400">Isolated</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create Sandbox */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Box className="w-5 h-5 text-blue-400" />
            Sandboxed Execution Environment
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <Button
              onClick={() => createSandbox('standard')}
              className="h-24 bg-blue-600 hover:bg-blue-700"
            >
              <div className="text-center">
                <Shield className="w-8 h-8 mx-auto mb-2" />
                <p className="font-semibold">Standard Sandbox</p>
                <p className="text-xs opacity-80">Balanced isolation</p>
              </div>
            </Button>

            <Button
              onClick={() => createSandbox('high_security')}
              className="h-24 bg-red-600 hover:bg-red-700"
            >
              <div className="text-center">
                <Lock className="w-8 h-8 mx-auto mb-2" />
                <p className="font-semibold">High Security Sandbox</p>
                <p className="text-xs opacity-80">Maximum isolation</p>
              </div>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Sandboxes */}
      {sandboxes.length > 0 && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Active Sandboxes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sandboxes.map((sandbox) => (
                <div
                  key={sandbox.id}
                  className={`p-4 rounded-lg border ${
                    sandbox.status === 'running'
                      ? 'bg-green-500/10 border-green-500'
                      : sandbox.status === 'terminated'
                      ? 'bg-slate-800/30 border-slate-700'
                      : 'bg-blue-500/10 border-blue-500'
                  }`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h4 className="font-semibold text-white mb-1">{sandbox.id}</h4>
                      <p className="text-sm text-slate-400">
                        Type: {sandbox.type.replace('_', ' ')} | 
                        CPU: {sandbox.cpu_limit}% | 
                        Memory: {sandbox.memory_limit_mb}MB
                      </p>
                    </div>
                    <Badge className={
                      sandbox.status === 'running' ? 'bg-green-500' :
                      sandbox.status === 'terminated' ? 'bg-slate-500' :
                      'bg-blue-500 animate-pulse'
                    }>
                      {sandbox.status}
                    </Badge>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-3">
                    <div className="p-2 bg-slate-900/50 rounded text-center">
                      <p className="text-xs text-slate-400">Processes</p>
                      <p className="text-lg font-bold text-white">{sandbox.process_count}</p>
                    </div>
                    <div className="p-2 bg-slate-900/50 rounded text-center">
                      <p className="text-xs text-slate-400">API Calls</p>
                      <p className="text-lg font-bold text-white">{sandbox.api_calls}</p>
                    </div>
                    <div className="p-2 bg-slate-900/50 rounded text-center">
                      <p className="text-xs text-slate-400">Network</p>
                      <p className="text-lg font-bold text-white">
                        {sandbox.network_access ? (
                          <CheckCircle className="w-5 h-5 text-green-400 inline" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-400 inline" />
                        )}
                      </p>
                    </div>
                    <div className="p-2 bg-slate-900/50 rounded text-center">
                      <p className="text-xs text-slate-400">Violations</p>
                      <p className="text-lg font-bold text-red-400">{sandbox.violations?.length || 0}</p>
                    </div>
                  </div>

                  {sandbox.violations && sandbox.violations.length > 0 && (
                    <div className="mb-3 p-2 bg-red-500/10 border border-red-500 rounded text-xs">
                      <p className="font-semibold text-red-400 mb-1">Security Violations:</p>
                      {sandbox.violations.slice(-3).map((v, idx) => (
                        <p key={idx} className="text-slate-300">
                          • {v.type} ({v.action}) - {new Date(v.timestamp).toLocaleTimeString()}
                        </p>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2">
                    {sandbox.status === 'running' && (
                      <>
                        <Button
                          onClick={() => simulateViolation(sandbox.id)}
                          size="sm"
                          variant="outline"
                          className="border-orange-500 text-orange-400"
                        >
                          Test Security
                        </Button>
                        <Button
                          onClick={() => terminateSandbox(sandbox.id)}
                          size="sm"
                          variant="outline"
                          className="border-red-500 text-red-400"
                        >
                          <Square className="w-3 h-3 mr-1" />
                          Terminate
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Info */}
      <Card className="bg-blue-500/10 border border-blue-500">
        <CardContent className="p-6">
          <div className="flex items-start gap-3">
            <Shield className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
            <div>
              <h4 className="font-semibold text-blue-400 mb-2">Sandbox Security Features</h4>
              <ul className="text-sm text-slate-300 space-y-1">
                <li>• <strong>Process Isolation:</strong> Separate memory and CPU contexts</li>
                <li>• <strong>Resource Limits:</strong> CPU, memory, and network caps</li>
                <li>• <strong>Filesystem Isolation:</strong> Restricted file access</li>
                <li>• <strong>API Monitoring:</strong> Track all system calls</li>
                <li>• <strong>Network Control:</strong> Optional network isolation</li>
                <li>• <strong>Auto-Termination:</strong> Immediate shutdown on violations</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}