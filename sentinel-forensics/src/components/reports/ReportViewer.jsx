import React from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Download, FileText, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * REPORT VIEWER - Display structured report with citation tracking
 */

export default function ReportViewer({ reportId }) {
    const { data: reports = [], isLoading } = useQuery({
        queryKey: ['report', reportId],
        queryFn: () => base44.entities.Report.filter({ id: reportId })
    });

    const report = reports[0];

    const exportMutation = useMutation({
        mutationFn: async () => {
            const { data } = await base44.functions.invoke('exportReportPDF', {
                reportId
            });
            return data;
        },
        onSuccess: (data) => {
            toast.success('PDF exported successfully');
            window.open(data.file_url, '_blank');
        },
        onError: (error) => {
            toast.error('Failed to export PDF', {
                description: error.message
            });
        }
    });

    if (isLoading) {
        return (
            <div className="flex items-center justify-center p-12">
                <Loader2 className="w-8 h-8 animate-spin text-slate-400" />
            </div>
        );
    }

    if (!report) {
        return (
            <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center">
                    <FileText className="w-12 h-12 text-slate-600 mx-auto mb-4" />
                    <p className="text-slate-400">Report not found</p>
                </CardContent>
            </Card>
        );
    }

    return (
        <div className="space-y-6">
            {/* Report Header */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardHeader>
                    <div className="flex items-start justify-between">
                        <div className="space-y-1">
                            <CardTitle className="text-white text-xl">
                                {report.title}
                            </CardTitle>
                            <div className="flex items-center gap-3 text-sm text-slate-400">
                                <span>Report #{report.report_number}</span>
                                <span>•</span>
                                <span>Version {report.version}</span>
                                <span>•</span>
                                <Badge variant="outline" className="text-xs">
                                    {report.standard?.replace('_', ' ').toUpperCase()}
                                </Badge>
                                <Badge 
                                    variant="outline"
                                    className={
                                        report.status === 'approved' ? 'border-green-500 text-green-400' :
                                        report.status === 'review' ? 'border-yellow-500 text-yellow-400' :
                                        'border-slate-500 text-slate-400'
                                    }
                                >
                                    {report.status.toUpperCase()}
                                </Badge>
                            </div>
                        </div>
                        <Button
                            onClick={() => exportMutation.mutate()}
                            disabled={exportMutation.isPending}
                            variant="outline"
                            className="border-slate-700 text-white"
                        >
                            {exportMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : (
                                <Download className="w-4 h-4 mr-2" />
                            )}
                            Export PDF
                        </Button>
                    </div>
                </CardHeader>
            </Card>

            {/* AI Generation Info */}
            {report.ai_generated && (
                <Card className="bg-blue-900/20 border-blue-700/50">
                    <CardContent className="p-4">
                        <div className="flex items-start gap-3">
                            <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                            <div className="space-y-1">
                                <p className="text-sm text-blue-200 font-semibold">
                                    AI-Assisted Report
                                </p>
                                <p className="text-xs text-blue-300/80">
                                    Generated with {report.generation_metadata?.evidence_count || 0} evidence items 
                                    and {report.generation_metadata?.findings_count || 0} findings. 
                                    All claims are citation-backed.
                                </p>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Report Content */}
            <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-6">
                    {report.content?.sections?.map((section, idx) => (
                        <div key={idx} className="mb-8 last:mb-0">
                            <h2 className="text-lg font-semibold text-white mb-4 border-b border-slate-700 pb-2">
                                {section.title}
                            </h2>
                            <div className="space-y-4">
                                {section.paragraphs?.map((para, pIdx) => (
                                    <div key={pIdx} className="space-y-2">
                                        <p className="text-slate-300 leading-relaxed">
                                            {para.text}
                                        </p>
                                        {para.citations && para.citations.length > 0 && (
                                            <div className="flex items-center gap-2 text-xs">
                                                <Badge variant="outline" className="text-slate-500 border-slate-700">
                                                    Citations: {para.citations.length}
                                                </Badge>
                                                {!para.verified && (
                                                    <Badge variant="outline" className="text-yellow-500 border-yellow-700">
                                                        <AlertCircle className="w-3 h-3 mr-1" />
                                                        Needs Review
                                                    </Badge>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}

                    {/* Fallback for legacy format */}
                    {!report.content?.sections && (
                        <div className="space-y-6 text-slate-300">
                            {report.findings && (
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-2">Findings</h3>
                                    <p className="whitespace-pre-wrap">{report.findings}</p>
                                </div>
                            )}
                            {report.methodology && (
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-2">Methodology</h3>
                                    <p className="whitespace-pre-wrap">{report.methodology}</p>
                                </div>
                            )}
                            {report.conclusions && (
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-2">Conclusions</h3>
                                    <p className="whitespace-pre-wrap">{report.conclusions}</p>
                                </div>
                            )}
                            {report.recommendations && (
                                <div>
                                    <h3 className="text-lg font-semibold text-white mb-2">Recommendations</h3>
                                    <p className="whitespace-pre-wrap">{report.recommendations}</p>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Citations Summary */}
            {report.citations && report.citations.length > 0 && (
                <Card className="bg-slate-900/50 border-slate-800">
                    <CardHeader>
                        <CardTitle className="text-white text-sm">
                            Citation Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between text-slate-400">
                                <span>Total Citations:</span>
                                <span className="text-white">{report.citations.length}</span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>Verified:</span>
                                <span className="text-green-400">
                                    {report.citations.filter(c => c.verified).length}
                                </span>
                            </div>
                            <div className="flex justify-between text-slate-400">
                                <span>Evidence References:</span>
                                <span className="text-white">
                                    {report.evidence_references?.length || 0}
                                </span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}
        </div>
    );
}