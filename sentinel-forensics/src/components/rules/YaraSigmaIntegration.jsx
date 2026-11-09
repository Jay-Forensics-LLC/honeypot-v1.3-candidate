import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Download, RefreshCw, Github, Shield, AlertTriangle, CheckCircle } from "lucide-react";
import { toast } from "sonner";

// Curated threat ruleset sources
const RULESET_SOURCES = [
  {
    id: 'sigma-rules',
    name: 'Sigma HQ',
    type: 'sigma',
    url: 'https://api.github.com/repos/SigmaHQ/sigma/contents/rules',
    description: 'Official Sigma detection rules',
    category: 'comprehensive'
  },
  {
    id: 'yara-rules',
    name: 'Yara-Rules Project',
    type: 'yara',
    url: 'https://api.github.com/repos/Yara-Rules/rules/contents',
    description: 'Community YARA rules',
    category: 'malware'
  },
  {
    id: 'awesome-yara',
    name: 'Awesome YARA',
    type: 'yara',
    url: 'https://api.github.com/repos/InQuest/awesome-yara/contents',
    description: 'Curated YARA rules',
    category: 'malware'
  },
  {
    id: 'sigma-apt',
    name: 'Sigma APT Rules',
    type: 'sigma',
    url: 'https://api.github.com/repos/SigmaHQ/sigma/contents/rules/windows/apt',
    description: 'APT detection rules',
    category: 'apt'
  },
  {
    id: 'neo23x0-yara',
    name: 'Florian Roth YARA',
    type: 'yara',
    url: 'https://api.github.com/repos/Neo23x0/signature-base/contents/yara',
    description: 'Professional threat hunting rules',
    category: 'apt'
  }
];

