import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Shield, Database, Zap, Lock, FileCheck, GitBranch } from 'lucide-react';

/**
 * SYSTEM DESIGN DOCUMENT
 * Architecture overview with integrity guarantees
 */
export default function SystemDesignDocument() {
  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">System Design Document</h1>
          <p className="text-slate-400">Sentinel Forensics - Architecture & Security Guarantees</p>
        </div>

        {/* Architecture Overview */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <GitBranch className="w-5 h-5 text-blue-400" />
              Architecture Overview
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-slate-300">
            <div className="space-y-2">
              <h3 className="font-semibold text-white">Layer 1: Transport & API</h3>
              <ul className="list-disc ml-6 space-y-1 text-sm">
                <li>Unified Transport Layer with request coalescing, batching, and abort control</li>
                <li>Circuit breakers with exponential backoff (per-endpoint isolation)</li>
                <li>Client-side rate limiting (token bucket algorithm)</li>
                <li>Request deduplication and caching (TTL + LRU eviction)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-white">Layer 2: State Management</h3>
              <ul className="list-disc ml-6 space-y-1 text-sm">
                <li>Zustand typed stores with persistence middleware</li>
                <li>Transactional event bus with rollback support</li>
                <li>Dependency injection container for service orchestration</li>
                <li>React Query with aggressive caching (10min stale, 15min cache)</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-white">Layer 3: Storage & Persistence</h3>
              <ul className="list-disc ml-6 space-y-1 text-sm">
                <li>IndexedDB with batch writes, snapshots, and schema migrations</li>
                <li>Append-only storage with timestamp monotonicity enforcement</li>
                <li>Offline queue with retry logic and conflict resolution</li>
                <li>Progressive data preloading and predictive prefetch</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h3 className="font-semibold text-white">Layer 4: Security & Forensics</h3>
              <ul className="list-disc ml-6 space-y-1 text-sm">
                <li>Tamper-evident logging with SHA-256 hash chains</li>
                <li>Device integrity checks (OS detection, MAC spoofing, VM detection)</li>
                <li>Telemetry blocker with service worker interception</li>
                <li>Script integrity verification with hash validation</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Event Pipeline */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-400" />
              Event Pipeline Architecture
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-slate-300 text-sm">
            <div className="bg-slate-800/50 rounded-lg p-4 space-y-3">
              <p className="font-semibold text-white">Event Flow:</p>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-blue-500/20 rounded flex items-center justify-center text-xs text-blue-400">1</div>
                  <span>Event captured (user action, system event, threat detection)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-purple-500/20 rounded flex items-center justify-center text-xs text-purple-400">2</div>
                  <span>Normalized using ForensicEvent schema</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-green-500/20 rounded flex items-center justify-center text-xs text-green-400">3</div>
                  <span>Cryptographic hash calculated (SHA-256 with previous hash)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-orange-500/20 rounded flex items-center justify-center text-xs text-orange-400">4</div>
                  <span>Appended to immutable storage (timestamp monotonicity check)</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 bg-red-500/20 rounded flex items-center justify-center text-xs text-red-400">5</div>
                  <span>Persisted to IndexedDB and event bus notification</span>
                </div>
              </div>
            </div>

            <div className="bg-slate-800/50 rounded-lg p-4">
              <p className="font-semibold text-white mb-2">Event Normalization Schema:</p>
              <pre className="text-xs bg-slate-900 rounded p-3 overflow-x-auto">
{`{
  eventType: string,        // Standardized event type
  eventData: object,        // Sanitized event payload
  timestamp: ISO8601,       // Server-synchronized timestamp
  sequenceNumber: number,   // Monotonic sequence
  previousHash: string,     // SHA-256 of previous event
  hash: string,            // SHA-256 of current event
  metadata: {
    source: string,
    version: string,
    userAgent: string,
    url: string
  }
}`}
              </pre>
            </div>
          </CardContent>
        </Card>

        {/* Integrity Guarantees */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Lock className="w-5 h-5 text-green-400" />
              Integrity Guarantees
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-4">
              <div className="bg-green-950/20 border border-green-500/30 rounded-lg p-4">
                <h3 className="text-green-300 font-semibold mb-2 flex items-center gap-2">
                  <FileCheck className="w-4 h-4" />
                  Tamper Detection
                </h3>
                <ul className="text-sm text-green-200 space-y-1">
                  <li>✓ Hash chain validation</li>
                  <li>✓ Sequence number verification</li>
                  <li>✓ Timestamp monotonicity checks</li>
                  <li>✓ Previous hash continuity</li>
                </ul>
              </div>

              <div className="bg-blue-950/20 border border-blue-500/30 rounded-lg p-4">
                <h3 className="text-blue-300 font-semibold mb-2 flex items-center gap-2">
                  <Database className="w-4 h-4" />
                  Data Immutability
                </h3>
                <ul className="text-sm text-blue-200 space-y-1">
                  <li>✓ Append-only storage pattern</li>
                  <li>✓ No update/delete operations</li>
                  <li>✓ Retention policy enforcement</li>
                  <li>✓ Snapshot-based rollback</li>
                </ul>
              </div>

              <div className="bg-purple-950/20 border border-purple-500/30 rounded-lg p-4">
                <h3 className="text-purple-300 font-semibold mb-2 flex items-center gap-2">
                  <Shield className="w-4 h-4" />
                  Device Integrity
                </h3>
                <ul className="text-sm text-purple-200 space-y-1">
                  <li>✓ OS verification on activation</li>
                  <li>✓ MAC spoofing detection</li>
                  <li>✓ Device cloning detection</li>
                  <li>✓ VM/emulator identification</li>
                </ul>
              </div>

              <div className="bg-orange-950/20 border border-orange-500/30 rounded-lg p-4">
                <h3 className="text-orange-300 font-semibold mb-2 flex items-center gap-2">
                  <Zap className="w-4 h-4" />
                  Event Ordering
                </h3>
                <ul className="text-sm text-orange-200 space-y-1">
                  <li>✓ Monotonic timestamps</li>
                  <li>✓ Sequential numbering</li>
                  <li>✓ Clock skew detection</li>
                  <li>✓ Gap detection in sequences</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Threat Intelligence Pipeline */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-400" />
              Threat Intelligence Pipeline
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-slate-300 text-sm">
            <div className="space-y-3">
              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">1. Ingestion</h3>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Real-time API bindings to VirusTotal, AbuseIPDB, AlienVault OTX, URLScan</li>
                  <li>Rate limiting and request coalescing</li>
                  <li>Schema validation against predefined threat schemas</li>
                </ul>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">2. Normalization</h3>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Provider-specific mapping adapters</li>
                  <li>Unified threat score calculation</li>
                  <li>Confidence level aggregation</li>
                  <li>Tag extraction and severity classification</li>
                </ul>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">3. Storage</h3>
                <ul className="list-disc ml-6 space-y-1">
                  <li>Append-only storage with cryptographic hashing</li>
                  <li>Forensic logger integration for audit trail</li>
                  <li>IndexedDB persistence with automatic pruning</li>
                </ul>
              </div>

              <div className="bg-slate-800/50 rounded-lg p-4">
                <h3 className="font-semibold text-white mb-2">4. Analysis & Response</h3>
                <ul className="list-disc ml-6 space-y-1">
                  <li>One-click conversion to evidence records</li>
                  <li>Automated remediation step generation</li>
                  <li>Cross-reference with MITRE ATT&CK framework</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Performance & Monitoring */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Performance & Monitoring</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-300">
            <div className="grid md:grid-cols-3 gap-4">
              <div className="bg-slate-800/30 rounded p-3">
                <p className="font-semibold text-white mb-1">FPS Monitoring</p>
                <p className="text-xs">Real-time frame rate tracking with threshold alerts (&lt;30 FPS critical)</p>
              </div>
              <div className="bg-slate-800/30 rounded p-3">
                <p className="font-semibold text-white mb-1">Memory Management</p>
                <p className="text-xs">Heap usage monitoring with automatic GC triggers (&gt;90% critical)</p>
              </div>
              <div className="bg-slate-800/30 rounded p-3">
                <p className="font-semibold text-white mb-1">Error Tracking</p>
                <p className="text-xs">Global error capture with forensic logging and context preservation</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Security Features */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-purple-400" />
              Security Hardening
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div className="space-y-2">
                <Badge className="bg-purple-500/20 text-purple-400 border-purple-500/50 mb-2">
                  Anti-Tamper
                </Badge>
                <ul className="list-disc ml-6 space-y-1 text-slate-300">
                  <li>Cryptographic event chain (SHA-256)</li>
                  <li>Immutable append-only logs</li>
                  <li>Chain integrity verification</li>
                  <li>Sequence gap detection</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/50 mb-2">
                  Device Security
                </Badge>
                <ul className="list-disc ml-6 space-y-1 text-slate-300">
                  <li>OS fingerprinting on activation</li>
                  <li>MAC spoofing detection (WebRTC)</li>
                  <li>Device cloning detection</li>
                  <li>Virtual machine identification</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Badge className="bg-green-500/20 text-green-400 border-green-500/50 mb-2">
                  Privacy
                </Badge>
                <ul className="list-disc ml-6 space-y-1 text-slate-300">
                  <li>Telemetry blocking (Service Worker)</li>
                  <li>Script integrity monitoring</li>
                  <li>CSP-conscious sandboxing</li>
                  <li>Sensitive data redaction</li>
                </ul>
              </div>

              <div className="space-y-2">
                <Badge className="bg-orange-500/20 text-orange-400 border-orange-500/50 mb-2">
                  Threat Intelligence
                </Badge>
                <ul className="list-disc ml-6 space-y-1 text-slate-300">
                  <li>Multi-source API integration</li>
                  <li>Schema validation & normalization</li>
                  <li>Automated enrichment workflows</li>
                  <li>Evidence conversion pipeline</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Data Flow Diagram */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Critical Data Flows</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4 text-sm">
              <div className="bg-gradient-to-r from-blue-950/50 to-purple-950/50 border border-blue-500/30 rounded-lg p-4">
                <p className="font-semibold text-blue-300 mb-2">Evidence Upload Flow:</p>
                <p className="text-slate-300">
                  User Upload → InputValidator → CryptoHash → ForensicLogger → IndexedDB → 
                  AuditLog → EventBus → UI Update → OfflineQueue (if offline)
                </p>
              </div>

              <div className="bg-gradient-to-r from-purple-950/50 to-pink-950/50 border border-purple-500/30 rounded-lg p-4">
                <p className="font-semibold text-purple-300 mb-2">Threat Intelligence Flow:</p>
                <p className="text-slate-300">
                  API Request → RateLimiter → CircuitBreaker → ExternalAPI → SchemaValidator → 
                  DataMapper → AppendOnlyStorage → ForensicLogger → Cache
                </p>
              </div>

              <div className="bg-gradient-to-r from-green-950/50 to-blue-950/50 border border-green-500/30 rounded-lg p-4">
                <p className="font-semibold text-green-300 mb-2">Offline Sync Flow:</p>
                <p className="text-slate-300">
                  OfflineDetection → MutationQueue → IndexedDB → OnlineDetection → 
                  QueueProcessor → BatchRetry → ConflictResolution → ServerSync → CacheInvalidation
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Feature Flags */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Progressive Feature Rollout</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-slate-300">
            <p className="mb-3">All major features are gated behind feature flags for safe rollout:</p>
            <div className="grid md:grid-cols-3 gap-3">
              <Badge variant="outline" className="justify-center py-2">unified_transport</Badge>
              <Badge variant="outline" className="justify-center py-2">request_batching</Badge>
              <Badge variant="outline" className="justify-center py-2">advanced_caching</Badge>
              <Badge variant="outline" className="justify-center py-2">virtual_lists</Badge>
              <Badge variant="outline" className="justify-center py-2">health_monitoring</Badge>
              <Badge variant="outline" className="justify-center py-2">session_refresh</Badge>
              <Badge variant="outline" className="justify-center py-2">event_bus</Badge>
              <Badge variant="outline" className="justify-center py-2">typed_stores</Badge>
              <Badge variant="outline" className="justify-center py-2">snapshots</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}