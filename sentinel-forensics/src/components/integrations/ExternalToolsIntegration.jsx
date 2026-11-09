import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Shield, Globe, Eye, CheckCircle } from "lucide-react";
import { toast } from "sonner";

export default function ExternalToolsIntegration({ evidence }) {
  const [querying, setQuerying] = useState(null);
  const queryClient = useQueryClient();

  const { data: integrations = [] } = useQuery({
    queryKey: ['external-tools', evidence.id],
    queryFn: () => base44.entities.ExternalToolIntegration.filter({ evidence_id: evidence.id }),
    enabled: !!evidence.id
  });

  const queryToolMutation = useMutation({
    mutationFn: async ({ toolName, queryType, queryValue }) => {
      setQuerying(toolName);

      // Simulate API call to external tool
      const response = await base44.integrations.Core.InvokeLLM({
        prompt: `Simulate a threat intelligence lookup for:
Tool: ${toolName}
Query Type: ${queryType}
Query Value: ${queryValue}

Provide realistic threat intelligence data including:
- Reputation score
- Detection rate
- Associated threats
- Community votes
- Tags/classifications`,
        response_json_schema: {
          type: "object",
          properties: {
            positives: { type: "number" },
            total_scans: { type: "number" },
            reputation_score: { type: "number" },
            threat_level: { type: "string" },
            tags: { type: "array", items: { type: "string" } }
          }
        }
      });

      const integration = {
        evidence_id: evidence.id,
        tool_name: toolName,
        query_type: queryType,
        query_value: queryValue,
        api_response: response,
        summary: response,
        query_timestamp: new Date().toISOString(),
        success: true
      };

      await base44.entities.ExternalToolIntegration.create(integration);
      return integration;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['external-tools', evidence.id] });
      setQuerying(null);
      toast.success('Threat intelligence retrieved!');
    },
    onError: () => {
      setQuerying(null);
      toast.error('Query failed');
    }
  });

  const tools = [
    { name: 'virustotal', icon: Shield, label: 'VirusTotal', color: 'from-blue-500 to-blue-600' },
    { name: 'alienvault_otx', icon: Globe, label: 'AlienVault OTX', color: 'from-green-500 to-green-600' },
    { name: 'hybrid_analysis', icon: Eye, label: 'Hybrid Analysis', color: 'from-purple-500 to-purple-600' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <ExternalLink className="w-5 h-5 text-blue-400" />
        <h3 className="text-lg font-semibold text-white">External Threat Intelligence</h3>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {tools.map((tool) => {
          const Icon = tool.icon;
          const isQuerying = querying === tool.name;
          const hasData = integrations.some(i => i.tool_name === tool.name);

          return (
            <Button
              key={tool.name}
              onClick={() => queryToolMutation.mutate({
                toolName: tool.name,
                queryType: 'file_hash',
                queryValue: evidence.file_hash
              })}
              disabled={isQuerying}
              className={`bg-gradient-to-r ${tool.color} hover:opacity-90 relative`}
            >
              <Icon className="w-4 h-4 mr-2" />
              {tool.label}
              {hasData && (
                <CheckCircle className="w-3 h-3 ml-2 text-green-300" />
              )}
            </Button>
          );
        })}
      </div>

      {/* Integration Results */}
      <div className="space-y-3">
        {integrations.map((integration) => (
          <Card key={integration.id} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <p className="font-semibold text-white">{integration.tool_name.replace('_', ' ').toUpperCase()}</p>
                  <p className="text-xs text-slate-400">
                    Queried: {new Date(integration.query_timestamp).toLocaleString()}
                  </p>
                </div>
                {integration.summary && (
                  <Badge className={
                    integration.summary.threat_level === 'high' ? 'bg-red-500' :
                    integration.summary.threat_level === 'medium' ? 'bg-yellow-500' :
                    'bg-green-500'
                  }>
                    {integration.summary.threat_level || 'Unknown'}
                  </Badge>
                )}
              </div>

              {integration.summary && (
                <div className="grid grid-cols-2 gap-4 mt-3 text-sm">
                  <div>
                    <span className="text-slate-400">Detections:</span>
                    <span className="ml-2 text-white font-semibold">
                      {integration.summary.positives}/{integration.summary.total_scans}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400">Reputation:</span>
                    <span className="ml-2 text-white font-semibold">
                      {integration.summary.reputation_score}/100
                    </span>
                  </div>
                </div>
              )}

              {integration.summary?.tags && integration.summary.tags.length > 0 && (
                <div className="mt-3">
                  <div className="flex flex-wrap gap-1">
                    {integration.summary.tags.map((tag, idx) => (
                      <Badge key={idx} className="bg-slate-700 text-white text-xs">
                        {tag}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}