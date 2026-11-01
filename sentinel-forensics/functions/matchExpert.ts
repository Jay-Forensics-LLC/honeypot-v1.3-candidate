import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { query, specialization, min_rating = 0, availability = 'all' } = await req.json();

    // Build filter
    const filter = { is_verified: true };
    
    if (specialization) {
      filter.specializations = { $contains: specialization };
    }
    
    if (availability === 'available_now') {
      filter.availability_status = 'available';
    }

    // Fetch experts
    const experts = await base44.entities.ExpertProfile.filter(filter, '-rating');

    // Filter by minimum rating
    const filtered = experts.filter(e => (e.rating || 0) >= min_rating);

    // If query provided, use AI to rank by relevance
    let ranked = filtered;
    if (query) {
      const rankingPrompt = `Given the following expert request:
"${query}"

And these expert profiles:
${filtered.map((e, i) => `${i + 1}. ${e.display_name} - Specializations: ${e.specializations.join(', ')} - Experience: ${e.years_experience} years`).join('\n')}

Rank them by relevance (1 = most relevant). Return JSON:
{
  "rankings": [1, 3, 2, ...]  // array of indices (0-based) in order of relevance
}`;

      try {
        const rankingResult = await base44.integrations.Core.InvokeLLM({
          prompt: rankingPrompt,
          response_json_schema: {
            type: "object",
            properties: {
              rankings: { type: "array", items: { type: "number" } }
            }
          }
        });

        ranked = rankingResult.rankings
          .map(idx => filtered[idx])
          .filter(Boolean);
      } catch (error) {
        console.warn('AI ranking failed, using default order:', error);
      }
    }

    return Response.json({
      success: true,
      experts: ranked,
      total: ranked.length
    });

  } catch (error) {
    console.error('Expert matching error:', error);
    return Response.json({
      error: 'Matching failed',
      details: error.message
    }, { status: 500 });
  }
});