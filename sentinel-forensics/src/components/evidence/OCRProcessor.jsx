import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScanText, Loader2, CheckCircle, AlertCircle, FileText, Tags } from 'lucide-react';
import { toast } from 'sonner';

export default function OCRProcessor({ evidenceId, evidenceType, onComplete }) {
  const queryClient = useQueryClient();
  const [ocrResult, setOcrResult] = useState(null);

  const processOCRMutation = useMutation({
    mutationFn: () => base44.functions.invoke('processEvidenceOCR', { evidence_id: evidenceId }),
    onSuccess: (data) => {
      setOcrResult(data);
      queryClient.invalidateQueries(['evidence']);
      toast.success(`OCR complete - ${data.confidence} confidence`);
      if (onComplete) onComplete(data);
    },
    onError: (error) => {
      toast.error('OCR processing failed');
      console.error('OCR error:', error);
    }
  });

  const autoProcessMutation = useMutation({
    mutationFn: (caseId) => base44.functions.invoke('autoProcessEvidence', { 
      evidence_id: evidenceId,
      case_id: caseId 
    }),
    onSuccess: (data) => {
      queryClient.invalidateQueries(['evidence']);
      toast.success('Evidence processing complete');
      if (onComplete) onComplete(data);
    }
  });

  const ocrSupportedTypes = ['image', 'screenshot', 'file'];
  const isSupported = ocrSupportedTypes.includes(evidenceType);

  if (!isSupported) {
    return null;
  }

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <ScanText className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-white font-medium mb-2">AI Processing Available</h3>
            <p className="text-sm text-slate-400 mb-3">
              Extract text, metadata, and automatically categorize this evidence using AI.
            </p>

            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => processOCRMutation.mutate()}
                disabled={processOCRMutation.isLoading}
              >
                {processOCRMutation.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <ScanText className="w-4 h-4 mr-2" />
                    Extract Text (OCR)
                  </>
                )}
              </Button>

              <Button
                size="sm"
                variant="outline"
                onClick={() => autoProcessMutation.mutate()}
                disabled={autoProcessMutation.isLoading}
              >
                {autoProcessMutation.isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  'Full Analysis'
                )}
              </Button>
            </div>

            {ocrResult && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-400" />
                  <span className="text-sm text-green-300">OCR Complete</span>
                  <Badge variant="outline" className="text-xs">
                    {ocrResult.confidence} confidence
                  </Badge>
                </div>

                {ocrResult.document_type && (
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-blue-400" />
                    <span className="text-sm text-slate-300">
                      Type: <span className="text-white">{ocrResult.document_type}</span>
                    </span>
                  </div>
                )}

                {ocrResult.suggested_tags?.length > 0 && (
                  <div className="flex items-start gap-2">
                    <Tags className="w-4 h-4 text-purple-400 mt-0.5" />
                    <div className="flex flex-wrap gap-1">
                      {ocrResult.suggested_tags.slice(0, 5).map((tag, idx) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {ocrResult.extracted_text && (
                  <details className="mt-2">
                    <summary className="text-sm text-blue-400 cursor-pointer hover:text-blue-300">
                      View Extracted Text
                    </summary>
                    <div className="mt-2 p-3 bg-slate-800/50 rounded border border-slate-700 max-h-48 overflow-y-auto">
                      <p className="text-xs text-slate-300 whitespace-pre-wrap font-mono">
                        {ocrResult.extracted_text}
                      </p>
                    </div>
                  </details>
                )}
              </div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}