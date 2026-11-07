import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Advanced Evidence Search with Tag Support
 * 
 * Supports:
 * - Full-text search
 * - Tag filtering (ANY/ALL/exclude)
 * - Tag syntax in search: tag:apt, tag:"wifi mitm"
 * - Cross-case or single-case scope
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchTerm, caseId, tagsAny, tagsAll, excludeTags, caseScope } = await req.json();

    // Parse tag: syntax from search term
    let cleanedSearch = searchTerm || '';
    const tagMatches = [];
    
    if (searchTerm) {
      // Match tag:"quoted tag" and tag:unquoted
      const tagPattern = /tag:(?:"([^"]+)"|(\S+))/g;
      let match;
      
      while ((match = tagPattern.exec(searchTerm)) !== null) {
        const tagName = match[1] || match[2];
        tagMatches.push(tagName.toLowerCase());
      }
      
      // Remove tag: syntax from search term
      cleanedSearch = searchTerm.replace(tagPattern, '').trim();
    }

    // Build base filter
    const filter = {
      organization_id: user.organization_id
    };

    // Case scope
    if (caseScope !== 'ALL_CASES' && caseId) {
      filter.case_id = caseId;
    }

    // Get all evidence matching base filter + text search
    let evidence = await base44.entities.EvidenceV2.filter(filter);

    // Text search on title/description
    if (cleanedSearch) {
      const searchLower = cleanedSearch.toLowerCase();
      evidence = evidence.filter(e => 
        e.title?.toLowerCase().includes(searchLower) ||
        e.description?.toLowerCase().includes(searchLower)
      );
    }

    // Tag filtering
    const allTagIds = [...(tagsAny || []), ...(tagsAll || []), ...(excludeTags || []), ...tagMatches];
    
    if (allTagIds.length > 0 || tagMatches.length > 0) {
      // Get all evidence-tag mappings
      const evidenceTags = await base44.entities.EvidenceTag.filter({
        organization_id: user.organization_id,
        is_active: true
      });

      // Get tag details for name matching
      const tags = await base44.entities.Tag.filter({
        organization_id: user.organization_id,
        is_deleted: false
      });

      // Map tag names to IDs from search syntax
      const tagNameToId = {};
      tags.forEach(tag => {
        tagNameToId[tag.name.toLowerCase()] = tag.id;
      });

      const searchTagIds = tagMatches
        .map(name => tagNameToId[name])
        .filter(id => id);

      const combinedTagsAny = [...(tagsAny || []), ...searchTagIds];
      const combinedTagsAll = tagsAll || [];
      const combinedExclude = excludeTags || [];

      // Build evidence -> tags map
      const evidenceTagMap = {};
      evidenceTags.forEach(et => {
        if (!evidenceTagMap[et.evidence_id]) {
          evidenceTagMap[et.evidence_id] = [];
        }
        evidenceTagMap[et.evidence_id].push(et.tag_id);
      });

      // Filter evidence by tags
      evidence = evidence.filter(e => {
        const eTags = evidenceTagMap[e.id] || [];

        // Exclude tags
        if (combinedExclude.some(tagId => eTags.includes(tagId))) {
          return false;
        }

        // Match ALL tags
        if (combinedTagsAll.length > 0) {
          if (!combinedTagsAll.every(tagId => eTags.includes(tagId))) {
            return false;
          }
        }

        // Match ANY tags
        if (combinedTagsAny.length > 0) {
          if (!combinedTagsAny.some(tagId => eTags.includes(tagId))) {
            return false;
          }
        }

        return true;
      });
    }

    // Sort by collection timestamp
    evidence.sort((a, b) => {
      const dateA = new Date(a.collection_timestamp || a.created_date);
      const dateB = new Date(b.collection_timestamp || b.created_date);
      return dateB - dateA;
    });

    return Response.json({
      evidence,
      count: evidence.length,
      parsedTags: tagMatches
    });
  } catch (error) {
    console.error('Evidence search error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});