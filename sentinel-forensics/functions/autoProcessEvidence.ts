import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { evidence_id, case_id } = await req.json();

    if (!evidence_id) {
      return Response.json({ error: 'Missing evidence_id' }, { status: 400 });
    }

    const evidence = await base44.asServiceRole.entities.EvidenceV2.filter({ id: evidence_id });
    if (evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceRecord = evidence[0];
    const results = {
      ocr: null,
      categorization: null,
      metadata_extraction: null
    };

    // 1. Run OCR if applicable
    const ocrSupportedTypes = ['image', 'screenshot', 'file'];
    if (ocrSupportedTypes.includes(evidenceRecord.evidence_type)) {
      try {
        const ocrResponse = await fetch(`${Deno.env.get('BASE44_FUNCTION_URL') || ''}/processEvidenceOCR`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': req.headers.get('Authorization')
          },
          body: JSON.stringify({ evidence_id })
        });
        results.ocr = await ocrResponse.json();
      } catch (error) {
        console.error('OCR processing failed:', error);
      }
    }

    // 2. Extract metadata from file
    const metadataPrompt = `Analyze this evidence file and extract all available metadata.

Evidence Type: ${evidenceRecord.evidence_type}
File Name: ${evidenceRecord.title}

Extract and return as JSON:
{
  "file_metadata": {
    "creation_date": "if visible",
    "modification_date": "if visible",
    "author": "if visible",
    "device_info": "any device information visible"
  },
  "content_analysis": {
    "contains_pii": true/false,
    "contains_sensitive_data": true/false,
    "relevance_score": 0-100,
    "summary": "brief summary"
  },
  "legal_relevance": {
    "potential_evidence_value": "high/medium/low",
    "key_facts": ["list of key facts"],
    "requires_redaction": true/false
  }
}`;

    try {
      const metadataAnalysis = await base44.integrations.Core.InvokeLLM({
        prompt: metadataPrompt,
        file_urls: [evidenceRecord.file_url],
        response_json_schema: {
          type: "object",
          properties: {
            file_metadata: { type: "object" },
            content_analysis: { type: "object" },
            legal_relevance: { type: "object" }
          }
        }
      });

      results.metadata_extraction = metadataAnalysis;

      // Update evidence with extracted metadata
      const enhancedMetadata = {
        ...(evidenceRecord.metadata || {}),
        ...metadataAnalysis.file_metadata,
        ai_analysis: metadataAnalysis.content_analysis,
        legal_analysis: metadataAnalysis.legal_relevance,
        auto_processed_at: new Date().toISOString()
      };

      await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
        metadata: enhancedMetadata
      });

      // Auto-categorize based on case context if case_id provided
      if (case_id) {
        const caseData = await base44.asServiceRole.entities.Case.filter({ id: case_id });
        if (caseData.length > 0) {
          const caseContext = caseData[0];
          
          const categorizationPrompt = `Given this evidence and case context, suggest the most appropriate categorization.

Case Type: ${caseContext.case_type}
Case Status: ${caseContext.status}
Evidence Type: ${evidenceRecord.evidence_type}
Evidence Summary: ${metadataAnalysis.content_analysis?.summary || 'N/A'}

Return as JSON:
{
  "suggested_evidence_type": "most appropriate type",
  "priority": "high/medium/low",
  "suggested_actions": ["list of recommended next steps"],
  "related_evidence_ids": []
}`;

          const categorization = await base44.integrations.Core.InvokeLLM({
            prompt: categorizationPrompt,
            response_json_schema: {
              type: "object",
              properties: {
                suggested_evidence_type: { type: "string" },
                priority: { type: "string" },
                suggested_actions: { type: "array", items: { type: "string" } },
                related_evidence_ids: { type: "array", items: { type: "string" } }
              }
            }
          });

          results.categorization = categorization;
        }
      }
    } catch (error) {
      console.error('Metadata extraction failed:', error);
    }

    return Response.json({
      success: true,
      evidence_id,
      processing_results: results,
      message: 'Evidence processing completed'
    });

  } catch (error) {
    console.error('Auto-processing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});