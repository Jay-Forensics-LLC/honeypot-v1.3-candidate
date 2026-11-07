import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Lock, Key, Eye, AlertTriangle } from 'lucide-react';

export default function SecurityDocs() {
  return (
    <div className="p-6 space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-4 mb-8">
        <div className="w-12 h-12 bg-gradient-to-br from-red-600 to-orange-600 rounded-lg flex items-center justify-center">
          <Shield className="w-6 h-6 text-white" />
        </div>
        <div>
          <h1 className="text-3xl font-bold text-white">Security Architecture</h1>
          <p className="text-slate-400">Military-grade security implementation details</p>
        </div>
      </div>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="w-5 h-5 text-blue-400" />
            Zero-Trust Architecture
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300">
          <p>
            Sentinel Forensics implements a comprehensive zero-trust security model where every request 
            is authenticated and authorized, regardless of origin.
          </p>
          
          <div className="bg-slate-800/50 rounded p-4 space-y-2">
            <h4 className="font-semibold text-white">Key Principles:</h4>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>Never trust, always verify - all requests require authentication</li>
              <li>Least privilege access - users only access what they need</li>
              <li>Defense in depth - multiple layers of security controls</li>
              <li>Continuous monitoring - all actions logged and auditable</li>
              <li>Encryption everywhere - data encrypted at rest and in transit</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="w-5 h-5 text-purple-400" />
            API Key Management
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300">
          <p>
            All third-party API keys are stored server-side as environment variables and NEVER exposed to 
            the browser or client applications.
          </p>
          
          <div className="bg-slate-800/50 rounded p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-white mb-2">Storage:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Encrypted at rest in secure key vault</li>
                <li>Accessed only by backend functions via environment variables</li>
                <li>Rotation supported without application redeployment</li>
                <li>All rotations logged in audit trail</li>
              </ul>
            </div>
            
            <div>
              <h4 className="font-semibold text-white mb-2">Access Control:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Backend functions validate user authentication before API calls</li>
                <li>Subscription tier checked for each request</li>
                <li>Rate limiting enforced per user per provider</li>
                <li>All API calls logged with user context</li>
              </ul>
            </div>
          </div>

          <div className="bg-yellow-900/20 border border-yellow-500/30 rounded p-3">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-yellow-200">
                <strong>Developer Note:</strong> Never commit API keys to version control. 
                Use environment variables exclusively and rotate keys if accidentally exposed.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Eye className="w-5 h-5 text-green-400" />
            Audit Logging
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300">
          <p>
            Every security-relevant action is logged to an immutable audit trail with cryptographic 
            integrity verification.
          </p>
          
          <div className="bg-slate-800/50 rounded p-4">
            <h4 className="font-semibold text-white mb-2">Logged Events Include:</h4>
            <ul className="grid md:grid-cols-2 gap-2 text-sm">
              <li>• Authentication attempts</li>
              <li>• Evidence access & modifications</li>
              <li>• API key rotations</li>
              <li>• Subscription changes</li>
              <li>• Report generations</li>
              <li>• Threat intel queries</li>
              <li>• Admin actions</li>
              <li>• Failed access attempts</li>
            </ul>
          </div>

          <div className="bg-slate-800/50 rounded p-4">
            <h4 className="font-semibold text-white mb-2">Integrity Protection:</h4>
            <p className="text-sm mb-2">
              Each audit log entry includes:
            </p>
            <ul className="list-disc list-inside space-y-1 text-sm">
              <li>SHA-256 hash of entry content</li>
              <li>Hash of previous entry (blockchain-style chain)</li>
              <li>Timestamp with microsecond precision</li>
              <li>User context and session information</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle>Chain of Custody</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300">
          <p>
            Evidence integrity is maintained through cryptographic chain of custody tracking that meets 
            legal admissibility standards for digital forensics.
          </p>
          
          <div className="bg-slate-800/50 rounded p-4 space-y-3">
            <div>
              <h4 className="font-semibold text-white mb-2">Evidence Collection:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm">
                <li>SHA-256 hash computed on upload</li>
                <li>Initial custody entry created with timestamp and uploader</li>
                <li>Merkle root generated for batch integrity</li>
                <li>Evidence marked for verification</li>
              </ol>
            </div>

            <div>
              <h4 className="font-semibold text-white mb-2">Every Custody Transfer Logs:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Timestamp (ISO 8601 format)</li>
                <li>Action performed</li>
                <li>User who performed action</li>
                <li>Integrity hash at time of transfer</li>
                <li>Digital signature</li>
              </ul>
            </div>
          </div>

          <div className="bg-green-900/20 border border-green-500/30 rounded p-3">
            <p className="text-sm text-green-200">
              <strong>Legal Compliance:</strong> This implementation meets the requirements of 
              Federal Rules of Evidence 902(14) for self-authenticating evidence and Florida Statute 90.803 
              for business records exception to hearsay.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle>RBAC (Role-Based Access Control)</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-slate-300">
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-800/50 rounded p-4">
              <h4 className="font-semibold text-white mb-2">Admin Role:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Full system access</li>
                <li>User management</li>
                <li>API key rotation</li>
                <li>Audit log access</li>
                <li>Provider configuration</li>
              </ul>
            </div>

            <div className="bg-slate-800/50 rounded p-4">
              <h4 className="font-semibold text-white mb-2">User Role:</h4>
              <ul className="list-disc list-inside space-y-1 text-sm">
                <li>Own cases & evidence</li>
                <li>Assigned tasks</li>
                <li>Threat intel queries (rate-limited)</li>
                <li>Report generation</li>
                <li>Limited to subscription tier</li>
              </ul>
            </div>
          </div>

          <div className="bg-slate-800/50 rounded p-4">
            <h4 className="font-semibold text-white mb-2">Subscription Tiers:</h4>
            <ul className="space-y-2 text-sm">
              <li><strong className="text-blue-400">Professional:</strong> Advanced features, 100 API calls/month</li>
              <li><strong className="text-purple-400">Enterprise:</strong> Unlimited devices, 5000 API calls/month</li>
              <li><strong className="text-red-400">Forensic Suite:</strong> Military-grade, unlimited everything</li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}