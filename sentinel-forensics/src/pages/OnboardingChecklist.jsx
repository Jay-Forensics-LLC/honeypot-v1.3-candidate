import { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  CheckCircle,
  Shield,
  Database,
  Bell,
  FileText,
  ChevronRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../components/utils';

const ONBOARDING_STEPS = [
  {
    id: 'create_first_case',
    title: 'Create Your First Case',
    description: 'Start tracking an investigation',
    icon: FileText,
    link: 'Cases',
    checkFn: async () => {
      const cases = await base44.entities.Case.list('-created_date', 1);
      return cases.length > 0;
    }
  },
  {
    id: 'upload_evidence',
    title: 'Upload Evidence',
    description: 'Secure your first piece of digital evidence',
    icon: Database,
    link: 'Evidence',
    checkFn: async () => {
      const evidence = await base44.entities.EvidenceV2.list('-created_date', 1);
      return evidence.length > 0;
    }
  },
  {
    id: 'enroll_device',
    title: 'Enroll a Device',
    description: 'Connect a device for monitoring',
    icon: Shield,
    link: 'Devices',
    checkFn: async () => {
      const devices = await base44.entities.Device.list('-created_date', 1);
      return devices.length > 0;
    }
  },
  {
    id: 'setup_mfa',
    title: 'Enable Two-Factor Auth',
    description: 'Secure your account with 2FA',
    icon: Shield,
    link: 'MFASetup',
    checkFn: async () => {
      const user = await base44.auth.me();
      return user?.mfa_enabled === true;
    }
  },
  {
    id: 'configure_alerts',
    title: 'Set Up Security Alerts',
    description: 'Get notified of threats',
    icon: Bell,
    link: 'ThreatDetection',
    checkFn: async () => {
      const rules = await base44.entities.DetectionRule.list('-created_date', 1);
      return rules.length > 0;
    }
  }
];

export default function OnboardingChecklist() {
  const [completionStatus, setCompletionStatus] = useState({});
  const [checking, setChecking] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: onboardingData } = useQuery({
    queryKey: ['onboarding-status'],
    queryFn: async () => {
      try {
        const records = await base44.entities.UserOnboarding.filter({ user_email: user?.email });
        return records[0] || null;
      } catch {
        return null;
      }
    },
    enabled: !!user,
  });

  const updateOnboardingMutation = useMutation({
    mutationFn: async (updates) => {
      if (onboardingData?.id) {
        return base44.entities.UserOnboarding.update(onboardingData.id, updates);
      } else {
        return base44.entities.UserOnboarding.create({
          user_email: user?.email,
          ...updates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-status'] });
    }
  });

  const checkProgress = async () => {
    setChecking(true);
    const status = {};
    
    for (const step of ONBOARDING_STEPS) {
      try {
        status[step.id] = await step.checkFn();
      } catch (error) {
        status[step.id] = false;
      }
    }
    
    setCompletionStatus(status);
    
    const completed = Object.keys(status).filter(k => status[k]);
    const progress = (completed.length / ONBOARDING_STEPS.length) * 100;
    
    await updateOnboardingMutation.mutateAsync({
      onboarding_status: progress === 100 ? 'completed' : 'in_progress',
      steps_completed: completed,
      progress_percentage: Math.round(progress)
    });
    
    setChecking(false);
    
    if (progress === 100) {
      toast.success('Onboarding complete! 🎉');
    }
  };

  useEffect(() => {
    if (user) {
      checkProgress();
    }
  }, [user]);

  const completedSteps = Object.values(completionStatus).filter(Boolean).length;
  const progress = (completedSteps / ONBOARDING_STEPS.length) * 100;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Getting Started</h1>
        <p className="text-slate-400">Complete these steps to unlock the full power of Sentinel Forensics</p>
      </div>

      {/* Progress Card */}
      <Card className="bg-gradient-to-br from-blue-900/20 to-purple-900/20 border-blue-500/30">
        <CardContent className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-xl font-bold text-white">Your Progress</h3>
              <p className="text-sm text-slate-300">
                {completedSteps} of {ONBOARDING_STEPS.length} steps completed
              </p>
            </div>
            <div className="text-3xl font-bold text-white">
              {Math.round(progress)}%
            </div>
          </div>
          <Progress value={progress} className="h-2" />
        </CardContent>
      </Card>

      {/* Steps List */}
      <div className="space-y-3">
        {ONBOARDING_STEPS.map((step, idx) => {
          const Icon = step.icon;
          const isComplete = completionStatus[step.id];
          
          return (
            <Card key={step.id} className={`bg-slate-900/50 border-slate-800 hover:border-blue-500/50 transition-all ${
              isComplete ? 'border-green-500/30' : ''
            }`}>
              <CardContent className="p-4">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    isComplete ? 'bg-green-500/20' : 'bg-slate-700/50'
                  }`}>
                    {isComplete ? (
                      <CheckCircle className="w-6 h-6 text-green-400" />
                    ) : (
                      <Icon className="w-6 h-6 text-slate-400" />
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono text-slate-500">
                        Step {idx + 1}
                      </span>
                      {isComplete && (
                        <Badge className="bg-green-500/20 text-green-400 text-xs">
                          Complete
                        </Badge>
                      )}
                    </div>
                    <h4 className="font-semibold text-white">{step.title}</h4>
                    <p className="text-sm text-slate-400">{step.description}</p>
                  </div>
                  
                  {!isComplete && (
                    <Link to={createPageUrl(step.link)}>
                      <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                        Start
                        <ChevronRight className="w-4 h-4 ml-1" />
                      </Button>
                    </Link>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Refresh Button */}
      <div className="flex justify-center">
        <Button
          onClick={checkProgress}
          disabled={checking}
          variant="outline"
          className="border-slate-700"
        >
          {checking ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Checking Progress...
            </>
          ) : (
            <>
              <CheckCircle className="w-4 h-4 mr-2" />
              Refresh Progress
            </>
          )}
        </Button>
      </div>
    </div>
  );
}