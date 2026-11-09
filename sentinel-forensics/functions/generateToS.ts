import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { companyName = 'Sentinel-Forensics', jurisdiction = 'Delaware, USA', structuredOutput = false } = await req.json().catch(() => ({}));

    const prompt = `You are a legal-writing AI tasked with generating a **Terms of Service (ToS)** agreement for our digital forensics platform. Produce a comprehensive ToS document that is **legally robust yet easy to understand**. The ToS should include, at minimum, the following sections and points:

1. **Introduction & Acceptance of Terms:** State that by using the platform, users agree to these terms. Identify the company as "${companyName}" and note that continued use signifies acceptance.

2. **Description of Service:** Briefly describe what the service provides (digital forensics, evidence management, threat hunting platform) and any key usage requirements (users must be 18+, use the service only for lawful purposes, etc.). Keep this high-level and clear.

3. **User Obligations & Acceptable Use:** Outline what users are allowed and not allowed to do. Prohibit misuse of the platform (no attempts to breach security, no illegal content, no unauthorized access, no evidence tampering). Mention that users are responsible for maintaining confidentiality of their account credentials and must report security breaches immediately.

4. **Privacy and Data Use:** Refer to the Privacy Policy and summarize that user data is handled according to that policy. Make it clear users consent to data handling as described when they use the service. Note that evidence and forensic data is subject to chain-of-custody requirements.

5. **Intellectual Property:** State that the platform and its content (branding, software, documentation) are owned by ${companyName} or licensors, and usage does not grant ownership. Include that user feedback can be used by the company. Clarify that user-uploaded evidence remains the user's property but grants the company necessary licenses to process and store it.

6. **Disclaimers of Warranty:** Very clearly declare that the service is provided **"as is" and "as available," without warranties of any kind**. State that **no express or implied warranties** are given (including merchantability, fitness for a particular purpose, non-infringement, accuracy of forensic analysis results). Users must accept that there may be interruptions or errors and that the company does not guarantee the service will meet all expectations. Emphasize that forensic tools are aids and users remain responsible for their own professional judgments.

7. **Limitation of Liability:** State that the company's liability is strictly limited. The company **will not be liable for indirect, incidental, consequential, special, or punitive damages** arising from use of the platform (including lost profits, data loss, business interruption, or failed investigations). Specify maximum liability cap (amount paid by user in last 12 months, or $100 if service is free). Emphasize this limitation applies to the fullest extent permitted by law.

8. **Indemnification:** Require that users indemnify (protect) ${companyName} from claims or losses arising out of their misuse of the platform, violation of the terms, violation of laws, or infringement of third-party rights.

9. **Governing Law & Dispute Resolution:** Specify that ${jurisdiction} law governs the ToS. State that disputes will be resolved through binding arbitration (JAMS or AAA rules) with individual arbitration only (no class actions). Include a small claims court exception and jury trial waiver.

10. **Termination:** Explain that the company can suspend or terminate access for violations of the terms or at its discretion. Upon termination, users lose access but may export their data within 30 days. Company may delete data after the retention period. Users can terminate by ceasing use and requesting account deletion.

11. **Changes to Terms:** State that ${companyName} can update the ToS at any time by posting changes on the website or sending email notification. Continued use after changes means acceptance. Material changes will be announced with 30 days notice.

12. **No Waiver & Severability (standard clauses):** Mention that failure to enforce a provision isn't a waiver of rights, and if part of the ToS is found unenforceable, the rest remains in effect.

13. **Force Majeure:** Include that ${companyName} is not liable for delays or failures due to circumstances beyond reasonable control (natural disasters, cyberattacks, government actions, etc.).

14. **Export Controls:** Note that the platform may contain encryption and security tools subject to export control laws, and users must comply with all applicable export regulations.

15. **Contact Information:** Provide that users can contact ${companyName} with questions about the ToS.

Throughout the ToS, use **plain English**. The tone should be formal and authoritative (it's a legal document), but avoid unnecessary legalese. Each section should have a clear heading. Ensure especially that the **Disclaimer of Warranties** and **Limitation of Liability** sections are prominent and unambiguous (these protect us from lawsuits and need to be enforceable, so clarity is crucial). Also include a brief **"no warranties"** statement in the introduction to reinforce that we offer the service without any guarantee of reliability or accuracy.

The final output should read like a professional Terms of Service ready for publication on our website or app, understandable by a layperson while covering all legal bases. Use proper legal formatting with numbered sections and subsections.

IMPORTANT: This is a template document. Do not include actual dates, specific fee amounts, or fictional user data. Focus on clear policy language.

${structuredOutput ? `
**Output Format:** Return a JSON object with the following structure:
{
  "Introduction": "Full text of the Introduction & Acceptance of Terms section",
  "UserObligations": "Full text of User Obligations & Acceptable Use section",
  "PrivacyAndDataUse": "Full text of Privacy and Data Use section",
  "DisclaimerOfWarranties": "Full text of Disclaimers of Warranty section (CRITICAL - must be comprehensive)",
  "LimitationOfLiability": "Full text of Limitation of Liability section (CRITICAL - must be comprehensive)",
  "GoverningLaw": "Full text of Governing Law & Dispute Resolution section"
}

Include only the core legal sections as separate properties. Other sections can be combined into the most relevant property above.
` : ''}`;

    const response = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      add_context_from_internet: false,
      response_json_schema: structuredOutput ? {
        type: "object",
        properties: {
          Introduction: { type: "string" },
          UserObligations: { type: "string" },
          PrivacyAndDataUse: { type: "string" },
          DisclaimerOfWarranties: { type: "string" },
          LimitationOfLiability: { type: "string" },
          GoverningLaw: { type: "string" }
        }
      } : undefined
    });

    // Create audit log
    await base44.asServiceRole.entities.AuditLog.create({
      organization_id: user.organization_id,
      action: 'generate_terms_of_service',
      actor: user.email,
      metadata: {
        timestamp: new Date().toISOString(),
        company_name: companyName,
        jurisdiction: jurisdiction,
        structured_output: structuredOutput,
        doc_length: typeof response === 'string' ? response.length : JSON.stringify(response).length
      }
    });

    return Response.json({ 
      document: response,
      generated_at: new Date().toISOString(),
      generated_by: user.email,
      company_name: companyName,
      jurisdiction: jurisdiction
    });

  } catch (error) {
    console.error('ToS generation error:', error);
    return Response.json({ 
      error: 'Failed to generate Terms of Service',
      details: error.message 
    }, { status: 500 });
  }
});