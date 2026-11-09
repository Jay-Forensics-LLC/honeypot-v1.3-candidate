import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { 
  Database, 
  CheckCircle, 
  AlertTriangle, 
  Clock,
  Download,
  Shield,
  FileText
} from 'lucide-react';
import { format } from 'date-fns';

export default function CollectionViewer({ collections, selectedCollection, onSelectCollection }) {
  const getStatusColor = (status) => {
    const colors = {
      completed: 'bg-green-500/20 text-green-400 border-green-500/30',
      collecting: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
      analyzing: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
      failed: 'bg-red-500/20 text-red-400 border-red-500/30'
    };
    return colors[status] || colors.completed;
  };

  if (selectedCollection) {
    return (
      <div className="space-y-6">
        <Button 
          variant="outline" 
          onClick={() => onSelectCollection(null)}
          className="border-slate-700"
        >
          ← Back to Collections
        </Button>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-white">{selectedCollection.collection_name}</CardTitle>
                <p className="text-sm text-slate-400 mt-1">
                  {format(new Date(selectedCollection.collection_timestamp), 'PPpp')}
                </p>
              </div>
              <Badge className={getStatusColor(selectedCollection.status)}>
                {selectedCollection.status}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Collection Metadata */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Artifacts</p>
                <p className="text-2xl font-bold text-white">
                  {selectedCollection.collection_metadata?.total_artifacts || 0}
                </p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Total Size</p>
                <p className="text-2xl font-bold text-white">
                  {((selectedCollection.collection_metadata?.total_size_bytes || 0) / 1024 / 1024).toFixed(2)} MB
                </p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Devices</p>
                <p className="text-2xl font-bold text-white">
                  {selectedCollection.collection_metadata?.devices_involved?.length || 0}
                </p>
              </div>
              <div className="bg-slate-800 p-4 rounded-lg">
                <p className="text-sm text-slate-400 mb-1">Users</p>
                <p className="text-2xl font-bold text-white">
                  {selectedCollection.collection_metadata?.users_involved?.length || 0}
                </p>
              </div>
            </div>

            {/* AI Analysis */}
            {selectedCollection.ai_analysis && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm">AI Analysis Summary</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <p className="text-sm text-slate-300">
                    {selectedCollection.ai_analysis.findings_summary}
                  </p>

                  {selectedCollection.ai_analysis.threat_indicators?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-2">Threat Indicators</h4>
                      <div className="space-y-2">
                        {selectedCollection.ai_analysis.threat_indicators.map((indicator, i) => (
                          <div key={i} className="flex items-center justify-between p-2 bg-slate-900 rounded">
                            <span className="text-sm text-slate-300">{indicator.indicator}</span>
                            <div className="flex items-center gap-2">
                              <Progress value={indicator.confidence} className="w-20 h-2" />
                              <Badge className={getStatusColor(indicator.severity)}>
                                {indicator.severity}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedCollection.ai_analysis.recommended_actions?.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-white mb-2">Recommended Actions</h4>
                      <div className="space-y-2">
                        {selectedCollection.ai_analysis.recommended_actions.map((action, i) => (
                          <div key={i} className="p-3 bg-slate-900 rounded">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="border-orange-500/50 text-orange-400">
                                {action.urgency}
                              </Badge>
                              <span className="text-sm font-semibold text-white">{action.action}</span>
                            </div>
                            <p className="text-xs text-slate-400">{action.rationale}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Artifacts List */}
            {selectedCollection.artifacts_collected?.length > 0 && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm">Collected Artifacts</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {selectedCollection.artifacts_collected.map((artifact, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-slate-900 rounded">
                        <div className="flex items-center gap-3">
                          <FileText className="w-4 h-4 text-slate-400" />
                          <div>
                            <p className="text-sm text-white capitalize">{artifact.artifact_type.replace(/_/g, ' ')}</p>
                            <p className="text-xs text-slate-500">{(artifact.size_bytes / 1024).toFixed(2)} KB</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {artifact.storage_locations.map((loc, j) => (
                            <Badge key={j} variant="outline" className="text-xs border-slate-600">
                              {loc}
                            </Badge>
                          ))}
                          <Button size="sm" variant="ghost">
                            <Download className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Chain of Custody */}
            {selectedCollection.chain_of_custody?.length > 0 && (
              <Card className="bg-slate-800 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-sm flex items-center gap-2">
                    <Shield className="w-4 h-4 text-green-400" />
                    Chain of Custody
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {selectedCollection.chain_of_custody.map((entry, i) => (
                      <div key={i} className="flex items-start gap-3">
                        <div className="w-2 h-2 bg-green-400 rounded-full mt-2" />
                        <div className="flex-1">
                          <p className="text-sm text-white capitalize">{entry.action.replace(/_/g, ' ')}</p>
                          <p className="text-xs text-slate-400">
                            {entry.actor} • {format(new Date(entry.timestamp), 'PPpp')}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {collections && collections.length > 0 ? (
        collections.map((collection) => (
          <Card 
            key={collection.id} 
            className="bg-slate-900 border-slate-800 hover:border-slate-700 cursor-pointer transition-colors"
            onClick={() => onSelectCollection(collection)}
          >
            <CardContent className="p-6">
              <div className="flex items-start justify-between">
                <div className="flex items-start gap-4 flex-1">
                  <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                    <Database className="w-6 h-6 text-purple-400" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-lg font-semibold text-white">{collection.collection_name}</h3>
                      <Badge className={getStatusColor(collection.status)}>
                        {collection.status}
                      </Badge>
                      {collection.verified && (
                        <CheckCircle className="w-4 h-4 text-green-400" />
                      )}
                    </div>
                    <p className="text-sm text-slate-400 mb-3">
                      {format(new Date(collection.collection_timestamp), 'PPpp')}
                    </p>
                    <div className="flex gap-4 text-xs text-slate-500">
                      <span>{collection.collection_metadata?.total_artifacts || 0} artifacts</span>
                      <span>•</span>
                      <span>{((collection.collection_metadata?.total_size_bytes || 0) / 1024 / 1024).toFixed(2)} MB</span>
                      {collection.ai_analysis?.threat_indicators?.length > 0 && (
                        <>
                          <span>•</span>
                          <span className="text-orange-400">
                            {collection.ai_analysis.threat_indicators.length} threats
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      ) : (
        <Card className="bg-slate-900 border-slate-800">
          <CardContent className="p-12 text-center">
            <Database className="w-12 h-12 text-slate-600 mx-auto mb-4" />
            <p className="text-slate-400">No collections yet</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}