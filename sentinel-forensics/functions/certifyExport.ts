import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { 
      case_id, 
      export_type, 
      certification_level,
      included_evidence_ids,
      toolchain_disclosure,
      methodology 
    } = await req.json();

    if (!case_id || !export_type || !certification_level) {
      return Response.json({ 
        error: 'Missing required fields: case_id, export_type, certification_level' 
      }, { status: 400 });
    }

    // Calculate certification cost
    const certificationCosts = {
      draft: 0,
      certified: 2500, // $25.00
      court_ready: 5000 // $50.00
    };

    const paymentAmountCents = certificationCosts[certification_level] || 0;

    // For certified/court_ready exports, check payment or subscription
    if (certification_level !== 'draft' && paymentAmountCents > 0) {
      // TODO: Integrate with Stripe to validate payment/subscription
      // For now, we'll allow it but mark as pending payment
    }

    // Generate certification statement
    const certificationStatement = `
I, ${user.full_name} (${user.email}), hereby certify that:

1. The evidence contained in this export was collected and maintained in accordance with 
   industry-standard forensic protocols.
   
2. All chain of custody procedures were followed and documented.

3. The hash values and integrity checks were verified at the time of certification.

4. This export package is a true and accurate representation of the evidence as it exists 
   in the Sentinel Forensics system as of ${new Date().toISOString()}.

Certification Level: ${certification_level.toUpperCase()}
Case ID: ${case_id}
Certified Date: ${new Date().toLocaleDateString()}

Digital Signature: [System-generated hash will be applied]
    `.trim();

    const certification = await base44.asServiceRole.entities.ExportCertification.create({
      organization_id: user.organization_id,
      case_id,
      export_type,
      certification_level,
      certification_metadata: {
        certified_by: user.email,
        certified_at: new Date().toISOString(),
        certification_statement: certificationStatement,
        included_evidence_ids: included_evidence_ids || [],
        toolchain_disclosure: toolchain_disclosure || 'Standard Sentinel Forensics toolchain',
        methodology: methodology || 'NIST SP 800-86 compliant forensic methodology'
      },
      payment_status: paymentAmountCents > 0 ? 'pending' : 'paid',
      payment_amount_cents: paymentAmountCents,
      access_granted_to: [user.email]
    });

    // Log usage for billing
    await base44.functions.invoke('logUsage', {
      case_id,
      usage_type: certification_level === 'draft' ? 'export' : 'certified_export',
      quantity: 1,
      unit: 'count',
      metadata: {
        export_type,
        certification_level,
        certification_id: certification.id
      }
    });

    return Response.json({ 
      success: true,
      certification_id: certification.id,
      payment_required: paymentAmountCents > 0,
      payment_amount_cents: paymentAmountCents,
      certification_statement: certificationStatement,
      message: certification_level === 'draft' 
        ? 'Draft export created (no payment required)'
        : `Certification created. Payment of $${(paymentAmountCents / 100).toFixed(2)} required.`
    });

  } catch (error) {
    console.error('Export certification error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});