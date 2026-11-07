import React from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertTriangle, Shield, Info } from 'lucide-react';

/**
 * CRITICAL LEGAL DISCLAIMER FOR MDM FEATURES
 * 
 * COMPLIANCE REQUIREMENTS:
 * - ECPA (Electronic Communications Privacy Act)
 * - CFAA (Computer Fraud and Abuse Act)
 * - GDPR (if EU users)
 * - State wiretapping laws
 * - Corporate policy disclosure requirements
 */

export default function MDMLegalDisclaimer({ compact = false }) {
  if (compact) {
    return (
      <Alert className="bg-red-900/20 border-red-500/50">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <AlertDescription className="text-red-200 text-sm">
          <strong>⚖️ LEGAL NOTICE:</strong> This tool is for authorized forensic investigation and device inventory only. 
          Unauthorized device monitoring is illegal. <a href="#full-terms" className="underline">Read full terms</a>.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* CRITICAL WARNING */}
      <Alert className="bg-red-900/30 border-red-500/70">
        <AlertTriangle className="h-6 w-6 text-red-400" />
        <AlertDescription className="text-red-100">
          <div className="space-y-3">
            <h3 className="text-xl font-bold text-red-300">⚖️ MANDATORY LEGAL NOTICE</h3>
            
            <div className="space-y-2 text-sm">
              <p className="font-semibold text-red-200">
                THIS IS A FORENSIC INVESTIGATION TOOL, NOT FULL MDM
              </p>
              
              <ul className="list-disc ml-6 space-y-1 text-red-200">
                <li><strong>Device Control:</strong> This system tracks device metadata and provides inventory management. 
                It does NOT install MDM profiles or provide remote device control without explicit integration with authorized MDM providers.</li>
                
                <li><strong>Consent Required:</strong> You MUST have explicit written consent from device owners before enrollment. 
                Unauthorized monitoring violates federal and state wiretapping laws.</li>
                
                <li><strong>Employment Context:</strong> Corporate device monitoring requires clear written policy disclosure and employee acknowledgment. 
                Consult legal counsel before deployment.</li>
                
                <li><strong>Personal Relationships:</strong> Spousal surveillance without consent is illegal in all 50 U.S. states and most jurisdictions worldwide.</li>
                
                <li><strong>Data Retention:</strong> You are responsible for compliance with data protection laws (GDPR, CCPA, etc.) regarding collected device data.</li>
              </ul>
            </div>
          </div>
        </AlertDescription>
      </Alert>

      {/* COMPLIANCE CHECKLIST */}
      <Alert className="bg-yellow-900/20 border-yellow-500/50">
        <Shield className="h-5 w-5 text-yellow-400" />
        <AlertDescription className="text-yellow-100 text-sm">
          <h4 className="font-semibold mb-2 text-yellow-300">✅ Required Before Enrollment:</h4>
          <ol className="list-decimal ml-6 space-y-1">
            <li>Written consent from device owner (stored securely)</li>
            <li>Clear disclosure of what data is collected</li>
            <li>Documentation of legitimate forensic/investigative purpose</li>
            <li>Compliance with organizational privacy policy</li>
            <li>Legal review if used in employment or litigation context</li>
          </ol>
        </AlertDescription>
      </Alert>

      {/* TECHNICAL LIMITATIONS */}
      <Alert className="bg-blue-900/20 border-blue-500/50">
        <Info className="h-5 w-5 text-blue-400" />
        <AlertDescription className="text-blue-100 text-sm">
          <h4 className="font-semibold mb-2 text-blue-300">🔧 Technical Capabilities:</h4>
          <p className="mb-2">This system provides:</p>
          <ul className="list-disc ml-6 space-y-1">
            <li><strong>Device Inventory:</strong> Track device metadata, enrollment status, and security posture</li>
            <li><strong>Security Scanning:</strong> Detect MDM profiles, jailbreak/root, and security misconfigurations</li>
            <li><strong>Evidence Collection:</strong> Document device state for forensic purposes</li>
          </ul>
          
          <p className="mt-3 mb-2">This system does NOT provide:</p>
          <ul className="list-disc ml-6 space-y-1">
            <li>Remote device locking or wiping (requires MDM integration)</li>
            <li>Real-time surveillance or location tracking</li>
            <li>Screen recording or keystroke logging</li>
            <li>Automatic enforcement of security policies</li>
          </ul>
          
          <p className="mt-3 font-semibold text-blue-200">
            For full MDM capabilities, integrate with authorized providers (Jamf, Intune, MobileIron) via enterprise settings.
          </p>
        </AlertDescription>
      </Alert>

      {/* PROHIBITED USES */}
      <Alert className="bg-purple-900/20 border-purple-500/50">
        <AlertTriangle className="h-5 w-5 text-purple-400" />
        <AlertDescription className="text-purple-100 text-sm">
          <h4 className="font-semibold mb-2 text-purple-300">🚫 Prohibited Uses:</h4>
          <ul className="list-disc ml-6 space-y-1">
            <li>Monitoring devices without owner knowledge and consent</li>
            <li>Spousal surveillance or relationship monitoring</li>
            <li>Stalking, harassment, or coercion</li>
            <li>Unlawful interception of communications</li>
            <li>Circumventing legitimate MDM removal attempts</li>
            <li>Any use violating local, state, or federal law</li>
          </ul>
        </AlertDescription>
      </Alert>

      {/* ACKNOWLEDGMENT */}
      <div className="bg-slate-800/50 border border-slate-700 rounded-lg p-4">
        <p className="text-sm text-slate-300">
          <strong className="text-white">By using this feature, you acknowledge:</strong>
        </p>
        <ol className="list-decimal ml-6 mt-2 space-y-1 text-xs text-slate-400">
          <li>You have read and understood the legal requirements and limitations</li>
          <li>You have obtained proper consent from all enrolled device owners</li>
          <li>You are using this tool for legitimate forensic investigation purposes</li>
          <li>You accept full legal responsibility for compliance with applicable laws</li>
          <li>You will not use this tool for any prohibited purpose</li>
        </ol>
      </div>

      {/* CONTACT */}
      <p className="text-xs text-slate-500 text-center">
        Questions about legal compliance? Contact your legal department or consult with a privacy attorney. 
        This software is provided "as is" without warranty. Users bear all legal responsibility for lawful use.
      </p>
    </div>
  );
}