import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { legal_case_id, numbering_scheme } = await req.json();

    if (!legal_case_id) {
      return Response.json({ error: 'legal_case_id required' }, { status: 400 });
    }

    // Get existing exhibits for this case
    const existingExhibits = await base44.asServiceRole.entities.CourtExhibit.filter({
      legal_case_id
    });

    // Determine numbering scheme (letter, number, or party-prefixed)
    const scheme = numbering_scheme || 'letter'; // 'letter', 'number', 'plaintiff', 'defendant'
    
    let nextNumber;
    if (scheme === 'letter') {
      // Exhibit A, B, C, etc.
      const letterExhibits = existingExhibits
        .filter(e => /^Exhibit [A-Z]$/.test(e.exhibit_number))
        .map(e => e.exhibit_number.charAt(8).charCodeAt(0) - 65);
      
      const maxLetter = letterExhibits.length > 0 ? Math.max(...letterExhibits) : -1;
      const nextLetter = String.fromCharCode(65 + maxLetter + 1);
      nextNumber = `Exhibit ${nextLetter}`;
      
    } else if (scheme === 'number') {
      // Exhibit 1, 2, 3, etc.
      const numberExhibits = existingExhibits
        .filter(e => /^Exhibit \d+$/.test(e.exhibit_number))
        .map(e => parseInt(e.exhibit_number.split(' ')[1]));
      
      const maxNumber = numberExhibits.length > 0 ? Math.max(...numberExhibits) : 0;
      nextNumber = `Exhibit ${maxNumber + 1}`;
      
    } else if (scheme === 'plaintiff' || scheme === 'defendant') {
      // Plaintiff's Exhibit 1, Defendant's Exhibit 1, etc.
      const prefix = scheme === 'plaintiff' ? "Plaintiff's Exhibit" : "Defendant's Exhibit";
      const partyExhibits = existingExhibits
        .filter(e => e.exhibit_number.startsWith(prefix))
        .map(e => parseInt(e.exhibit_number.split(' ').pop()));
      
      const maxNumber = partyExhibits.length > 0 ? Math.max(...partyExhibits) : 0;
      nextNumber = `${prefix} ${maxNumber + 1}`;
    }

    // Verify uniqueness
    const isDuplicate = existingExhibits.some(e => e.exhibit_number === nextNumber);
    if (isDuplicate) {
      return Response.json({ 
        error: 'Generated number already exists',
        nextNumber,
        suggestion: 'Try a different numbering scheme'
      }, { status: 409 });
    }

    return Response.json({ 
      success: true,
      exhibit_number: nextNumber,
      scheme,
      total_exhibits: existingExhibits.length
    });

  } catch (error) {
    console.error('Exhibit numbering error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});