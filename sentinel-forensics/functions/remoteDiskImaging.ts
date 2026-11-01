import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { device_id, case_id, imaging_options } = await req.json();

    if (!device_id) {
      return Response.json({ error: 'Device ID required' }, { status: 400 });
    }

    // Create forensic collection record
    const collection = await base44.entities.ForensicCollection.create({
      organization_id: user.organization_id,
      case_id,
      device_id,
      collection_type: 'disk_image',
      status: 'collecting',
      progress: 0,
      collection_metadata: {
        start_time: new Date().toISOString(),
        compression: imaging_options?.compression || 'none'
      }
    });

    // Simulate disk imaging process
    const imagingSteps = [
      { progress: 10, message: 'Establishing secure connection...' },
      { progress: 25, message: 'Verifying device integrity...' },
      { progress: 40, message: 'Creating bit-by-bit disk image...' },
      { progress: 60, message: 'Computing forensic hashes...' },
      { progress: 80, message: 'Compressing image...' },
      { progress: 95, message: 'Verifying image integrity...' },
      { progress: 100, message: 'Disk image complete' }
    ];

    // Simulated hash
    const imageHash = 'sha256:' + Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)).join('');

    // Update collection with completion
    await base44.entities.ForensicCollection.update(collection.id, {
      status: 'completed',
      progress: 100,
      collection_metadata: {
        ...collection.collection_metadata,
        end_time: new Date().toISOString(),
        size_bytes: Math.floor(Math.random() * 500000000000), // 50-500GB
        hash: imageHash
      },
      storage_location: `/forensics/disk_images/${device_id}_${Date.now()}.dd`
    });

    // Create audit log
    await base44.entities.AuditLog.create({
      organization_id: user.organization_id,
      user_email: user.email,
      action: 'forensic_disk_image',
      resource_type: 'device',
      resource_id: device_id,
      timestamp: new Date().toISOString(),
      details: {
        collection_id: collection.id,
        hash: imageHash,
        case_id
      }
    });

    return Response.json({
      success: true,
      collection_id: collection.id,
      hash: imageHash,
      steps: imagingSteps
    });

  } catch (error) {
    console.error('Disk imaging error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});