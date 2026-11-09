import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Database, Upload, Loader2, FileCheck, AlertTriangle, Copy, CheckCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

export default function ForensicImageUploadCard({ caseId }) {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);
  const [copiedHash, setCopiedHash] = useState(false);
  const queryClient = useQueryClient();

  const uploadMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error('No file selected');

      const fileExt = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();
      
      // Upload file to storage
      const uploaded = await base44.integrations.Core.UploadFile({ file: selectedFile });
      
      // Init forensic image upload
      const initResult = await base44.functions.invoke('forensicImageUpload', {
        action: 'init',
        case_id: caseId || null,
        filename: selectedFile.name,
        evidence_type: fileExt === '.e01' ? 'forensic_image_e01' : 'forensic_image_dd',
        size_bytes: selectedFile.size
      });
      
      // Complete upload (server-side hashing)
      const completeResult = await base44.functions.invoke('forensicImageUpload', {
        action: 'complete',
        upload_session_id: initResult.data.upload_session_id,
        file_url: uploaded.file_url,
        filename: selectedFile.name
      });
      
      return completeResult.data;
    },
    onSuccess: (data) => {
      setUploadResult(data);
      queryClient.invalidateQueries({ queryKey: ['org-query', 'EvidenceV2'] });
      toast.success('Forensic image uploaded', {
        description: 'Analysis queued - check Analysis tab for results'
      });
    }
  });

  const copyHash = (hash) => {
    navigator.clipboard.writeText(hash);
    setCopiedHash(true);
    toast.success('Hash copied');
    setTimeout(() => setCopiedHash(false), 2000);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-white">
          <Database className="w-5 h-5 text-red-400" />
          Forensic Image Upload (E01, DD)
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert className="bg-red-900/20 border-red-500/30">
          <AlertTriangle className="h-4 w-4 text-red-400" />
          <AlertDescription className="text-red-200 text-sm">
            <strong>Read-Only Analysis:</strong> Forensic images are analyzed in isolated environments. 
            Server-side SHA-256 hashing ensures integrity.
          </AlertDescription>
        </Alert>

        <div className="space-y-2">
          <label className="text-sm font-medium text-white">Select Forensic Image</label>
          <Input
            type="file"
            accept=".e01,.dd,.raw,.img"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
                if (!['.e01', '.dd', '.raw', '.img'].includes(ext)) {
                  toast.error('Invalid file type', {
                    description: 'Only .e01, .dd, .raw, .img files accepted'
                  });
                  return;
                }
                
                // 50GB limit
                if (file.size > 50 * 1024 * 1024 * 1024) {
                  toast.error('File too large', {
                    description: 'Maximum 50GB per forensic image'
                  });
                  return;
                }
                
                setSelectedFile(file);
                setUploadResult(null);
              }
            }}
            className="bg-slate-800 border-slate-700 text-white"
          />
          <p className="text-xs text-slate-400">
            Supported: E01 (EnCase), DD (raw disk image), RAW, IMG • Max 50GB
          </p>
        </div>

        {selectedFile && !uploadResult && (
          <div className="p-3 bg-blue-900/20 border border-blue-500/30 rounded">
            <p className="text-sm text-blue-200">
              <strong>{selectedFile.name}</strong> ({(selectedFile.size / (1024 * 1024 * 1024)).toFixed(2)} GB)
            </p>
          </div>
        )}

        <Button
          onClick={() => uploadMutation.mutate()}
          disabled={!selectedFile || uploadMutation.isPending || !!uploadResult}
          className="w-full bg-red-600 hover:bg-red-700"
        >
          {uploadMutation.isPending ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Uploading & Hashing...
            </>
          ) : (
            <>
              <Upload className="w-4 h-4 mr-2" />
              Upload Forensic Image
            </>
          )}
        </Button>

        {uploadResult && (
          <div className="space-y-3 p-4 bg-green-900/20 border border-green-500/30 rounded-lg">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <span className="text-sm font-semibold text-green-200">Upload Complete</span>
            </div>
            
            <div className="space-y-2">
              <p className="text-xs text-slate-400">Evidence ID:</p>
              <code className="text-xs text-white font-mono bg-slate-900 p-2 rounded block">
                {uploadResult.evidence_id}
              </code>
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-400">SHA-256 Hash:</p>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyHash(uploadResult.sha256)}
                  className="h-6"
                >
                  {copiedHash ? (
                    <CheckCircle className="w-3 h-3 text-green-400" />
                  ) : (
                    <Copy className="w-3 h-3" />
                  )}
                </Button>
              </div>
              <code className="text-xs text-green-400 font-mono bg-slate-900 p-2 rounded block break-all">
                {uploadResult.sha256}
              </code>
            </div>
            
            <div className="text-xs text-slate-400 bg-slate-900 p-2 rounded">
              ✓ Analysis job queued<br/>
              ✓ Metadata extraction scheduled<br/>
              ✓ Chain of custody initialized
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}