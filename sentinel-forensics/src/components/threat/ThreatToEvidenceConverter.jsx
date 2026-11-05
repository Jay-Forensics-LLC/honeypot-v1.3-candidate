import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { FileText, CheckCircle, AlertTriangle } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import { formatForEvidence } from './ThreatDataMapper';
import { logForensicEvent, ForensicEventTypes } from '../forensics/ForensicLogger';

/**
 * THREAT TO EVIDENCE CONVERTER
 * Convert detected threats to evidence records with remediation
 */
export function ThreatToEvidenceConverter({ threat, onConverted }) {
  const [converting, setConverting] = React.useState(false);
  const [converted, setConverted] = React.useState(false);

  async function handleConvert() {
    setConverting(true);

    try {
      const user = await base44.auth.me();
      const evidenceData = formatForEvidence(threat);

      // Create evidence record
      const evidence = await base44.entities.EvidenceV2.create({
        ...evidenceData,
        organization_id: user.organization_id,
        collected_date: new Date().toISOString(),
        source: 'Threat Intelligence',
        integrity_verified: true
      });

      // Log forensic event
      await logForensicEvent(ForensicEventTypes.EVIDENCE_UPLOAD, {
        evidenceId: evidence.id,
        source: 'threat_intelligence',
        indicator: threat.indicator,
        threatScore: threat.threatScore
      });

      setConverted(true);
      toast.success('Threat added as evidence');

      if (onConverted) {
        onConverted(evidence);
      }
    } catch (error) {
      console.error('Failed to convert threat to evidence:', error);
      toast.error('Failed to add evidence');
    } finally {
      setConverting(false);
    }
  }

  return (
    <div className="flex items-center gap-2">
      {!converted ? (
        <Button
          size="sm"
          onClick={handleConvert}
          disabled={converting}
          className="bg-blue-600 hover:bg-blue-700"
        >
          <FileText className="w-4 h-4 mr-2" />
          {converting ? 'Adding...' : 'Add as Evidence'}
        </Button>
      ) : (
        <Badge variant="outline" className="text-green-400 border-green-500/30">
          <CheckCircle className="w-3 h-3 mr-1" />
          Added to Evidence
        </Badge>
      )}
    </div>
  );
}

/**
 * REMEDIATION STEPS COMPONENT
 */
export function RemediationSteps({ threat }) {
  const steps = getRemediationSteps(threat);

  if (!steps || steps.length === 0) return null;

  return (
    <Card className="bg-orange-950/20 border-orange-500/30">
      <CardContent className="pt-6">
        <div className="flex items-start gap-3 mb-4">
          <AlertTriangle className="w-5 h-5 text-orange-400 mt-0.5" />
          <div>
            <h3 className="text-sm font-semibold text-orange-300 mb-1">
              Remediation Steps
            </h3>
            <p className="text-xs text-orange-200">
              Follow these steps to address this threat
            </p>
          </div>
        </div>

        <ol className="space-y-3 ml-8">
          {steps.map((step, idx) => (
            <li key={idx} className="text-sm text-slate-300">
              <span className="font-semibold text-orange-400">{idx + 1}.</span> {step}
            </li>
          ))}
        </ol>

        {threat.severity === 'critical' && (
          <div className="mt-4 p-3 bg-red-950/30 border border-red-500/30 rounded">
            <p className="text-xs text-red-300 font-semibold">
              ⚠️ CRITICAL: Immediate action required. Consider isolating affected systems.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Get remediation steps based on threat
 */
function getRemediationSteps(threat) {
  const steps = [];

  if (threat.indicatorType === 'ip') {
    steps.push('Block the IP address in your firewall');
    steps.push('Review logs for any connections to/from this IP');
    steps.push('Check all systems that communicated with this IP');
    
    if (threat.threatScore > 70) {
      steps.push('Isolate affected systems from the network');
      steps.push('Run full malware scan on affected systems');
      steps.push('Reset passwords for any accounts accessed from affected systems');
    }
    
    steps.push('Monitor for any future connection attempts');
    steps.push('Document the incident in your security log');
  } else if (threat.indicatorType === 'domain') {
    steps.push('Block the domain in DNS/proxy servers');
    steps.push('Check browser history for visits to this domain');
    steps.push('Scan systems for malware that may have been downloaded');
    
    if (threat.threatScore > 70) {
      steps.push('Quarantine any files downloaded from this domain');
      steps.push('Run full system scans on all affected machines');
      steps.push('Review email logs for phishing attempts from this domain');
    }
    
    steps.push('Update threat intelligence feeds');
    steps.push('Train users on identifying malicious domains');
  }

  // Add confidence-based steps
  if (threat.confidence === 'low') {
    steps.push('⚠️ Note: Low confidence - verify threat before taking aggressive action');
  }

  return steps;
}