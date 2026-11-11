import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const prompt = `You are a technical documentation expert tasked with writing a **System Architecture Overview** for the Sentinel-Forensics digital forensics platform. The audience includes engineers, auditors, and compliance officers. Using clear and professional language, **describe the platform's overall architecture** in detail:

- **Components & Design:** Identify all major system components (e.g. data collection agents, backend analysis engine, databases, user interface, APIs) and explain their roles. Describe how these components interact and how data flows through the system from ingestion to output.  
- **Security & Trust Model:** Highlight security architecture decisions. Explain how the design follows best practices like *defense-in-depth, least privilege, and zero trust.* Assume advanced threats: describe measures such as network segmentation, encryption, multi-factor authentication, continuous monitoring, and incident response capabilities that protect the system.
- **Resilience & Compliance:** Explain how the architecture remains resilient even if parts of the environment are compromised (assume breach). Mention any fail-safes, redundancy, or tamper-detection in place. Also note compliance-related design choices (e.g. audit logging, data retention controls) that facilitate legal defensibility.  
- **Clarity and Organization:** Structure the document with clear sections (e.g. *Overview*, *Components*, *Data Flow*, *Security Measures*, *Compliance Considerations*, *Conclusion*). Ensure it reads like a formal technical report suitable for PDF. Avoid unexplained jargon and keep the tone factual and impartial.

Context: Sentinel-Forensics is a forensic investigation platform with:
- Multi-tenant architecture with organization isolation
- Device health monitoring and compliance checking
- Threat hunting engine with AI-powered analysis
- Evidence management with chain of custody
- BLE/network monitoring capabilities
- Real-time threat detection and containment
- Integration with threat intelligence feeds
- Automated response and remediation
- RBAC with forensic audit logging

Your output should be a **comprehensive, plain-English architecture document** that could be shared with stakeholders or included in official compliance documentation. It must accurately reflect the system's design and the security posture in a way that both technical and non-technical reviewers can understand.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      action: 'generate_architecture_doc',
      actor: user.email,
      metadata: {
        timestamp: new Date().toISOString(),
        doc_length: response.length
      }
    });

    return Response.json({ 
      document: response,
      generated_at: new Date().toISOString(),
      generated_by: user.email
    });

  } catch (error) {
    console.error('Architecture doc generation error:', error);
    return Response.json({ 
      error: 'Failed to generate document',
      details: error.message 
    }, { status: 500 });
  }
});