export default function YaraSigmaIntegration() {
  const [selectedSources, setSelectedSources] = useState([]);
  const [importing, setImporting] = useState(false);
  const [importResults, setImportResults] = useState(null);
  
  const queryClient = useQueryClient();

  const importRulesetMutation = useMutation({
    mutationFn: async (sources) => {
      const results = {
        total: 0,
        imported: 0,
        failed: 0,
        details: []
      };

      for (const source of sources) {
        try {
          // Fetch rules from GitHub API
          const response = await fetch(source.url);
          const files = await response.json();

          if (!Array.isArray(files)) {
            throw new Error('Invalid response from source');
          }

          // Filter for rule files
          const ruleFiles = files.filter(file => 
            (source.type === 'sigma' && file.name.endsWith('.yml')) ||
            (source.type === 'yara' && (file.name.endsWith('.yar') || file.name.endsWith('.yara')))
          );

          results.total += ruleFiles.length;

          // Import each rule
          for (const file of ruleFiles.slice(0, 20)) { // Limit to 20 rules per source
            try {
              // Fetch rule content
              const contentResponse = await fetch(file.download_url);
              const ruleContent = await contentResponse.text();

              // Create rule in database
              const rule = {
                rule_id: `${source.type.toUpperCase()}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
                rule_name: file.name.replace(/\.(yml|yar|yara)$/, ''),
                rule_type: source.type,
                enabled: false, // Disabled by default for review
                severity: 'medium',
                description: `Imported from ${source.name}`,
                rule_logic: {},
                rule_yaml: ruleContent,
                tags: [source.category, 'imported', source.type],
                detection_count: 0,
                false_positive_count: 0
              };

              await base44.entities.DetectionRule.create(rule);
              results.imported++;
              
              results.details.push({
                source: source.name,
                rule: file.name,
                status: 'success'
              });
            } catch (error) {
              results.failed++;
              results.details.push({
                source: source.name,
                rule: file.name,
                status: 'failed',
                error: error.message
              });
            }
          }
        } catch (error) {
          results.details.push({
            source: source.name,
            rule: 'N/A',
            status: 'failed',
            error: `Failed to fetch from source: ${error.message}`
          });
        }
      }

      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['detection-rules'] });
      setImportResults(results);
      toast.success(`Imported ${results.imported} rules successfully!`);
    },
    onError: (error) => {
      toast.error(`Import failed: ${error.message}`);
    }
  });

  const handleImport = async () => {
    if (selectedSources.length === 0) {
      toast.error('Please select at least one source');
      return;
    }

    const sources = RULESET_SOURCES.filter(s => selectedSources.includes(s.id));
    setImporting(true);
    setImportResults(null);
    
    await importRulesetMutation.mutateAsync(sources);
    setImporting(false);
  };

  const toggleSource = (sourceId) => {
    setSelectedSources(prev => 
      prev.includes(sourceId) 
        ? prev.filter(id => id !== sourceId)
        : [...prev, sourceId]
    );
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Github className="w-5 h-5 text-purple-400" />
            Import Open-Source Threat Rulesets
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4">
            <Label className="text-white">Select Ruleset Sources:</Label>
            
            {RULESET_SOURCES.map(source => (
              <div key={source.id} className="flex items-start gap-3 p-4 bg-slate-800/50 rounded-lg border border-slate-700">
                <Checkbox
                  id={source.id}
                  checked={selectedSources.includes(source.id)}
                  onCheckedChange={() => toggleSource(source.id)}
                />
                <div className="flex-1">
                  <label htmlFor={source.id} className="cursor-pointer">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-semibold text-white">{source.name}</h4>
                      <Badge className={
                        source.type === 'sigma' ? 'bg-blue-500' : 'bg-purple-500'
                      }>
                        {source.type.toUpperCase()}
                      </Badge>
                      <Badge variant="outline" className="text-xs">
                        {source.category}
                      </Badge>
                    </div>
                    <p className="text-sm text-slate-400">{source.description}</p>
                    <code className="text-xs text-slate-500 mt-1 block">{source.url}</code>
                  </label>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-3">
            <Button
              onClick={handleImport}
              disabled={importing || selectedSources.length === 0}
              className="bg-purple-600 hover:bg-purple-700 flex-1"
            >
              {importing ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Importing Rules...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4 mr-2" />
                  Import {selectedSources.length} Source{selectedSources.length !== 1 ? 's' : ''}
                </>
              )}
            </Button>
          </div>

          {/* Import Results */}
          {importResults && (
            <div className="space-y-4 pt-4 border-t border-slate-700">
              <h4 className="font-semibold text-white">Import Results:</h4>
              
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-500/10 rounded-lg border border-blue-500">
                  <p className="text-2xl font-bold text-blue-400">{importResults.total}</p>
                  <p className="text-xs text-slate-400">Total Rules</p>
                </div>
                <div className="p-4 bg-green-500/10 rounded-lg border border-green-500">
                  <p className="text-2xl font-bold text-green-400">{importResults.imported}</p>
                  <p className="text-xs text-slate-400">Imported</p>
                </div>
                <div className="p-4 bg-red-500/10 rounded-lg border border-red-500">
                  <p className="text-2xl font-bold text-red-400">{importResults.failed}</p>
                  <p className="text-xs text-slate-400">Failed</p>
                </div>
              </div>

              <div className="max-h-64 overflow-y-auto space-y-2">
                {importResults.details.slice(0, 20).map((detail, idx) => (
                  <div key={idx} className="flex items-center justify-between p-2 bg-slate-800/30 rounded text-xs">
                    <span className="text-slate-400">{detail.source}: {detail.rule}</span>
                    {detail.status === 'success' ? (
                      <CheckCircle className="w-4 h-4 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                ))}
              </div>

              <div className="bg-yellow-500/10 border border-yellow-500 rounded-lg p-4">
                <p className="text-sm text-yellow-400 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 mt-0.5" />
                  <span>
                    Imported rules are <strong>disabled by default</strong>. Review and enable them in the Rules tab to start detection.
                  </span>
                </p>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-Update Schedule */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5 text-blue-400" />
            Auto-Update Configuration
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-slate-400">
            Configure automatic updates from threat intelligence sources
          </p>

          <div className="p-4 bg-slate-800/50 rounded-lg border border-slate-700">
            <Label className="mb-3 block">Update Frequency:</Label>
            <div className="flex gap-3">
              <Button variant="outline" className="flex-1">Daily</Button>
              <Button variant="outline" className="flex-1">Weekly</Button>
              <Button variant="outline" className="flex-1">Monthly</Button>
              <Button variant="outline" className="flex-1">Manual Only</Button>
            </div>
          </div>

          <div className="flex items-start gap-2 p-4 bg-blue-500/10 rounded-lg border border-blue-500">
            <Shield className="w-5 h-5 text-blue-400 mt-0.5" />
            <div className="text-sm text-blue-400">
              <strong>Pro Tip:</strong> Enable auto-updates to stay protected against the latest threats. New rules will be imported automatically and require your approval before activation.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}