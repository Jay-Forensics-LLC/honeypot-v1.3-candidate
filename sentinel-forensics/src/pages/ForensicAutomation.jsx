import React, { useState } from 'react';
import { useOrgQuery } from '../components/hooks/useOrgQuery';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { 
  Zap, 
  Plus, 
  Activity, 
  Clock, 
  Shield,
  Database,
  TrendingUp,
  AlertTriangle
} from 'lucide-react';
import TriggerManager from '../components/forensics/TriggerManager';
import CollectionViewer from '../components/forensics/CollectionViewer';
import AIAnalysisPanel from '../components/forensics/AIAnalysisPanel';

export default function ForensicAutomation() {
  const [activeTab, setActiveTab] = useState('triggers');
  const [selectedCollection, setSelectedCollection] = useState(null);

  const { data: triggers } = useOrgQuery('ForensicTrigger', {}, '-created_date', 100);
  const { data: collections } = useOrgQuery('ForensicCollection', {}, '-collection_timestamp', 50);

  const activeTriggers = triggers?.filter(t => t.is_active) || [];
  const recentCollections = collections?.slice(0, 5) || [];
  const totalArtifacts = collections?.reduce((sum, c) => sum + (c.collection_metadata?.total_artifacts || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-white mb-2">Forensic Automation</h1>
            <p className="text-slate-400">AI-driven automated forensic data collection and analysis</p>
          </div>
          <Button className="bg-blue-600 hover:bg-blue-700">
            <Plus className="w-4 h-4 mr-2" />
            New Trigger
          </Button>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Active Triggers</p>
                  <p className="text-2xl font-bold text-white">{activeTriggers.length}</p>
                </div>
                <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center">
                  <Zap className="w-6 h-6 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Collections</p>
                  <p className="text-2xl font-bold text-white">{collections?.length || 0}</p>
                </div>
                <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center">
                  <Activity className="w-6 h-6 text-purple-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Total Artifacts</p>
                  <p className="text-2xl font-bold text-white">{totalArtifacts}</p>
                </div>
                <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center">
                  <Database className="w-6 h-6 text-green-400" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-400 mb-1">Last 24h</p>
                  <p className="text-2xl font-bold text-white">
                    {collections?.filter(c => 
                      new Date(c.collection_timestamp) > new Date(Date.now() - 86400000)
                    ).length || 0}
                  </p>
                </div>
                <div className="w-12 h-12 bg-orange-500/20 rounded-lg flex items-center justify-center">
                  <Clock className="w-6 h-6 text-orange-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity Alert */}
        {recentCollections.length > 0 && recentCollections[0].ai_analysis?.threat_indicators?.length > 0 && (
          <Card className="bg-red-900/20 border-red-500/30">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                <div className="flex-1">
                  <p className="text-sm font-semibold text-red-300">Recent Threat Detected</p>
                  <p className="text-sm text-slate-300 mt-1">
                    {recentCollections[0].ai_analysis.threat_indicators[0].indicator}
                  </p>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    className="mt-2 border-red-500/50 text-red-400 hover:bg-red-500/10"
                    onClick={() => {
                      setSelectedCollection(recentCollections[0]);
                      setActiveTab('collections');
                    }}
                  >
                    View Details
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Main Content Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 bg-slate-900 border border-slate-800">
            <TabsTrigger value="triggers">
              <Shield className="w-4 h-4 mr-2" />
              Triggers
            </TabsTrigger>
            <TabsTrigger value="collections">
              <Database className="w-4 h-4 mr-2" />
              Collections
            </TabsTrigger>
            <TabsTrigger value="analysis">
              <TrendingUp className="w-4 h-4 mr-2" />
              Analysis
            </TabsTrigger>
          </TabsList>

          <TabsContent value="triggers" className="mt-6">
            <TriggerManager triggers={triggers} />
          </TabsContent>

          <TabsContent value="collections" className="mt-6">
            <CollectionViewer 
              collections={collections} 
              selectedCollection={selectedCollection}
              onSelectCollection={setSelectedCollection}
            />
          </TabsContent>

          <TabsContent value="analysis" className="mt-6">
            <AIAnalysisPanel collections={collections} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}