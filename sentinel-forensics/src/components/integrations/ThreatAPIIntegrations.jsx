import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Shield,
  Search,
  AlertTriangle,
  CheckCircle,
  Database,
  Loader2,
  Lock,
  Crown,
  Zap
} from "lucide-react";
import { toast } from "sonner";

export default function ThreatAPIIntegrations() {
  // SECURITY: Purge any legacy client-side API keys on load
  useEffect(() => {
    try {
      localStorage.removeItem('VT_API_KEY');
      localStorage.removeItem('SHODAN_API_KEY');
      localStorage.removeItem('HIBP_API_KEY');
      localStorage.removeItem('CENSYS_API_KEY');
      localStorage.removeItem('CENSYS_API_SECRET');
      sessionStorage.removeItem('VT_API_KEY');
      sessionStorage.removeItem('SHODAN_API_KEY');
      sessionStorage.removeItem('HIBP_API_KEY');
      sessionStorage.removeItem('CENSYS_API_KEY');
      console.log('✅ Legacy client-side API keys purged');
    } catch (error) {
      console.warn('Could not purge legacy keys:', error);
    }
  }, []);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const [activeProvider, setActiveProvider] = useState('virustotal');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);

  // VirusTotal state
  const [vtAction, setVtAction] = useState('file_report');
  const [vtHash, setVtHash] = useState('');
  const [vtIp, setVtIp] = useState('');
  const [vtDomain, setVtDomain] = useState('');
  const [vtUrl, setVtUrl] = useState('');

  // Shodan state
  const [shodanAction, setShodanAction] = useState('host');
  const [shodanIp, setShodanIp] = useState('');
  const [shodanQuery, setShodanQuery] = useState('');

  // HIBP state
  const [hibpAction, setHibpAction] = useState('breachedaccount');
  const [hibpAccount, setHibpAccount] = useState('');
  const [hibpDomain, setHibpDomain] = useState('');

  // Censys state
  const [censysAction, setCensysAction] = useState('view_host');
  const [censysIp, setCensysIp] = useState('');
  const [censysQuery, setCensysQuery] = useState('');

  const tier = user?.subscription_tier || 'free';
  const isPaidTier = tier === 'professional' || tier === 'enterprise';

  const handleVirusTotalLookup = async () => {
    if (!isPaidTier) {
      toast.error('VirusTotal integration requires Pro or Enterprise subscription');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const payload = { action: vtAction };

      switch (vtAction) {
        case 'file_report':
          if (!vtHash) {
            toast.error('Please enter a file hash');
            return;
          }
          payload.hash = vtHash;
          break;
        case 'ip_report':
          if (!vtIp) {
            toast.error('Please enter an IP address');
            return;
          }
          payload.ip = vtIp;
          break;
        case 'domain_report':
          if (!vtDomain) {
            toast.error('Please enter a domain');
            return;
          }
          payload.domain = vtDomain;
          break;
        case 'url_report':
          if (!vtUrl) {
            toast.error('Please enter a URL');
            return;
          }
          payload.url = vtUrl;
          break;
      }

      const response = await base44.functions.invoke('proxyVirusTotal', payload);
      
      setResults(response.data);
      toast.success('VirusTotal lookup completed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'VirusTotal lookup failed');
      console.error('VirusTotal error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleShodanLookup = async () => {
    if (!isPaidTier) {
      toast.error('Shodan integration requires Pro or Enterprise subscription');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const payload = { action: shodanAction };

      switch (shodanAction) {
        case 'host':
          if (!shodanIp) {
            toast.error('Please enter an IP address');
            return;
          }
          payload.ip = shodanIp;
          break;
        case 'search':
          if (!shodanQuery) {
            toast.error('Please enter a search query');
            return;
          }
          payload.query = shodanQuery;
          break;
      }

      const response = await base44.functions.invoke('proxyShodan', payload);
      
      setResults(response.data);
      toast.success('Shodan lookup completed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Shodan lookup failed');
      console.error('Shodan error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleHIBPLookup = async () => {
    if (!isPaidTier) {
      toast.error('HIBP integration requires Pro or Enterprise subscription');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const payload = { action: hibpAction };

      switch (hibpAction) {
        case 'breachedaccount':
          if (!hibpAccount) {
            toast.error('Please enter an email address');
            return;
          }
          payload.account = hibpAccount;
          break;
        case 'breaches':
          if (hibpDomain) {
            payload.domain = hibpDomain;
          }
          break;
      }

      const response = await base44.functions.invoke('proxyHIBP', payload);
      
      setResults(response.data);
      toast.success('HIBP lookup completed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'HIBP lookup failed');
      console.error('HIBP error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCensysLookup = async () => {
    if (!isPaidTier) {
      toast.error('Censys integration requires Pro or Enterprise subscription');
      return;
    }

    setLoading(true);
    setResults(null);

    try {
      const payload = { action: censysAction };

      switch (censysAction) {
        case 'view_host':
          if (!censysIp) {
            toast.error('Please enter an IP address');
            return;
          }
          payload.ip = censysIp;
          break;
        case 'search_hosts':
          if (!censysQuery) {
            toast.error('Please enter a search query');
            return;
          }
          payload.query = censysQuery;
          break;
      }

      const response = await base44.functions.invoke('proxyCensys', payload);
      
      setResults(response.data);
      toast.success('Censys lookup completed');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Censys lookup failed');
      console.error('Censys error:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!isPaidTier) {
    return (
      <div className="p-6">
        <Card className="bg-gradient-to-br from-purple-900/20 to-blue-900/20 border-purple-500/30">
          <CardContent className="p-12 text-center">
            <Crown className="w-16 h-16 mx-auto mb-4 text-purple-400" />
            <h2 className="text-2xl font-bold text-white mb-4">
              Upgrade to Access Threat Intelligence
            </h2>
            <p className="text-slate-300 mb-6 max-w-2xl mx-auto">
              Threat API integrations (VirusTotal, Shodan, Have I Been Pwned, Censys) are available on Pro and Enterprise plans.
              All API keys are securely managed server-side with RBAC, rate-limiting, and audit logging.
            </p>
            <div className="flex justify-center gap-4">
              <Button
                onClick={() => window.location.href = '/subscription'}
                className="bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700"
              >
                <Crown className="w-4 h-4 mr-2" />
                Upgrade to Pro
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Threat Intelligence APIs</h1>
          <p className="text-slate-400 flex items-center gap-2">
            <Lock className="w-4 h-4 text-green-400" />
            Secure server-side proxies • No API keys in browser • Full audit logging
          </p>
        </div>
        <Badge className="bg-gradient-to-r from-purple-600 to-blue-600 text-white px-4 py-2">
          <Zap className="w-4 h-4 mr-2" />
          {tier === 'enterprise' ? 'Enterprise' : 'Professional'}
        </Badge>
      </div>

      <Tabs value={activeProvider} onValueChange={setActiveProvider}>
        <TabsList className="grid w-full grid-cols-4 bg-slate-800">
          <TabsTrigger value="virustotal">VirusTotal</TabsTrigger>
          <TabsTrigger value="shodan">Shodan</TabsTrigger>
          <TabsTrigger value="hibp">HIBP</TabsTrigger>
          <TabsTrigger value="censys">Censys</TabsTrigger>
        </TabsList>

        {/* VirusTotal Tab */}
        <TabsContent value="virustotal" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Shield className="w-5 h-5 text-blue-400" />
                VirusTotal Threat Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Lookup Type</label>
                <select
                  value={vtAction}
                  onChange={(e) => setVtAction(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 text-white p-2 rounded"
                >
                  <option value="file_report">File Hash Report</option>
                  <option value="ip_report">IP Address Report</option>
                  <option value="domain_report">Domain Report</option>
                  <option value="url_report">URL Report</option>
                </select>
              </div>

              {vtAction === 'file_report' && (
                <Input
                  placeholder="Enter MD5, SHA1, or SHA256 hash"
                  value={vtHash}
                  onChange={(e) => setVtHash(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              {vtAction === 'ip_report' && (
                <Input
                  placeholder="Enter IP address (e.g., 1.2.3.4)"
                  value={vtIp}
                  onChange={(e) => setVtIp(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              {vtAction === 'domain_report' && (
                <Input
                  placeholder="Enter domain (e.g., example.com)"
                  value={vtDomain}
                  onChange={(e) => setVtDomain(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              {vtAction === 'url_report' && (
                <Input
                  placeholder="Enter URL (e.g., https://example.com/path)"
                  value={vtUrl}
                  onChange={(e) => setVtUrl(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              <Button
                onClick={handleVirusTotalLookup}
                disabled={loading}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Query VirusTotal
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Shodan Tab */}
        <TabsContent value="shodan" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-red-400" />
                Shodan Internet Intelligence
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Lookup Type</label>
                <select
                  value={shodanAction}
                  onChange={(e) => setShodanAction(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 text-white p-2 rounded"
                >
                  <option value="host">Host Lookup</option>
                  <option value="search">Search Query</option>
                </select>
              </div>

              {shodanAction === 'host' && (
                <Input
                  placeholder="Enter IP address"
                  value={shodanIp}
                  onChange={(e) => setShodanIp(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              {shodanAction === 'search' && (
                <Input
                  placeholder="Enter search query (e.g., apache country:US)"
                  value={shodanQuery}
                  onChange={(e) => setShodanQuery(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              <Button
                onClick={handleShodanLookup}
                disabled={loading}
                className="w-full bg-red-600 hover:bg-red-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Query Shodan
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* HIBP Tab */}
        <TabsContent value="hibp" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <AlertTriangle className="w-5 h-5 text-yellow-400" />
                Have I Been Pwned
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Lookup Type</label>
                <select
                  value={hibpAction}
                  onChange={(e) => setHibpAction(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 text-white p-2 rounded"
                >
                  <option value="breachedaccount">Check Email</option>
                  <option value="breaches">All Breaches</option>
                </select>
              </div>

              {hibpAction === 'breachedaccount' && (
                <Input
                  type="email"
                  placeholder="Enter email address"
                  value={hibpAccount}
                  onChange={(e) => setHibpAccount(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              {hibpAction === 'breaches' && (
                <Input
                  placeholder="Enter domain (optional)"
                  value={hibpDomain}
                  onChange={(e) => setHibpDomain(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              <Button
                onClick={handleHIBPLookup}
                disabled={loading}
                className="w-full bg-yellow-600 hover:bg-yellow-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Checking...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Query HIBP
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Censys Tab */}
        <TabsContent value="censys" className="space-y-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-purple-400" />
                Censys Internet Scans
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-400 mb-2 block">Lookup Type</label>
                <select
                  value={censysAction}
                  onChange={(e) => setCensysAction(e.target.value)}
                  className="w-full bg-slate-800 border-slate-700 text-white p-2 rounded"
                >
                  <option value="view_host">View Host</option>
                  <option value="search_hosts">Search Hosts</option>
                </select>
              </div>

              {censysAction === 'view_host' && (
                <Input
                  placeholder="Enter IP address"
                  value={censysIp}
                  onChange={(e) => setCensysIp(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              {censysAction === 'search_hosts' && (
                <Input
                  placeholder="Enter search query"
                  value={censysQuery}
                  onChange={(e) => setCensysQuery(e.target.value)}
                  className="bg-slate-800 border-slate-700 text-white"
                />
              )}

              <Button
                onClick={handleCensysLookup}
                disabled={loading}
                className="w-full bg-purple-600 hover:bg-purple-700"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Searching...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4 mr-2" />
                    Query Censys
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Results Display */}
      {results && (
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-400" />
              Results
              {results.rate_limit && (
                <Badge className="ml-auto bg-blue-500/20 text-blue-400">
                  {results.rate_limit.remaining} lookups remaining
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-slate-800 p-4 rounded-lg text-slate-300 text-sm overflow-auto max-h-96">
              {JSON.stringify(results.data, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}

      {/* Security Notice */}
      <Card className="bg-green-900/10 border-green-500/30">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Lock className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-green-200">
              <p className="font-semibold mb-1">🔒 Security Best Practices</p>
              <ul className="list-disc list-inside space-y-1 text-green-300/80">
                <li>All API keys are stored server-side only (never in browser)</li>
                <li>Every lookup is audit-logged with user, timestamp, and query hash</li>
                <li>Rate limits enforced per user tier (Pro: 100/day, Enterprise: 5000/day)</li>
                <li>RBAC prevents unauthorized access to threat intelligence</li>
                <li>No API secrets ever appear in network traffic or browser storage</li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}