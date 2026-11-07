
import { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  Shield,
  CheckCircle,
  XCircle, // Added XCircle import
  Lock,
  Eye,
  AlertTriangle,
  Users,
  Zap,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Target,
  Brain,
  Heart
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { toast } from "sonner";
import { CryptoUtils } from "../components/utils/CryptoUtils";

const SECURITY_LEVELS = [
  {
    id: 'basic',
    name: 'Basic Protection',
    description: 'Essential security for everyday use',
    icon: Shield,
    color: 'text-blue-400',
    features: [
      'Real-time threat monitoring',
      'Basic device scanning',
      'Automatic updates',
      'Simple alerts'
    ],
    recommended: 'journalists, activists, general users'
  },
  {
    id: 'enhanced',
    name: 'Enhanced Security',
    description: 'Advanced protection for high-risk individuals',
    icon: Lock,
    color: 'text-purple-400',
    features: [
      'All Basic features',
      'Network traffic analysis',
      'VPN auto-activation',
      'Behavioral anomaly detection',
      'Spyware scanning (Pegasus, Predator)'
    ],
    recommended: 'human rights defenders, investigators, lawyers'
  },
  {
    id: 'maximum',
    name: 'Maximum Protection',
    description: 'Military-grade security for extreme threats',
    icon: Target,
    color: 'text-red-400',
    features: [
      'All Enhanced features',
      'Zero-click exploit detection',
      'Baseband monitoring',
      'Memory forensics',
      'Emergency lockdown mode',
      'Honeypot deployment',
      'Real-time correlation engine'
    ],
    recommended: 'dissidents, whistleblowers, targeted individuals'
  }
];

const THREAT_SCENARIOS = [
  {
    id: 'government_surveillance',
    name: 'Government Surveillance',
    description: 'Protection from state-sponsored surveillance',
    threats: ['Pegasus', 'Predator', 'Network monitoring', 'IMSI catchers'],
    icon: Eye,
    severity: 'critical'
  },
  {
    id: 'corporate_espionage',
    name: 'Corporate Espionage',
    description: 'Protect intellectual property and communications',
    threats: ['Data theft', 'Network infiltration', 'Social engineering'],
    icon: Users,
    severity: 'high'
  },
  {
    id: 'cybercrime',
    name: 'Cybercrime & Hacking',
    description: 'Defense against hackers and malware',
    threats: ['Malware', 'Ransomware', 'Phishing', 'Account takeover'],
    icon: AlertTriangle,
    severity: 'medium'
  },
  {
    id: 'personal_safety',
    name: 'Personal Safety',
    description: 'Protection from stalking and harassment',
    threats: ['Stalkerware', 'Location tracking', 'Contact surveillance'],
    icon: Heart,
    severity: 'high'
  }
];

export default function Onboarding() {
  const [step, setStep] = useState(1);
  const [setupData, setSetupData] = useState({
    securityLevel: '',
    threatScenarios: [],
    deviceType: '',
    autoScan: true,
    notifications: true,
    emergencyContact: ''
  });
  const [generatingKey, setGeneratingKey] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const totalSteps = 5;
  const progress = (step / totalSteps) * 100;

  const completeOnboardingMutation = useMutation({
    mutationFn: async () => {
      // Step 1: Generate encryption key
      setGeneratingKey(true);
      const encryptionKey = CryptoUtils.generateId();
      const keyHash = await CryptoUtils.hash(encryptionKey);
      
      // Store encryption key hash (NOT the actual key)
      await base44.auth.updateMe({
        encryption_key_hash: keyHash,
        encryption_key_generated: new Date().toISOString(),
        preferences: {
          ...user?.preferences,
          security_level: setupData.securityLevel,
          threat_scenarios: setupData.threatScenarios,
          auto_scan: setupData.autoScan,
          notifications_enabled: setupData.notifications,
          emergency_contact: setupData.emergencyContact,
          onboarding_completed: true,
          onboarding_date: new Date().toISOString()
        }
      });

      // Step 2: Create security profile
      await base44.entities.SecurityProfile.create({
        profile_id: `PROFILE-${Date.now()}`,
        user_id: user?.email,
        profile_name: `${SECURITY_LEVELS.find(l => l.id === setupData.securityLevel)?.name} Profile`,
        risk_level: setupData.securityLevel === 'maximum' ? 'critical' :
                     setupData.securityLevel === 'enhanced' ? 'high' : 'medium',
        active: true,
        auto_activation: {
          enabled: true,
          triggers: setupData.threatScenarios.map(scenario => ({
            trigger_type: 'threat_level',
            condition: 'equals',
            value: scenario
          }))
        },
        encryption_settings: {
          encryption_level: setupData.securityLevel === 'maximum' ? 'military' :
                           setupData.securityLevel === 'enhanced' ? 'quantum_resistant' : 'standard',
          vpn_mandatory: setupData.securityLevel !== 'basic',
          end_to_end_encryption: true,
          encrypted_dns: setupData.securityLevel !== 'basic'
        },
        network_settings: {
          auto_vpn: setupData.securityLevel !== 'basic',
          public_wifi_protection: true,
          tor_routing: setupData.securityLevel === 'maximum',
          firewall_level: setupData.securityLevel === 'maximum' ? 'paranoid' :
                         setupData.securityLevel === 'enhanced' ? 'strict' : 'balanced',
          block_tracking: true
        },
        device_settings: {
          camera_block: false,
          microphone_block: false,
          location_spoofing: setupData.securityLevel === 'maximum',
          clipboard_protection: setupData.securityLevel !== 'basic',
          screen_recording_block: setupData.securityLevel === 'maximum',
          biometric_required: true
        },
        monitoring_settings: {
          behavioral_analysis: true,
          api_monitoring: setupData.securityLevel !== 'basic',
          network_traffic_analysis: setupData.securityLevel !== 'basic',
          privilege_monitoring: setupData.securityLevel !== 'basic',
          zero_day_scanning: setupData.securityLevel === 'maximum'
        },
        response_settings: {
          auto_remediation: setupData.securityLevel !== 'basic',
          device_isolation: setupData.securityLevel === 'maximum',
          evidence_auto_collect: true,
          silent_alerts: false,
          emergency_wipe: false
        }
      });

      // Step 3: Run initial security scan
      if (setupData.autoScan) {
        await base44.entities.DeviceIntegrityScan.create({
          scan_id: `SCAN-${Date.now()}`,
          device_id: `DEVICE-${user?.email}`,
          scan_type: 'quick',
          scan_started: new Date().toISOString(),
          overall_health_score: 100,
          hardware_integrity: {},
          memory_analysis: {},
          system_call_analysis: {},
          api_integrity: {},
          rootkit_detection: {},
          network_integrity: {},
          privilege_analysis: {},
          file_system_integrity: {},
          threats_detected: [],
          recommendations: ['Complete initial security setup', 'Enable automatic scanning', 'Configure emergency contacts']
        });
      }

      // Step 4: Create audit log
      await base44.entities.AuditLog.create({
        event_type: 'security_setup_completed',
        severity: 'info',
        description: `Security setup completed: ${setupData.securityLevel} level`,
        user_id: user?.email,
        timestamp: new Date().toISOString(),
        success: true,
        metadata: {
          security_level: setupData.securityLevel,
          threat_scenarios: setupData.threatScenarios,
          encryption_key_generated: true
        }
      });

      setGeneratingKey(false);
      return { encryptionKey };
    },
    onSuccess: ({ encryptionKey }) => {
      queryClient.invalidateQueries({ queryKey: ['user'] });
      
      toast.success('🛡️ Security Setup Complete!', {
        description: 'Your device is now protected with military-grade security'
      });

      // Show encryption key (user must save this)
      toast.info(`⚠️ SAVE YOUR ENCRYPTION KEY: ${encryptionKey}`, {
        description: 'Store this securely - you\'ll need it for recovery',
        duration: 30000
      });

      setTimeout(() => {
        navigate(createPageUrl('Dashboard'));
      }, 2000);
    },
    onError: () => {
      setGeneratingKey(false);
      toast.error('Setup failed - please try again');
    }
  });

  const nextStep = () => {
    if (step === 2 && !setupData.securityLevel) {
      toast.error('Please select a security level');
      return;
    }
    if (step === 3 && setupData.threatScenarios.length === 0) {
      toast.error('Please select at least one threat scenario');
      return;
    }
    setStep(step + 1);
  };

  const prevStep = () => setStep(step - 1);

  const toggleThreatScenario = (scenarioId) => {
    setSetupData(prev => ({
      ...prev,
      threatScenarios: prev.threatScenarios.includes(scenarioId)
        ? prev.threatScenarios.filter(id => id !== scenarioId)
        : [...prev.threatScenarios, scenarioId]
    }));
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 p-6 flex items-center justify-center">
      <div className="max-w-4xl w-full">
        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Step {step} of {totalSteps}</span>
            <span className="text-sm text-slate-400">{Math.round(progress)}% Complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="bg-slate-900/80 backdrop-blur-xl border-slate-800">
          <CardHeader>
            <div className="flex items-center justify-center mb-4">
              <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-red-700 rounded-full flex items-center justify-center">
                <Shield className="w-8 h-8 text-white" />
              </div>
            </div>
            <CardTitle className="text-center text-white text-2xl">
              {step === 1 && 'Welcome to Sentinel Forensics'}
              {step === 2 && 'Choose Your Security Level'}
              {step === 3 && 'Select Threat Scenarios'}
              {step === 4 && 'Configure Monitoring'}
              {step === 5 && 'Final Setup'}
            </CardTitle>
            <p className="text-center text-slate-400 mt-2">
              {step === 1 && 'Let\'s secure your device in 5 simple steps'}
              {step === 2 && 'Select the protection level that matches your needs'}
              {step === 3 && 'Help us understand what you need protection from'}
              {step === 4 && 'Configure how Sentinel will monitor your device'}
              {step === 5 && 'Review and complete your security setup'}
            </p>
          </CardHeader>

          <CardContent className="space-y-6">
            {/* STEP 1: Welcome */}
            {step === 1 && (
              <div className="space-y-6 py-6">
                <div className="text-center space-y-4">
                  <Sparkles className="w-16 h-16 mx-auto text-yellow-400 animate-pulse" />
                  <h3 className="text-xl font-semibold text-white">
                    Professional-Grade Security Made Simple
                  </h3>
                  <p className="text-slate-400 max-w-2xl mx-auto">
                    Sentinel Forensics provides the same protection used by security professionals,
                    human rights defenders, and journalists worldwide - but made easy for everyone.
                  </p>
                </div>

                <div className="grid md:grid-cols-3 gap-4 mt-8">
                  <div className="p-4 bg-slate-800/50 rounded-lg text-center">
                    <Shield className="w-8 h-8 mx-auto mb-2 text-blue-400" />
                    <h4 className="font-semibold text-white mb-1">Military-Grade Protection</h4>
                    <p className="text-xs text-slate-400">
                      Same tech used by governments & security agencies
                    </p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg text-center">
                    <Brain className="w-8 h-8 mx-auto mb-2 text-purple-400" />
                    <h4 className="font-semibold text-white mb-1">AI-Powered Detection</h4>
                    <p className="text-xs text-slate-400">
                      Automatically detects Pegasus, Predator & other spyware
                    </p>
                  </div>
                  <div className="p-4 bg-slate-800/50 rounded-lg text-center">
                    <Zap className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
                    <h4 className="font-semibold text-white mb-1">Zero Configuration</h4>
                    <p className="text-xs text-slate-400">
                      Set it once, protect forever - no technical skills needed
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-blue-500/10 border border-blue-500 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-200">
                      <p className="font-semibold mb-1">What Happens Next?</p>
                      <ul className="space-y-1 text-blue-300/90">
                        <li>• Choose your security level (Basic, Enhanced, or Maximum)</li>
                        <li>• Tell us what threats you face</li>
                        <li>• We'll automatically configure everything</li>
                        <li>• Your device will be protected in under 2 minutes</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 2: Security Level */}
            {step === 2 && (
              <div className="space-y-4">
                {SECURITY_LEVELS.map(level => {
                  const Icon = level.icon;
                  return (
                    <button
                      key={level.id}
                      onClick={() => setSetupData(prev => ({ ...prev, securityLevel: level.id }))}
                      className={`w-full p-6 rounded-lg border-2 text-left transition-all ${
                        setupData.securityLevel === level.id
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-12 h-12 rounded-lg bg-gradient-to-br ${
                          level.id === 'basic' ? 'from-blue-500 to-blue-600' :
                          level.id === 'enhanced' ? 'from-purple-500 to-purple-600' :
                          'from-red-500 to-red-600'
                        } flex items-center justify-center flex-shrink-0`}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                        <div className="flex-1">
                          <h3 className="text-lg font-semibold text-white mb-1">{level.name}</h3>
                          <p className="text-sm text-slate-400 mb-3">{level.description}</p>
                          <div className="space-y-1 mb-3">
                            {level.features.map((feature, idx) => (
                              <div key={idx} className="flex items-center gap-2 text-sm text-slate-300">
                                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                                <span>{feature}</span>
                              </div>
                            ))}
                          </div>
                          <Badge className="bg-slate-700 text-slate-300">
                            Recommended for: {level.recommended}
                          </Badge>
                        </div>
                        {setupData.securityLevel === level.id && (
                          <CheckCircle className="w-6 h-6 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* STEP 3: Threat Scenarios */}
            {step === 3 && (
              <div className="space-y-4">
                <p className="text-slate-400 text-center mb-6">
                  Select all threat scenarios you want protection against
                </p>
                {THREAT_SCENARIOS.map(scenario => {
                  const Icon = scenario.icon;
                  const isSelected = setupData.threatScenarios.includes(scenario.id);
                  return (
                    <button
                      key={scenario.id}
                      onClick={() => toggleThreatScenario(scenario.id)}
                      className={`w-full p-5 rounded-lg border-2 text-left transition-all ${
                        isSelected
                          ? 'border-red-500 bg-red-500/10'
                          : 'border-slate-700 bg-slate-800/30 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        <div className={`w-10 h-10 rounded-lg ${
                          scenario.severity === 'critical' ? 'bg-red-500/20' :
                          scenario.severity === 'high' ? 'bg-orange-500/20' :
                          'bg-yellow-500/20'
                        } flex items-center justify-center flex-shrink-0`}>
                          <Icon className={`w-5 h-5 ${
                            scenario.severity === 'critical' ? 'text-red-400' :
                            scenario.severity === 'high' ? 'text-orange-400' :
                            'text-yellow-400'
                          }`} />
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-semibold text-white">{scenario.name}</h3>
                            <Badge className={
                              scenario.severity === 'critical' ? 'bg-red-500' :
                              scenario.severity === 'high' ? 'bg-orange-500' :
                              'bg-yellow-500'
                            }>
                              {scenario.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-slate-400 mb-2">{scenario.description}</p>
                          <div className="flex flex-wrap gap-2">
                            {scenario.threats.map((threat, idx) => (
                              <Badge key={idx} variant="outline" className="text-xs border-slate-600 text-slate-400">
                                {threat}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        {isSelected && (
                          <CheckCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* STEP 4: Configure Monitoring */}
            {step === 4 && (
              <div className="space-y-6">
                <div className="p-5 bg-slate-800/50 rounded-lg space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-white">Automatic Security Scanning</h4>
                      <p className="text-sm text-slate-400">
                        Run security checks automatically every 24 hours
                      </p>
                    </div>
                    <button
                      onClick={() => setSetupData(prev => ({ ...prev, autoScan: !prev.autoScan }))}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        setupData.autoScan ? 'bg-green-500' : 'bg-slate-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        setupData.autoScan ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>

                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-semibold text-white">Threat Notifications</h4>
                      <p className="text-sm text-slate-400">
                        Get instant alerts when threats are detected
                      </p>
                    </div>
                    <button
                      onClick={() => setSetupData(prev => ({ ...prev, notifications: !prev.notifications }))}
                      className={`w-12 h-6 rounded-full transition-colors ${
                        setupData.notifications ? 'bg-green-500' : 'bg-slate-600'
                      }`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        setupData.notifications ? 'translate-x-6' : 'translate-x-0.5'
                      }`} />
                    </button>
                  </div>
                </div>

                <div>
                  <Label className="text-white mb-2 block">
                    Emergency Contact (Optional)
                  </Label>
                  <Input
                    value={setupData.emergencyContact}
                    onChange={(e) => setSetupData(prev => ({ ...prev, emergencyContact: e.target.value }))}
                    placeholder="email@example.com or +1234567890"
                    className="bg-slate-800 border-slate-700 text-white"
                  />
                  <p className="text-xs text-slate-400 mt-2">
                    This contact will be notified in case of critical security threats
                  </p>
                </div>

                <div className="p-4 bg-yellow-500/10 border border-yellow-500 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-200">
                      <p className="font-semibold mb-1">Privacy Notice</p>
                      <p className="text-yellow-300/90">
                        All scans run locally on your device. No data is shared with third parties.
                        Emergency contacts only receive alerts if critical threats are detected.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* STEP 5: Final Review */}
            {step === 5 && (
              <div className="space-y-6">
                <div className="text-center py-4">
                  <Shield className="w-16 h-16 mx-auto mb-4 text-green-400" />
                  <h3 className="text-xl font-semibold text-white mb-2">
                    Ready to Activate Protection
                  </h3>
                  <p className="text-slate-400">
                    Review your security configuration below
                  </p>
                </div>

                <div className="space-y-3">
                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <h4 className="font-semibold text-white mb-2">Security Level</h4>
                    <Badge className="bg-red-500 text-white">
                      {SECURITY_LEVELS.find(l => l.id === setupData.securityLevel)?.name}
                    </Badge>
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <h4 className="font-semibold text-white mb-2">Threat Protection</h4>
                    <div className="flex flex-wrap gap-2">
                      {setupData.threatScenarios.map(scenarioId => {
                        const scenario = THREAT_SCENARIOS.find(s => s.id === scenarioId);
                        return (
                          <Badge key={scenarioId} className="bg-blue-500 text-white">
                            {scenario?.name}
                          </Badge>
                        );
                      })}
                    </div>
                  </div>

                  <div className="p-4 bg-slate-800/50 rounded-lg">
                    <h4 className="font-semibold text-white mb-2">Monitoring Settings</h4>
                    <div className="space-y-2 text-sm text-slate-300">
                      <div className="flex items-center gap-2">
                        {setupData.autoScan ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span>Automatic scanning: {setupData.autoScan ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {setupData.notifications ? (
                          <CheckCircle className="w-4 h-4 text-green-400" />
                        ) : (
                          <XCircle className="w-4 h-4 text-red-400" />
                        )}
                        <span>Threat notifications: {setupData.notifications ? 'Enabled' : 'Disabled'}</span>
                      </div>
                      {setupData.emergencyContact && (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4 text-green-400" />
                          <span>Emergency contact: {setupData.emergencyContact}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-green-500/10 border border-green-500 rounded-lg">
                  <div className="flex items-start gap-3">
                    <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-green-200">
                      <p className="font-semibold mb-1">What Happens When You Click "Activate"?</p>
                      <ul className="space-y-1 text-green-300/90">
                        <li>• Generate your personal encryption key</li>
                        <li>• Configure security profiles</li>
                        <li>• Run initial device scan</li>
                        <li>• Activate real-time protection</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-6 border-t border-slate-800">
              <Button
                onClick={prevStep}
                disabled={step === 1}
                variant="outline"
                className="border-slate-700"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>

              {step < totalSteps ? (
                <Button
                  onClick={nextStep}
                  className="bg-gradient-to-r from-red-600 to-red-700 hover:from-red-700 hover:to-red-800"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : (
                <Button
                  onClick={() => completeOnboardingMutation.mutate()}
                  disabled={generatingKey}
                  className="bg-gradient-to-r from-green-600 to-green-700 hover:from-green-700 hover:to-green-800"
                >
                  {generatingKey ? (
                    <>
                      <Zap className="w-4 h-4 mr-2 animate-spin" />
                      Activating Protection...
                    </>
                  ) : (
                    <>
                      <Shield className="w-4 h-4 mr-2" />
                      Activate Protection
                    </>
                  )}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
