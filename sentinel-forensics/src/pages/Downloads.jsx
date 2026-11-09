import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Download,
  Apple,
  Monitor,
  Smartphone,
  Terminal,
  Shield,
  CheckCircle,
  Copy,
  ExternalLink,
  Info,
  FileCheck
} from 'lucide-react';
import { toast } from 'sonner';

export default function Downloads() {
  const [copiedCommand, setCopiedCommand] = useState(null);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: agentLinks, isLoading: linksLoading } = useQuery({
    queryKey: ['agent-download-links'],
    queryFn: async () => {
      const result = await base44.functions.invoke('getAgentDownloadLinks');
      return result.data;
    }
  });

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    setCopiedCommand(label);
    toast.success('Copied to clipboard!');
    setTimeout(() => setCopiedCommand(null), 2000);
  };

  const handleDownload = (url, filename) => {
    if (!url || url.includes('PLACEHOLDER') || url.includes('YOUR_R2_BUCKET')) {
      toast.error('Download not available', {
        description: 'Agent binary not yet uploaded to object storage. Contact admin.',
        duration: 5000
      });
      return;
    }
    
    // Trigger download
    const link = document.createElement('a');
    link.href = url;
    link.download = filename || 'sentinel-agent.exe';
    link.click();
    toast.success('Download started');
  };

  const agentCommands = {
    macos: {
      install: `curl -fsSL https://sentinel-forensics.app/install/macos.sh | sudo bash`,
      verify: `sentinel-agent --version`,
      start: `sudo sentinel-agent start`,
      status: `sudo sentinel-agent status`,
      logs: `sudo tail -f /var/log/sentinel-agent.log`,
      uninstall: `sudo /usr/local/bin/sentinel-agent uninstall`
    },
    linux: {
      install: `curl -fsSL https://sentinel-forensics.app/install/linux.sh | sudo bash`,
      verify: `sentinel-agent --version`,
      start: `sudo systemctl start sentinel-agent`,
      status: `sudo systemctl status sentinel-agent`,
      logs: `sudo journalctl -u sentinel-agent -f`,
      uninstall: `sudo apt remove sentinel-agent -y  # Debian/Ubuntu\nsudo yum remove sentinel-agent -y  # RHEL/CentOS`
    },
    windows: {
      install: `iwr -useb https://sentinel-forensics.app/install/windows.ps1 | iex`,
      verify: `sentinel-agent.exe --version`,
      start: `Start-Service SentinelAgent`,
      status: `Get-Service SentinelAgent`,
      logs: `Get-EventLog -LogName Application -Source SentinelAgent -Newest 50`,
      uninstall: `& "C:\\Program Files\\Sentinel\\uninstall.exe"`
    },
    ios: {
      sysdiagnose: `Press and hold: Volume Up + Volume Down + Power\nHold for 1-2 seconds, then release\nWait 10 minutes\nSettings → Privacy → Analytics → Analytics Data → sysdiagnose_*`,
      backup: `Mac: Finder → iPhone → Back Up Now (unencrypted)\nWindows: iTunes → iPhone → Back Up`,
      // Removed `shortcuts` field as it's replaced by the placeholder in JSX.
      // Keeping it commented out or removed here depends on whether it's used elsewhere.
      // For this change, it's safe to remove as the JSX block is entirely replaced.
      // shortcuts: `Install via App Store:\n1. Open Safari on iPhone\n2. Go to: https://sentinel-forensics.app/ios/shortcuts\n3. Tap "Get Shortcut"\n4. Add to Shortcuts app\n5. Run "Sentinel Evidence Collector" shortcut`,
      logs: `Settings → Privacy & Security → Analytics & Improvements → Analytics Data\nShare logs via AirDrop or email`
    },
    android: {
      apk: `Option 1: Via ADB\nadb install sentinel-agent.apk\n\nOption 2: Direct Install\n1. Download APK\n2. Settings → Security → Install Unknown Apps\n3. Allow installation\n4. Tap APK file to install`,
      bugreport: `Developer Options must be enabled:\n1. Settings → About Phone → Tap "Build Number" 7 times\n2. Settings → System → Developer Options\n3. Tap "Take Bug Report"\n4. Select "Interactive Report"\n5. Wait 2-5 minutes\n6. Share via email/USB`,
      logcat: `Via ADB:\nadb logcat -d > device-logs.txt\n\nOr use Terminal app:\nlogcat -d > /sdcard/Download/logs.txt`,
      permissions: `Check for suspicious apps:\nadb shell pm list packages -3\nadb shell dumpsys package [package.name] | grep permission`
    }
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">
            📥 Downloads & Agent Setup
          </h1>
          <p className="text-slate-400">
            Endpoint agents, mobile tools, and evidence collection utilities
          </p>
        </div>

        {/* Platform Tabs */}
        <Tabs defaultValue="macos" className="w-full">
          <TabsList className="grid grid-cols-2 md:grid-cols-5 gap-2 bg-slate-900/50 p-2">
            <TabsTrigger value="macos" className="data-[state=active]:bg-blue-600">
              <Apple className="w-4 h-4 mr-2" />
              macOS
            </TabsTrigger>
            <TabsTrigger value="windows" className="data-[state=active]:bg-blue-600">
              <Monitor className="w-4 h-4 mr-2" />
              Windows
            </TabsTrigger>
            <TabsTrigger value="linux" className="data-[state=active]:bg-blue-600">
              <Terminal className="w-4 h-4 mr-2" />
              Linux
            </TabsTrigger>
            <TabsTrigger value="ios" className="data-[state=active]:bg-blue-600">
              <Smartphone className="w-4 h-4 mr-2" />
              iOS
            </TabsTrigger>
            <TabsTrigger value="android" className="data-[state=active]:bg-blue-600">
              <Smartphone className="w-4 h-4 mr-2" />
              Android
            </TabsTrigger>
          </TabsList>

          {/* macOS */}
          <TabsContent value="macos" className="space-y-4 mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Apple className="w-5 h-5" />
                  Sentinel Agent for macOS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">Sentinel Agent v1.2.0</p>
                    <p className="text-sm text-slate-400">macOS 11.0+ (Intel & Apple Silicon)</p>
                  </div>
                  <Button
                    disabled
                    className="bg-slate-700 cursor-not-allowed min-h-[44px]"
                    title="Coming soon - use manual collection methods below"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download (.pkg)
                  </Button>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <p className="text-sm text-slate-400 mb-3">Quick Install (Terminal):</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-3 rounded text-sm text-green-400 overflow-x-auto">
                      {agentCommands.macos.install}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(agentCommands.macos.install, 'macos-install')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-8"
                    >
                      {copiedCommand === 'macos-install' ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-white">Common Commands:</p>
                  
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Verify Installation:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400">
                        {agentCommands.macos.verify}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.macos.verify, 'macos-verify')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        {copiedCommand === 'macos-verify' ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Start Agent:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400">
                        {agentCommands.macos.start}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.macos.start, 'macos-start')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        {copiedCommand === 'macos-start' ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Check Status:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400">
                        {agentCommands.macos.status}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.macos.status, 'macos-status')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        {copiedCommand === 'macos-status' ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">View Logs:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400">
                        {agentCommands.macos.logs}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.macos.logs, 'macos-logs')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        {copiedCommand === 'macos-logs' ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Uninstall:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-red-400">
                        {agentCommands.macos.uninstall}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.macos.uninstall, 'macos-uninstall')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        {copiedCommand === 'macos-uninstall' ? (
                          <CheckCircle className="w-3 h-3 text-green-400" />
                        ) : (
                          <Copy className="w-3 h-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-sm text-blue-200">
                    <strong>Note:</strong> Agent requires elevated privileges for system monitoring.
                    Install script requests sudo access for secure installation.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Manual Evidence Collection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 mb-2">Collect System Logs:</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-2 rounded text-xs text-green-400 overflow-x-auto">
{`# Collect all relevant logs
sudo log collect --last 24h --output ~/sentinel-logs.logarchive

# Convert to readable format  
log show --archive ~/sentinel-logs.logarchive > ~/sentinel-logs.txt

# Upload ~/sentinel-logs.txt to Evidence Vault`}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(`sudo log collect --last 24h --output ~/sentinel-logs.logarchive\nlog show --archive ~/sentinel-logs.logarchive > ~/sentinel-logs.txt`, 'macos-logs-manual')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">Network Traffic Capture:</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-2 rounded text-xs text-green-400 overflow-x-auto">
{`# Install tcpdump (if not present)
brew install tcpdump

# Capture 30 minutes of traffic
sudo tcpdump -i en0 -w ~/network-capture.pcap -G 1800 -W 1

# Upload ~/network-capture.pcap to Network Uploader`}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(`brew install tcpdump\nsudo tcpdump -i en0 -w ~/network-capture.pcap -G 1800 -W 1`, 'macos-tcpdump')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Windows */}
          <TabsContent value="windows" className="space-y-4 mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Monitor className="w-5 h-5" />
                  Sentinel Agent for Windows
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {linksLoading ? (
                  <div className="h-20 bg-slate-800/50 rounded animate-pulse" />
                ) : (
                  <>
                    <div className="flex items-center justify-between flex-wrap gap-3">
                      <div>
                        <p className="text-white font-semibold">Sentinel Agent v{agentLinks?.downloads?.windows?.version || '1.0.0'}</p>
                        <p className="text-sm text-slate-400">Windows 10/11 (x64)</p>
                        <p className="text-xs text-slate-500 mt-1">
                          Size: {((agentLinks?.downloads?.windows?.sizeBytes || 0) / 1024 / 1024).toFixed(1)} MB
                        </p>
                      </div>
                      <Button
                        onClick={() => handleDownload(
                          agentLinks?.downloads?.windows?.url,
                          'sentinel-agent-windows.exe'
                        )}
                        className="bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                      >
                        <Download className="w-4 h-4 mr-2" />
                        Download (.exe)
                      </Button>
                    </div>

                    {/* SHA-256 Verification */}
                    <div className="bg-slate-800/50 p-4 rounded-lg border border-slate-700">
                      <div className="flex items-center gap-2 mb-2">
                        <FileCheck className="w-4 h-4 text-green-400" />
                        <p className="text-sm font-semibold text-white">Integrity Verification</p>
                      </div>
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex-1">
                          <p className="text-xs text-slate-400 mb-1">SHA-256:</p>
                          <code className="text-xs text-green-400 font-mono break-all block bg-slate-900 p-2 rounded">
                            {agentLinks?.downloads?.windows?.sha256 || 'HASH_PENDING_UPLOAD'}
                          </code>
                        </div>
                        <Button
                          onClick={() => copyToClipboard(
                            agentLinks?.downloads?.windows?.sha256 || '',
                            'windows-hash'
                          )}
                          size="sm"
                          variant="outline"
                          className="border-slate-600 min-h-[44px]"
                        >
                          {copiedCommand === 'windows-hash' ? (
                            <CheckCircle className="w-4 h-4 text-green-400" />
                          ) : (
                            <Copy className="w-4 h-4" />
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-slate-400 mt-2">
                        Verify after download: <code className="text-cyan-400">certutil -hashfile sentinel-agent-windows.exe SHA256</code>
                      </p>
                    </div>
                  </>
                )}

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <p className="text-sm text-slate-400 mb-3">Quick Install (PowerShell as Admin):</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-3 rounded text-sm text-cyan-400 overflow-x-auto">
                      {agentCommands.windows.install}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(agentCommands.windows.install, 'windows-install')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-8"
                    >
                      {copiedCommand === 'windows-install' ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-white">Common Commands (PowerShell):</p>
                  
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Verify Installation:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-cyan-400">
                        {agentCommands.windows.verify}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.windows.verify, 'windows-verify')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Start Service:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-cyan-400">
                        {agentCommands.windows.start}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.windows.start, 'windows-start')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Check Status:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-cyan-400">
                        {agentCommands.windows.status}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.windows.status, 'windows-status')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">View Logs:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-cyan-400 overflow-x-auto">
                        {agentCommands.windows.logs}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.windows.logs, 'windows-logs')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-sm text-blue-200">
                    <strong>Note:</strong> Run PowerShell as Administrator for installation.
                    Agent runs as a Windows Service with SYSTEM privileges.
                  </p>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Manual Evidence Collection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 mb-2">Collect Event Logs:</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-2 rounded text-xs text-cyan-400 overflow-x-auto">
{`# Export Security logs (last 7 days)
Get-WinEvent -LogName Security -MaxEvents 10000 | Export-Csv security-logs.csv

# Export Application logs
Get-WinEvent -LogName Application -MaxEvents 5000 | Export-Csv app-logs.csv

# Upload CSVs to Evidence Vault`}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(`Get-WinEvent -LogName Security -MaxEvents 10000 | Export-Csv security-logs.csv\nGet-WinEvent -LogName Application -MaxEvents 5000 | Export-Csv app-logs.csv`, 'windows-logs-manual')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">Network Capture (Wireshark):</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-2 rounded text-xs text-cyan-400 overflow-x-auto">
{`# Install Wireshark first: https://www.wireshark.org/download.html
# Then capture via tshark (command-line):

tshark -i Wi-Fi -a duration:1800 -w network-capture.pcapng

# Or use Wireshark GUI:
# 1. Open Wireshark
# 2. Select your network interface
# 3. Click "Start Capturing"
# 4. Wait 30 minutes
# 5. File → Save As → network-capture.pcapng
# 6. Upload to Network Uploader`}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(`tshark -i Wi-Fi -a duration:1800 -w network-capture.pcapng`, 'windows-tshark')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Linux */}
          <TabsContent value="linux" className="space-y-4 mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Sentinel Agent for Linux
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <p className="text-white font-semibold">Sentinel Agent v1.2.0</p>
                    <p className="text-sm text-slate-400">Ubuntu 20.04+, Debian 11+, RHEL 8+, Fedora 35+</p>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      disabled
                      className="bg-slate-700 cursor-not-allowed min-h-[44px]"
                      title="Coming soon"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      .deb
                    </Button>
                    <Button
                      disabled
                      className="bg-slate-700 cursor-not-allowed min-h-[44px]"
                      title="Coming soon"
                    >
                      <Download className="w-4 h-4 mr-2" />
                      .rpm
                    </Button>
                  </div>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <p className="text-sm text-slate-400 mb-3">Quick Install:</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-3 rounded text-sm text-green-400 overflow-x-auto">
                      {agentCommands.linux.install}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(agentCommands.linux.install, 'linux-install')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-8"
                    >
                      {copiedCommand === 'linux-install' ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-white">Systemd Commands:</p>
                  
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Start Agent:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400">
                        {agentCommands.linux.start}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.linux.start, 'linux-start')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Check Status:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400">
                        {agentCommands.linux.status}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.linux.status, 'linux-status')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">View Logs (journalctl):</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400 overflow-x-auto">
                        {agentCommands.linux.logs}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.linux.logs, 'linux-logs')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Uninstall:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-red-400 overflow-x-auto whitespace-pre">
                        {agentCommands.linux.uninstall}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.linux.uninstall, 'linux-uninstall')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white text-sm">Manual Evidence Collection</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 mb-2">Collect System Logs:</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-2 rounded text-xs text-green-400 overflow-x-auto">
{`# Collect auth logs
sudo journalctl -u ssh -u sudo --since "24 hours ago" > auth-logs.txt

# Collect system logs
sudo journalctl --since "7 days ago" > system-logs.txt

# Upload to Evidence Vault`}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(`sudo journalctl -u ssh -u sudo --since "24 hours ago" > auth-logs.txt\nsudo journalctl --since "7 days ago" > system-logs.txt`, 'linux-logs-manual')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>

                <div>
                  <p className="text-xs text-slate-400 mb-2">Network Traffic Capture:</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-2 rounded text-xs text-green-400 overflow-x-auto">
{`# Capture 30 minutes of traffic (eth0 or wlan0)
sudo tcpdump -i eth0 -w network-capture.pcap -G 1800 -W 1

# Upload to Network Uploader`}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(`sudo tcpdump -i eth0 -w network-capture.pcap -G 1800 -W 1`, 'linux-tcpdump')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-6"
                    >
                      <Copy className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* iOS */}
          <TabsContent value="ios" className="space-y-4 mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Evidence Collection for iOS
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <p className="text-sm text-yellow-200">
                    <strong>Note:</strong> iOS doesn't allow background agents due to Apple's security restrictions.
                    Use iTunes/Finder backups and sysdiagnose for comprehensive forensic analysis.
                  </p>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white mb-3">Method 1: Sysdiagnose (Recommended)</p>
                  <div className="bg-slate-800/50 p-4 rounded-lg">
                    <p className="text-xs text-slate-400 mb-2">Generate Sysdiagnose:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-3 rounded text-sm text-cyan-400 whitespace-pre-wrap">
                        {agentCommands.ios.sysdiagnose}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.ios.sysdiagnose, 'ios-sysdiagnose')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2 h-8"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white mb-3">Method 2: iTunes/Finder Backup</p>
                  <div className="bg-slate-800/50 p-4 rounded-lg">
                    <p className="text-xs text-slate-400 mb-2">Create Backup:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-3 rounded text-sm text-cyan-400 whitespace-pre-wrap">
                        {agentCommands.ios.backup}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.ios.backup, 'ios-backup')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2 h-8"
                      >
                        <Copy className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>

                {/* Method 3: iOS Shortcuts - REMOVED/UPDATED */}
                <div className="bg-slate-800/50 p-4 rounded-lg border-2 border-dashed border-slate-700">
                  <div className="flex items-start gap-3">
                    <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-white mb-2">iOS Shortcuts (Planned Feature)</p>
                      <p className="text-xs text-slate-400 mb-3">
                        Automated evidence collection via iOS Shortcuts is planned for a future release. 
                        For now, please use iTunes backup or sysdiagnose methods above.
                      </p>
                      <p className="text-xs text-blue-400">
                        ETA: Q2 2025 • <a href="https://apps.apple.com/app/idXXXXXXXX" className="hover:underline" target="_blank" rel="noopener noreferrer">
                          iOS App Coming Soon
                        </a>
                      </p>
                    </div>
                  </div>
                </div>

                <div>
                  <p className="text-sm font-semibold text-white mb-3">Access Analytics Data</p>
                  <div className="bg-slate-800/50 p-4 rounded-lg">
                    <div className="relative">
                      <pre className="bg-slate-900 p-3 rounded text-sm text-cyan-400 whitespace-pre-wrap">
                        {agentCommands.ios.logs}
                      </pre>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Android */}
          <TabsContent value="android" className="space-y-4 mt-6">
            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Smartphone className="w-5 h-5" />
                  Sentinel Agent for Android
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-white font-semibold">Sentinel Agent v1.2.0</p>
                    <p className="text-sm text-slate-400">Android 10+ (ARM & x86)</p>
                  </div>
                  <Button
                    disabled
                    className="bg-slate-700 cursor-not-allowed min-h-[44px]"
                    title="Coming soon - use manual ADB methods below"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download (.apk)
                  </Button>
                </div>

                <div className="bg-slate-800/50 p-4 rounded-lg">
                  <p className="text-sm text-slate-400 mb-3">Installation via ADB:</p>
                  <div className="relative">
                    <pre className="bg-slate-900 p-3 rounded text-sm text-green-400 overflow-x-auto whitespace-pre-wrap">
                      {agentCommands.android.apk}
                    </pre>
                    <Button
                      onClick={() => copyToClipboard(`adb install sentinel-agent.apk`, 'android-install')}
                      size="sm"
                      variant="ghost"
                      className="absolute top-2 right-2 h-8"
                    >
                      {copiedCommand === 'android-install' ? (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      ) : (
                        <Copy className="w-4 h-4" />
                      )}
                    </Button>
                  </div>
                </div>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-white">Evidence Collection Commands (ADB):</p>
                  
                  <div>
                    <p className="text-xs text-slate-400 mb-1">Generate Bug Report:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400 overflow-x-auto whitespace-pre-wrap">
                        {agentCommands.android.bugreport}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(`adb bugreport bugreport.zip`, 'android-bugreport')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Capture Logcat:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400 overflow-x-auto whitespace-pre-wrap">
                        {agentCommands.android.logcat}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(`adb logcat -d > device-logs.txt`, 'android-logcat')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs text-slate-400 mb-1">Check App Permissions:</p>
                    <div className="relative">
                      <pre className="bg-slate-900 p-2 rounded text-sm text-green-400 overflow-x-auto whitespace-pre-wrap">
                        {agentCommands.android.permissions}
                      </pre>
                      <Button
                        onClick={() => copyToClipboard(agentCommands.android.permissions, 'android-perms')}
                        size="sm"
                        variant="ghost"
                        className="absolute top-1 right-1 h-6"
                      >
                        <Copy className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                  <p className="text-sm text-blue-200">
                    <strong>Note:</strong> Enable Developer Options and USB Debugging for ADB access.
                    APK installation requires "Install Unknown Apps" permission.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Tools & Utilities */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Forensic Tools & Utilities</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">MVT (Mobile Verification Toolkit)</p>
                    <p className="text-xs text-slate-400">iOS/Android malware detection</p>
                  </div>
                  <Button
                    onClick={() => window.open('https://github.com/mvt-project/mvt', '_blank')}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 min-h-[44px]"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    GitHub
                  </Button>
                </div>
                <div className="relative">
                  <pre className="bg-slate-900 p-2 rounded text-xs text-green-400">
