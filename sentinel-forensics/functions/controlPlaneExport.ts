import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { session_id, format } = await req.json();

    const session = await base44.entities.IncidentSession.get(session_id);
    const indicators = await base44.entities.ControlPlaneIndicator.filter({ session_id });
    const actions = await base44.entities.ControlPlaneAction.filter({ session_id });
    const evidence = await base44.entities.ControlPlaneEvidence.filter({ session_id });
    const chain = await base44.entities.ChainOfCustodyEntry.filter({ session_id }, 'created_date');

    if (format === 'json') {
      return Response.json({
        watermark: "NOT LEGALLY ADMISSIBLE UNTIL VERIFIED",
        export_timestamp: new Date().toISOString(),
        session,
        indicators,
        actions,
        evidence,
        chain_of_custody: chain
      });
    }

    if (format === 'csv_manifest') {
      const csv = [
        ['Type', 'Timestamp', 'Description', 'Status', 'Hash'],
        ...chain.map(entry => [
          entry.entry_type,
          entry.timestamp_utc,
          entry.narrative,
          'RECORDED',
          entry.entry_hash
        ])
      ].map(row => row.join(',')).join('\n');

      return new Response(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': `attachment; filename="session_${session_id}_manifest.csv"`
        }
      });
    }

    return Response.json({ error: 'Invalid format' }, { status: 400 });

  } catch (error) {
    console.error('Export error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});