import { createClientFromRequest } from 'npm:@base44/sdk@0.8.6';

/**
 * Seed Device Metrics (Testing/Demo)
 * 
 * Generates realistic fixture data for device health testing.
 * Creates 10 devices with varying health profiles across all risk bands.
 */

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const fixtures = [
      {
        // CRITICAL: SMART failure + crashes
        device_id: 'DEV-CRITICAL-001',
        hostname: 'workstation-alpha',
        os_family: 'Windows',
        risk_band: 'CRITICAL',
        metrics: [
          { disk_usage_pct: 92, mem_pressure: 85, cpu_load_avg: 75, disk_smart_status: 'FAILED', 
            disk_reallocated_sectors: 120, crash_count_24h: 5, reboot_count_24h: 3, 
            temperature_celsius: 88, agent_heartbeat_gap_minutes: 5 }
        ]
      },
      {
        // HIGH: High disk usage + degrading
        device_id: 'DEV-HIGH-001',
        hostname: 'laptop-bravo',
        os_family: 'macOS',
        risk_band: 'HIGH',
        metrics: [
          { disk_usage_pct: 88, mem_pressure: 78, cpu_load_avg: 65, disk_smart_status: 'WARNING', 
            disk_reallocated_sectors: 25, crash_count_24h: 1, battery_health_pct: 45,
            temperature_celsius: 78, agent_heartbeat_gap_minutes: 10 }
        ]
      },
      {
        // MEDIUM: Memory pressure + trending up
        device_id: 'DEV-MEDIUM-001',
        hostname: 'desktop-charlie',
        os_family: 'Linux',
        risk_band: 'MEDIUM',
        metrics: [
          { disk_usage_pct: 70, mem_pressure: 82, cpu_load_avg: 55, disk_smart_status: 'PASSED', 
            disk_reallocated_sectors: 0, crash_count_24h: 0, temperature_celsius: 65,
            agent_heartbeat_gap_minutes: 2 }
        ]
      },
      {
        // LOW: Healthy
        device_id: 'DEV-LOW-001',
        hostname: 'server-delta',
        os_family: 'Linux',
        risk_band: 'LOW',
        metrics: [
          { disk_usage_pct: 45, mem_pressure: 40, cpu_load_avg: 30, disk_smart_status: 'PASSED', 
            disk_reallocated_sectors: 0, crash_count_24h: 0, temperature_celsius: 55,
            agent_heartbeat_gap_minutes: 1 }
        ]
      },
      {
        // CRITICAL: Offline agent + high temp
        device_id: 'DEV-CRITICAL-002',
        hostname: 'laptop-echo',
        os_family: 'Windows',
        risk_band: 'CRITICAL',
        metrics: [
          { disk_usage_pct: 75, mem_pressure: 60, cpu_load_avg: 85, disk_smart_status: 'PASSED', 
            disk_reallocated_sectors: 0, crash_count_24h: 0, temperature_celsius: 95,
            agent_heartbeat_gap_minutes: 180, battery_health_pct: 35 }
        ]
      },
      {
        // HIGH: Battery degraded + high reboots
        device_id: 'DEV-HIGH-002',
        hostname: 'macbook-foxtrot',
        os_family: 'macOS',
        risk_band: 'HIGH',
        metrics: [
          { disk_usage_pct: 60, mem_pressure: 55, cpu_load_avg: 50, disk_smart_status: 'PASSED', 
            disk_reallocated_sectors: 0, crash_count_24h: 0, reboot_count_24h: 7,
            temperature_celsius: 70, battery_health_pct: 38, agent_heartbeat_gap_minutes: 5 }
        ]
      },
      {
        // MEDIUM: Disk trending up
        device_id: 'DEV-MEDIUM-002',
        hostname: 'workstation-golf',
        os_family: 'Windows',
        risk_band: 'MEDIUM',
        metrics: [
          { disk_usage_pct: 77, mem_pressure: 50, cpu_load_avg: 45, disk_smart_status: 'PASSED', 
            disk_reallocated_sectors: 0, crash_count_24h: 0, temperature_celsius: 60,
            agent_heartbeat_gap_minutes: 3 }
        ]
      },
      {
        // LOW: Healthy server
        device_id: 'DEV-LOW-002',
        hostname: 'server-hotel',
        os_family: 'Linux',
        risk_band: 'LOW',
        metrics: [
          { disk_usage_pct: 35, mem_pressure: 30, cpu_load_avg: 20, disk_smart_status: 'PASSED', 
            disk_reallocated_sectors: 0, crash_count_24h: 0, temperature_celsius: 50,
            agent_heartbeat_gap_minutes: 1 }
        ]
      },
      {
        // HIGH: Reallocated sectors warning
        device_id: 'DEV-HIGH-003',
        hostname: 'desktop-india',
        os_family: 'Windows',
        risk_band: 'HIGH',
        metrics: [
          { disk_usage_pct: 65, mem_pressure: 55, cpu_load_avg: 50, disk_smart_status: 'WARNING', 
            disk_reallocated_sectors: 35, crash_count_24h: 0, temperature_celsius: 68,
            agent_heartbeat_gap_minutes: 8 }
        ]
      },
      {
        // MEDIUM: High CPU sustained
        device_id: 'DEV-MEDIUM-003',
        hostname: 'laptop-juliet',
        os_family: 'macOS',
        risk_band: 'MEDIUM',
        metrics: [
          { disk_usage_pct: 55, mem_pressure: 48, cpu_load_avg: 88, disk_smart_status: 'PASSED', 
            disk_reallocated_sectors: 0, crash_count_24h: 0, temperature_celsius: 80,
            battery_health_pct: 75, agent_heartbeat_gap_minutes: 4 }
        ]
      }
    ];

    const results = {
      devices_created: 0,
      metrics_created: 0,
      errors: []
    };

    for (const fixture of fixtures) {
      try {
        // Create device
        await base44.asServiceRole.entities.Device.create({
          organization_id: user.organization_id,
          device_id: fixture.device_id,
          hostname: fixture.hostname,
          os_family: fixture.os_family,
          agent_status: 'online',
          compliance_status: 'pass',
          risk_band: fixture.risk_band
        });
        results.devices_created++;

        // Create metrics (7 days of data with slight variations)
        for (let i = 0; i < 7; i++) {
          const baseMetric = fixture.metrics[0];
          const timestamp = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
          
          // Add realistic variance
          const variance = () => Math.random() * 5 - 2.5;
          
          await base44.asServiceRole.entities.DeviceHealthMetric.create({
            organization_id: user.organization_id,
            device_id: fixture.device_id,
            metric_timestamp: timestamp.toISOString(),
            cpu_load_avg: Math.max(0, Math.min(100, baseMetric.cpu_load_avg + variance())),
            mem_pressure: Math.max(0, Math.min(100, baseMetric.mem_pressure + variance())),
            disk_usage_pct: Math.max(0, Math.min(100, baseMetric.disk_usage_pct + (i * 0.5))), // Trending up
            disk_smart_status: baseMetric.disk_smart_status,
            disk_reallocated_sectors: baseMetric.disk_reallocated_sectors,
            io_wait: Math.random() * 20,
            temperature_celsius: baseMetric.temperature_celsius + variance(),
            battery_health_pct: baseMetric.battery_health_pct || null,
            reboot_count_24h: baseMetric.reboot_count_24h || 0,
            crash_count_24h: baseMetric.crash_count_24h || 0,
            process_anomaly_count: Math.floor(Math.random() * 3),
            network_error_rate: Math.random() * 2,
            agent_heartbeat_gap_minutes: baseMetric.agent_heartbeat_gap_minutes || 2
          });
          results.metrics_created++;
        }

      } catch (error) {
        results.errors.push({ device_id: fixture.device_id, error: error.message });
      }
    }

    return Response.json({
      success: true,
      ...results,
      message: 'Fixture data seeded successfully'
    });

  } catch (error) {
    console.error('Seed error:', error);
    return Response.json({ 
      error: 'Seeding failed',
      details: error.message 
    }, { status: 500 });
  }
});