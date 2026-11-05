import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { evidence_id } = await req.json();

    if (!evidence_id) {
      return Response.json({ error: 'Missing evidence_id' }, { status: 400 });
    }

    const evidence = await base44.asServiceRole.entities.EvidenceV2.filter({ id: evidence_id });
    if (evidence.length === 0) {
      return Response.json({ error: 'Evidence not found' }, { status: 404 });
    }

    const evidenceRecord = evidence[0];

    // Check if file type supports OCR
    const ocrSupportedTypes = ['image', 'screenshot', 'file'];
    if (!ocrSupportedTypes.includes(evidenceRecord.evidence_type)) {
      return Response.json({ 
        success: false, 
        message: 'Evidence type does not support OCR' 
      });
    }

    // Extract text using AI with vision capabilities
    const ocrPrompt = `Analyze this image/document and extract ALL visible text with high accuracy.
    
Format your response as JSON:
{
  "extracted_text": "full extracted text",
  "document_type": "type of document (e.g., receipt, contract, email, screenshot, photo, etc.)",
  "key_entities": ["important names, dates, locations, etc."],
  "suggested_tags": ["relevant tags for categorization"],
  "confidence": "high/medium/low",
  "language": "detected language"
}`;

    const ocrResult = await base44.integrations.Core.InvokeLLM({
      prompt: ocrPrompt,
      file_urls: [evidenceRecord.file_url],
      response_json_schema: {
        type: "object",
        properties: {
          extracted_text: { type: "string" },
          document_type: { type: "string" },
          key_entities: { type: "array", items: { type: "string" } },
          suggested_tags: { type: "array", items: { type: "string" } },
          confidence: { type: "string" },
          language: { type: "string" }
        }
      }
    });

    // Enhance metadata with OCR results
    const enhancedMetadata = {
      ...(evidenceRecord.metadata || {}),
      ocr_extracted_text: ocrResult.extracted_text,
      ocr_document_type: ocrResult.document_type,
      ocr_key_entities: ocrResult.key_entities,
      ocr_confidence: ocrResult.confidence,
      ocr_language: ocrResult.language,
      ocr_processed_at: new Date().toISOString(),
      ocr_processed_by: user.email
    };

    // Auto-categorize based on content if case_id exists
    let suggestedCategory = evidenceRecord.evidence_type;
    if (ocrResult.document_type) {
      const typeMapping = {
        'receipt': 'file',
        'contract': 'file',
        'email': 'screenshot',
        'text_message': 'screenshot',
        'photo': 'screenshot',
        'document': 'file',
        'form': 'file'
      };
      suggestedCategory = typeMapping[ocrResult.document_type.toLowerCase()] || evidenceRecord.evidence_type;
    }

    // Merge suggested tags with existing tags
    const existingTags = evidenceRecord.tags || [];
    const mergedTags = [...new Set([...existingTags, ...ocrResult.suggested_tags])];

    // Update evidence with OCR results - using backend function for RLS compliance
    try {
      await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
        metadata: enhancedMetadata,
        tags: mergedTags,
        notes: evidenceRecord.notes ? 
          `${evidenceRecord.notes}\n\nOCR: ${ocrResult.document_type} - ${ocrResult.extracted_text.substring(0, 200)}...` :
          `OCR: ${ocrResult.document_type} - ${ocrResult.extracted_text.substring(0, 200)}...`
      });

      // Log OCR processing in chain of custody
      const chainEntry = {
        timestamp: new Date().toISOString(),
        action: 'analyzed',
        performed_by: user.email,
        notes: `OCR processing completed - ${ocrResult.confidence} confidence`,
        audit_log_id: `ocr-${Date.now()}`
      };

      const updatedChain = [...(evidenceRecord.chain_of_custody || []), chainEntry];
      await base44.asServiceRole.entities.EvidenceV2.update(evidence_id, {
        chain_of_custody: updatedChain
      });
    } catch (updateError) {
      console.error('Evidence update error:', updateError);
      throw new Error('Failed to update evidence with OCR results');
    }

    return Response.json({
      success: true,
      ocr_result: ocrResult,
      extracted_text: ocrResult.extracted_text,
      suggested_tags: mergedTags,
      document_type: ocrResult.document_type,
      confidence: ocrResult.confidence
    });

  } catch (error) {
    console.error('OCR processing error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});