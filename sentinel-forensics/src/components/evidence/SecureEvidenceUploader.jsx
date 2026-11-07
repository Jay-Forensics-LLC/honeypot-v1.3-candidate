import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Upload, Loader2, Shield, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { secureFileUpload } from '@/functions/secureFileUpload';

/**
 * SECURE EVIDENCE UPLOADER - Malware-Protected Upload
 * 
 * REMEDIATION: REM-003
 * 
 * Features:
 * - Magic bytes validation
 * - VirusTotal integration
 * - EICAR detection
 * - Executable blocking
 * - Automatic quarantine
 */

const ALLOWED_EXTENSIONS = [
  '.jpg', '.jpeg', '.png', '.gif', '.webp',
  '.pdf', '.zip', '.txt', '.log', '.csv',
  '.json', '.pcap', '.pcapng', '.bin', '.dat',
  '.e01', '.dd', '.raw', '.img'
];

export default function SecureEvidenceUploader({ caseId, onSuccess, cases = [], userEmail }) {
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    evidence_type: 'file',
    case_id: caseId || ''
  });
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileWarning, setFileWarning] = useState(null);
  const [isForensicImage, setIsForensicImage] = useState(false);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) {
        throw new Error('No file selected');
      }

      // Client-side pre-validation (UX improvement)
      const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
      
      if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
        throw new Error(`File type not allowed. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
      }

      // Check for executable extensions
      const blockedExtensions = ['.exe', '.dll', '.sh', '.bat', '.cmd', '.scr', '.jar', '.app'];
      if (blockedExtensions.some(ext => fileExt === ext)) {
        throw new Error('Executable files are not allowed for security reasons');
      }

      // FORENSIC IMAGE FLOW (E01, DD, RAW, IMG)
      const forensicExtensions = ['.e01', '.dd', '.raw', '.img'];
      if (forensicExtensions.includes(fileExt)) {
        // Upload file first
        const uploadedFile = await base44.integrations.Core.UploadFile({ file: selectedFile });
        
        // Init forensic image upload
        const initResult = await base44.functions.invoke('forensicImageUpload', {
          action: 'init',
          case_id: formData.case_id || null,
          filename: selectedFile.name,
          evidence_type: fileExt === '.e01' ? 'forensic_image_e01' : 'forensic_image_dd',
          size_bytes: selectedFile.size
        });
        
        // Complete forensic image upload (server-side hashing)
        const completeResult = await base44.functions.invoke('forensicImageUpload', {
          action: 'complete',
          upload_session_id: initResult.data.upload_session_id,
          file_url: uploadedFile.file_url,
          filename: selectedFile.name
        });
        
        return completeResult.data;
      }

      // STANDARD EVIDENCE FLOW
      const formDataToSend = new FormData();
      formDataToSend.append('file', selectedFile);
      formDataToSend.append('case_id', formData.case_id || 'GENERAL');
      formDataToSend.append('evidence_type', formData.evidence_type);

      const response = await secureFileUpload(formDataToSend);

      // If quarantined, throw error
      if (response.data.error) {
        throw new Error(response.data.message || response.data.error);
      }

      // CRITICAL: Use backend function for secure evidence update
      const evidenceId = response.data.evidence_id;
      
      await base44.functions.invoke('secureEvidenceUpdate', {
        evidence_id: evidenceId,
        updates: {
          title: formData.title || selectedFile.name,
          description: formData.description,
          metadata: {
            ...response.data.metadata,
            uploaded_via: 'SecureEvidenceUploader',
            validation_passed: true
          }
        }
      });

      return response.data;
    },
    onSuccess: (data) => {
      const message = isForensicImage 
        ? 'Forensic Image Uploaded & Queued for Analysis'
        : 'Evidence Uploaded Successfully';
      
      const description = data.sha256 
        ? `SHA-256: ${data.sha256.substring(0, 16)}...` 
        : `File validated and stored securely`;
      
      toast.success(message, {
        description,
        duration: 5000
      });

      queryClient.invalidateQueries({ queryKey: ['evidence'] });
      queryClient.invalidateQueries({ queryKey: ['org-query', 'EvidenceV2'] });
      
      // Reset form
      setFormData({ title: '', description: '', evidence_type: 'file', case_id: caseId || '' });
      setSelectedFile(null);
      setFileWarning(null);
      setIsForensicImage(false);

      if (onSuccess) onSuccess(data);
    },
    onError: (error) => {
      toast.error('Upload Failed', {
        description: error.message,
        duration: 7000
      });
    }
  });

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    
    if (!file) return;

    setSelectedFile(file);
    setFileWarning(null);

    // Client-side validation warnings
    const fileExt = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    
    if (!ALLOWED_EXTENSIONS.includes(fileExt)) {
      setFileWarning({
        type: 'error',
        message: `File type "${fileExt}" not allowed`
      });
      setSelectedFile(null);
      return;
    }

    // Check if forensic image
    const forensicExtensions = ['.e01', '.dd', '.raw', '.img'];
    setIsForensicImage(forensicExtensions.includes(fileExt));

    // Size warning (different limits for forensic images)
    const maxSizes = {
      forensic: 50 * 1024 * 1024 * 1024, // 50GB for forensic images
      free: 10 * 1024 * 1024,
      plus: 100 * 1024 * 1024,
      pro: 1024 * 1024 * 1024
    };

    const userTier = 'free';
    const maxSize = forensicExtensions.includes(fileExt) ? maxSizes.forensic : maxSizes[userTier];

    if (file.size > maxSize) {
      setFileWarning({
        type: 'error',
        message: `File too large. Maximum: ${(maxSize / (1024 * 1024 * 1024)).toFixed(1)} GB`
      });
      setSelectedFile(null);
      return;
    }

    // Set default title
    if (!formData.title) {
      setFormData({ ...formData, title: file.name });
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Shield className="w-5 h-5 text-green-400" />
          Secure Evidence Upload
          <span className="text-xs text-slate-400 font-normal ml-2">
            (Malware-Protected)
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Security Notice */}
        <Alert className="bg-blue-900/20 border-blue-500/30">
          <Shield className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200 text-sm">
            <strong>Multi-Layer Security:</strong> Files are validated with magic bytes detection, 
            scanned by VirusTotal, checked for executables, and quarantined if malicious.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <Label className="text-white">Evidence Title</Label>
          <Input
            value={formData.title}
            onChange={(e) => setFormData({ ...formData, title: e.target.value })}
            placeholder="e.g., Network capture from incident"
            className="bg-slate-800 border-slate-700 text-white"
            style={{ fontSize: '16px' }}
          />
        </div>

        {cases.length > 0 && (
          <div className="space-y-2">
            <Label className="text-white">Case (optional)</Label>
            <select
              value={formData.case_id}
              onChange={(e) => setFormData({ ...formData, case_id: e.target.value })}
              className="w-full bg-slate-800 border-slate-700 text-white rounded-md p-2"
              style={{ fontSize: '16px' }}
            >
              <option value="">No case</option>
              {cases.map(c => (
                <option key={c.id} value={c.id}>
                  {c.case_number} - {c.title}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-2">
          <Label className="text-white">Description</Label>
          <Textarea
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Detailed description of evidence..."
            className="bg-slate-800 border-slate-700 text-white min-h-[100px]"
            style={{ fontSize: '16px' }}
          />
        </div>

        <div className="space-y-2">
          <Label className="text-white">Select File</Label>
          <Input
            type="file"
            onChange={handleFileSelect}
            className="bg-slate-800 border-slate-700 text-white"
            accept={ALLOWED_EXTENSIONS.join(',')}
            style={{ fontSize: '16px' }}
          />
          <p className="text-xs text-slate-400">
            Allowed: {ALLOWED_EXTENSIONS.join(', ')}
          </p>
        </div>

        {fileWarning && (
          <Alert className={fileWarning.type === 'error' ? 'bg-red-900/20 border-red-500/30' : 'bg-yellow-900/20 border-yellow-500/30'}>
            <AlertTriangle className={`h-4 w-4 ${fileWarning.type === 'error' ? 'text-red-400' : 'text-yellow-400'}`} />
            <AlertDescription className={fileWarning.type === 'error' ? 'text-red-200' : 'text-yellow-200'}>
              {fileWarning.message}
            </AlertDescription>
          </Alert>
        )}

        {selectedFile && !fileWarning && (
          <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-green-400" />
              <span className="text-sm text-green-200">
                {selectedFile.name} ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
              </span>
            </div>
            {isForensicImage && (
              <div className="text-xs text-yellow-300 bg-yellow-900/20 p-2 rounded border border-yellow-500/30">
                <strong>Forensic Image Detected:</strong> Server-side SHA-256 hashing will be performed. Analysis will be queued automatically.
              </div>
            )}
          </div>
        )}

        <Button
          onClick={() => uploadMutation.mutate()}
          disabled={!selectedFile || uploadMutation.isPending || !!fileWarning}
          className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              {isForensicImage ? 'Uploading & Hashing...' : 'Scanning & Uploading...'}
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              {isForensicImage ? 'Upload Forensic Image' : 'Upload Evidence (Secure)'}
            </>
          )}
        </Button>

        <p className="text-xs text-slate-400 text-center">
          {isForensicImage 
            ? 'Forensic images (E01/DD) are hashed server-side and queued for metadata extraction'
            : 'Files are scanned for malware and stored in encrypted private storage'}
        </p>
      </CardContent>
    </Card>
  );
}