
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { 
  Search,
  FileText,
  Database,
  AlertTriangle,
  Activity,
  X,
  Loader2
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { DateUtils } from "../utils/DateUtils";

export default function AdvancedSearch() {
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState({
    cases: [],
    evidence: [],
    alerts: [],
    sessions: [],
    findings: [],
    threats: [],
    devices: []
  });

  const navigate = useNavigate();

  const searchAllEntities = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter a search query");
      return;
    }

    setSearching(true);
    const query = searchQuery.toLowerCase();

    try {
      // Search Cases
      const cases = await base44.entities.Case.list();
      const filteredCases = cases.filter(c => 
        c.title?.toLowerCase().includes(query) ||
        c.case_number?.toLowerCase().includes(query) ||
        c.description?.toLowerCase().includes(query)
      );

      // Search Evidence
      const evidence = await base44.entities.EvidenceV2.list();
      const filteredEvidence = evidence.filter(e =>
        e.title?.toLowerCase().includes(query) ||
        e.evidence_number?.toLowerCase().includes(query) ||
        e.description?.toLowerCase().includes(query)
      );

      // Search Alerts
      const alerts = await base44.entities.Alert.list();
      const filteredAlerts = alerts.filter(a =>
        a.title?.toLowerCase().includes(query) ||
        a.description?.toLowerCase().includes(query) ||
        a.source?.toLowerCase().includes(query)
      );

      // Search Sessions
      const sessions = await base44.entities.ScanSession.list();
      const filteredSessions = sessions.filter(s =>
        s.session_id?.toLowerCase().includes(query) ||
        s.location_tag?.toLowerCase().includes(query)
      );

      // Search Findings
      const findings = await base44.entities.IOCFinding.list();
      const filteredFindings = findings.filter(f =>
        f.ioc_value?.toLowerCase().includes(query) ||
        f.description?.toLowerCase().includes(query)
      );

      // Search Zero-Click Threats
      const threats = await base44.entities.ZeroClickThreat.list();
      const filteredThreats = threats.filter(t =>
        t.threat_id?.toLowerCase().includes(query) ||
        t.threat_type?.toLowerCase().includes(query)
      );

      // Search BLE Devices
      const devices = await base44.entities.BLEDevice.list();
      const filteredDevices = devices.filter(d =>
        d.current_mac_address?.toLowerCase().includes(query) ||
        d.device_fingerprint_id?.toLowerCase().includes(query)
      );

      setResults({
        cases: filteredCases,
        evidence: filteredEvidence,
        alerts: filteredAlerts,
        sessions: filteredSessions,
        findings: filteredFindings,
        threats: filteredThreats,
        devices: filteredDevices
      });

      const totalResults = Object.values({
        cases: filteredCases,
        evidence: filteredEvidence,
        alerts: filteredAlerts,
        sessions: filteredSessions,
        findings: filteredFindings,
        threats: filteredThreats,
        devices: filteredDevices
      }).reduce((sum, arr) => sum + arr.length, 0);

      toast.success(`Found ${totalResults} results across all entities`);
    } catch (error) {
      toast.error("Search failed");
      console.error(error);
    } finally {
      setSearching(false);
    }
  };

  const totalResults = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

  const navigateToItem = (type, item) => {
    switch(type) {
      case 'case':
        navigate(createPageUrl('Cases'));
        break;
      case 'evidence':
        navigate(createPageUrl('EvidenceDetail') + '/' + item.id);
        break;
      case 'alert':
        navigate(createPageUrl('ThreatDetection'));
        break;
      case 'session':
        navigate(createPageUrl(`SessionDetail?id=${item.id}`));
        break;
      case 'finding':
        navigate(createPageUrl('Sessions'));
        break;
      case 'threat':
        navigate(createPageUrl('PegasusDefense'));
        break;
      case 'device':
        navigate(createPageUrl('BLEMonitor'));
        break;
    }
  };

  return (
    <div className="space-y-6">
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Search className="w-5 h-5" />
            Advanced Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Search across all entities (cases, evidence, alerts, sessions...)"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchAllEntities()}
              className="bg-slate-800 border-slate-700 text-white"
            />
            <Button
              onClick={searchAllEntities}
              disabled={searching}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {searching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Searching...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  Search
                </>
              )}
            </Button>
          </div>

          {totalResults > 0 && (
            <div className="flex items-center gap-2">
              <Badge className="bg-green-500">{totalResults} Results Found</Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setSearchQuery("");
                  setResults({
                    cases: [],
                    evidence: [],
                    alerts: [],
                    sessions: [],
                    findings: [],
                    threats: [],
                    devices: []
                  });
                }}
              >
                <X className="w-3 h-3 mr-1" />
                Clear
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {totalResults > 0 && (
        <Tabs defaultValue="all" className="space-y-4">
          <TabsList className="bg-slate-900/50">
            <TabsTrigger value="all">All ({totalResults})</TabsTrigger>
            <TabsTrigger value="cases">Cases ({results.cases.length})</TabsTrigger>
            <TabsTrigger value="evidence">Evidence ({results.evidence.length})</TabsTrigger>
            <TabsTrigger value="alerts">Alerts ({results.alerts.length})</TabsTrigger>
            <TabsTrigger value="sessions">Sessions ({results.sessions.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="all" className="space-y-3">
            {results.cases.slice(0, 3).map(item => (
              <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('case', item)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-blue-400 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-white">{item.title}</h4>
                        <p className="text-sm text-slate-400">Case #{item.case_number}</p>
                      </div>
                    </div>
                    <Badge className="bg-blue-500">Case</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}

            {results.evidence.slice(0, 3).map(item => (
              <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-purple-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('evidence', item)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Database className="w-5 h-5 text-purple-400 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-white">{item.title}</h4>
                        <p className="text-sm text-slate-400">Evidence #{item.evidence_number}</p>
                      </div>
                    </div>
                    <Badge className="bg-purple-500">Evidence</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}

            {results.alerts.slice(0, 3).map(item => (
              <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('alert', item)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-5 h-5 text-red-400 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-white">{item.title}</h4>
                        <p className="text-sm text-slate-400">{item.source}</p>
                      </div>
                    </div>
                    <Badge className="bg-red-500">Alert</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}

            {results.sessions.slice(0, 3).map(item => (
              <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-green-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('session', item)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <Activity className="w-5 h-5 text-green-400 mt-0.5" />
                      <div>
                        <h4 className="font-semibold text-white">Session #{item.session_id}</h4>
                        <p className="text-sm text-slate-400">{item.location_tag || 'Unknown location'}</p>
                      </div>
                    </div>
                    <Badge className="bg-green-500">Session</Badge>
                  </div>
                </CardContent>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="cases" className="space-y-3">
            {results.cases.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center text-slate-400">
                  No cases found
                </CardContent>
              </Card>
            ) : (
              results.cases.map(item => (
                <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('case', item)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-white mb-1">{item.title}</h4>
                        <p className="text-sm text-slate-400">Case #{item.case_number}</p>
                        <p className="text-xs text-slate-500 mt-2">{item.description}</p>
                      </div>
                      <Badge className={
                        item.status === 'open' ? 'bg-blue-500' :
                        item.status === 'active' ? 'bg-green-500' :
                        item.status === 'closed' ? 'bg-gray-500' :
                        'bg-yellow-500'
                      }>
                        {item.status?.toUpperCase()}
                      </Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="evidence" className="space-y-3">
            {results.evidence.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center text-slate-400">
                  No evidence found
                </CardContent>
              </Card>
            ) : (
              results.evidence.map(item => (
                <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-purple-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('evidence', item)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-white mb-1">{item.title}</h4>
                        <p className="text-sm text-slate-400">Evidence #{item.evidence_number}</p>
                        <p className="text-xs text-slate-500 mt-2">{item.description}</p>
                      </div>
                      <Badge className="bg-purple-500">{item.evidence_type}</Badge>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="alerts" className="space-y-3">
            {results.alerts.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center text-slate-400">
                  No alerts found
                </CardContent>
              </Card>
            ) : (
              results.alerts.map(item => (
                <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-red-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('alert', item)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-white mb-1">{item.title}</h4>
                        <p className="text-sm text-slate-400">{item.source}</p>
                        <p className="text-xs text-slate-500 mt-2">{item.description}</p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Badge className={
                          item.severity === 'critical' ? 'bg-red-500' :
                          item.severity === 'high' ? 'bg-orange-500' :
                          item.severity === 'medium' ? 'bg-yellow-500' :
                          'bg-blue-500'
                        }>
                          {item.severity?.toUpperCase()}
                        </Badge>
                        <Badge variant="outline">{item.status}</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          <TabsContent value="sessions" className="space-y-3">
            {results.sessions.length === 0 ? (
              <Card className="bg-slate-900/50 border-slate-800">
                <CardContent className="p-12 text-center text-slate-400">
                  No sessions found
                </CardContent>
              </Card>
            ) : (
              results.sessions.map(item => (
                <Card key={item.id} className="bg-slate-900/50 border-slate-800 hover:border-green-500/50 transition-all cursor-pointer" onClick={() => navigateToItem('session', item)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold text-white mb-1">Session #{item.session_id}</h4>
                        <p className="text-sm text-slate-400">{item.location_tag || 'Unknown location'}</p>
                        <p className="text-xs text-slate-500 mt-2">
                          {DateUtils.safeFormatDateTime(item.start_timestamp)} • {item.duration_seconds}s
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Badge className="bg-green-500">{item.session_type}</Badge>
                        <Badge variant="outline">Risk: {item.risk_score}/100</Badge>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
