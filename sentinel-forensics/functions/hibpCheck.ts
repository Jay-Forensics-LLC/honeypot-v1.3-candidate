import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();
        
        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { email } = await req.json();
        
        if (!email) {
            return Response.json({ error: 'Email required' }, { status: 400 });
        }

        const hibpApiKey = Deno.env.get("HIBP_API_KEY");
        
        if (!hibpApiKey) {
            return Response.json({ 
                error: 'HIBP API key not configured',
                message: 'Add HIBP_API_KEY in dashboard settings'
            }, { status: 500 });
        }
        
        const response = await fetch(
            `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}?truncateResponse=false`,
            {
                headers: {
                    'hibp-api-key': hibpApiKey,
                    'user-agent': 'Sentinel-Forensics-Platform'
                }
            }
        );

        if (response.status === 404) {
            return Response.json({
                email,
                breached: false,
                breach_count: 0,
                breaches: []
            });
        }

        if (!response.ok) {
            return Response.json({ 
                error: 'HIBP API error', 
                details: await response.text() 
            }, { status: response.status });
        }

        const breaches = await response.json();
        
        return Response.json({
            email,
            breached: true,
            breach_count: breaches.length,
            breaches: breaches.map(b => ({
                name: b.Name,
                title: b.Title,
                domain: b.Domain,
                breach_date: b.BreachDate,
                added_date: b.AddedDate,
                description: b.Description,
                data_classes: b.DataClasses,
                is_verified: b.IsVerified,
                is_sensitive: b.IsSensitive
            }))
        });
    } catch (error) {
        return Response.json({ error: error.message }, { status: 500 });
    }
});