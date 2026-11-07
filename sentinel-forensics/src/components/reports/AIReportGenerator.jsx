import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Loader2, Sparkles, FileText, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';

/**
 * AI REPORT GENERATOR - Production UI
 * Generates evidence-backed reports with citation validation
 */

export default function AIReportGenerator({ caseId, onComplete }) {
    const queryClient = useQueryClient();
    const [standard, setStandard] = useState('court_admissible');
    const [title, setTitle] = useState('');
    const [options, setOptions] = useState({
        includeTimeline: true,
        includeEvidenceTable: true,
        includeRiskSection: true,
        includeRecommendations: true
    });

    const generateMutation = useMutation({
        mutationFn: async (params) => {
            const { data } = await base44.functions.invoke('generateAIReport', params);
            return data;
        },
        onSuccess: (data) => {
            queryClient.invalidateQueries({ queryKey: ['reports', caseId] });
            
            if (data.validation_warnings && data.validation_warnings.length > 0) {
                toast.warning('Report generated with warnings', {
                    description: `${data.validation_warnings.length} citation issues found. Review required.`
                });
            } else {
                toast.success('Report generated successfully', {
                    description: 'All citations validated'
                });
            }
            
            if (onComplete) {
                onComplete(data.report_id);
            }
        },
        onError: (error) => {
            toast.error('Failed to generate report', {
                description: error.message
            });
        }
    });

    const handleGenerate = () => {
        if (!standard) {
            toast.error('Please select a standard');
            return;
        }

        generateMutation.mutate({
            caseId,
            standard,
            title: title || undefined,
            options
        });
    };

    return (
        <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-red-500" />
                    AI-Assisted Report Generation
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
                {/* Standard Selection */}
                <div className="space-y-2">
                    <Label className="text-slate-300">Report Standard</Label>
                    <Select value={standard} onValueChange={setStandard}>
                        <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="court_admissible">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    <div>
                                        <div className="font-semibold">Court-Admissible</div>
                                        <div className="text-xs text-slate-400">
                                            Formal forensic report with chain of custody emphasis
                                        </div>
                                    </div>
                                </div>
                            </SelectItem>
                            <SelectItem value="soc2">
                                <div className="flex items-center gap-2">
                                    <FileText className="w-4 h-4" />
                                    <div>
                                        <div className="font-semibold">SOC 2 Compliance</div>
                                        <div className="text-xs text-slate-400">
                                            Security audit with control assessment
                                        </div>
                                    </div>
                                </div>
                            </SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Title */}
                <div className="space-y-2">
                    <Label className="text-slate-300">Report Title (Optional)</Label>
                    <Input
                        placeholder="Auto-generated if left blank"
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        className="bg-slate-800 border-slate-700 text-white"
                    />
                </div>

                {/* Options */}
                <div className="space-y-3">
                    <Label className="text-slate-300">Include Sections</Label>
                    
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Timeline Analysis</span>
                        <Switch
                            checked={options.includeTimeline}
                            onCheckedChange={(checked) => 
                                setOptions(prev => ({ ...prev, includeTimeline: checked }))
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Evidence Table</span>
                        <Switch
                            checked={options.includeEvidenceTable}
                            onCheckedChange={(checked) => 
                                setOptions(prev => ({ ...prev, includeEvidenceTable: checked }))
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Risk Assessment</span>
                        <Switch
                            checked={options.includeRiskSection}
                            onCheckedChange={(checked) => 
                                setOptions(prev => ({ ...prev, includeRiskSection: checked }))
                            }
                        />
                    </div>

                    <div className="flex items-center justify-between">
                        <span className="text-sm text-slate-400">Recommendations</span>
                        <Switch
                            checked={options.includeRecommendations}
                            onCheckedChange={(checked) => 
                                setOptions(prev => ({ ...prev, includeRecommendations: checked }))
                            }
                        />
                    </div>
                </div>

                {/* Warning Box */}
                <div className="bg-yellow-900/20 border border-yellow-700/50 rounded-lg p-4">
                    <div className="flex items-start gap-3">
                        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                        <div className="space-y-1">
                            <p className="text-sm text-yellow-200 font-semibold">
                                Evidence-Backed Generation
                            </p>
                            <p className="text-xs text-yellow-300/80">
                                All statements will be verified against case evidence. 
                                Uncited claims will be flagged for review.
                            </p>
                        </div>
                    </div>
                </div>

                {/* Generate Button */}
                <Button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending}
                    className="w-full bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                >
                    {generateMutation.isPending ? (
                        <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            Generating Report...
                        </>
                    ) : (
                        <>
                            <Sparkles className="w-4 h-4 mr-2" />
                            Generate Draft Report
                        </>
                    )}
                </Button>

                {/* Success Message */}
                {generateMutation.isSuccess && (
                    <div className="bg-green-900/20 border border-green-700/50 rounded-lg p-4">
                        <div className="flex items-center gap-3">
                            <CheckCircle2 className="w-5 h-5 text-green-500" />
                            <div>
                                <p className="text-sm text-green-200 font-semibold">
                                    Report Generated
                                </p>
                                <p className="text-xs text-green-300/80">
                                    Report #{generateMutation.data?.report_number}
                                </p>
                            </div>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}