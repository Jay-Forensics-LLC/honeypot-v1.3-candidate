import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { 
  Shield, ArrowRight, ArrowLeft, Check, 
  Search, Activity, Network, Loader2, CheckCircle
} from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '../components/utils';

export default function QuickStartWizard() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [goal, setGoal] = useState('');
  const [scanTarget, setScanTarget] = useState('');
  const [scanComplete, setScanComplete] = useState(false);

  const goals = [
    { id: 'device_check', label: 'Check my device for suspicious changes', icon: Shield },
    { id: 'privacy_baseline', label: 'Run a privacy baseline scan', icon: Search },
    { id: 'incident_response', label: "I'm responding to an incident", icon: Activity }
  ];

  const scanTargets = [
    { id: 'browser', label: 'Browser & extensions', icon: Search, page: 'IOSDiagnostics' },
    { id: 'startup', label: 'Startup items / persistence', icon: Activity, page: 'Devices' },
    { id: 'network', label: 'Network indicators', icon: Network, page: 'NetworkMonitor' }
  ];

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      await base44.auth.updateMe({
        onboarding_completed: true
      });
    },
    onSuccess: () => {
      const selectedTarget = scanTargets.find(t => t.id === scanTarget);
      navigate(createPageUrl(selectedTarget?.page || 'App'));
    }
  });

  const handleRunScan = async () => {
    setScanComplete(false);
    toast.info('Running first scan...', { duration: 1500 });
    
    // Simulate scan
    setTimeout(() => {
      setScanComplete(true);
      toast.success('Scan complete! Check results below.');
    }, 2000);
  };

  const progress = (step / 3) * 100;

  return (
    <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
      <div className="max-w-2xl w-full space-y-6">
        {/* Progress */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-slate-400">Step {step} of 3</span>
            <span className="text-slate-400">{Math.round(progress)}% complete</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>

        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-2xl">
              {step === 1 && 'Select Your Goal'}
              {step === 2 && 'Pick What to Scan First'}
              {step === 3 && 'Run Your First Scan'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Step 1: Select Goal */}
            {step === 1 && (
              <div className="space-y-3">
                {goals.map((g) => {
                  const Icon = g.icon;
                  return (
                    <button
                      key={g.id}
                      onClick={() => setGoal(g.id)}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        goal === g.id
                          ? 'border-blue-500 bg-blue-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          goal === g.id ? 'bg-blue-500/20' : 'bg-slate-800'
                        }`}>
                          <Icon className={`w-5 h-5 ${goal === g.id ? 'text-blue-400' : 'text-slate-400'}`} />
                        </div>
                        <span className={`font-medium ${goal === g.id ? 'text-blue-300' : 'text-white'}`}>
                          {g.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 2: Pick Scan Target */}
            {step === 2 && (
              <div className="space-y-3">
                {scanTargets.map((target) => {
                  const Icon = target.icon;
                  return (
                    <button
                      key={target.id}
                      onClick={() => setScanTarget(target.id)}
                      className={`w-full p-4 rounded-lg border-2 text-left transition-all ${
                        scanTarget === target.id
                          ? 'border-purple-500 bg-purple-500/10'
                          : 'border-slate-700 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                          scanTarget === target.id ? 'bg-purple-500/20' : 'bg-slate-800'
                        }`}>
                          <Icon className={`w-5 h-5 ${scanTarget === target.id ? 'text-purple-400' : 'text-slate-400'}`} />
                        </div>
                        <span className={`font-medium ${scanTarget === target.id ? 'text-purple-300' : 'text-white'}`}>
                          {target.label}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Step 3: Run Scan */}
            {step === 3 && (
              <div className="space-y-4">
                <div className="p-6 bg-slate-800/50 rounded-lg text-center space-y-4">
                  {!scanComplete ? (
                    <>
                      <Shield className="w-16 h-16 text-blue-400 mx-auto" />
                      <div>
                        <h3 className="text-lg font-semibold text-white mb-2">Ready to scan</h3>
                        <p className="text-sm text-slate-400">
                          We'll check {scanTargets.find(t => t.id === scanTarget)?.label.toLowerCase()} for issues.
                        </p>
                      </div>
                      <Button
                        size="lg"
                        className="bg-blue-600 hover:bg-blue-700"
                        onClick={handleRunScan}
                      >
                        Run First Scan
                      </Button>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
                      <div>
                        <h3 className="text-lg font-semibold text-green-400 mb-2">Scan Complete!</h3>
                        <p className="text-sm text-slate-300 mb-4">
                          Your device looks secure. No critical issues detected.
                        </p>
                        <div className="space-y-2 text-left">
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-green-400" />
                            No suspicious processes found
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-green-400" />
                            Firewall is enabled
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-300">
                            <Check className="w-4 h-4 text-green-400" />
                            No network anomalies
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {scanComplete && (
                  <div className="p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
                    <p className="text-sm text-blue-300">
                      <strong>What this means:</strong> Your system is following security best practices. 
                      You can now explore the full dashboard to run deeper scans or investigate specific areas.
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Navigation Buttons */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-800">
              <Button
                variant="outline"
                onClick={() => step > 1 ? setStep(step - 1) : navigate(createPageUrl('WelcomeOnboarding'))}
                className="border-slate-700"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back
              </Button>
              
              {step < 3 ? (
                <Button
                  onClick={() => setStep(step + 1)}
                  disabled={
                    (step === 1 && !goal) || 
                    (step === 2 && !scanTarget)
                  }
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  Continue
                  <ArrowRight className="w-4 h-4 ml-2" />
                </Button>
              ) : scanComplete ? (
                <Button
                  onClick={() => completeOnboarding.mutate()}
                  disabled={completeOnboarding.isPending}
                  className="bg-green-600 hover:bg-green-700"
                >
                  {completeOnboarding.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      Go to Dashboard
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              ) : null}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}