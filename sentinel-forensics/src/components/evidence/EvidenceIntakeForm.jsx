import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, Shield, Hash, CheckCircle2, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import EvidenceContextDialog from '../cases/EvidenceContextDialog';

export default function EvidenceIntakeForm({ caseId, caseData, onComplete }) {
  const [step, setStep] = useState('select'); // 'select', 'metadata', 'confirm'
  const [selectedFile, setSelectedFile] = useState(null);
  const [hashing, setHashing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [hash, setHash] = useState(null);
  const [showContextDialog, setShowContextDialog] = useState(false);
  const [evidenceContext, setEvidenceContext] = useState(null);
  const [metadata, setMetadata] = useState({
    title: '',
    description: '',
    evidence_type: 'file',
    collection_method: 'manual_upload',
    tags: ''
  });

  const calculateHash = async (file) => {
    setHashing(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      setHash(hashHex);
      return hashHex;
    } finally {
      setHashing(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setSelectedFile(file);
    setMetadata(prev => ({ ...prev, title: file.name }));
    await calculateHash(file);
    setStep('metadata');
  };

  const handleCollect = async () => {
    if (!selectedFile || !hash) return;

    // Gate 3: Check if evidence context has been declared for this case
    if (!caseData?.evidence_context_declared && !evidenceContext) {
      setShowContextDialog(true);
      return;
    }

    setUploading(true);
    try {
      const user = await base44.auth.me();

      // Update case with evidence context if this is first evidence
      if (!caseData?.evidence_context_declared && evidenceContext) {
        await base44.entities.Case.update(caseId, {
          evidence_context_declared: true,
          evidence_context_timestamp: new Date().toISOString()
        });
      }

      // Upload file
      const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });

      // Create evidence record
      await base44.entities.EvidenceV2.create({
        organization_id: user.organization_id,
        case_id: caseId,
        evidence_type: metadata.evidence_type,
        title: metadata.title,
        description: metadata.description,
        file_url,
        file_name: selectedFile.name,
        file_size: selectedFile.size,
        sha256_hash: hash,
        collection_timestamp: new Date().toISOString(),
        collected_by: user.email,
        collection_method: metadata.collection_method,
        tool_version: 'Sentinel-Forensics v1.0',
        is_original: true,
        immutable: true,
        tags: metadata.tags.split(',').map(t => t.trim()).filter(t => t),
        metadata: {
          original_filename: selectedFile.name,
          mime_type: selectedFile.type,
          upload_timestamp: new Date().toISOString(),
          evidence_source: evidenceContext?.source || caseData?.evidence_source || 'unknown',
          evidence_note: evidenceContext?.note || caseData?.evidence_note || ''
        }
      });

      toast.success('Evidence collected and integrity anchored!');
      onComplete?.();
      
      // Reset form
      setStep('select');
      setSelectedFile(null);
      setHash(null);
      setEvidenceContext(null);
      setMetadata({
        title: '',
        description: '',
        evidence_type: 'file',
        collection_method: 'manual_upload',
        tags: ''
      });
    } catch (error) {
      console.error('Evidence intake error:', error);
      toast.error('Failed to collect evidence');
    } finally {
      setUploading(false);
    }
  };

  return (
    <>
      <EvidenceContextDialog
        open={showContextDialog}
        onClose={() => setShowContextDialog(false)}
        onAcknowledge={(context) => {
          setEvidenceContext(context);
          setShowContextDialog(false);
          // Retry collection after context is provided
          setTimeout(() => handleCollect(), 100);
        }}
      />

      <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-blue-400" />
          <div>
            <CardTitle className="text-white">Phase 2: Evidence Intake</CardTitle>
            <CardDescription className="text-slate-400">
              User-initiated artifact collection with automatic integrity anchoring
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {step === 'select' && (
          <>
            <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <p className="text-sm text-blue-200">
                <strong>You decide what to collect.</strong> The platform documents what you selected and when.
              </p>
            </div>

            <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-500/50 transition-colors">
              <input
                type="file"
                id="file-upload"
                className="hidden"
                onChange={handleFileSelect}
              />
              <label htmlFor="file-upload" className="cursor-pointer">
                <Upload className="w-12 h-12 mx-auto mb-4 text-slate-400" />
                <p className="text-white mb-2">Click to select evidence file</p>
                <p className="text-xs text-slate-500">
                  Files will be hashed immediately upon selection
                </p>
              </label>
            </div>
          </>
        )}

        {step === 'metadata' && (
          <>
            {hashing ? (
              <div className="text-center py-8">
                <Loader2 className="w-12 h-12 animate-spin mx-auto mb-4 text-blue-400" />
                <p className="text-white">Computing SHA-256 hash...</p>
              </div>
            ) : (
              <>
                <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle2 className="w-4 h-4 text-green-400" />
                    <p className="text-sm text-green-200 font-medium">File selected and hashed</p>
                  </div>
                  <div className="flex items-start gap-2 text-xs text-slate-400 font-mono break-all">
                    <Hash className="w-3 h-3 flex-shrink-0 mt-0.5" />
                    <span>{hash}</span>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <Label className="text-slate-300">File Name</Label>
                    <Input
                      value={selectedFile?.name}
                      disabled
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-300">Evidence Title *</Label>
                    <Input
                      value={metadata.title}
                      onChange={(e) => setMetadata({ ...metadata, title: e.target.value })}
                      placeholder="Descriptive title for this evidence"
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-300">Description (Observational)</Label>
                    <Textarea
                      value={metadata.description}
                      onChange={(e) => setMetadata({ ...metadata, description: e.target.value })}
                      placeholder="Document what this evidence is, without interpretation..."
                      className="bg-slate-800 border-slate-700 text-white mt-1 h-20"
                    />
                  </div>

                  <div>
                    <Label className="text-slate-300">Evidence Type</Label>
                    <Select
                      value={metadata.evidence_type}
                      onValueChange={(value) => setMetadata({ ...metadata, evidence_type: value })}
                    >
                      <SelectTrigger className="bg-slate-800 border-slate-700 text-white mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="file">File</SelectItem>
                        <SelectItem value="log">Log</SelectItem>
                        <SelectItem value="network_metadata">Network Metadata</SelectItem>
                        <SelectItem value="config_state">Configuration State</SelectItem>
                        <SelectItem value="screenshot">Screenshot</SelectItem>
                        <SelectItem value="memory_dump">Memory Dump</SelectItem>
                        <SelectItem value="user_observation">User Observation</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <Label className="text-slate-300">Tags (comma-separated)</Label>
                    <Input
                      value={metadata.tags}
                      onChange={(e) => setMetadata({ ...metadata, tags: e.target.value })}
                      placeholder="e.g., suspicious, network, malware"
                      className="bg-slate-800 border-slate-700 text-white mt-1"
                    />
                  </div>
                </div>

                <div className="flex gap-3 pt-4 border-t border-slate-700">
                  <Button
                    onClick={() => {
                      setStep('select');
                      setSelectedFile(null);
                      setHash(null);
                    }}
                    variant="outline"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCollect}
                    disabled={!metadata.title.trim() || uploading}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Collecting...
                      </>
                    ) : (
                      <>
                        <Shield className="w-4 h-4 mr-2" />
                        Collect Evidence
                      </>
                    )}
                  </Button>
                </div>

                <p className="text-xs text-slate-500 text-center">
                  This action will create an immutable evidence record with integrity anchoring
                </p>
              </>
            )}
          </>
        )}
      </CardContent>
    </Card>
    </>
  );
}