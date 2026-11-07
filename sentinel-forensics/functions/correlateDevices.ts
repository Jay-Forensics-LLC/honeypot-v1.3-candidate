import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { case_id } = await req.json();

    if (!case_id) {
      return Response.json({ error: 'case_id required' }, { status: 400 });
    }

    // Fetch all mobile devices and artifacts
    const devices = await base44.entities.MobileDevice.filter({ case_id });
    const mobileArtifacts = await base44.entities.MobileArtifact.filter({ case_id });
    const evidence = await base44.entities.EvidenceV2.filter({ case_id });

    const correlations = [];

    // RULE 1: File Hash Matching (files that appear on multiple devices)
    const hashMap = new Map();
    
    // Index mobile artifacts by hash
    mobileArtifacts
      .filter(a => a.file_hash)
      .forEach(artifact => {
        if (!hashMap.has(artifact.file_hash)) {
          hashMap.set(artifact.file_hash, []);
        }
        hashMap.get(artifact.file_hash).push({ type: 'mobile', artifact });
      });

    // Index evidence by hash
    evidence
      .filter(e => e.sha256_hash)
      .forEach(ev => {
        if (!hashMap.has(ev.sha256_hash)) {
          hashMap.set(ev.sha256_hash, []);
        }
        hashMap.get(ev.sha256_hash).push({ type: 'evidence', artifact: ev });
      });

    // Find matches
    hashMap.forEach((items, hash) => {
      if (items.length > 1) {
        for (let i = 0; i < items.length; i++) {
          for (let j = i + 1; j < items.length; j++) {
            correlations.push({
              correlation_type: 'file_hash_match',
              confidence_score: 95,
              source_device_id: items[i].type === 'mobile' ? items[i].artifact.device_id : null,
              target_device_id: items[j].type === 'mobile' ? items[j].artifact.device_id : null,
              source_artifact_id: items[i].artifact.id,
              target_artifact_id: items[j].artifact.id,
              description: `Identical file found on ${items[i].type} and ${items[j].type} (SHA-256: ${hash.substring(0, 16)}...)`,
              match_details: { hash, file_name: items[i].artifact.title || items[i].artifact.file_path }
            });
          }
        }
      }
    });

    // RULE 2: Contact/Phone Number Matching
    const phoneMap = new Map();
    
    mobileArtifacts
      .filter(a => a.participants && a.participants.length > 0)
      .forEach(artifact => {
        artifact.participants.forEach(phone => {
          if (!phoneMap.has(phone)) {
            phoneMap.set(phone, []);
          }
          phoneMap.get(phone).push(artifact);
        });
      });

    // Check if phone numbers appear in evidence descriptions
    evidence.forEach(ev => {
      const content = `${ev.title} ${ev.description}`.toLowerCase();
      phoneMap.forEach((artifacts, phone) => {
        if (content.includes(phone.replace(/\D/g, ''))) {
          artifacts.forEach(artifact => {
            correlations.push({
              correlation_type: 'contact_match',
              confidence_score: 80,
              source_device_id: artifact.device_id,
              source_artifact_id: artifact.id,
              target_artifact_id: ev.id,
              description: `Phone number ${phone} appears in both mobile data and evidence`,
              match_details: { phone_number: phone }
            });
          });
        }
      });
    });

    // RULE 3: Temporal Correlation (events within 5 minutes)
    const timeWindow = 5 * 60 * 1000; // 5 minutes in ms

    mobileArtifacts.forEach(mobile => {
      const mobileTime = new Date(mobile.timestamp).getTime();
      
      evidence.forEach(ev => {
        const evTime = new Date(ev.collection_timestamp || ev.created_date).getTime();
        const timeDiff = Math.abs(mobileTime - evTime);

        if (timeDiff <= timeWindow) {
          correlations.push({
            correlation_type: 'temporal_correlation',
            confidence_score: 70,
            source_device_id: mobile.device_id,
            source_artifact_id: mobile.id,
            target_artifact_id: ev.id,
            description: `Events occurred within ${Math.floor(timeDiff / 60000)} minutes of each other`,
            match_details: { 
              time_difference_seconds: Math.floor(timeDiff / 1000),
              mobile_timestamp: mobile.timestamp,
              evidence_timestamp: ev.collection_timestamp || ev.created_date
            }
          });
        }
      });
    });

    // RULE 4: Location Proximity (if both have location data)
    const locatedArtifacts = mobileArtifacts.filter(a => a.location?.latitude && a.location?.longitude);
    
    for (let i = 0; i < locatedArtifacts.length; i++) {
      for (let j = i + 1; j < locatedArtifacts.length; j++) {
        const loc1 = locatedArtifacts[i].location;
        const loc2 = locatedArtifacts[j].location;

        // Calculate distance using Haversine formula
        const R = 6371e3; // Earth radius in meters
        const φ1 = loc1.latitude * Math.PI / 180;
        const φ2 = loc2.latitude * Math.PI / 180;
        const Δφ = (loc2.latitude - loc1.latitude) * Math.PI / 180;
        const Δλ = (loc2.longitude - loc1.longitude) * Math.PI / 180;

        const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
                  Math.cos(φ1) * Math.cos(φ2) *
                  Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        const distance = R * c; // in meters

        if (distance <= 100) { // Within 100 meters
          correlations.push({
            correlation_type: 'location_proximity',
            confidence_score: 85,
            source_device_id: locatedArtifacts[i].device_id,
            target_device_id: locatedArtifacts[j].device_id,
            source_artifact_id: locatedArtifacts[i].id,
            target_artifact_id: locatedArtifacts[j].id,
            description: `Devices were within ${Math.round(distance)}m of each other`,
            match_details: { 
              distance_meters: Math.round(distance),
              location1: loc1,
              location2: loc2
            }
          });
        }
      }
    }

    // RULE 5: Communication Link (same conversation across apps)
    const communicationPairs = new Map();
    
    mobileArtifacts
      .filter(a => ['sms', 'app_message', 'call_log'].includes(a.artifact_type))
      .forEach(artifact => {
        if (artifact.participants && artifact.participants.length > 0) {
          const key = artifact.participants.sort().join('|');
          if (!communicationPairs.has(key)) {
            communicationPairs.set(key, []);
          }
          communicationPairs.get(key).push(artifact);
        }
      });

    communicationPairs.forEach((artifacts, pair) => {
      if (artifacts.length > 1) {
        const apps = [...new Set(artifacts.map(a => a.app_source || a.artifact_type))];
        if (apps.length > 1) {
          for (let i = 0; i < artifacts.length; i++) {
            for (let j = i + 1; j < artifacts.length; j++) {
              correlations.push({
                correlation_type: 'communication_link',
                confidence_score: 90,
                source_device_id: artifacts[i].device_id,
                target_device_id: artifacts[j].device_id,
                source_artifact_id: artifacts[i].id,
                target_artifact_id: artifacts[j].id,
                description: `Same parties communicating via ${apps.join(' and ')}`,
                match_details: { participants: pair.split('|'), apps }
              });
            }
          }
        }
      }
    });

    // Store unique correlations
    const stored = [];
    const seen = new Set();

    for (const corr of correlations) {
      const key = `${corr.correlation_type}|${corr.source_artifact_id}|${corr.target_artifact_id}`;
      if (!seen.has(key)) {
        seen.add(key);
        
        const record = await base44.asServiceRole.entities.DeviceCorrelation.create({
          organization_id: user.organization_id,
          case_id,
          ...corr,
          discovered_at: new Date().toISOString()
        });
        
        stored.push(record);
      }
    }

    // Log activity
    await base44.asServiceRole.entities.CaseActivity.create({
      organization_id: user.organization_id,
      case_id,
      activity_type: 'evidence_added',
      actor_email: user.email,
      description: `Cross-device correlation completed: ${stored.length} links discovered`,
      timestamp: new Date().toISOString()
    });

    return Response.json({
      success: true,
      correlations_found: stored.length,
      correlations: stored,
      breakdown: {
        file_matches: stored.filter(c => c.correlation_type === 'file_hash_match').length,
        contact_matches: stored.filter(c => c.correlation_type === 'contact_match').length,
        temporal: stored.filter(c => c.correlation_type === 'temporal_correlation').length,
        location: stored.filter(c => c.correlation_type === 'location_proximity').length,
        communication: stored.filter(c => c.correlation_type === 'communication_link').length
      }
    });

  } catch (error) {
    console.error('Device correlation error:', error);
    return Response.json({
      error: 'Correlation failed',
      details: error.message
    }, { status: 500 });
  }
});