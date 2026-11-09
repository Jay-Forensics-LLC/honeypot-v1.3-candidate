import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { 
      firmName = '[Security Firm Name]', 
      companyName = 'Sentinel-Forensics',
      productName = 'Sentinel-Forensics Platform',
      startMonth = '[Month]',
      endMonth = '[Month]',
      contactName = user.full_name || '[Contact Name]',
      contactTitle = '[Title]',
      contactEmail = user.email,
      contactPhone = '[Phone]'
    } = await req.json().catch(() => ({}));

    const prompt = `You are drafting a formal **Third-Party Security Audit Request** letter (RISA) to a reputable security auditing firm. The goal is to professionally invite them to conduct a comprehensive security assessment of our digital forensics platform. The letter should include:

- **Subject Line/Title:** Begin with a clear subject: **"Request for Independent Security Audit (RISA) of ${companyName}"**

- **Salutation and Introduction:** Politely address the firm as "Dear ${firmName} Team,". Introduce our company: "We are ${companyName}, providing a digital forensics and surveillance detection platform called ${productName}, and we are seeking an independent security audit." Mention briefly their reputation for comprehensive security assessments and forensic-grade auditing expertise.

- **Purpose of the Audit:** State that we wish to engage them for a **comprehensive security audit** of our platform. Emphasize our commitment to security and compliance, and that this audit is a proactive measure to ensure our system is robust against advanced threats. Note that our platform handles sensitive digital evidence and requires forensic-grade security assurance.

- **Scope of Work:** Clearly outline what areas the audit should cover:
  - **Application security** (web front-end and backend APIs) – checking for vulnerabilities like OWASP Top 10 issues, authentication/authorization flaws, injection attacks, and business logic vulnerabilities.
  - **Network and infrastructure security** – examining cloud deployment, network configuration, firewall rules, API security, and service isolation.
  - **Data protection and cryptography** – reviewing how we handle and store sensitive data (evidence data encryption at rest and in transit, key management practices, chain-of-custody integrity).
  - **Resilience against advanced persistent threats (APT)** – assessment of defenses against sophisticated threat actors, including potential social engineering or phishing tests.
  - **Compliance aspects** – assess alignment with standards like ISO 27001, NIST CSF, and relevant regulations for digital evidence handling (e.g., CJIS, GDPR, HIPAA if applicable).
  - **Forensic integrity** – verify tamper-evident logging, immutable audit trails, and evidence preservation mechanisms.

  Invite them to suggest adjustments to scope based on their expertise and best practices for forensic platforms.

- **Timeline and Availability:** Indicate: "We are aiming to begin the engagement in ${startMonth} and would like it completed by ${endMonth}." Note any critical deadlines for compliance requirements or product releases if applicable.

- **Deliverables:** State expected outputs:
  - Detailed **report of findings** with identified vulnerabilities, severity ratings (CVSS scoring preferred), and specific remediation recommendations.
  - Executive summary suitable for board/stakeholder presentation.
  - Debrief meeting to discuss findings and remediation roadmap.
  - Optional: Security attestation or certification documentation upon successful completion for customer assurance.

- **Confidentiality & Access:** Acknowledge that we will provide necessary access and information for the audit under a mutual NDA. Emphasize secure communication channels for sensitive data. Note any constraints (e.g., testing in staging vs production environments, data access limitations for privacy compliance).

- **Contact Information:** Provide contact details for ${contactName}, ${contactTitle}, at ${contactEmail} and ${contactPhone}. Encourage them to reach out with questions or to schedule an initial discussion. Express openness to discussing scope, timeline, and commercial terms.

- **Closing:** End professionally: "Thank you for your time and consideration. We look forward to the possibility of working with ${firmName} to strengthen our platform's security posture and provide our customers with the highest level of assurance." Sign off with "Sincerely," followed by ${contactName}, ${contactTitle}, ${companyName}.

The tone should be **professional and formal**. Use clear, precise language – we are a client requesting a critical security service. The letter should reflect that we take security seriously (mention that our platform deals with sensitive digital evidence requiring forensic defensibility). The finished text should be suitable as an email body or a PDF letter on company letterhead.

IMPORTANT: This is a template letter. Do not include actual dates or fictional details beyond the placeholders provided. Focus on professional, legally appropriate language.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      action: 'generate_risa_letter',
      actor: user.email,
      metadata: {
        timestamp: new Date().toISOString(),
        firm_name: firmName,
        company_name: companyName,
        doc_length: response.length
      }
    });

    return Response.json({ 
      document: response,
      generated_at: new Date().toISOString(),
      generated_by: user.email,
      firm_name: firmName,
      company_name: companyName
    });

  } catch (error) {
    console.error('RISA letter generation error:', error);
    return Response.json({ 
      error: 'Failed to generate RISA letter',
      details: error.message 
    }, { status: 500 });
  }
});