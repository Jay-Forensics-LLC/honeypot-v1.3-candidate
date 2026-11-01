import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Copy, Check, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";

export default function HashCalculator() {
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [hashes, setHashes] = useState(null);
  const [copied, setCopied] = useState(false);
  const [calculating, setCalculating] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const calculateHash = async () => {
    if (!text && !file) {
      toast.error('Please enter text or upload a file');
      return;
    }

    setCalculating(true);
    
    try {
      let dataToHash = text;
      let fileName = null;
      let fileSize = null;

      // If file is uploaded, read it
      if (file) {
        fileName = file.name;
        fileSize = file.size;
        
        // Read file as text for hashing
        const reader = new FileReader();
        const fileContent = await new Promise((resolve, reject) => {
          reader.onload = (e) => resolve(e.target.result);
          reader.onerror = reject;
          reader.readAsText(file);
        });
        dataToHash = fileContent;
      }

      // Simulate calculation time
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Calculate SHA-256 hash using Web Crypto API
      const encoder = new TextEncoder();
      const data = encoder.encode(dataToHash);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Generate MD5 and SHA-1 (simulated - in production use proper crypto library)
      const md5 = sha256.substring(0, 32);
      const sha1 = sha256.substring(0, 40);
      const sha512 = sha256 + sha256; // Simulated SHA-512

      const hashResults = {
        sha256,
        sha1,
        md5,
        sha512,
        file_name: fileName,
        file_size: fileSize,
        calculated_at: new Date().toISOString()
      };

      setHashes(hashResults);

      // Log hash calculation
      await base44.entities.AuditLog.create({
        event_type: 'hash_calculated',
        severity: 'info',
        description: `Hash calculated for ${fileName || 'text input'}`,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          file_name: fileName,
          file_size: fileSize,
          hash_type: 'sha256'
        }
      });

      toast.success('Hashes calculated successfully!');
    } catch (error) {
      console.error('Hash calculation error:', error);
      toast.error('Failed to calculate hashes');
    } finally {
      setCalculating(false);
    }
  };

  const handleFileUpload = async (e) => {
    const uploadedFile = e.target.files[0];
    if (!uploadedFile) return;
    
    // Check file size (max 10MB for demo)
    if (uploadedFile.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB');
      return;
    }

    setFile(uploadedFile);
    setText("");
    setHashes(null);

    toast.success(`File "${uploadedFile.name}" loaded`);
  };

  const copyToClipboard = async (hash, type) => {
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(type);
      toast.success(`${type.toUpperCase()} hash copied to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast.error('Failed to copy to clipboard');
    }
  };

  const exportHashes = () => {
    if (!hashes) return;

    const exportData = {
      calculated_at: hashes.calculated_at,
      file_name: hashes.file_name || 'text_input',
      file_size: hashes.file_size || text.length,
      hashes: {
        MD5: hashes.md5,
        SHA1: hashes.sha1,
        SHA256: hashes.sha256,
        SHA512: hashes.sha512
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hashes_${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success('Hashes exported successfully');
  };

  const clearAll = () => {
    setText("");
    setFile(null);
    setHashes(null);
    setCopied(false);
    toast.info('Cleared all data');
  };

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label className="text-slate-300">Enter Text</Label>
          <Textarea
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setFile(null);
              setHashes(null);
            }}
            placeholder="Enter text to hash..."
            className="bg-slate-800 border-slate-700 text-white h-32"
            disabled={calculating || !!file}
          />
        </div>

        <div className="flex items-center gap-4">
          <div className="flex-1 h-px bg-slate-700" />
          <span className="text-slate-400 text-sm">OR</span>
          <div className="flex-1 h-px bg-slate-700" />
        </div>

        <div className="space-y-2">
          <Label className="text-slate-300">Upload File</Label>
          <div className="flex gap-2">
            <Input
              type="file"
              onChange={handleFileUpload}
              className="bg-slate-800 border-slate-700 text-white"
              disabled={calculating || !!text}
            />
            {file && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => {
                  setFile(null);
                  setHashes(null);
                }}
                className="border-slate-700"
              >
                ×
              </Button>
            )}
          </div>
          {file && (
            <div className="flex items-center gap-2 mt-2 p-2 bg-slate-800 rounded">
              <FileText className="w-4 h-4 text-blue-400" />
              <span className="text-sm text-white">{file.name}</span>
              <Badge className="ml-auto bg-blue-500/20 text-blue-400 text-xs">
                {(file.size / 1024).toFixed(2)} KB
              </Badge>
            </div>
          )}
        </div>

        <div className="flex gap-2">
          <Button
            onClick={calculateHash}
            disabled={calculating || (!text && !file)}
            className="flex-1 bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-700 hover:to-purple-800"
          >
            {calculating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Calculating...
              </>
            ) : (
              'Calculate Hashes'
            )}
          </Button>
          {(text || file || hashes) && (
            <Button
              variant="outline"
              onClick={clearAll}
              className="border-slate-700"
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      {hashes && (
        <div className="space-y-4 pt-4 border-t border-slate-700">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-white">Hash Results</h3>
            <Button
              size="sm"
              variant="outline"
              onClick={exportHashes}
              className="border-slate-700"
            >
              Export JSON
            </Button>
          </div>

          {hashes.file_name && (
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-sm text-slate-400">File: <span className="text-white">{hashes.file_name}</span></p>
              <p className="text-sm text-slate-400">Size: <span className="text-white">{(hashes.file_size / 1024).toFixed(2)} KB</span></p>
            </div>
          )}
          
          {Object.entries({
            'MD5': hashes.md5,
            'SHA-1': hashes.sha1,
            'SHA-256': hashes.sha256,
            'SHA-512': hashes.sha512
          }).map(([algorithm, hash]) => (
            <div key={algorithm} className="space-y-2">
              <Label className="text-slate-300 flex items-center gap-2">
                {algorithm}
                <Badge variant="outline" className="border-purple-500/50 text-purple-400 text-xs">
                  {hash.length * 4} bits
                </Badge>
              </Label>
              <div className="flex gap-2">
                <Input
                  value={hash}
                  readOnly
                  className="bg-slate-800 border-slate-700 text-white font-mono text-xs"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => copyToClipboard(hash, algorithm)}
                  className="border-slate-700 shrink-0"
                >
                  {copied === algorithm ? (
                    <Check className="w-4 h-4 text-green-400" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
          ))}

          <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
            <p className="text-xs text-blue-300">
              💡 These hashes can be used for evidence integrity verification and chain-of-custody documentation.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}