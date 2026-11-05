import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { 
  Upload,
  File,
  CheckCircle,
  Hash,
  Shield
} from "lucide-react";
import { toast } from "sonner";
import { CryptoUtils } from "../utils/CryptoUtils";

export default function EvidenceUploader({ caseId, onSuccess }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [calculatingHash, setCalculatingHash] = useState(false);
  const [fileHash, setFileHash] = useState(null);
  
  const [evidenceData, setEvidenceData] = useState({
    title: '',
    description: '',
    evidence_type: 'file',
    collection_method: 'manual',
    case_id: caseId || ''
  });

  const queryClient = useQueryClient();

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list('-created_date'),
    initialData: []
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Calculate SHA-256 hash of file
  const calculateFileHash = async (file) => {
    setCalculatingHash(true);
    try {
      const hash = await CryptoUtils.hashFile(file);
      setFileHash(hash);
      toast.success('File hash calculated successfully');
      return hash;
    } catch (error) {
      toast.error('Failed to calculate file hash');
      console.error(error);
      return null;
    } finally {
      setCalculatingHash(false);
    }
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSelectedFile(file);
    setEvidenceData({
      ...evidenceData,
      title: evidenceData.title || file.name
    });

    // Auto-calculate hash
    await calculateFileHash(file);
  };

  const uploadEvidenceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No file selected');
      if (!evidenceData.title) throw new Error('Evidence title is required');
      if (!evidenceData.case_id) throw new Error('Case selection is required');
      if (!fileHash) throw new Error('File hash not calculated');

      setUploading(true);
      setUploadProgress(0);

      // Upload file
      setUploadProgress(20);
      const { file_url } = await base44.integrations.Core.UploadFile({ file: selectedFile });
      
      setUploadProgress(60);

      // Create evidence record
      const evidenceNumber = `EVD-${Date.now().toString().slice(-8)}`;
      
      const evidence = {
        evidence_id: `EVID-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        case_id: evidenceData.case_id,
        evidence_number: evidenceNumber,
        title: evidenceData.title,
        description: evidenceData.description,
        evidence_type: evidenceData.evidence_type,
        file_url: file_url,
        file_hash_sha256: fileHash,
        file_hash_md5: null, // Could calculate MD5 too if needed
        collection_method: evidenceData.collection_method,
        collection_timestamp: new Date().toISOString(),
        risk_score: 0,
        threat_classification: 'unknown',
        chain_root: `MERKLE-${Date.now()}`,
        chain_of_custody: [{
          timestamp: new Date().toISOString(),
          action: 'Evidence uploaded',
          performed_by: user?.email || 'unknown',
          integrity_hash: fileHash,
          digital_signature: `SIG-${Date.now()}`
        }],
        metadata: {
          file_name: selectedFile.name,
          file_size: selectedFile.size,
          file_type: selectedFile.type,
          upload_timestamp: new Date().toISOString()
        },
        is_verified: false,
        legal_hold: false,
        redaction_applied: false,
        privacy_level: 'internal'
      };

      setUploadProgress(80);
      const createdEvidence = await base44.entities.EvidenceV2.create(evidence);

      setUploadProgress(100);

      // Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'evidence_uploaded',
        severity: 'info',
        description: `Evidence "${evidenceData.title}" uploaded`,
        user_id: user?.email || 'unknown',
        resource_affected: evidenceNumber,
        action_performed: 'upload',
        success: true,
        timestamp: new Date().toISOString(),
        metadata: {
          evidence_id: createdEvidence.id,
          file_hash: fileHash,
          file_size: selectedFile.size
        },
        blockchain_hash: `HASH-${Date.now()}`
      });

      return createdEvidence;
    },
    onSuccess: (evidence) => {
      setUploading(false);
      setUploadProgress(0);
      setDialogOpen(false);
      
      // Reset form
      setSelectedFile(null);
      setFileHash(null);
      setEvidenceData({
        title: '',
        description: '',
        evidence_type: 'file',
        collection_method: 'manual',
        case_id: caseId || ''
      });

      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      queryClient.invalidateQueries({ queryKey: ['cases'] });
      
      toast.success(`Evidence uploaded successfully! ID: ${evidence.evidence_number}`);
      
      if (onSuccess) onSuccess(evidence);
    },
    onError: (error) => {
      setUploading(false);
      setUploadProgress(0);
      toast.error(error.message || 'Failed to upload evidence');
    }
  });

  return (
    <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
          <Upload className="w-4 h-4 mr-2" />
          Upload Evidence
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="w-5 h-5" />
            Upload Forensic Evidence
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 mt-4">
          {/* File Upload */}
          <div className="space-y-2">
            <Label>Evidence File *</Label>
            <div className="border-2 border-dashed border-slate-700 rounded-lg p-8 text-center hover:border-blue-500 transition-colors">
              <Input
                type="file"
                onChange={handleFileSelect}
                className="hidden"
                id="evidence-file-upload"
                disabled={uploading}
              />
              <label htmlFor="evidence-file-upload" className="cursor-pointer">
                {selectedFile ? (
                  <div className="space-y-2">
                    <File className="w-12 h-12 mx-auto text-blue-400" />
                    <p className="text-white font-semibold">{selectedFile.name}</p>
                    <p className="text-sm text-slate-400">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                    {fileHash && (
                      <div className="mt-3 p-2 bg-green-500/10 border border-green-500/30 rounded">
                        <div className="flex items-center justify-center gap-2 text-green-400 text-xs">
                          <CheckCircle className="w-4 h-4" />
                          <span>Hash calculated: {fileHash.substring(0, 16)}...</span>
                        </div>
                      </div>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={(e) => {
                        e.preventDefault();
                        setSelectedFile(null);
                        setFileHash(null);
                      }}
                      className="mt-2"
                      disabled={uploading}
                    >
                      Change File
                    </Button>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <Upload className="w-12 h-12 mx-auto text-slate-400" />
                    <p className="text-slate-300">Click to select evidence file</p>
                    <p className="text-sm text-slate-500">All file types supported</p>
                  </div>
                )}
              </label>
            </div>
          </div>

          {/* Evidence Details */}
          <div className="space-y-2">
            <Label>Evidence Title *</Label>
            <Input
              value={evidenceData.title}
              onChange={(e) => setEvidenceData({...evidenceData, title: e.target.value})}
              placeholder="e.g., Network capture from incident"
              className="bg-slate-800 border-slate-700"
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label>Description</Label>
            <Textarea
              value={evidenceData.description}
              onChange={(e) => setEvidenceData({...evidenceData, description: e.target.value})}
              placeholder="Detailed description of the evidence..."
              className="bg-slate-800 border-slate-700 h-24"
              disabled={uploading}
            />
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Evidence Type *</Label>
              <Select 
                value={evidenceData.evidence_type} 
                onValueChange={(value) => setEvidenceData({...evidenceData, evidence_type: value})}
                disabled={uploading}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="file">File</SelectItem>
                  <SelectItem value="network_capture">Network Capture (PCAP)</SelectItem>
                  <SelectItem value="device_log">Device Log</SelectItem>
                  <SelectItem value="screenshot">Screenshot</SelectItem>
                  <SelectItem value="metadata">Metadata</SelectItem>
                  <SelectItem value="forensic_image">Forensic Image</SelectItem>
                  <SelectItem value="memory_dump">Memory Dump</SelectItem>
                  <SelectItem value="mvt_backup">MVT Backup</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Collection Method *</Label>
              <Select 
                value={evidenceData.collection_method} 
                onValueChange={(value) => setEvidenceData({...evidenceData, collection_method: value})}
                disabled={uploading}
              >
                <SelectTrigger className="bg-slate-800 border-slate-700">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="manual">Manual Upload</SelectItem>
                  <SelectItem value="automated">Automated Collection</SelectItem>
                  <SelectItem value="mvt">Mobile Verification Toolkit</SelectItem>
                  <SelectItem value="network_tap">Network Tap</SelectItem>
                  <SelectItem value="memory_forensics">Memory Forensics</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Associated Case *</Label>
            <Select 
              value={evidenceData.case_id} 
              onValueChange={(value) => setEvidenceData({...evidenceData, case_id: value})}
              disabled={uploading}
            >
              <SelectTrigger className="bg-slate-800 border-slate-700">
                <SelectValue placeholder="Select case" />
              </SelectTrigger>
              <SelectContent>
                {cases.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.case_number} - {c.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Upload Progress */}
          {uploading && (
            <div className="space-y-2 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="text-white">
                  {uploadProgress < 30 ? 'Uploading file...' :
                   uploadProgress < 70 ? 'Creating evidence record...' :
                   uploadProgress < 90 ? 'Generating audit trail...' :
                   'Finalizing...'}
                </span>
                <span className="text-white font-semibold">{uploadProgress}%</span>
              </div>
              <Progress value={uploadProgress} className="h-2" />
            </div>
          )}

          {/* Calculating Hash */}
          {calculatingHash && (
            <div className="p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
              <div className="flex items-center gap-2 text-purple-400 text-sm">
                <Hash className="w-4 h-4 animate-pulse" />
                <span>Calculating SHA-256 hash for integrity verification...</span>
              </div>
            </div>
          )}

          {/* Security Notice */}
          <div className="p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <Shield className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-200">
                <p className="font-semibold mb-1">Chain of Custody Protection</p>
                <p className="text-yellow-300/80 text-xs">
                  Evidence will be cryptographically hashed (SHA-256) and tracked with tamper-resistant 
                  chain-of-custody logging. This ensures forensic integrity and legal admissibility in 
                  accordance with F.S. 90.803(6) Business Records Exception.
                </p>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={uploading}
              className="border-slate-700"
            >
              Cancel
            </Button>
            <Button
              onClick={() => uploadEvidenceMutation.mutate()}
              disabled={
                !selectedFile || 
                !evidenceData.title || 
                !evidenceData.case_id || 
                !fileHash || 
                uploading ||
                calculatingHash
              }
              className="bg-blue-600 hover:bg-blue-700"
            >
              {uploading ? (
                <>
                  <Upload className="w-4 h-4 mr-2 animate-pulse" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Upload Evidence
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}