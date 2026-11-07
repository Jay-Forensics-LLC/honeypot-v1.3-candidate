import { createClientFromRequest } from 'npm:@base44/sdk@0.7.1';
import { jsPDF } from 'npm:jspdf@2.5.1';

/**
 * Generate BLE Scan Report PDF
 * Includes session summary, device list, recurrences, watchlist matches
 */
Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { session_id } = await req.json();

        if (!session_id) {
            return Response.json({ error: 'session_id required' }, { status: 400 });
        }

        // Fetch session (user-scoped RLS)
        const sessions = await base44.entities.ScanSession.filter({ id: session_id });
        
        if (sessions.length === 0) {
            return Response.json({ error: 'Session not found or access denied' }, { status: 404 });
        }

        const session = sessions[0];

        // Fetch observations
        const observations = await base44.entities.Observation.filter({
            session_id: session.session_id
        });

        // Fetch devices
        const devices = await base44.entities.BLEDevice.filter({
            last_seen: { $gte: session.start_timestamp }
        });

        // Fetch anomalies
        const anomalies = await base44.entities.BLEAnomaly.filter({
            detection_timestamp: { $gte: session.start_timestamp }
        });

        // Generate PDF
        const doc = new jsPDF();
        let y = 20;

        // Header
        doc.setFontSize(20);
        doc.text('BLE Scan Report', 20, y);
        y += 10;

        doc.setFontSize(10);
        doc.setTextColor(100);
        doc.text(`Session: ${session.session_id}`, 20, y);
        y += 6;
        doc.text(`Generated: ${new Date().toLocaleString()}`, 20, y);
        y += 6;
        doc.text(`Analyst: ${user.email}`, 20, y);
        y += 15;

        // Session Summary
        doc.setFontSize(14);
        doc.setTextColor(0);
        doc.text('Session Summary', 20, y);
        y += 8;

        doc.setFontSize(10);
        doc.text(`Start: ${new Date(session.start_timestamp).toLocaleString()}`, 25, y);
        y += 6;
        doc.text(`End: ${session.end_timestamp ? new Date(session.end_timestamp).toLocaleString() : 'In Progress'}`, 25, y);
        y += 6;
        doc.text(`Location: ${session.location_tag || 'Unknown'}`, 25, y);
        y += 6;
        doc.text(`Devices Detected: ${session.observation_count || 0}`, 25, y);
        y += 6;
        doc.text(`Anomalies: ${session.anomaly_count || 0}`, 25, y);
        y += 6;
        doc.text(`Risk Score: ${session.risk_score || 0}/100`, 25, y);
        y += 15;

        // Devices Table
        doc.setFontSize(14);
        doc.text('Detected Devices', 20, y);
        y += 10;

        doc.setFontSize(9);
        doc.setTextColor(100);
        doc.text('MAC Address', 20, y);
        doc.text('Name/Type', 70, y);
        doc.text('RSSI', 120, y);
        doc.text('Sightings', 145, y);
        doc.text('Risk', 175, y);
        y += 6;

        doc.setDrawColor(200);
        doc.line(20, y, 190, y);
        y += 4;

        doc.setTextColor(0);
        for (const device of devices.slice(0, 20)) {
            if (y > 270) {
                doc.addPage();
                y = 20;
            }

            const recurrent = (device.total_sightings || 0) > 1;
            const risk = device.threat_assessment?.threat_score || 0;

            doc.text(device.current_mac_address || 'N/A', 20, y);
            doc.text((device.device_type_classification || 'Unknown').substring(0, 20), 70, y);
            doc.text(`${device.detection_history?.[0]?.rssi_dbm || 'N/A'} dBm`, 120, y);
            doc.text(`${device.total_sightings || 1}${recurrent ? ' ⟳' : ''}`, 145, y);
            doc.setTextColor(risk > 70 ? 255 : 0, risk > 70 ? 0 : 200, 0);
            doc.text(`${risk}`, 175, y);
            doc.setTextColor(0);
            y += 6;
        }

        y += 10;

        // Anomalies
        if (anomalies.length > 0) {
            if (y > 240) {
                doc.addPage();
                y = 20;
            }

            doc.setFontSize(14);
            doc.text('Threats & Anomalies', 20, y);
            y += 10;

            doc.setFontSize(9);
            for (const anomaly of anomalies.slice(0, 10)) {
                if (y > 270) {
                    doc.addPage();
                    y = 20;
                }

                doc.setTextColor(255, 0, 0);
                doc.text(`⚠ ${anomaly.anomaly_type}`, 20, y);
                doc.setTextColor(0);
                y += 6;
                doc.text(`MAC: ${anomaly.mac_address || 'N/A'}`, 25, y);
                y += 6;
                doc.text(`Severity: ${anomaly.severity} | Confidence: ${anomaly.confidence_score}%`, 25, y);
                y += 6;
                doc.text(`${(anomaly.anomaly_details?.description || '').substring(0, 80)}`, 25, y);
                y += 10;
            }
        }

        // Footer
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text('Sentinel Forensics | Confidential', 20, 285);
        doc.text(`Page 1 of ${doc.internal.getNumberOfPages()}`, 160, 285);

        // Generate PDF as ArrayBuffer
        const pdfBytes = doc.output('arraybuffer');

        // Upload to storage
        const pdfBlob = new Blob([pdfBytes], { type: 'application/pdf' });
        const uploadResult = await base44.integrations.Core.UploadFile({
            file: pdfBlob
        });

        // Audit log
        await base44.entities.AuditLog.create({
            event_type: 'ble_report_generated',
            severity: 'info',
            description: `BLE scan report generated for session ${session.session_id}`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                session_id: session.session_id,
                pdf_url: uploadResult.file_url
            }
        });

        return Response.json({
            success: true,
            pdf_url: uploadResult.file_url,
            session_id: session.session_id
        });

    } catch (error) {
        console.error('BLE report generation error:', error);
        return Response.json({
            error: 'Report generation failed',
            message: error.message
        }, { status: 500 });
    }
});