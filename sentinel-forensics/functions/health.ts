/**
 * Health Check Endpoint
 * Validates app availability for monitoring and DNS verification
 */

Deno.serve(async (req) => {
  const startTime = Date.now();
  
  try {
    // Basic health check
    const health = {
      app: 'sentinel-forensics',
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime_ms: Date.now() - startTime,
      version: '1.0.0',
      environment: Deno.env.get('ENV') || 'production'
    };
    
    return Response.json(health, {
      status: 200,
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'X-App-Name': 'sentinel-forensics'
      }
    });
    
  } catch (error) {
    return Response.json({
      app: 'sentinel-forensics',
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Health check failed'
    }, { status: 500 });
  }
});