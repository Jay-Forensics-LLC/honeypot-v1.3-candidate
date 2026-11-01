import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { FileText, Download, Loader2, Copy, Shield, Scale, Mail } from 'lucide-react';
import { toast } from 'sonner';
import ReactMarkdown from 'react-markdown';

export default function DocumentationGenerator() {
  const [generatedDoc, setGeneratedDoc] = useState('');
  const [docType, setDocType] = useState('architecture'); // 'architecture', 'data-handling', 'tos', or 'risa'

  const generateDoc = useMutation({
    mutationFn: async () => {
      const functionName = docType === 'architecture' 
        ? 'generateArchitectureDoc' 
        : docType === 'data-handling'
        ? 'generateDataHandlingDoc'
        : docType === 'tos'
        ? 'generateToS'
        : 'generateRISA';
      const response = await base44.functions.invoke(functionName, {});
      return response.data;
    },
    onSuccess: (data) => {
      setGeneratedDoc(typeof data.document === 'string' ? data.document : JSON.stringify(data.document, null, 2));
      toast.success('Document generated');
    }
  });

  const copyToClipboard = () => {
    navigator.clipboard.writeText(generatedDoc);
    toast.success('Copied to clipboard');
  };

  const downloadDoc = () => {
    const blob = new Blob([generatedDoc], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel-architecture-${Date.now()}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Document downloaded');
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          {docType === 'architecture' ? (
            <FileText className="w-5 h-5 text-blue-400" />
          ) : docType === 'data-handling' ? (
            <Shield className="w-5 h-5 text-green-400" />
          ) : docType === 'tos' ? (
            <Scale className="w-5 h-5 text-purple-400" />
          ) : (
            <Mail className="w-5 h-5 text-orange-400" />
          )}
          AI Documentation Generator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <p className="text-xs text-blue-300">
            Generate comprehensive documentation using AI-powered analysis
          </p>
        </div>

        {!generatedDoc && (
          <>
            <div>
              <label className="text-xs text-slate-400 mb-2 block">Document Type</label>
              <Select value={docType} onValueChange={setDocType}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="architecture">System Architecture</SelectItem>
                  <SelectItem value="data-handling">Data Handling & Evidence</SelectItem>
                  <SelectItem value="tos">Terms of Service</SelectItem>
                  <SelectItem value="risa">Security Audit Request (RISA)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            </>
        )}

        {!generatedDoc && (
          <Button
            onClick={() => generateDoc.mutate()}
            disabled={generateDoc.isPending}
            className="w-full bg-blue-600 hover:bg-blue-700"
          >
            {generateDoc.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <FileText className="w-4 h-4 mr-2" />
                Generate Documentation
              </>
            )}
          </Button>
        )}

        {generatedDoc && (
          <>
            <div className="flex gap-2">
              <Button
                onClick={copyToClipboard}
                variant="outline"
                className="flex-1"
              >
                <Copy className="w-4 h-4 mr-2" />
                Copy
              </Button>
              <Button
                onClick={downloadDoc}
                variant="outline"
                className="flex-1"
              >
                <Download className="w-4 h-4 mr-2" />
                Download
              </Button>
            </div>

            <div className="max-h-96 overflow-y-auto p-4 bg-slate-800/50 rounded-lg border border-slate-700">
              <ReactMarkdown className="prose prose-sm prose-invert max-w-none">
                {generatedDoc}
              </ReactMarkdown>
            </div>

            <Button
              onClick={() => {
                setGeneratedDoc('');
                generateDoc.reset();
              }}
              variant="ghost"
              className="w-full"
            >
              Generate New Document
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}