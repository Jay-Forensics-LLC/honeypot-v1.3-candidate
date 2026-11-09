import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * ANALYTICS: Export Evidence Bundle
 * Creates a ZIP with JSON exports + manifest with SHA-256 hashes
 */
Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { filters, widgets } = await req.json();

    // Fetch data for each requested widget
    const exports = {};
    const manifest = {
      exportedAt: new Date().toISOString(),
      exportedBy: user.email,
      filters,
      widgets: []
    };

    // Call each analytics function
    if (widgets.includes('topThreats')) {
      const response = await base44.functions.invoke('analyticsTopThreats', { filters });
      exports.topThreats = response.data;
      const hash = await hashString(JSON.stringify(response.data.data));
      manifest.widgets.push({
        name: 'topThreats',
        file: 'top_threats.json',
        sha256: hash,
        rowCount: response.data.data.length
      });
    }

    if (widgets.includes('networkTimeseries')) {
      const response = await base44.functions.invoke('analyticsNetworkTimeseries', { filters });
      exports.networkTimeseries = response.data;
      const hash = await hashString(JSON.stringify(response.data.data));
      manifest.widgets.push({
        name: 'networkTimeseries',
        file: 'network_timeseries.json',
        sha256: hash,
        bucketCount: response.data.meta.bucketCount
      });
    }

    if (widgets.includes('vulnTrends')) {
      const response = await base44.functions.invoke('analyticsVulnTrends', { filters });
      exports.vulnTrends = response.data;
      const hash = await hashString(JSON.stringify(response.data.data));
      manifest.widgets.push({
        name: 'vulnTrends',
        file: 'vuln_trends.json',
        sha256: hash,
        bucketCount: response.data.data.length
      });
    }

    if (widgets.includes('geoDistribution')) {
      const response = await base44.functions.invoke('analyticsGeoDistribution', { filters });
      exports.geoDistribution = response.data;
      const hash = await hashString(JSON.stringify(response.data.data));
      manifest.widgets.push({
        name: 'geoDistribution',
        file: 'geo_distribution.json',
        sha256: hash,
        countryCount: response.data.data.length
      });
    }

    if (widgets.includes('agentPerformance')) {
      const response = await base44.functions.invoke('analyticsAgentPerformance', { filters });
      exports.agentPerformance = response.data;
      const hash = await hashString(JSON.stringify(response.data.data));
      manifest.widgets.push({
        name: 'agentPerformance',
        file: 'agent_performance.json',
        sha256: hash,
        agentCount: response.data.data.agents.length
      });
    }

    // Create dashboard summary report
    const dashboardReport = {
      reportType: 'analytics_dashboard_export',
      generatedAt: manifest.exportedAt,
      generatedBy: manifest.exportedBy,
      filters: manifest.filters,
      widgets: manifest.widgets,
      integrity: {
        manifestSha256: await hashString(JSON.stringify(manifest))
      }
    };

    // For now, return JSON bundle (ZIP implementation requires additional library)
    // In production, use JSZip or equivalent
    const bundle = {
      manifest,
      dashboardReport,
      exports
    };

    return Response.json({
      success: true,
      bundle,
      downloadInstructions: 'Full ZIP export requires JSZip library. Current: JSON bundle with hashes.'
    });

  } catch (error) {
    console.error('Analytics export bundle error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});

async function hashString(str) {
  const encoder = new TextEncoder();
  const data = encoder.encode(str);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}