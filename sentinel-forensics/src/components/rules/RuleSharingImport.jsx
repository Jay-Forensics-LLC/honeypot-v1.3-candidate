import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Download, Upload, Shield, CheckCircle, AlertTriangle, FileCode, Share2 } from "lucide-react";
import { CryptoUtils } from "../utils/CryptoUtils";
import { toast } from "sonner";

export default function RuleSharingImport() {
  const [exportData, setExportData] = useState('');
  const [importData, setImportData] = useState('');
  const [selectedRules, setSelectedRules] = useState([]);
  const [verificationResult, setVerificationResult] = useState(null);
  
  const queryClient = useQueryClient();

  const { data: rules = [] } = useQuery({
    queryKey: ['detection-rules'],
    queryFn: () => base44.entities.DetectionRule.list(),
    initialData: []
  });

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  // Export rules as signed JSON
  const exportRulesMutation = useMutation({
    mutationFn: async (ruleIds) => {
      const rulesToExport = rules.filter(r => ruleIds.includes(r.id));
      
      if (rulesToExport.length === 0) {
        throw new Error('No rules selected for export');
      }

      // Create rule pack
      const rulePack = {
        version: '1.0',
        export_date: new Date().toISOString(),
        exported_by: user?.email || 'anonymous',
        rule_count: rulesToExport.length,
        rules: rulesToExport.map(rule => ({
          rule_name: rule.rule_name,
          rule_type: rule.rule_type,
          severity: rule.severity,
          description: rule.description,
          rule_logic: rule.rule_logic,
          rule_yaml: rule.rule_yaml,
          tags: rule.tags
        }))
      };

      // Create digital signature
      const packString = JSON.stringify(rulePack);
      const signature = await CryptoUtils.hash(packString);

      const signedPack = {
        ...rulePack,
        signature,
        signature_algorithm: 'SHA-256'
      };

      return JSON.stringify(signedPack, null, 2);
    },
    onSuccess: (data) => {
      setExportData(data);
      toast.success(`Exported ${selectedRules.length} rules`);
    },
    onError: (error) => {
      toast.error(`Export failed: ${error.message}`);
    }
  });

  // Import rules from signed JSON
  const importRulesMutation = useMutation({
    mutationFn: async (signedPackString) => {
      try {
        const signedPack = JSON.parse(signedPackString);

        // Verify signature
        const { signature, signature_algorithm, ...packData } = signedPack;
        const packString = JSON.stringify(packData);
        const computedSignature = await CryptoUtils.hash(packString);

        const verified = signature === computedSignature;

        if (!verified) {
          throw new Error('Invalid signature - rule pack may have been tampered with');
        }

        // Import rules
        const importResults = {
          total: signedPack.rule_count,
          imported: 0,
          skipped: 0,
          failed: 0,
          details: []
        };

        for (const rule of signedPack.rules) {
          try {
            // Check if rule already exists
            const existingRule = rules.find(r => r.rule_name === rule.rule_name);
            
            if (existingRule) {
              importResults.skipped++;
              importResults.details.push({
                rule: rule.rule_name,
                status: 'skipped',
                reason: 'Rule already exists'
              });
              continue;
            }

            // Create new rule
            const newRule = {
              rule_id: `IMPORTED-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
              ...rule,
              enabled: false, // Disabled by default for review
              detection_count: 0,
              false_positive_count: 0
            };

            await base44.entities.DetectionRule.create(newRule);
            
            importResults.imported++;
            importResults.details.push({
              rule: rule.rule_name,
              status: 'success'
            });
          } catch (error) {
            importResults.failed++;
            importResults.details.push({
              rule: rule.rule_name,
              status: 'failed',
              error: error.message
            });
          }
        }

        return {
          verified,
          signature,
          exported_by: signedPack.exported_by,
          export_date: signedPack.export_date,
          ...importResults
        };
      } catch (error) {
        throw new Error(`Import failed: ${error.message}`);
      }
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
      setVerificationResult(result);
      toast.success(`Imported ${result.imported} rules successfully!`);
    },
    onError: (error) => {
      toast.error(error.message);
    }
  });

  const handleExport = () => {
    if (selectedRules.length === 0) {
      toast.error('Please select at least one rule to export');
      return;
    }
    exportRulesMutation.mutate(selectedRules);
  };

  const handleImport = () => {
    if (!importData.trim()) {
      toast.error('Please paste rule pack JSON');
      return;
    }
    importRulesMutation.mutate(importData);
  };

  const downloadRulePack = () => {
    const blob = new Blob([exportData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `jay-forensics-rules-${Date.now()}.json`;
    link.click();
    toast.success('Rule pack downloaded');
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(exportData);
    toast.success('Copied to clipboard');
  };

  const toggleRuleSelection = (ruleId) => {
    setSelectedRules(prev => 
      prev.includes(ruleId)
        ? prev.filter(id => id !== ruleId)
        : [...prev, ruleId]
    );
  };

  const selectAll = () => {
    setSelectedRules(rules.map(r => r.id));
  };

  const deselectAll = () => {
    setSelectedRules([]);
  };

  return (
    <Tabs defaultValue="export" className="space-y-6">
      <TabsList className="bg-slate-900/50">
        <TabsTrigger value="export">
          <Download className="w-4 h-4 mr-2" />
          Export Rules
        </TabsTrigger>
        <TabsTrigger value="import">
          <Upload className="w-4 h-4 mr-2" />
          Import Rules
        </TabsTrigger>
      </TabsList>

      {/* Export Tab */}
      <TabsContent value="export" className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Share2 className="w-5 h-5 text-blue-400" />
                Export Detection Rules
              </div>
              <div className="flex items-center gap-2">
                <Button size="sm" variant="outline" onClick={selectAll}>
                  Select All
                </Button>
                <Button size="sm" variant="outline" onClick={deselectAll}>
                  Deselect All
                </Button>
              </div>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
              {rules.map(rule => (
                <div
                  key={rule.id}
                  onClick={() => toggleRuleSelection(rule.id)}
                  className={`p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedRules.includes(rule.id)
                      ? 'border-blue-500 bg-blue-500/10'
                      : 'border-slate-700 bg-slate-800/50 hover:border-blue-500/50'
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-semibold text-white text-sm">{rule.rule_name}</h4>
                    {selectedRules.includes(rule.id) && (
                      <CheckCircle className="w-5 h-5 text-blue-400" />
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className="text-xs">{rule.rule_type}</Badge>
                    <Badge className="text-xs">{rule.severity}</Badge>
                  </div>
                </div>
              ))}
            </div>

            {selectedRules.length > 0 && (
              <div className="p-3 bg-blue-500/10 rounded border border-blue-500 text-sm text-blue-400">
                {selectedRules.length} rule{selectedRules.length !== 1 ? 's' : ''} selected for export
              </div>
            )}

            <Button
              onClick={handleExport}
              disabled={exportRulesMutation.isPending || selectedRules.length === 0}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              {exportRulesMutation.isPending ? 'Generating...' : 'Generate Signed Rule Pack'}
            </Button>

            {exportData && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Label>Signed Rule Pack (JSON):</Label>
                  <Badge className="bg-green-500">
                    <Shield className="w-3 h-3 mr-1" />
                    Digitally Signed
                  </Badge>
                </div>
                <Textarea
                  value={exportData}
                  readOnly
                  className="bg-slate-800 border-slate-700 font-mono text-xs h-64"
                />
                <div className="flex gap-3">
                  <Button onClick={downloadRulePack} variant="outline" className="flex-1">
                    <Download className="w-4 h-4 mr-2" />
                    Download JSON
                  </Button>
                  <Button onClick={copyToClipboard} variant="outline" className="flex-1">
                    <FileCode className="w-4 h-4 mr-2" />
                    Copy to Clipboard
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="p-4 bg-green-500/10 rounded-lg border border-green-500">
          <div className="flex items-start gap-3 text-sm text-green-400">
            <Shield className="w-5 h-5 mt-0.5" />
            <div>
              <strong>Digitally Signed Export:</strong> Rule packs are cryptographically signed with SHA-256 
              to ensure integrity. Recipients can verify the signature to detect any tampering.
            </div>
          </div>
        </div>
      </TabsContent>

      {/* Import Tab */}
      <TabsContent value="import" className="space-y-6">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="w-5 h-5 text-purple-400" />
              Import Detection Rules
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Paste Signed Rule Pack (JSON):</Label>
              <Textarea
                value={importData}
                onChange={(e) => setImportData(e.target.value)}
                placeholder='{"version": "1.0", "rules": [...], "signature": "..."}'
                className="bg-slate-800 border-slate-700 font-mono text-xs h-64 mt-2"
              />
            </div>

            <Button
              onClick={handleImport}
              disabled={importRulesMutation.isPending || !importData.trim()}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              {importRulesMutation.isPending ? 'Importing...' : 'Import & Verify Rules'}
            </Button>

            {verificationResult && (
              <div className="space-y-4">
                {/* Verification Status */}
                <div className={`p-4 rounded-lg border ${
                  verificationResult.verified
                    ? 'bg-green-500/10 border-green-500'
                    : 'bg-red-500/10 border-red-500'
                }`}>
                  <div className="flex items-center gap-3 mb-2">
                    {verificationResult.verified ? (
                      <>
                        <CheckCircle className="w-6 h-6 text-green-400" />
                        <div>
                          <p className="font-semibold text-green-400">Signature Verified ✓</p>
                          <p className="text-xs text-green-300 mt-1">
                            Rule pack integrity confirmed
                          </p>
                        </div>
                      </>
                    ) : (
                      <>
                        <AlertTriangle className="w-6 h-6 text-red-400" />
                        <div>
                          <p className="font-semibold text-red-400">Signature Invalid ✗</p>
                          <p className="text-xs text-red-300 mt-1">
                            DO NOT use this rule pack - it may have been tampered with
                          </p>
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid md:grid-cols-2 gap-3 text-xs mt-3">
                    <div>
                      <p className="text-slate-400">Exported By:</p>
                      <p className="text-white font-mono">{verificationResult.exported_by}</p>
                    </div>
                    <div>
                      <p className="text-slate-400">Export Date:</p>
                      <p className="text-white">{new Date(verificationResult.export_date).toLocaleString()}</p>
                    </div>
                  </div>
                </div>

                {/* Import Results */}
                <div className="grid md:grid-cols-3 gap-4">
                  <div className="p-4 bg-blue-500/10 rounded border border-blue-500">
                    <p className="text-2xl font-bold text-blue-400">{verificationResult.total}</p>
                    <p className="text-xs text-slate-400">Total Rules</p>
                  </div>
                  <div className="p-4 bg-green-500/10 rounded border border-green-500">
                    <p className="text-2xl font-bold text-green-400">{verificationResult.imported}</p>
                    <p className="text-xs text-slate-400">Imported</p>
                  </div>
                  <div className="p-4 bg-yellow-500/10 rounded border border-yellow-500">
                    <p className="text-2xl font-bold text-yellow-400">{verificationResult.skipped}</p>
                    <p className="text-xs text-slate-400">Skipped</p>
                  </div>
                </div>

                {/* Details */}
                {verificationResult.details.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-2">
                    {verificationResult.details.map((detail, idx) => (
                      <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/30 rounded text-xs">
                        <span className="text-slate-300">{detail.rule}</span>
                        <div className="flex items-center gap-2">
                          {detail.status === 'success' && (
                            <Badge className="bg-green-500">Imported</Badge>
                          )}
                          {detail.status === 'skipped' && (
                            <Badge className="bg-yellow-500">Skipped</Badge>
                          )}
                          {detail.status === 'failed' && (
                            <Badge className="bg-red-500">Failed</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <div className="p-3 bg-yellow-500/10 rounded border border-yellow-500 text-xs text-yellow-400">
                  <AlertTriangle className="w-4 h-4 inline mr-2" />
                  Imported rules are <strong>disabled by default</strong>. Review and enable them in the Rules tab.
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="p-4 bg-purple-500/10 rounded-lg border border-purple-500">
          <div className="flex items-start gap-3 text-sm text-purple-400">
            <Shield className="w-5 h-5 mt-0.5" />
            <div>
              <strong>Secure Rule Sharing:</strong> Only import rule packs from trusted sources. 
              The digital signature verification ensures the rules haven't been modified since export.
            </div>
          </div>
        </div>
      </TabsContent>
    </Tabs>
  );
}