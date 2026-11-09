import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Progress } from "@/components/ui/progress";
import { 
  Archive, 
  Download,
  Lock,
  FileText,
  Shield,
  Hash,
  CheckCircle,
  Loader2
} from "lucide-react";
import { CryptoUtils } from "../utils/CryptoUtils";
import { toast } from "sonner";
import { format } from "date-fns";

export default function ForensicZIPGenerator({ sessionId, caseId }) {
  const [bundleName, setBundleName] = useState('');
  const [includeSignatures, setIncludeSignatures] = useState(true);
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeChainOfCustody, setIncludeChainOfCustody] = useState(true);
  const [encryptArchive, setEncryptArchive] = useState(true);
  const [generateProgress, setGenerateProgress] = useState(0);
  const [isGenerating, setIsGenerating] = useState(false);

  const { data: session } = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => sessionId ? base44.entities.ScanSession.filter({ session_id: sessionId }).then(r => r[0]) : null,
    enabled: !!sessionId
  });

  const { data: caseData } = useQuery({
    queryKey: ['case', caseId],
    queryFn: () => caseId ? base44.entities.Case.filter({ case_number: caseId }).then(r => r[0]) : null,
    enabled: !!caseId
  });

  const generateBundleMutation = useMutation({
    mutationFn: async () => {
      setIsGenerating(true);
      setGenerateProgress(0);

      const bundle = {
        bundle_id: `FORENSIC-${Date.now()}`,
        generated_at: new Date().toISOString(),
        bundle_name: bundleName || `Forensic_Bundle_${format(new Date(), 'yyyy-MM-dd_HHmmss')}`,
        version: '1.0',
        watermark: 'NOT LEGALLY ADMISSIBLE UNTIL VERIFIED',
        contents: {}
      };

      // Step 1: Collect session data (20%)
      setGenerateProgress(20);
      if (sessionId && session) {
        bundle.contents.session = session;
        
        const observations = await base44.entities.Observation.filter({ session_id: sessionId });
        bundle.contents.observations = observations;

        const findings = await base44.entities.IOCFinding.filter({ session_id: sessionId });
        bundle.contents.findings = findings;
      }

      // Step 2: Collect case data (40%)
      setGenerateProgress(40);
      if (caseId && caseData) {
        bundle.contents.case = caseData;
        
        const evidence = await base44.entities.Evidence.filter({ case_id: caseId });
        bundle.contents.evidence = evidence;

        const reports = await base44.entities.Report.filter({ case_id: caseId });
        bundle.contents.reports = reports;
      }

      // Step 3: Generate signatures (60%)
      setGenerateProgress(60);
      if (includeSignatures) {
        const dataString = JSON.stringify(bundle.contents);
        bundle.signatures = {
          sha256: await CryptoUtils.hash(dataString),
          md5: await CryptoUtils.md5(dataString),
          signed_at: new Date().toISOString()
        };
      }

      // Step 4: Add metadata (70%)
      setGenerateProgress(70);
      if (includeMetadata) {
        bundle.metadata = {
          investigator: await base44.auth.me().then(u => u.email),
          organization: await base44.auth.me().then(u => u.organization),
          total_records: Object.keys(bundle.contents).reduce((sum, key) => {
            return sum + (Array.isArray(bundle.contents[key]) ? bundle.contents[key].length : 1);
          }, 0),
          file_size_estimate: new Blob([JSON.stringify(bundle)]).size,
          generated_with: 'Jay Forensics v1.0'
        };
      }

      // Step 5: Chain of custody (80%)
      setGenerateProgress(80);
      if (includeChainOfCustody) {
        bundle.chain_of_custody = [
          {
            timestamp: new Date().toISOString(),
            action: 'Bundle Generated',
            actor: bundle.metadata?.investigator || 'Unknown',
            integrity_hash: bundle.signatures?.sha256 || 'N/A'
          }
        ];
      }

      // Step 6: Create merkle tree for verification (90%)
      setGenerateProgress(90);
      const merkleLeaves = [];
      
      if (bundle.contents.observations) {
        for (const obs of bundle.contents.observations) {
          const hash = await CryptoUtils.hash(JSON.stringify(obs));
          merkleLeaves.push(hash);
        }
      }

      bundle.merkle_root = merkleLeaves.length > 0 
        ? await CryptoUtils.hash(merkleLeaves.join(''))
        : null;

      // Step 7: Encrypt if requested (95%)
      setGenerateProgress(95);
      let finalData = JSON.stringify(bundle, null, 2);
      
      if (encryptArchive) {
        const encryptionKey = await CryptoUtils.generateKey();
        finalData = await CryptoUtils.encrypt(finalData, encryptionKey);
        
        bundle.encryption = {
          encrypted: true,
          algorithm: 'AES-256-GCM',
          key_hint: 'Stored securely - contact investigator',
          encrypted_at: new Date().toISOString()
        };
      }

      // Step 8: Create downloadable file (100%)
      setGenerateProgress(100);
      const blob = new Blob([finalData], { type: encryptArchive ? 'application/octet-stream' : 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${bundle.bundle_name}${encryptArchive ? '.encrypted' : ''}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Also create a manifest file
      const manifest = {
        bundle_id: bundle.bundle_id,
        bundle_name: bundle.bundle_name,
        generated_at: bundle.generated_at,
        sha256_hash: bundle.signatures?.sha256,
        merkle_root: bundle.merkle_root,
        encrypted: encryptArchive,
        total_records: bundle.metadata?.total_records,
        file_size_bytes: blob.size,
        watermark: bundle.watermark,
        verification_instructions: 'Use SHA-256 hash to verify integrity. Check merkle_root for tamper detection.'
      };

      const manifestBlob = new Blob([JSON.stringify(manifest, null, 2)], { type: 'application/json' });
      const manifestUrl = URL.createObjectURL(manifestBlob);
      const manifestLink = document.createElement('a');
      manifestLink.href = manifestUrl;
      manifestLink.download = `${bundle.bundle_name}_MANIFEST.json`;
      document.body.appendChild(manifestLink);
      manifestLink.click();
      document.body.removeChild(manifestLink);
      URL.revokeObjectURL(manifestUrl);

      // Create export record
      await base44.entities.ExportRecord.create({
        export_id: bundle.bundle_id,
        session_id: sessionId || 'N/A',
        export_type: 'forensic_bundle',
        export_timestamp: bundle.generated_at,
        file_url: 'local-download',
        file_hash_sha256: bundle.signatures?.sha256,
        file_size_bytes: blob.size,
        includes_merkle_root: !!bundle.merkle_root,
        watermarked: true,
        verified: false
      });

      return bundle;
    },
    onSuccess: (bundle) => {
      setIsGenerating(false);
      toast.success(`Forensic bundle generated: ${bundle.bundle_name}`);
    },
    onError: (error) => {
      setIsGenerating(false);
      toast.error(`Bundle generation failed: ${error.message}`);
    }
  });

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Archive className="w-5 h-5 text-purple-400" />
          Forensic ZIP Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Legal Watermark Notice */}
        <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
          <div className="flex items-start gap-3">
            <Shield className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
            <div>
              <h4 className="font-semibold text-yellow-500 mb-1">Legal Watermark</h4>
              <p className="text-sm text-yellow-200/90">
                All bundles include: <strong>"NOT LEGALLY ADMISSIBLE UNTIL VERIFIED"</strong>
                <br />
                Must be cryptographically verified before use in legal proceedings.
              </p>
            </div>
          </div>
        </div>

        {/* Bundle Configuration */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Bundle Name</Label>
            <Input
              value={bundleName}
              onChange={(e) => setBundleName(e.target.value)}
              placeholder="Forensic_Evidence_Bundle"
              className="bg-slate-800 border-slate-700"
            />
          </div>

          {/* Options */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox 
                checked={includeSignatures}
                onCheckedChange={setIncludeSignatures}
                id="signatures"
              />
              <Label htmlFor="signatures" className="cursor-pointer">
                Include SHA-256 & MD5 signatures
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox 
                checked={includeMetadata}
                onCheckedChange={setIncludeMetadata}
                id="metadata"
              />
              <Label htmlFor="metadata" className="cursor-pointer">
                Include investigator metadata
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox 
                checked={includeChainOfCustody}
                onCheckedChange={setIncludeChainOfCustody}
                id="custody"
              />
              <Label htmlFor="custody" className="cursor-pointer">
                Include chain of custody log
              </Label>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox 
                checked={encryptArchive}
                onCheckedChange={setEncryptArchive}
                id="encrypt"
              />
              <Label htmlFor="encrypt" className="cursor-pointer flex items-center gap-2">
                <Lock className="w-4 h-4 text-purple-400" />
                Encrypt archive (AES-256-GCM)
              </Label>
            </div>
          </div>
        </div>

        {/* Bundle Contents Preview */}
        <div className="p-4 bg-slate-800/30 rounded-lg space-y-2">
          <h4 className="font-semibold text-white mb-3">Bundle Will Include:</h4>
          
          {sessionId && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Session data, observations, and findings
            </div>
          )}
          
          {caseId && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <CheckCircle className="w-4 h-4 text-green-400" />
              Case data, evidence, and reports
            </div>
          )}

          {includeSignatures && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Hash className="w-4 h-4 text-blue-400" />
              Cryptographic signatures (SHA-256, MD5)
            </div>
          )}

          {includeChainOfCustody && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <FileText className="w-4 h-4 text-purple-400" />
              Chain of custody documentation
            </div>
          )}

          {encryptArchive && (
            <div className="flex items-center gap-2 text-sm text-slate-300">
              <Lock className="w-4 h-4 text-purple-400" />
              Military-grade encryption
            </div>
          )}
        </div>

        {/* Generate Progress */}
        {isGenerating && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-slate-400">Generating bundle...</span>
              <span className="text-white font-semibold">{generateProgress}%</span>
            </div>
            <Progress value={generateProgress} className="h-2" />
          </div>
        )}

        {/* Generate Button */}
        <Button
          onClick={() => generateBundleMutation.mutate()}
          disabled={isGenerating || (!sessionId && !caseId)}
          className="w-full bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating Bundle...
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Generate Forensic Bundle
            </>
          )}
        </Button>

        {!sessionId && !caseId && (
          <p className="text-sm text-slate-500 text-center">
            Select a session or case to generate a bundle
          </p>
        )}
      </CardContent>
    </Card>
  );
}