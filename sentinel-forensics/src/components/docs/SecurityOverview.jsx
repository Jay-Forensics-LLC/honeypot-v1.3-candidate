import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, Key, Lock, AlertTriangle } from 'lucide-react';

export default function SecurityOverview() {
  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card className="bg-slate-900 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Shield className="w-6 h-6 text-blue-400" />
            Sentinel Forensics - Security Overview
          </CardTitle>
        </CardHeader>
        <CardContent className="text-slate-300 space-y-6">
          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Architecture</h2>
            <p>Sentinel Forensics implements a <strong>zero-trust security model</strong> with military-grade encryption and tamper-resistant audit logging.</p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-400" />
              Secret Handling
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Server-Side Only</h3>
                <p>All API keys and secrets are stored as <strong>environment variables</strong> in the Base44 dashboard and are <strong>never</strong> exposed to the client.</p>
                
                <div className="mt-3 bg-slate-800 rounded-lg p-4">
                  <p className="font-semibold text-white mb-2">Current Integrations:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>SHODAN_API_KEY - Shodan device search</li>
                    <li>VIRUSTOTAL_API_KEY - VirusTotal malware scanning</li>
                    <li>HIBP_API_KEY - Have I Been Pwned breach checking</li>
                    <li>CENSYS_API_ID + CENSYS_API_SECRET - Censys infrastructure mapping</li>
                    <li>STRIPE_SECRET_KEY - Stripe payment processing</li>
                    <li>PLAID_CLIENT_ID + PLAID_SECRET - Plaid ACH banking</li>
                  </ul>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Access Pattern</h3>
                <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-3">
                  <code className="text-green-300">Client → Base44 Proxy Function → External API (with API key from env)</code>
                </div>
                <div className="mt-2 bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                  <code className="text-red-300">Client → External API (with hardcoded key) ❌</code>
                </div>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">API Key Rotation</h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Admin-Only Key Management</h3>
                <p>Admins can rotate API keys via the <code className="bg-slate-800 px-2 py-1 rounded">/admin/providers</code> page:</p>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Navigate to Admin → Provider Settings</li>
                  <li>Select the provider (e.g., VirusTotal)</li>
                  <li>Enter new API key</li>
                  <li>Click "Test Connection"</li>
                  <li>If successful, click "Activate"</li>
                  <li>Old key is immediately replaced</li>
                  <li>Rotation is logged in audit trail</li>
                </ol>
              </div>

              <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
                <p className="font-semibold text-blue-300 mb-2">Recommended Rotation Schedule:</p>
                <ul className="list-disc list-inside space-y-1 text-blue-200">
                  <li><strong>Quarterly</strong> for production systems</li>
                  <li><strong>Immediately</strong> if key is suspected to be compromised</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <Lock className="w-5 h-5 text-blue-400" />
              Content Security Policy (CSP)
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Current Headers</h3>
                <p>Base44 automatically applies these security headers:</p>
                <div className="bg-slate-800 rounded-lg p-3 mt-2 font-mono text-sm">
                  <div>X-Content-Type-Options: nosniff</div>
                  <div>X-Frame-Options: DENY</div>
                  <div>Referrer-Policy: strict-origin-when-cross-origin</div>
                  <div>Permissions-Policy: geolocation=(), microphone=(), camera=()</div>
                </div>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Custom CSP (if needed)</h3>
                <p>To add a custom Content-Security-Policy, configure it in:</p>
                <ul className="list-disc list-inside mt-2">
                  <li>Base44 Dashboard → Settings → Security Headers</li>
                  <li>Or via Cloudflare/CDN settings</li>
                </ul>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Role-Based Access Control (RBAC)</h2>
            <div className="overflow-x-auto">
              <table className="w-full border border-slate-700">
                <thead className="bg-slate-800">
                  <tr>
                    <th className="border border-slate-700 px-4 py-2 text-left">Tier</th>
                    <th className="border border-slate-700 px-4 py-2 text-left">Features</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className="border border-slate-700 px-4 py-2">Free</td>
                    <td className="border border-slate-700 px-4 py-2">Basic forensics, evidence upload, case management</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-700 px-4 py-2">Professional</td>
                    <td className="border border-slate-700 px-4 py-2">+ Pegasus Defense, Threat Hunting, Advanced Malware, 100 queries/mo</td>
                  </tr>
                  <tr>
                    <td className="border border-slate-700 px-4 py-2">Enterprise</td>
                    <td className="border border-slate-700 px-4 py-2">+ Unlimited queries, Priority support, Custom integrations</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-400" />
              Incident Response
            </h2>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">If a Key is Compromised</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li><strong>Immediately rotate the key</strong> via /admin/providers</li>
                  <li><strong>Revoke the old key</strong> in the provider's dashboard</li>
                  <li><strong>Review audit logs</strong> for unauthorized usage</li>
                  <li><strong>Notify affected users</strong> if data was accessed</li>
                  <li><strong>File incident report</strong> with timestamp and impact assessment</li>
                </ol>
              </div>

              <div>
                <h3 className="text-lg font-semibold text-white mb-2">If Suspicious Activity is Detected</h3>
                <ol className="list-decimal list-inside space-y-1">
                  <li>Check /admin/audit for anomalous patterns</li>
                  <li>Review failed login attempts</li>
                  <li>Verify rate limit violations</li>
                  <li>Investigate any 403/401 errors from unexpected IPs</li>
                </ol>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">Security Checklist</h2>
            <div className="space-y-2">
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> All API keys stored server-side only</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> CSP headers configured</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> RBAC enforced on all premium routes</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> Rate limiting active</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> Audit logging comprehensive</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> Evidence chain-of-custody tracked</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> Encryption at rest and in transit</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> Key rotation procedure documented</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> Session cookies secured</div>
              <div className="flex items-center gap-2"><span className="text-green-400">✅</span> No client-side secrets</div>
            </div>
          </section>

          <div className="mt-6 pt-6 border-t border-slate-700 text-sm text-slate-400">
            <p><strong>Last Updated:</strong> January 2025</p>
            <p><strong>Contact:</strong> security@sentinelforensics.com</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}