import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { structuredOutput = false } = await req.json().catch(() => ({}));

    const prompt = `You are a documentation specialist writing a **Data Handling and Evidence Management Specification** for the Sentinel-Forensics platform. The goal is to detail how we manage data and digital evidence in a forensically sound, privacy-conscious way, **assuming high-security requirements**. Please include:

- **Data Collection & Ingestion:** Describe how data (user data, log files, forensic images, etc.) is collected or uploaded. Emphasize that all evidence is collected using forensically sound methods (e.g. write-blocking, hashing of originals) to preserve integrity. Note any consent or logging that occurs during collection for compliance.

- **Chain of Custody & Integrity:** Explain the mechanisms that ensure **forensic defensibility** of evidence. This includes maintaining a clear **chain-of-custody** record for each item (who handled it, when) and using cryptographic hashing or digital fingerprints to detect tampering. Mention that the system automatically records every access or transfer of evidence in tamper-evident audit logs.

- **Storage & Access Controls:** Document how data is stored securely (e.g. encrypted databases or drives, segregated storage for PII vs evidence files). Specify that **encryption at rest and in transit** is used (AES-256 or similar standards). Discuss role-based access controls and strict permissions – only authorized personnel can access sensitive evidence, with all access logged. Highlight any measures against insider threats or APTs (e.g. dual control for critical actions, monitoring of access patterns).

- **Privacy Preservation:** Describe how personal or non-relevant information is protected. For example, if personal data is co-mingled with evidence, outline processes for minimizing exposure (such as filtering out or redacting non-case data). Clarify compliance with privacy laws (GDPR, etc.), such as honoring data minimization and ensuring data subject rights can be fulfilled (deletion after a case, etc.). The tone should reassure that user privacy is respected even as evidence is handled.

- **Retention & Disposal:** State the retention policies for different data types (e.g. active case evidence retained until case closure plus X years, log data retained Y months). Confirm that once data is no longer needed (or upon case completion), it is securely disposed of (secure deletion or destruction) in line with legal requirements. Emphasize **defensible deletion** – ensuring no remnants remain – and document how this is logged and auditable.

- **Adversary-Resilient Assumptions:** Throughout, assume an advanced adversary might attempt to steal or alter data. Describe how our procedures mitigate this – for example, using hardware-encrypted storage devices, requiring MFA for access, keeping offline backups, and regularly verifying hashes of stored evidence. Mention that these precautions align with industry best practices for high-assurance digital evidence management.

Write this as a **formal specification document** with clear sections (introduction, detailed policies, and possibly tables or bullet lists for key rules). The style should be factual and precise, suitable for an internal policy manual or external auditor review. Do **not** include any fictional data; focus on process and policy. Ensure the document demonstrates that our evidence handling can withstand legal scrutiny and sophisticated attacks.

Context: Sentinel-Forensics is a forensic platform with:
- Multi-tenant architecture with strict organization isolation
- Evidence vault with cryptographic verification and AES-256 encryption
- Chain of custody tracking for all evidence with tamper-evident logs
- Encrypted storage (at rest) and transmission (in transit)
- RBAC with forensic audit logging and MFA enforcement
- Immutable, timestamped audit logs
- Data retention policies and secure disposal with verification
- Privacy controls, PII redaction capabilities, and GDPR compliance
- Write-blocking for evidence collection and hash verification
- Offline backups and regular integrity checks

${structuredOutput ? `
**Output Format:** Provide the documentation as a comprehensive narrative document with clear sections. Additionally, return a structured JSON object with:
- "narrative": the full documentation text
- "data_categories": an array of objects with fields:
  - "category": type of data (e.g., "Network Logs", "Forensic Evidence")
  - "description": what this data category contains
  - "retention_policy": how long data is kept and disposal conditions
  - "security_measures": encryption, access controls, integrity checks applied
` : ''}

Your output should be a **comprehensive, legally defensible documentation** that could be presented in court proceedings or compliance audits. It must accurately reflect evidence handling procedures in plain language suitable for both technical and legal audiences.`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false,
      response_json_schema: structuredOutput ? {
        type: "object",
        properties: {
          narrative: { type: "string" },
          data_categories: {
            type: "array",
            items: {
              type: "object",
              properties: {
                category: { type: "string" },
                description: { type: "string" },
                retention_policy: { type: "string" },
                security_measures: { type: "string" }
              }
            }
          }
        }
      } : undefined
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      action: 'generate_data_handling_doc',
      actor: user.email,
      metadata: {
        timestamp: new Date().toISOString(),
        structured_output: structuredOutput,
        doc_length: typeof response === 'string' ? response.length : JSON.stringify(response).length
      }
    });

    return Response.json({ 
      document: response,
      generated_at: new Date().toISOString(),
      generated_by: user.email
    });

  } catch (error) {
    console.error('Data handling doc generation error:', error);
    return Response.json({ 
      error: 'Failed to generate document',
      details: error.message 
    }, { status: 500 });
  }
});