import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Shield, Copy } from 'lucide-react';
import { toast } from 'sonner';

export default function VerificationPanel({ runId }) {
  const [verificationResult, setVerificationResult] = useState(null);
  const [verifying, setVerifying] = useState(false);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const response = await base44.functions.invoke('verifyAuditIntegrity', { run_id: runId });
      setVerificationResult(response.data);
      toast.success('Verification complete');
    } catch (error) {
      toast.error(`Verification failed: ${error.message}`);
    } finally {
      setVerifying(false);
    }
  };

  const copyCommands = () => {
    const commands = `# Verify artifacts manually:
shasum -a 256 audit_${runId}.json
shasum -a 256 audit_${runId}_summary.md
shasum -a 256 audit_${runId}_manifest.json

# Compare output to stored hashes`;
    navigator.clipboard.writeText(commands);
    toast.success('Commands copied');
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-white font-medium flex items-center gap-2">
          <Shield className="w-5 h-5 text-purple-400" />
          Chain-of-Custody Verification
        </h3>
        <Button onClick={handleVerify} disabled={verifying} className="bg-purple-600 hover:bg-purple-700">
          {verifying ? 'Verifying...' : 'Verify Integrity'}
        </Button>
      </div>

      {verificationResult && (
        <>
          <Card className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4 space-y-3">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Verification Status:</span>
                <Badge className={
                  verificationResult.verification_status === 'VERIFIED' 
                    ? 'bg-green-500/20 text-green-400 border-green-500/50'
                    : 'bg-red-500/20 text-red-400 border-red-500/50'
                }>
                  {verificationResult.verification_status === 'VERIFIED' ? (
                    <><CheckCircle className="w-3 h-3 mr-1" /> VERIFIED</>
                  ) : (
                    <><XCircle className="w-3 h-3 mr-1" /> FAILED</>
                  )}
                </Badge>
              </div>
              
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Seal Status:</span>
                <Badge className="bg-blue-500/20 text-blue-400">{verificationResult.seal_status}</Badge>
              </div>

              {verificationResult.seal_hash && (
                <div>
                  <span className="text-slate-400 text-sm block mb-1">Seal Hash (SHA-256):</span>
                  <code className="text-xs text-slate-300 bg-slate-900 p-2 rounded block break-all">
                    {verificationResult.seal_hash}
                  </code>
                </div>
              )}

              <div className="text-xs text-slate-500">
                Sealed at: {verificationResult.sealed_at ? new Date(verificationResult.sealed_at).toLocaleString() : 'Not sealed'}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-white text-sm">Artifacts</CardTitle>
              <Button size="sm" variant="outline" onClick={copyCommands}>
                <Copy className="w-3 h-3 mr-1" />
                Copy Verification Commands
              </Button>
            </CardHeader>
            <CardContent className="space-y-2">
              {verificationResult.artifacts?.map(artifact => (
                <div key={artifact.artifact_id} className="p-3 bg-slate-900/50 rounded space-y-2">
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="text-white font-medium text-sm">{artifact.filename}</div>
                      <div className="text-xs text-slate-500">{artifact.type} · {(artifact.size_bytes / 1024).toFixed(1)} KB</div>
                    </div>
                    <Badge className={
                      artifact.status === 'VERIFIED' 
                        ? 'bg-green-500/20 text-green-400'
                        : artifact.status === 'WARNING'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-red-500/20 text-red-400'
                    }>
                      {artifact.status}
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xs text-slate-500 mb-1">Stored Hash:</div>
                    <code className="text-xs text-slate-400 block break-all font-mono">
                      {artifact.stored_hash}
                    </code>
                  </div>
                  {artifact.message && (
                    <div className="text-xs text-yellow-400">⚠️ {artifact.message}</div>
                  )}
                </div>
              ))}
            </CardContent>
          </Card>

          <div className="text-xs text-slate-500 p-3 bg-slate-800/30 rounded">
            <strong className="text-white">Chain-of-Custody Guarantee:</strong> All artifacts are immutable once written. 
            Seal hash cryptographically binds run configuration, statistics, and artifact hashes. 
            Any tampering will be detected during verification.
          </div>
        </>
      )}
    </div>
  );
}