pip3 install mvt
mvt-ios check-backup /path/to/backup
                  </pre>
                  <Button
                    onClick={() => copyToClipboard(`pip3 install mvt\nmvt-ios check-backup /path/to/backup`, 'mvt')}
                    size="sm"
                    variant="ghost"
                    className="absolute top-1 right-1 h-6"
                  >
                    <Copy className="w-3 h-3" />
                  </Button>
                </div>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">Wireshark</p>
                    <p className="text-xs text-slate-400">Network protocol analyzer</p>
                  </div>
                  <Button
                    onClick={() => window.open('https://www.wireshark.org/download.html', '_blank')}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 min-h-[44px]"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Essential for network traffic capture and analysis. Upload .pcap files to Network Uploader.
                </p>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">YARA Rules</p>
                    <p className="text-xs text-slate-400">Malware signature scanning</p>
                  </div>
                  <Button
                    onClick={() => window.open('https://github.com/Yara-Rules/rules', '_blank')}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 min-h-[44px]"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    GitHub
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Community YARA rules for malware detection. Import into YARA Rules page.
                </p>
              </div>

              <div className="p-4 bg-slate-800/50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="font-semibold text-white">Platform Tools (ADB)</p>
                    <p className="text-xs text-slate-400">Android debugging tools</p>
                  </div>
                  <Button
                    onClick={() => window.open('https://developer.android.com/tools/releases/platform-tools', '_blank')}
                    size="sm"
                    className="bg-purple-600 hover:bg-purple-700 min-h-[44px]"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
                <p className="text-xs text-slate-400">
                  Required for Android evidence collection via ADB commands.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Documentation */}
        <Card className="bg-blue-900/20 border-blue-500/30">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-blue-400" />
              Quick Start Resources
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid md:grid-cols-2 gap-3">
              <Button
                onClick={() => {
                  // Download the quick start guide
                  toast.info('Quick Start Guide', {
                    description: 'See QUICK_START_GUIDE.md in project files'
                  });
                }}
                variant="outline"
                className="border-blue-500/50 text-blue-400 justify-start min-h-[44px]"
              >
                <Download className="w-4 h-4 mr-2" />
                Quick Start Guide
              </Button>
              <Button
                onClick={() => {
                  toast.info('Threat Detection Guide', {
                    description: 'See REAL_THREAT_DETECTION_GUIDE.md in project files'
                  });
                }}
                variant="outline"
                className="border-blue-500/50 text-blue-400 justify-start min-h-[44px]"
              >
                <Download className="w-4 h-4 mr-2" />
                Threat Detection Guide
              </Button>
              <Button
                onClick={() => {
                  toast.info('API Keys Guide', {
                    description: 'See API_KEYS_REQUIRED.md in project files'
                  });
                }}
                variant="outline"
                className="border-blue-500/50 text-blue-400 justify-start min-h-[44px]"
              >
                <Download className="w-4 h-4 mr-2" />
                API Configuration Guide
              </Button>
              <Button
                onClick={() => {
                  toast.info('Features Audit', {
                    description: 'See NEW_FEATURES_AUDIT.md in project files'
                  });
                }}
                variant="outline"
                className="border-blue-500/50 text-blue-400 justify-start min-h-[44px]"
              >
                <Download className="w-4 h-4 mr-2" />
                Features Audit Report
              </Button>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}