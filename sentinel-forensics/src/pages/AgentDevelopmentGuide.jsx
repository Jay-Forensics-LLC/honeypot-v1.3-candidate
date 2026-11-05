import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Code,
  Terminal,
  Shield,
  CheckCircle,
  AlertTriangle,
  Copy,
  FileCode,
  Lock,
  Zap
} from 'lucide-react';
import { toast } from 'sonner';

/**
 * SENTINEL AGENT DEVELOPMENT GUIDE
 * Complete documentation for building desktop remediation agents
 * 
 * Covers:
 * - Windows agent (C#/.NET / Rust)
 * - macOS agent (Swift / Rust)
 * - Linux agent (Rust / Go)
 * - Communication protocol
 * - VSS/APFS/LVM snapshot implementations
 * - Code signing requirements
 * - Security architecture
 */
export default function AgentDevelopmentGuide() {
  const [activeTab, setActiveTab] = useState('overview');

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-xl flex items-center justify-center flex-shrink-0">
          <Code className="w-6 h-6 md:w-8 md:h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-2">
            Agent Development Guide
          </h1>
          <p className="text-sm md:text-base text-slate-400">
            Complete technical specification for building Sentinel desktop remediation agents
          </p>
          <div className="flex items-center gap-2 mt-2">
            <Badge className="bg-blue-500/20 text-blue-400 text-xs">
              Production Ready
            </Badge>
            <Badge className="bg-green-500/20 text-green-400 text-xs">
              Open Source
            </Badge>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList className="grid w-full grid-cols-2 md:grid-cols-6 bg-slate-900/50 p-1">
          <TabsTrigger value="overview" className="data-[state=active]:bg-blue-600 min-h-[44px]">
            Overview
          </TabsTrigger>
          <TabsTrigger value="windows" className="data-[state=active]:bg-purple-600 min-h-[44px]">
            Windows
          </TabsTrigger>
          <TabsTrigger value="macos" className="data-[state=active]:bg-green-600 min-h-[44px]">
            macOS
          </TabsTrigger>
          <TabsTrigger value="linux" className="data-[state=active]:bg-orange-600 min-h-[44px]">
            Linux
          </TabsTrigger>
          <TabsTrigger value="protocol" className="data-[state=active]:bg-indigo-600 min-h-[44px]">
            Protocol
          </TabsTrigger>
          <TabsTrigger value="security" className="data-[state=active]:bg-red-600 min-h-[44px]">
            Security
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-6">
          <OverviewSection copyToClipboard={copyToClipboard} />
        </TabsContent>

        <TabsContent value="windows" className="space-y-6">
          <WindowsAgentGuide copyToClipboard={copyToClipboard} />
        </TabsContent>

        <TabsContent value="macos" className="space-y-6">
          <MacOSAgentGuide copyToClipboard={copyToClipboard} />
        </TabsContent>

        <TabsContent value="linux" className="space-y-6">
          <LinuxAgentGuide copyToClipboard={copyToClipboard} />
        </TabsContent>

        <TabsContent value="protocol" className="space-y-6">
          <ProtocolSpec copyToClipboard={copyToClipboard} />
        </TabsContent>

        <TabsContent value="security" className="space-y-6">
          <SecurityArchitecture copyToClipboard={copyToClipboard} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

/**
 * Overview Section
 */
function OverviewSection({ copyToClipboard }) {
  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Agent Architecture Overview</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300">
          <p className="text-sm">
            Sentinel remediation agents are lightweight, signed binaries that run with appropriate privileges
            to perform system-level operations: snapshots, quarantine, file operations, and restoration.
          </p>

          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
              <Shield className="w-8 h-8 text-blue-400 mb-2" />
              <h3 className="font-semibold text-white mb-2">Security First</h3>
              <ul className="text-xs space-y-1 text-slate-400">
                <li>• Mutual TLS authentication</li>
                <li>• RSA-4096 or Ed25519 signatures</li>
                <li>• Localhost-only by default</li>
                <li>• Ephemeral tokens</li>
                <li>• Minimal attack surface</li>
              </ul>
            </div>

            <div className="p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
              <Zap className="w-8 h-8 text-green-400 mb-2" />
              <h3 className="font-semibold text-white mb-2">Cross-Platform</h3>
              <ul className="text-xs space-y-1 text-slate-400">
                <li>• Windows (VSS snapshots)</li>
                <li>• macOS (APFS snapshots)</li>
                <li>• Linux (LVM snapshots)</li>
                <li>• Unified WebSocket API</li>
                <li>• Consistent command schema</li>
              </ul>
            </div>

            <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded-lg">
              <Lock className="w-8 h-8 text-purple-400 mb-2" />
              <h3 className="font-semibold text-white mb-2">Reversible Operations</h3>
              <ul className="text-xs space-y-1 text-slate-400">
                <li>• Automatic snapshots</li>
                <li>• Rollback tokens</li>
                <li>• Atomic transactions</li>
                <li>• Chain-of-custody logging</li>
                <li>• Integrity verification</li>
              </ul>
            </div>
          </div>

          <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold text-yellow-200 mb-1">Development Prerequisites</p>
                <ul className="text-yellow-300/80 space-y-1 text-xs">
                  <li>• Code signing certificates (Windows: Authenticode, macOS: Apple Developer ID, Linux: GPG)</li>
                  <li>• Admin/root access for testing snapshot APIs</li>
                  <li>• Understanding of OS-specific security models</li>
                  <li>• WebSocket client library for chosen language</li>
                  <li>• Cryptography library for RSA/Ed25519 signatures</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Quick Start</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold">
                1
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Choose Platform</p>
                <p className="text-xs text-slate-400">Select target OS (Windows, macOS, or Linux)</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold">
                2
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Review Protocol Spec</p>
                <p className="text-xs text-slate-400">Read WebSocket message formats and authentication flow</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold">
                3
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Implement Snapshot API</p>
                <p className="text-xs text-slate-400">VSS (Windows), APFS (macOS), or LVM (Linux)</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold">
                4
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Test & Sign</p>
                <p className="text-xs text-slate-400">Test on VM, then code-sign binaries</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-800/50 rounded">
              <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold">
                5
              </div>
              <div className="flex-1">
                <p className="text-white font-semibold text-sm">Package & Distribute</p>
                <p className="text-xs text-slate-400">Create MSI/PKG/DEB installers</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/**
 * Windows Agent Guide
 */
function WindowsAgentGuide({ copyToClipboard }) {
  const csharpExample = `using System;
using System.Management;
using System.IO;
using System.Security.Cryptography;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;

namespace SentinelAgent
{
    public class WindowsRemediationAgent
    {
        private ClientWebSocket _websocket;
        private string _deviceId;
        private string _authToken;

        // VSS Snapshot Creation
        public async Task<SnapshotResult> CreateVSSSnapshot(string volumePath)
        {
            try
            {
                // Use Windows Management Instrumentation (WMI)
                var scope = new ManagementScope(@"\\\\localhost\\root\\cimv2");
                scope.Connect();

                var className = "Win32_ShadowCopy";
                var methodName = "Create";

                using (var mc = new ManagementClass(scope, new ManagementPath(className), null))
                {
                    var inParams = mc.GetMethodParameters(methodName);
                    inParams["Volume"] = volumePath;
                    inParams["Context"] = "ClientAccessible";

                    var outParams = mc.InvokeMethod(methodName, inParams, null);
                    
                    var shadowId = outParams["ShadowID"].ToString();
                    var returnValue = Convert.ToInt32(outParams["ReturnValue"]);

                    if (returnValue == 0)
                    {
                        return new SnapshotResult
                        {
                            Success = true,
                            SnapshotId = shadowId,
                            Path = GetShadowCopyPath(shadowId)
                        };
                    }
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine($"VSS Error: {ex.Message}");
            }

            return new SnapshotResult { Success = false };
        }

        // Quarantine File with AES-256 Encryption
        public async Task<QuarantineResult> QuarantineFile(string filePath, string quarantinePath)
        {
            try
            {
                // Calculate hashes
                var hashes = CalculateFileHashes(filePath);

                // Encrypt file with AES-256-GCM
                var encryptedData = await EncryptFileAES256GCM(filePath);

                // Move to quarantine
                var quarantineFile = Path.Combine(quarantinePath, 
                    $"{Path.GetFileName(filePath)}.encrypted");
                
                File.WriteAllBytes(quarantineFile, encryptedData.Ciphertext);

                // Store encryption metadata
                var metadata = new QuarantineMetadata
                {
                    OriginalPath = filePath,
                    QuarantinePath = quarantineFile,
                    Hashes = hashes,
                    Salt = encryptedData.Salt,
                    IV = encryptedData.IV,
                    Timestamp = DateTime.UtcNow
                };

                // Delete original (securely)
                SecureDelete(filePath);

                return new QuarantineResult
                {
                    Success = true,
                    Metadata = metadata
                };
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Quarantine error: {ex.Message}");
                return new QuarantineResult { Success = false, Error = ex.Message };
            }
        }

        // Secure File Deletion (DoD 5220.22-M)
        private void SecureDelete(string filePath)
        {
            const int passes = 3;
            var fileInfo = new FileInfo(filePath);
            var fileLength = fileInfo.Length;

            using (var fs = new FileStream(filePath, FileMode.Open, FileAccess.Write))
            {
                for (int pass = 0; pass < passes; pass++)
                {
                    fs.Position = 0;
                    var buffer = new byte[4096];
                    
                    // Fill with random data
                    using (var rng = RandomNumberGenerator.Create())
                    {
                        for (long i = 0; i < fileLength; i += buffer.Length)
                        {
                            rng.GetBytes(buffer);
                            fs.Write(buffer, 0, (int)Math.Min(buffer.Length, fileLength - i));
                        }
                    }
                    
                    fs.Flush(true);
                }
            }

            File.Delete(filePath);
        }

        // WebSocket Communication
        public async Task ConnectToServer(string wsUrl, string deviceId, string token)
        {
            _websocket = new ClientWebSocket();
            _websocket.Options.SetRequestHeader("Authorization", $"Bearer {token}");

            await _websocket.ConnectAsync(new Uri(wsUrl), CancellationToken.None);

            // Start listening for commands
            _ = Task.Run(() => ListenForCommands());
        }

        private async Task ListenForCommands()
        {
            var buffer = new byte[8192];

            while (_websocket.State == WebSocketState.Open)
            {
                var result = await _websocket.ReceiveAsync(
                    new ArraySegment<byte>(buffer), 
                    CancellationToken.None
                );

                if (result.MessageType == WebSocketMessageType.Text)
                {
                    var message = System.Text.Encoding.UTF8.GetString(buffer, 0, result.Count);
                    await ProcessCommand(message);
                }
            }
        }
    }

    public class SnapshotResult
    {
        public bool Success { get; set; }
        public string SnapshotId { get; set; }
        public string Path { get; set; }
        public string Error { get; set; }
    }

    public class QuarantineResult
    {
        public bool Success { get; set; }
        public QuarantineMetadata Metadata { get; set; }
        public string Error { get; set; }
    }
}`;

  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-white flex items-center gap-3">
              <Terminal className="w-6 h-6 text-purple-400" />
              Windows Agent (C# / Rust)
            </CardTitle>
            <Button
              onClick={() => copyToClipboard(csharpExample)}
              variant="outline"
              size="sm"
              className="min-h-[36px]"
            >
              <Copy className="w-4 h-4 mr-2" />
              Copy Example
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <h3 className="font-semibold text-white text-sm">Technology Stack</h3>
            <div className="flex flex-wrap gap-2">
              <Badge className="bg-purple-500/20 text-purple-400">C# .NET 8.0</Badge>
              <Badge className="bg-purple-500/20 text-purple-400">Rust (Alternative)</Badge>
              <Badge className="bg-purple-500/20 text-purple-400">WMI for VSS</Badge>
              <Badge className="bg-purple-500/20 text-purple-400">Windows Service</Badge>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-white text-sm">Key Features</h3>
            <ul className="text-sm text-slate-400 space-y-1">
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span><strong>VSS Integration:</strong> Volume Shadow Copy Service for atomic snapshots</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span><strong>Registry Operations:</strong> Safe registry hive export/import</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span><strong>Service Management:</strong> Start/stop/remove Windows services</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span><strong>Task Scheduler:</strong> Manipulate scheduled tasks</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <span><strong>Driver Detection:</strong> Enumerate and verify driver signatures</span>
              </li>
            </ul>
          </div>

          <div className="bg-slate-950 p-4 rounded-lg overflow-x-auto">
            <pre className="text-xs text-green-400 font-mono whitespace-pre">
{csharpExample}
            </pre>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-white text-sm">Code Signing</h3>
            <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300">
              <p className="mb-2 font-mono">signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com SentinelAgent.exe</p>
              <p className="text-slate-500">Requires: Windows SDK, Authenticode certificate ($99-$400/year)</p>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="font-semibold text-white text-sm">Installation</h3>
            <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300 space-y-2">
              <p className="font-mono">• MSI Installer (WiX Toolset)</p>
              <p className="font-mono">• EXE Installer (Inno Setup)</p>
              <p className="font-mono">• Silent deployment: msiexec /i SentinelAgent.msi /quiet</p>
              <p className="font-mono">• SCCM/Intune support for enterprise</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  );
}

/**
 * macOS Agent Guide
 */
function MacOSAgentGuide({ copyToClipboard }) {
  const swiftExample = `import Foundation
import Security

class SentinelAgentMacOS {
    
    // APFS Snapshot Creation
    func createAPFSSnapshot(volumePath: String) async throws -> SnapshotResult {
        let snapshotName = "sentinel-\\(UUID().uuidString)"
        
        // Create APFS snapshot using tmutil
        let process = Process()
        process.executableURL = URL(fileURLWithPath: "/usr/bin/tmutil")
        process.arguments = ["localsnapshot", volumePath, snapshotName]
        
        try {
            try await process.run()
            process.waitUntilExit()
            
            if process.terminationStatus == 0 {
                return SnapshotResult(
                    success: true,
                    snapshotId: snapshotName,
                    path: "/.MobileBackups.trash/\\(snapshotName)"
                )
            }
        } catch {
            print("APFS snapshot error: \\(error)")
        }
        
        return SnapshotResult(success: false)
    }
    
    // Quarantine File with Encryption
    func quarantineFile(at path: String, to quarantinePath: String) async throws -> QuarantineResult {
        let fileManager = FileManager.default
        let fileName = (path as NSString).lastPathComponent
        
        // Calculate SHA-256 hash
        let fileData = try Data(contentsOf: URL(fileURLWithPath: path))
        let hash = SHA256.hash(data: fileData)
        let hashString = hash.compactMap { String(format: "%02x", $0) }.joined()
        
        // Encrypt with AES-256-GCM
        let key = SymmetricKey(size: .bits256)
        let sealedBox = try AES.GCM.seal(fileData, using: key)
        
        // Write encrypted file
        let quarantineFile = "\\(quarantinePath)/\\(fileName).encrypted"
        try sealedBox.combined?.write(to: URL(fileURLWithPath: quarantineFile))
        
        // Securely delete original
        try secureDelete(path: path)
        
        return QuarantineResult(
            success: true,
            originalPath: path,
            quarantinePath: quarantineFile,
            hash: hashString
        )
    }
    
    // Secure Deletion (7-pass Gutmann)
    func secureDelete(path: String) throws {
        let fileHandle = try FileHandle(forWritingTo: URL(fileURLWithPath: path))
        let fileSize = try fileHandle.seekToEnd()
        
        // Multiple overwrite passes
        for pass in 0..<7 {
            try fileHandle.seek(toOffset: 0)
            
            var randomData = Data(count: Int(fileSize))
            randomData.withUnsafeMutableBytes { ptr in
                arc4random_buf(ptr.baseAddress!, Int(fileSize))
            }
            
            try fileHandle.write(contentsOf: randomData)
            try fileHandle.synchronize()
        }
        
        try fileHandle.close()
        try FileManager.default.removeItem(atPath: path)
    }
    
    // WebSocket Connection
    func connect(wsUrl: String, deviceId: String, token: String) async throws {
        var request = URLRequest(url: URL(string: wsUrl)!)
        request.setValue("Bearer \\(token)", forHTTPHeaderField: "Authorization")
        
        let (stream, response) = try await URLSession.shared.webSocketTask(with: request).resume()
        
        // Listen for commands
        Task {
            await listenForCommands(stream: stream)
        }
    }
}`;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-3">
            <Terminal className="w-6 h-6 text-green-400" />
            macOS Agent (Swift / Rust)
          </CardTitle>
          <Button
            onClick={() => copyToClipboard(swiftExample)}
            variant="outline"
            size="sm"
            className="min-h-[36px]"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Example
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Technology Stack</h3>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-green-500/20 text-green-400">Swift 5.9+</Badge>
            <Badge className="bg-green-500/20 text-green-400">Rust (Alternative)</Badge>
            <Badge className="bg-green-500/20 text-green-400">tmutil for APFS</Badge>
            <Badge className="bg-green-500/20 text-green-400">Launch Daemon</Badge>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Key Features</h3>
          <ul className="text-sm text-slate-400 space-y-1">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>APFS Snapshots:</strong> Native snapshot support via tmutil/diskutil</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>LaunchAgent/Daemon:</strong> Manage startup items and background services</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>Plist Manipulation:</strong> Safe plist reading/writing</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>Kext Detection:</strong> Enumerate kernel extensions</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
              <span><strong>SIP Awareness:</strong> Respects System Integrity Protection</span>
            </li>
          </ul>
        </div>

        <div className="bg-slate-950 p-4 rounded-lg overflow-x-auto">
          <pre className="text-xs text-green-400 font-mono whitespace-pre">
{swiftExample}
          </pre>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Code Signing & Notarization</h3>
          <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300 space-y-2">
            <p className="font-mono">codesign --deep --force --verify --verbose --sign "Developer ID Application" SentinelAgent.app</p>
            <p className="font-mono">xcrun notarytool submit SentinelAgent.pkg --apple-id user@example.com --wait</p>
            <p className="text-slate-500">Requires: Apple Developer Account ($99/year), Xcode Command Line Tools</p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Installation</h3>
          <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300 space-y-2">
            <p className="font-mono">• PKG Installer (pkgbuild + productbuild)</p>
            <p className="font-mono">• DMG Distribution</p>
            <p className="font-mono">• Silent install: sudo installer -pkg SentinelAgent.pkg -target /</p>
            <p className="font-mono">• Jamf Pro / Munki support for enterprise</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Linux Agent Guide
 */
function LinuxAgentGuide({ copyToClipboard }) {
  const rustExample = `use std::process::Command;
use std::fs;
use std::path::Path;
use aes_gcm::{Aes256Gcm, Key, Nonce};
use aes_gcm::aead::{Aead, NewAead};
use sha2::{Sha256, Digest};
use tokio_tungstenite::connect_async;
use futures_util::{StreamExt, SinkExt};

pub struct SentinelAgentLinux {
    device_id: String,
    auth_token: String,
}

impl SentinelAgentLinux {
    // LVM Snapshot Creation
    pub async fn create_lvm_snapshot(
        &self,
        vg_name: &str,
        lv_name: &str,
        snapshot_size: &str
    ) -> Result<SnapshotResult, Box<dyn std::error::Error>> {
        let snapshot_name = format!("sentinel_{}", uuid::Uuid::new_v4());
        
        // Create LVM snapshot
        let output = Command::new("lvcreate")
            .args(&[
                "-L", snapshot_size,
                "-s",
                "-n", &snapshot_name,
                &format!("/dev/{}/{}", vg_name, lv_name)
            ])
            .output()?;

        if output.status.success() {
            Ok(SnapshotResult {
                success: true,
                snapshot_id: snapshot_name.clone(),
                path: format!("/dev/{}/{}", vg_name, snapshot_name),
                error: None,
            })
        } else {
            let error = String::from_utf8_lossy(&output.stderr);
            Err(format!("LVM snapshot failed: {}", error).into())
        }
    }

    // Quarantine File with AES-256-GCM
    pub async fn quarantine_file(
        &self,
        file_path: &Path,
        quarantine_path: &Path
    ) -> Result<QuarantineResult, Box<dyn std::error::Error>> {
        // Read file
        let file_data = fs::read(file_path)?;
        
        // Calculate SHA-256 hash
        let mut hasher = Sha256::new();
        hasher.update(&file_data);
        let hash = format!("{:x}", hasher.finalize());

        // Generate encryption key
        let key = Aes256Gcm::generate_key(&mut rand::thread_rng());
        let cipher = Aes256Gcm::new(&key);
        let nonce = Nonce::from_slice(b"unique nonce");

        // Encrypt
        let ciphertext = cipher.encrypt(nonce, file_data.as_ref())
            .map_err(|e| format!("Encryption failed: {}", e))?;

        // Write encrypted file
        let encrypted_path = quarantine_path.join(
            format!("{}.encrypted", file_path.file_name().unwrap().to_string_lossy())
        );
        fs::write(&encrypted_path, ciphertext)?;

        // Secure delete original (shred)
        Command::new("shred")
            .args(&["-vfz", "-n", "7", file_path.to_str().unwrap()])
            .output()?;

        Ok(QuarantineResult {
            success: true,
            original_path: file_path.to_string_lossy().to_string(),
            quarantine_path: encrypted_path.to_string_lossy().to_string(),
            hash,
        })
    }

    // WebSocket Connection
    pub async fn connect(&self, ws_url: &str) -> Result<(), Box<dyn std::error::Error>> {
        let url = format!("{}?device_id={}&token={}", 
            ws_url, self.device_id, self.auth_token);

        let (ws_stream, _) = connect_async(url).await?;
        let (mut write, mut read) = ws_stream.split();

        // Listen for commands
        tokio::spawn(async move {
            while let Some(msg) = read.next().await {
                if let Ok(msg) = msg {
                    // Process command
                    println!("Received: {:?}", msg);
                }
            }
        });

        Ok(())
    }
}

#[derive(Debug)]
pub struct SnapshotResult {
    pub success: bool,
    pub snapshot_id: String,
    pub path: String,
    pub error: Option<String>,
}

#[derive(Debug)]
pub struct QuarantineResult {
    pub success: bool,
    pub original_path: String,
    pub quarantine_path: String,
    pub hash: String,
}`;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-3">
            <Terminal className="w-6 h-6 text-orange-400" />
            Linux Agent (Rust / Go)
          </CardTitle>
          <Button
            onClick={() => copyToClipboard(rustExample)}
            variant="outline"
            size="sm"
            className="min-h-[36px]"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Example
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Technology Stack (Recommended: Rust)</h3>
          <div className="flex flex-wrap gap-2">
            <Badge className="bg-orange-500/20 text-orange-400">Rust 1.70+</Badge>
            <Badge className="bg-orange-500/20 text-orange-400">Go (Alternative)</Badge>
            <Badge className="bg-orange-500/20 text-orange-400">LVM2 for snapshots</Badge>
            <Badge className="bg-orange-500/20 text-orange-400">systemd</Badge>
          </div>
        </div>

        <div className="bg-slate-950 p-4 rounded-lg overflow-x-auto">
          <pre className="text-xs text-green-400 font-mono whitespace-pre">
{rustExample}
          </pre>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Dependencies (Cargo.toml)</h3>
          <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300 font-mono">
{`[dependencies]
tokio = { version = "1.35", features = ["full"] }
tokio-tungstenite = "0.21"
aes-gcm = "0.10"
sha2 = "0.10"
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
uuid = { version = "1.6", features = ["v4"] }
log = "0.4"
env_logger = "0.11"`}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Code Signing (GPG)</h3>
          <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300">
            <p className="mb-2 font-mono">gpg --detach-sign --armor sentinel-agent</p>
            <p className="text-slate-500">Distribute: Binary + .asc signature file</p>
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="font-semibold text-white text-sm">Packaging</h3>
          <div className="p-3 bg-slate-800/50 rounded text-xs text-slate-300 space-y-2">
            <p className="font-mono">• Debian: dpkg-deb --build sentinel-agent</p>
            <p className="font-mono">• RPM: rpmbuild -ba sentinel-agent.spec</p>
            <p className="font-mono">• AppImage for universal Linux</p>
            <p className="font-mono">• Ansible playbook for auto-deployment</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Protocol Specification
 */
function ProtocolSpec({ copyToClipboard }) {
  const protocolExample = `{
  "version": "1.0",
  "protocol": "sentinel-agent-ws",
  "authentication": {
    "method": "mutual_tls_jwt",
    "steps": [
      "1. Agent connects with device_id + enrollment_token",
      "2. Server validates token and returns session_token",
      "3. Agent generates RSA key pair (if first time)",
      "4. Agent sends public_key_pem to server",
      "5. Server stores public key and returns challenge_nonce",
      "6. Agent signs challenge with private key",
      "7. Server verifies signature → connection authenticated"
    ]
  },
  "message_formats": {
    "heartbeat": {
      "type": "heartbeat",
      "device_id": "DEV-123",
      "timestamp": "2025-01-15T10:30:00Z",
      "health": {
        "cpu_percent": 12.5,
        "memory_mb": 2048,
        "disk_percent": 45.2
      },
      "signature": "<RSA-SHA256 signature>"
    },
    "command": {
      "type": "command",
      "command_id": "CMD-456",
      "device_id": "DEV-123",
      "command_kind": "defense.activate",
      "params": {
        "defense_type": "usb_lockdown",
        "mode": "block_all"
      },
      "issued_at": "2025-01-15T10:31:00Z",
      "expires_at": "2025-01-15T10:46:00Z",
      "counter": 1,
      "server_signature": "<Ed25519 signature>"
    },
    "result": {
      "type": "result",
      "command_id": "CMD-456",
      "device_id": "DEV-123",
      "outcome": "success",
      "duration_ms": 523,
      "result_data": {
        "devices_blocked": 3,
        "snapshot_created": true
      },
      "timestamp": "2025-01-15T10:31:05Z",
      "agent_signature": "<RSA-SHA256 signature>"
    }
  },
  "security": {
    "replay_protection": "counter field must increment monotonically",
    "signature_verification": "All messages must be cryptographically signed",
    "timeout": "Commands expire after 15 minutes",
    "encryption": "WebSocket over TLS 1.3 (wss://)"
  }
}`;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-3">
            <FileCode className="w-6 h-6 text-indigo-400" />
            WebSocket Protocol Specification
          </CardTitle>
          <Button
            onClick={() => copyToClipboard(protocolExample)}
            variant="outline"
            size="sm"
            className="min-h-[36px]"
          >
            <Copy className="w-4 h-4 mr-2" />
            Copy Spec
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="bg-slate-950 p-4 rounded-lg overflow-x-auto">
          <pre className="text-xs text-cyan-400 font-mono whitespace-pre">
{protocolExample}
          </pre>
        </div>

        <div className="grid md:grid-cols-3 gap-4">
          <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded">
            <h3 className="font-semibold text-blue-200 mb-2 text-sm">Authentication</h3>
            <p className="text-xs text-blue-300/70">
              Mutual TLS + JWT tokens + RSA signature challenge-response
            </p>
          </div>

          <div className="p-4 bg-purple-900/20 border border-purple-500/30 rounded">
            <h3 className="font-semibold text-purple-200 mb-2 text-sm">Replay Protection</h3>
            <p className="text-xs text-purple-300/70">
              Monotonic counter + timestamp + nonce verification
            </p>
          </div>

          <div className="p-4 bg-green-900/20 border border-green-500/30 rounded">
            <h3 className="font-semibold text-green-200 mb-2 text-sm">Encryption</h3>
            <p className="text-xs text-green-300/70">
              WebSocket over TLS 1.3 + message-level signatures
            </p>
          </div>
        </div>

        <div className="p-4 bg-yellow-900/20 border border-yellow-500/30 rounded">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold text-yellow-200 mb-1">Security Requirements</p>
              <ul className="text-yellow-300/80 space-y-1 text-xs">
                <li>• Listen on 127.0.0.1 ONLY (no remote connections)</li>
                <li>• Validate all command signatures before execution</li>
                <li>• Implement command whitelisting</li>
                <li>• Log all operations to append-only audit log</li>
                <li>• Store tokens in OS keyring (DPAPI/Keychain/Pass)</li>
              </ul>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Security Architecture
 */
function SecurityArchitecture({ copyToClipboard }) {
  return (
    <>
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-3">
            <Shield className="w-6 h-6 text-red-400" />
            Security Architecture & Threat Model
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <h3 className="font-semibold text-white">Threat Model</h3>
            
            <div className="space-y-3">
              <div className="p-4 bg-red-900/20 border border-red-500/30 rounded">
                <h4 className="text-red-200 font-semibold mb-2 text-sm">🎯 Attack Surface</h4>
                <ul className="text-xs text-red-300/80 space-y-1">
                  <li>• <strong>Privilege Escalation:</strong> Agent runs with admin/root → must validate all commands</li>
                  <li>• <strong>Command Injection:</strong> Malicious commands via compromised dashboard</li>
                  <li>• <strong>Replay Attacks:</strong> Replaying captured commands</li>
                  <li>• <strong>MITM:</strong> Intercepting WebSocket traffic</li>
                  <li>• <strong>Rogue Agent:</strong> Unauthorized agent enrollment</li>
                </ul>
              </div>

              <div className="p-4 bg-green-900/20 border border-green-500/30 rounded">
                <h4 className="text-green-200 font-semibold mb-2 text-sm">✅ Mitigations</h4>
                <ul className="text-xs text-green-300/80 space-y-1">
                  <li>• <strong>Command Whitelisting:</strong> Only allow pre-approved command types</li>
                  <li>• <strong>Signature Verification:</strong> Verify server signature on every command</li>
                  <li>• <strong>Replay Protection:</strong> Monotonic counter + timestamp validation</li>
                  <li>• <strong>TLS Pinning:</strong> Pin server certificate</li>
                  <li>• <strong>Enrollment Tokens:</strong> One-time use tokens for enrollment</li>
                  <li>• <strong>Localhost Binding:</strong> Agent listens on 127.0.0.1 only</li>
                  <li>• <strong>Automatic Privilege Drop:</strong> Elevate only when needed, drop immediately after</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-white">Safe Snapshot Technology</h3>
            
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-slate-800/50 rounded">
                <h4 className="text-white font-semibold mb-2 text-sm">Windows VSS</h4>
                <p className="text-xs text-slate-400 mb-2">Volume Shadow Copy Service</p>
                <ul className="text-xs text-slate-300 space-y-1">
                  <li>• Copy-on-write snapshots</li>
                  <li>• Registry hive exports</li>
                  <li>• No file locking</li>
                  <li>• Auto-cleanup after 30 days</li>
                </ul>
              </div>

              <div className="p-4 bg-slate-800/50 rounded">
                <h4 className="text-white font-semibold mb-2 text-sm">macOS APFS</h4>
                <p className="text-xs text-slate-400 mb-2">APFS Filesystem Snapshots</p>
                <ul className="text-xs text-slate-300 space-y-1">
                  <li>• Read-only snapshots</li>
                  <li>• Instant creation</li>
                  <li>• Space-efficient</li>
                  <li>• Plist preservation</li>
                </ul>
              </div>

              <div className="p-4 bg-slate-800/50 rounded">
                <h4 className="text-white font-semibold mb-2 text-sm">Linux LVM</h4>
                <p className="text-xs text-slate-400 mb-2">Logical Volume Manager Snapshots</p>
                <ul className="text-xs text-slate-300 space-y-1">
                  <li>• Block-level snapshots</li>
                  <li>• tar+gzip fallback</li>
                  <li>• Hash verification</li>
                  <li>• systemd integration</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="p-4 bg-blue-900/20 border border-blue-500/30 rounded">
            <h3 className="font-semibold text-blue-200 mb-2">Rollback Verification Process</h3>
            <ol className="text-xs text-blue-300/80 space-y-1">
              <li>1. Create snapshot before ANY destructive operation</li>
              <li>2. Hash all affected files/registry keys → store in manifest</li>
              <li>3. Perform remediation (quarantine/delete)</li>
              <li>4. Verify system integrity (check critical files)</li>
              <li>5. If rollback needed: restore from snapshot + verify hashes match pre-snapshot state</li>
              <li>6. Generate chain-of-custody log with before/after hashes</li>
            </ol>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Build & Deployment Checklist</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {[
            { task: 'Implement snapshot API (VSS/APFS/LVM)', status: 'required' },
            { task: 'Implement quarantine with AES-256-GCM encryption', status: 'required' },
            { task: 'Implement WebSocket client with mutual auth', status: 'required' },
            { task: 'Add command whitelisting', status: 'required' },
            { task: 'Implement signature verification', status: 'required' },
            { task: 'Add audit logging (append-only)', status: 'required' },
            { task: 'Token storage in OS keyring', status: 'required' },
            { task: 'Code signing (Authenticode/Apple/GPG)', status: 'required' },
            { task: 'Create installer (MSI/PKG/DEB)', status: 'required' },
            { task: 'Test on VM before production', status: 'required' },
            { task: 'Implement auto-update mechanism', status: 'recommended' },
            { task: 'Add telemetry/health reporting', status: 'recommended' }
          ].map((item, idx) => (
            <div key={idx} className="flex items-center gap-3 p-3 bg-slate-800/50 rounded">
              <CheckCircle className={`w-5 h-5 ${
                item.status === 'required' ? 'text-red-400' : 'text-yellow-400'
              } flex-shrink-0`} />
              <span className="text-sm text-white flex-1">{item.task}</span>
              <Badge className={
                item.status === 'required' 
                  ? 'bg-red-500/20 text-red-400' 
                  : 'bg-yellow-500/20 text-yellow-400'
              }>
                {item.status}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>
    </>
  );
}