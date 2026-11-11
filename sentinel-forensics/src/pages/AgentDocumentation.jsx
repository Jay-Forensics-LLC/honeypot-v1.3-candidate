import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Monitor,
  Laptop,
  Server,
  Download,
  Terminal,
  Shield,
  FileCode,
  ExternalLink,
  Copy,
  CheckCircle2,
  AlertTriangle,
  Book,
  Github,
  Box,
} from "lucide-react";
import { toast } from "sonner";

export default function AgentDocumentation() {
  const [copiedSection, setCopiedSection] = useState(null);

  const copyToClipboard = (text, section) => {
    navigator.clipboard.writeText(text);
    setCopiedSection(section);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedSection(null), 2000);
  };

  const windowsCode = `# Sentinel Forensics Agent - Windows Implementation
# Language: PowerShell / C# (.NET)
# Minimum OS: Windows 10 / Server 2016

## Core Components:

### 1. Service Host (runs as Windows Service)
- Name: "SentinelForensicsAgent"
- Start: Automatic (Delayed Start)
- Recovery: Restart on failure
- Dependencies: TCP/IP, Cryptographic Services
- User: Local System (for admin actions) or Network Service (for monitoring only)

### 2. Command Execution Module
Functions:
- Defense.Activate (Panic Shield)
  * Set-NetFirewallProfile -All -DefaultInboundAction Block -DefaultOutboundAction Block
  * Disable-NetAdapterBinding -Name * -ComponentID ms_tcpip6
  * Stop-Service -Name RemoteRegistry, WinRM, TermService
  * Set PowerShell Execution Policy to AllSigned + Constrained Language Mode
  
- Policy.USBLockdown.Set
  * Registry: HKLM\\SYSTEM\\CurrentControlSet\\Services\\USBSTOR\\Start = 4
  * Group Policy: Removable Storage Access = Deny
  
- Snapshot.Run
  * Get-Process | Export-Csv processes.csv
  * Get-NetTCPConnection | Export-Csv connections.csv
  * Get-ItemProperty HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Run
  * Get-FileHash -Algorithm SHA256 for critical binaries
  * Generate signed manifest (XML + digital signature)

### 3. Communication Layer
- Protocol: WebSocket over TLS (wss://)
- Client Certificate: Generated on enrollment, presented for mTLS
- Fallback: HTTPS long-poll every 30s
- Heartbeat: Every 60s
- Command polling: Every 10s when online

### 4. Security
- Code Signing: All binaries Authenticode signed
- Installer: MSI with silent install option
- Enrollment: Public/Private keypair generated via .NET Crypto (RSA 4096)
- Tamper Protection: Service protected by SCM access control
- Least Privilege: Run non-admin tasks under Network Service context

## Build Instructions:

### Prerequisites:
- Visual Studio 2022
- .NET 6.0 SDK or higher
- WiX Toolset (for MSI installer)
- Code signing certificate (for production)

### Project Structure:
SentinelAgent.Windows/
├── SentinelAgent.Core/          # Shared business logic (C#)
├── SentinelAgent.Service/       # Windows Service host
├── SentinelAgent.Installer/     # WiX installer project
├── SentinelAgent.CLI/           # Management CLI tool
└── Tests/

### Build Commands:
dotnet build -c Release
dotnet publish -c Release -r win-x64 --self-contained
candle SentinelAgent.Installer.wxs
light -out SentinelAgentSetup.msi SentinelAgent.Installer.wixobj

### Installation:
msiexec /i SentinelAgentSetup.msi /qn ENROLLTOKEN=<token> SERVERURL=<url>

## GitHub Repository:
https://github.com/sentinel-forensics/agent-windows`;

  const macosCode = `# Sentinel Forensics Agent - macOS Implementation
# Language: Swift / Objective-C
# Minimum OS: macOS 11 (Big Sur)

## Core Components:

### 1. Launch Daemon (runs as system daemon)
- Plist: /Library/LaunchDaemons/com.sentinelforensics.agent.plist
- User: root (for privileged operations)
- KeepAlive: true
- RunAtLoad: true

### 2. Command Execution Module
Functions:
- Defense.Activate (Panic Shield)
  * /usr/libexec/ApplicationFirewall/socketfilterfw --setglobalstate on
  * /usr/libexec/ApplicationFirewall/socketfilterfw --setblockall on
  * launchctl unload /System/Library/LaunchDaemons/com.apple.screensharing.plist
  * Disable: Remote Login, File Sharing, Screen Sharing via System Preferences API
  
- Policy.USBLockdown.Set
  * IOKit Framework: Block USB storage device registration
  * Kernel Extension (kext) or System Extension for hardware-level enforcement
  
- Snapshot.Run
  * ps aux > processes.txt
  * lsof -i > connections.txt
  * system_profiler SPUSBDataType > usb_devices.txt
  * launchctl list > launch_agents.txt
  * shasum -a 256 /Applications/* /usr/bin/* /usr/sbin/*
  * Generate signed manifest (plist + codesign)

### 3. Communication Layer
- Protocol: WebSocket over TLS (wss://)
- Client Certificate: Keychain-stored X.509 cert
- Fallback: URLSession HTTPS long-poll
- Background: NSURLSession with background tasks
- Heartbeat: 60s intervals

### 4. Security
- Code Signing: Apple Developer ID Application certificate
- Notarization: Submit to Apple for notarization (required for macOS 10.15+)
- Entitlements: Network Client, Keychain Access, System Extension
- Hardened Runtime: Enabled
- Sandbox: Partial (network, keychain only; disable for privileged ops)
- TCC: Transparency, Consent, Control - request Full Disk Access for snapshots

## Build Instructions:

### Prerequisites:
- Xcode 14+
- macOS 11+ for building
- Apple Developer Account (for signing & notarization)
- Swift Package Manager

### Project Structure:
SentinelAgent.macOS/
├── SentinelAgentCore/           # Swift framework (shared logic)
├── SentinelAgentDaemon/         # Launch daemon main target
├── SentinelAgentCLI/            # Command-line management tool
├── Installer/                   # PKG installer scripts
└── Tests/

### Build Commands:
xcodebuild -scheme SentinelAgentDaemon -configuration Release
xcodebuild -scheme SentinelAgentCLI -configuration Release
productbuild --component SentinelAgent.app /Applications SentinelAgent.pkg

### Code Signing:
codesign --deep --force --verify --verbose --sign "Developer ID Application: Your Name" SentinelAgent.app

### Notarization:
xcrun altool --notarize-app --primary-bundle-id com.sentinelforensics.agent \\
  --username "your@email.com" --password "@keychain:AC_PASSWORD" \\
  --file SentinelAgent.pkg

### Installation:
sudo installer -pkg SentinelAgent.pkg -target /
sudo /usr/local/bin/sentinel-agent enroll --token <token> --server <url>

## GitHub Repository:
https://github.com/sentinel-forensics/agent-macos`;

  const linuxCode = `# Sentinel Forensics Agent - Linux Implementation
# Language: Rust / Go
# Minimum Distro: Ubuntu 20.04, RHEL 8, Debian 11

## Core Components:

### 1. Systemd Service
- Unit file: /etc/systemd/system/sentinel-agent.service
- Type: notify (sd_notify support)
- User: root (for privileged ops) or dedicated 'sentinel' user
- Restart: on-failure
- WantedBy: multi-user.target

### 2. Command Execution Module
Functions:
- Defense.Activate (Panic Shield)
  * iptables -P INPUT DROP; iptables -P OUTPUT DROP; iptables -A OUTPUT -p udp --dport 53 -j ACCEPT
  * systemctl stop sshd, systemctl stop smbd, systemctl stop winbind
  * sysctl net.ipv4.ip_forward=0, net.ipv6.conf.all.forwarding=0
  
- Policy.USBLockdown.Set
  * udev rules: /etc/udev/rules.d/99-sentinel-usb-block.rules
  * ACTION=="add", SUBSYSTEMS=="usb", DRIVERS=="usb-storage", RUN+="/bin/sh -c 'echo 1 > /sys\$devpath/remove'"
  * modprobe -r usb_storage
  
- Snapshot.Run
  * ps aux > processes.txt
  * ss -tupan > connections.txt
  * lsusb > usb_devices.txt
  * systemctl list-units > services.txt
  * find /usr/bin /usr/sbin -type f -exec sha256sum {} + > binary_hashes.txt
  * tar + gpg sign manifest

### 3. Communication Layer
- Protocol: WebSocket over TLS (wss://)
- Library: tungstenite (Rust) or gorilla/websocket (Go)
- Client Certificate: OpenSSL-generated X.509, stored in /etc/sentinel/certs/
- Fallback: reqwest (Rust) / net/http (Go) long-poll
- Heartbeat: 60s with keep-alive

### 4. Security
- Binary: Statically compiled (musl for Rust, static for Go)
- Installation: .deb (Debian/Ubuntu), .rpm (RHEL/Fedora)
- SELinux: Policy module for confined execution
- AppArmor: Profile for constrained file/network access
- Capabilities: CAP_NET_ADMIN, CAP_SYS_ADMIN (for privileged ops)
- User Isolation: Drop privileges after startup where possible

## Build Instructions:

### Prerequisites (Rust):
- Rust 1.70+
- cargo, rustc
- OpenSSL development libraries (libssl-dev on Debian, openssl-devel on RHEL)

### Prerequisites (Go):
- Go 1.21+
- gcc (for CGO if using SQLite or other C bindings)

### Project Structure:
sentinel-agent-linux/
├── src/                         # Rust source or Go package
│   ├── main.rs / main.go
│   ├── commands/                # Command execution logic
│   ├── comm/                    # WebSocket client
│   └── crypto/                  # Signing, verification
├── packaging/
│   ├── debian/                  # .deb control files
│   └── rpm/                     # .spec file
├── systemd/
│   └── sentinel-agent.service
└── tests/

### Build Commands (Rust):
cargo build --release --target x86_64-unknown-linux-musl
strip target/x86_64-unknown-linux-musl/release/sentinel-agent

### Build Commands (Go):
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -ldflags="-s -w" -o sentinel-agent

### Packaging (Debian):
dpkg-deb --build packaging/debian sentinel-agent_1.0.0_amd64.deb

### Packaging (RPM):
rpmbuild -ba packaging/rpm/sentinel-agent.spec

### Installation:
sudo dpkg -i sentinel-agent_1.0.0_amd64.deb   # Debian/Ubuntu
sudo rpm -ivh sentinel-agent-1.0.0.x86_64.rpm # RHEL/Fedora
sudo systemctl enable --now sentinel-agent
sudo sentinel-agent enroll --token <token> --server <url>

## GitHub Repository:
https://github.com/sentinel-forensics/agent-linux`;

  const architectureOverview = `# Sentinel Forensics Agent - Architecture Overview

## Design Principles:
1. **Least Privilege**: Agent runs with minimal permissions; escalates only when executing privileged commands
2. **Zero Trust**: All commands are cryptographically signed by server; agents verify signatures
3. **Defense in Depth**: Multiple layers of security (TLS, mTLS, signature verification, replay protection)
4. **Fail-Safe**: If agent loses connection, maintain last known good configuration
5. **Observability**: Comprehensive logging, telemetry, and health checks

## High-Level Architecture:

┌─────────────────────────────────────────────────────────────┐
│                    Sentinel Web Console                     │
│  (Base44 Frontend - React + Vite)                           │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTPS/WSS
                     ▼
┌─────────────────────────────────────────────────────────────┐
│              Command & Control Backend                       │
│  (Deno Deploy Functions + Base44 SDK)                       │
│  - /enrollDevice                                            │
│  - /dispatchCommand                                         │
│  - /ingestResult                                            │
└────────────────────┬────────────────────────────────────────┘
                     │ WSS (WebSocket Secure)
                     │ + mTLS (mutual TLS)
                     ▼
┌─────────────────────────────────────────────────────────────┐
│                  Local Agent (per device)                    │
│  Platform-specific implementations:                          │
│  - Windows: C# / .NET Service                               │
│  - macOS: Swift Launch Daemon                               │
│  - Linux: Rust/Go Systemd Service                           │
│                                                              │
│  Core Modules:                                               │
│  ├── WebSocket Client (persistent connection to C2)         │
│  ├── Command Processor (validates + executes commands)      │
│  ├── Snapshot Collector (forensic data gathering)           │
│  ├── Policy Enforcer (USB, Network, Firewall rules)         │
│  └── Telemetry Reporter (health, metrics, logs)             │
└─────────────────────────────────────────────────────────────┘

## Communication Flow:

1. **Enrollment**:
   Agent → POST /enrollDevice {publicKey, platform, deviceInfo}
   Server → 200 OK {deviceId, serverCert, enrollmentToken}
   Agent stores deviceId + serverCert, establishes mTLS session

2. **Command Dispatch** (Server → Agent):
   Operator → Click "Panic Shield" in Web Console
   Backend → Creates AgentCommand entity
   Backend → Sends signed command over WebSocket:
   {
     "commandId": "uuid",
     "kind": "defense.activate",
     "params": {"mode": "panic_shield"},
     "issuedAt": "2025-01-23T12:00:00Z",
     "expiresAt": "2025-01-23T12:05:00Z",
     "counter": 42,
     "signature": "ed25519_sig_base64"
   }

3. **Command Execution** (Agent):
   Agent verifies:
   - Signature matches server public key
   - Counter > last seen counter (anti-replay)
   - expiresAt > current time
   
   If valid:
   - Execute platform-specific logic (e.g., iptables, firewall rules)
   - Collect artifacts (logs, snapshots)
   - Generate result manifest
   - Sign result with agent's private key

4. **Result Ingestion** (Agent → Server):
   Agent → POST /ingestResult {commandId, outcome, artifacts[], agentSignature}
   Server verifies agentSignature, stores AgentResult entity
   Server updates AgentCommand.status = "completed"

5. **Heartbeat**:
   Every 60s: Agent → PING
   Server → PONG + any queued commands

## Security Model:

### Enrollment Phase:
- Agent generates RSA-4096 or Ed25519 keypair
- Public key sent to server during enrollment
- Server stores publicKeyPem in Device entity
- Server returns signed certificate (optional mTLS) or session token

### Command Signing:
- Server signs every command with Ed25519 private key
- Signature covers: {commandId, kind, params, issuedAt, expiresAt, counter}
- Agent verifies signature before execution

### Replay Protection:
- Each command includes monotonic counter
- Agent tracks highest-seen counter per device
- Commands with counter <= last_seen are rejected

### Result Integrity:
- Agent signs result payloads with its private key
- Server verifies agentSignature against stored publicKeyPem
- Prevents command injection from rogue agents

## Error Handling:

### Connection Loss:
- Agent attempts reconnect with exponential backoff (1s, 2s, 4s, ... max 60s)
- Maintains command queue locally; retries on reconnect
- If offline > 24h, alert operator via email/SMS

### Command Failure:
- Agent reports outcome="failed", errorCode, errorMessage
- Logs stored locally + sent to server when online
- Critical failures trigger local rollback (e.g., undo firewall rules)

### Certificate Expiry:
- Agent monitors cert expiry; requests renewal 7 days before expiration
- Server issues new cert via /renewCertificate endpoint
- Old cert remains valid until new one is confirmed installed

## Performance Considerations:

- WebSocket keep-alive: Prevents NAT timeout
- Command queue: Max 100 queued commands; oldest drop if exceeded
- Snapshot size limit: 500MB (configurable); larger datasets split into chunks
- CPU throttling: Snapshot operations limited to 25% CPU to avoid disrupting user

## Compliance & Legal:

- All actions logged with SHA-256 tamper-proof chain
- Evidence files hashed (SHA-256) + signed by agent
- Chain of custody preserved: enrollment → command → result → artifact
- Supports GDPR/CCPA: PII redaction in snapshots configurable
- F.S. 90.803(6) compliance: Forensic snapshots court-admissible if verified

## Future Enhancements:

- [ ] iOS/Android agent support
- [ ] Offline command execution (pre-staged commands)
- [ ] Multi-device orchestration (execute on device group)
- [ ] Real-time streaming telemetry (logs, metrics)
- [ ] Agent auto-update mechanism (signed updates only)
- [ ] Hardware TPM integration for key storage
- [ ] eBPF-based monitoring (Linux) for kernel-level visibility`;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Agent Documentation</h1>
          <p className="text-slate-400">Complete guide to building Sentinel Forensics agents</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            className="border-slate-700"
            onClick={() => window.open('https://github.com/sentinel-forensics/agent', '_blank')}
          >
            <Github className="w-4 h-4 mr-2" />
            View on GitHub
          </Button>
          <Button className="bg-gradient-to-r from-blue-600 to-purple-600">
            <Download className="w-4 h-4 mr-2" />
            Download SDK
          </Button>
        </div>
      </div>

      {/* Quick Start */}
      <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-500/30">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Book className="w-5 h-5 text-blue-400" />
            Quick Start Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">1</span>
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Choose Platform</p>
                <p className="text-sm text-slate-400">Select Windows, macOS, or Linux implementation</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">2</span>
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Clone & Build</p>
                <p className="text-sm text-slate-400">Follow platform-specific build instructions</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                <span className="text-white font-bold">3</span>
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Enroll Device</p>
                <p className="text-sm text-slate-400">Use enrollment token from Devices page</p>
              </div>
            </div>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-semibold mb-1">Security Notice</p>
                <p className="text-yellow-300/80">
                  Agents require administrator/root privileges for defense actions. Always code-sign binaries and use mTLS for production deployments.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Platform Tabs */}
      <Tabs defaultValue="architecture" className="space-y-4">
        <TabsList className="bg-slate-900 border-slate-800">
          <TabsTrigger value="architecture">
            <Box className="w-4 h-4 mr-2" />
            Architecture
          </TabsTrigger>
          <TabsTrigger value="windows">
            <Monitor className="w-4 h-4 mr-2" />
            Windows
          </TabsTrigger>
          <TabsTrigger value="macos">
            <Laptop className="w-4 h-4 mr-2" />
            macOS
          </TabsTrigger>
          <TabsTrigger value="linux">
            <Server className="w-4 h-4 mr-2" />
            Linux
          </TabsTrigger>
        </TabsList>

        {/* Architecture Tab */}
        <TabsContent value="architecture">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-blue-400" />
                  System Architecture & Design
                </CardTitle>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => copyToClipboard(architectureOverview, 'architecture')}
                  className="border-slate-700"
                >
                  {copiedSection === 'architecture' ? (
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-950 text-slate-300 p-6 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                {architectureOverview}
              </pre>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Windows Tab */}
        <TabsContent value="windows">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-blue-400" />
                  Windows Agent Implementation
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className="bg-blue-500/20 text-blue-400">C# / .NET</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(windowsCode, 'windows')}
                    className="border-slate-700"
                  >
                    {copiedSection === 'windows' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-950 text-slate-300 p-6 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                {windowsCode}
              </pre>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="border-slate-700"
                  onClick={() => window.open('https://github.com/sentinel-forensics/agent-windows', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Repository
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-700"
                  onClick={() => window.open('https://github.com/sentinel-forensics/agent-windows/releases', '_blank')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download Binary
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* macOS Tab */}
        <TabsContent value="macos">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Laptop className="w-5 h-5 text-purple-400" />
                  macOS Agent Implementation
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className="bg-purple-500/20 text-purple-400">Swift</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(macosCode, 'macos')}
                    className="border-slate-700"
                  >
                    {copiedSection === 'macos' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-950 text-slate-300 p-6 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                {macosCode}
              </pre>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="border-slate-700"
                  onClick={() => window.open('https://github.com/sentinel-forensics/agent-macos', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Repository
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-700"
                  onClick={() => window.open('https://github.com/sentinel-forensics/agent-macos/releases', '_blank')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download DMG
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Linux Tab */}
        <TabsContent value="linux">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-white flex items-center gap-2">
                  <Server className="w-5 h-5 text-green-400" />
                  Linux Agent Implementation
                </CardTitle>
                <div className="flex gap-2">
                  <Badge className="bg-orange-500/20 text-orange-400">Rust</Badge>
                  <Badge className="bg-cyan-500/20 text-cyan-400">Go</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyToClipboard(linuxCode, 'linux')}
                    className="border-slate-700"
                  >
                    {copiedSection === 'linux' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <pre className="bg-slate-950 text-slate-300 p-6 rounded-lg overflow-x-auto text-sm font-mono whitespace-pre-wrap">
                {linuxCode}
              </pre>
              <div className="mt-4 flex gap-2">
                <Button
                  variant="outline"
                  className="border-slate-700"
                  onClick={() => window.open('https://github.com/sentinel-forensics/agent-linux', '_blank')}
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Repository
                </Button>
                <Button
                  variant="outline"
                  className="border-slate-700"
                  onClick={() => window.open('https://github.com/sentinel-forensics/agent-linux/releases', '_blank')}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Download .deb/.rpm
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Additional Resources */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileCode className="w-5 h-5 text-purple-400" />
            Additional Resources
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4">
            <Button
              variant="outline"
              className="h-auto py-4 flex-col items-start border-slate-700 hover:bg-slate-800"
              onClick={() => window.open('https://docs.sentinelforensics.com/agent/api', '_blank')}
            >
              <Terminal className="w-6 h-6 mb-2 text-blue-400" />
              <p className="font-semibold text-white">API Reference</p>
              <p className="text-xs text-slate-400">Complete C2 API documentation</p>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex-col items-start border-slate-700 hover:bg-slate-800"
              onClick={() => window.open('https://docs.sentinelforensics.com/agent/security', '_blank')}
            >
              <Shield className="w-6 h-6 mb-2 text-green-400" />
              <p className="font-semibold text-white">Security Best Practices</p>
              <p className="text-xs text-slate-400">Code signing, mTLS, and hardening</p>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex-col items-start border-slate-700 hover:bg-slate-800"
              onClick={() => window.open('https://docs.sentinelforensics.com/agent/testing', '_blank')}
            >
              <CheckCircle2 className="w-6 h-6 mb-2 text-purple-400" />
              <p className="font-semibold text-white">Testing Guide</p>
              <p className="text-xs text-slate-400">Unit tests, integration tests, chaos engineering</p>
            </Button>

            <Button
              variant="outline"
              className="h-auto py-4 flex-col items-start border-slate-700 hover:bg-slate-800"
              onClick={() => window.open('https://docs.sentinelforensics.com/agent/troubleshooting', '_blank')}
            >
              <AlertTriangle className="w-6 h-6 mb-2 text-yellow-400" />
              <p className="font-semibold text-white">Troubleshooting</p>
              <p className="text-xs text-slate-400">Common issues and debugging tips</p>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}