import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';
import Anthropic from 'npm:@anthropic-ai/sdk';

const anthropic = new Anthropic({
  apiKey: Deno.env.get("ANTHROPIC_API_KEY"),
});

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    const { policy_type, compliance_frameworks, existing_content, action } = await req.json();

    if (!policy_type) {
      return Response.json({ error: 'Policy type required' }, { status: 400 });
    }

    const systemPrompt = `You are a security policy expert and compliance specialist. You draft security policies that are:
- Clear, actionable, and enforceable
- Aligned with industry best practices and regulatory requirements
- Specific to the compliance frameworks requested (GDPR, HIPAA, SOC 2, OWASP, etc.)
- Written in professional, legal-appropriate language
- Structured with clear sections: Purpose, Scope, Policy Statements, Procedures, Roles & Responsibilities, Enforcement

Your policies must be audit-ready and forensically sound.`;

    let userPrompt = '';

    if (action === 'draft') {
      userPrompt = `Draft a comprehensive ${policy_type} security policy for a forensics platform.

Compliance Frameworks to address: ${compliance_frameworks?.join(', ') || 'General best practices'}

Include:
1. Purpose and Scope
2. Policy Statements (numbered, specific requirements)
3. Procedures and Implementation Guidelines
4. Roles and Responsibilities
5. Compliance and Enforcement
6. Review and Update Schedule

Make it detailed, professional, and audit-ready.`;
    } else if (action === 'review') {
      userPrompt = `Review and improve this security policy for compliance and completeness:

${existing_content}

Target Compliance Frameworks: ${compliance_frameworks?.join(', ') || 'General best practices'}

Provide:
1. Compliance Score (0-100)
2. Strengths
3. Gaps and Missing Requirements
4. Specific Recommendations
5. Improved version of the policy`;
    } else if (action === 'update') {
      userPrompt = `Update this security policy to align with current best practices and compliance requirements:

${existing_content}

Target Compliance Frameworks: ${compliance_frameworks?.join(', ') || 'General best practices'}

Provide an updated version that addresses recent regulatory changes and security best practices.`;
    }

    const response = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20241022",
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt
        }
      ]
    });

    const policyContent = response.content[0].text;

    // Log the policy generation
    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'ai_policy_generation',
      resource_type: 'security_policy',
      timestamp: new Date().toISOString(),
      details: {
        policy_type,
        compliance_frameworks,
        action
      }
    });

    return Response.json({
      policy_content: policyContent,
      metadata: {
        policy_type,
        compliance_frameworks,
        generated_at: new Date().toISOString(),
        ai_model: "claude-3-5-sonnet"
      }
    });

  } catch (error) {
    console.error('AI Policy Drafter error:', error);
    return Response.json({ 
      error: 'Failed to generate policy',
      details: error.message 
    }, { status: 500 });
  }
});