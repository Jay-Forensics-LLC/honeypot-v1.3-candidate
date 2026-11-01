import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  Shield, 
  CheckCircle,
  XCircle,
  Activity
} from "lucide-react";
import SentinelCrypto from "../utils/SentinelCrypto";
import { toast } from "sonner";

export default function ChainIntegrityVerifier({ chainOfCustody }) {
  const [verifying, setVerifying] = useState(false);
  const [results, setResults] = useState(null);

  const verifyChain = async () => {
    if (!chainOfCustody || chainOfCustody.length === 0) {
      toast.error('No chain-of-custody to verify');
      return;
    }

    setVerifying(true);

    try {
      const isValid = await SentinelCrypto.verifyCustodyChain(chainOfCustody);
      
      setResults({
        isValid,
        totalEntries: chainOfCustody.length,
        timestamp: new Date().toISOString()
      });

      if (isValid) {
        toast.success('✅ Chain-of-custody verified! No tampering detected.');
      } else {
        toast.error('⚠️ Chain-of-custody COMPROMISED! Evidence may be inadmissible.');
      }
    } catch (error) {
      toast.error('Verification failed');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-green-400" />
          Chain-of-Custody Integrity Verifier
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-white mb-1">Cryptographic Verification</h3>
            <p className="text-sm text-slate-400">
              Verify evidence integrity using SHA-256 blockchain
            </p>
          </div>
          <Button
            onClick={verifyChain}
            disabled={verifying || !chainOfCustody}
            className="bg-green-600 hover:bg-green-700"
          >
            {verifying ? (
              <>
                <Activity className="w-4 h-4 mr-2 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Shield className="w-4 h-4 mr-2" />
                Verify Chain
              </>
            )}
          </Button>
        </div>

        {/* Results */}
        {results && (
          <div className={`p-6 rounded-lg border-2 ${
            results.isValid 
              ? 'bg-green-500/10 border-green-500' 
              : 'bg-red-500/10 border-red-500'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              {results.isValid ? (
                <>
                  <CheckCircle className="w-8 h-8 text-green-400" />
                  <div>
                    <h3 className="text-xl font-bold text-white">✅ CHAIN VERIFIED</h3>
                    <p className="text-sm text-slate-400">Evidence integrity confirmed</p>
                  </div>
                </>
              ) : (
                <>
                  <XCircle className="w-8 h-8 text-red-400" />
                  <div>
                    <h3 className="text-xl font-bold text-white">⚠️ TAMPERING DETECTED</h3>
                    <p className="text-sm text-slate-400">Chain-of-custody compromised</p>
                  </div>
                </>
              )}
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="p-3 bg-slate-900/50 rounded">
                <p className="text-xs text-slate-400 mb-1">Total Entries</p>
                <p className="text-2xl font-bold text-white">{results.totalEntries}</p>
              </div>
              <div className="p-3 bg-slate-900/50 rounded">
                <p className="text-xs text-slate-400 mb-1">Verified At</p>
                <p className="text-sm text-white">
                  {new Date(results.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {!results.isValid && (
              <div className="mt-4 p-3 bg-red-900/30 rounded">
                <p className="text-sm text-red-300">
                  <strong>CRITICAL:</strong> Hash verification failed. Evidence may have been 
                  tampered with and could be inadmissible in court. Preserve all records and 
                  contact forensic experts immediately.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Info */}
        <div className="p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
          <h4 className="font-semibold text-blue-400 mb-2">How It Works</h4>
          <ul className="text-sm text-slate-300 space-y-1">
            <li>• Each custody entry is cryptographically signed (SHA-256)</li>
            <li>• Entries are chained together (blockchain-style)</li>
            <li>• Any tampering breaks the hash chain</li>
            <li>• Provides legal-grade evidence integrity</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}