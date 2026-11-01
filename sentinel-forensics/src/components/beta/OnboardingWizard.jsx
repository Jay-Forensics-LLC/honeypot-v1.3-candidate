import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CheckCircle, Circle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

const ONBOARDING_STEPS = [
  {
    id: 'role_select',
    name: 'Select Your Role',
    description: 'Help us customize your experience'
  },
  {
    id: 'create_case',
    name: 'Create First Case',
    description: 'Set up your first investigation'
  },
  {
    id: 'upload_evidence',
    name: 'Upload Evidence',
    description: 'Add your first piece of evidence'
  },
  {
    id: 'explore_features',
    name: 'Feature Tour',
    description: 'Discover key capabilities'
  },
  {
    id: 'invite_team',
    name: 'Invite Team Members',
    description: 'Collaborate with your team'
  }
];

export default function OnboardingWizard({ onComplete }) {
  const [currentStep, setCurrentStep] = useState(0);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: completedSteps = [] } = useQuery({
    queryKey: ['onboarding-steps', user?.email],
    queryFn: () => base44.entities.OnboardingStep.filter({ 
      user_email: user.email 
    }),
    enabled: !!user
  });

  const completeStepMutation = useMutation({
    mutationFn: async (stepId) => {
      const step = ONBOARDING_STEPS.find(s => s.id === stepId);
      
      await base44.entities.OnboardingStep.create({
        organization_id: user.organization_id,
        user_email: user.email,
        step_id: stepId,
        step_name: step.name,
        completed: true,
        completed_at: new Date().toISOString()
      });

      // Track event
      await base44.functions.invoke('trackBetaEvent', {
        event_type: 'onboarding_step',
        event_name: stepId,
        route: '/onboarding',
        metadata: { step_index: ONBOARDING_STEPS.findIndex(s => s.id === stepId) }
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['onboarding-steps'] });
      
      if (currentStep < ONBOARDING_STEPS.length - 1) {
        setCurrentStep(currentStep + 1);
      } else {
        // Mark onboarding as complete
        const profile = queryClient.getQueryData(['beta-profile', user.email]);
        if (profile?.[0]) {
          base44.entities.UserBetaProfile.update(profile[0].id, {
            onboarding_completed: true,
            onboarding_completed_at: new Date().toISOString()
          });
        }
        toast.success('Onboarding complete!');
        onComplete?.();
      }
    }
  });

  const isStepCompleted = (stepId) => {
    return completedSteps.some(s => s.step_id === stepId && s.completed);
  };

  const progress = (completedSteps.length / ONBOARDING_STEPS.length) * 100;

  return (
    <Card className="bg-slate-900/50 border-slate-800 max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle className="text-white">Welcome to Sentinel Forensics Beta</CardTitle>
        <Progress value={progress} className="mt-4" />
        <p className="text-sm text-slate-400 mt-2">
          {completedSteps.length} of {ONBOARDING_STEPS.length} steps completed
        </p>
      </CardHeader>

      <CardContent className="space-y-4">
        {ONBOARDING_STEPS.map((step, index) => {
          const completed = isStepCompleted(step.id);
          const isCurrent = index === currentStep;

          return (
            <Card
              key={step.id}
              className={`${
                isCurrent ? 'bg-blue-900/20 border-blue-500/50' : 'bg-slate-800/50 border-slate-700'
              } ${completed ? 'opacity-60' : ''}`}
            >
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  {completed ? (
                    <CheckCircle className="w-6 h-6 text-green-400" />
                  ) : (
                    <Circle className="w-6 h-6 text-slate-500" />
                  )}
                  <div>
                    <h4 className="text-white font-semibold">{step.name}</h4>
                    <p className="text-sm text-slate-400">{step.description}</p>
                  </div>
                </div>

                {isCurrent && !completed && (
                  <Button
                    onClick={() => completeStepMutation.mutate(step.id)}
                    disabled={completeStepMutation.isPending}
                    className="bg-blue-600 hover:bg-blue-700"
                  >
                    {completeStepMutation.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      'Complete'
                    )}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}

        <div className="flex justify-between mt-6">
          <Button
            variant="outline"
            onClick={() => setCurrentStep(Math.max(0, currentStep - 1))}
            disabled={currentStep === 0}
            className="border-slate-700"
          >
            Previous
          </Button>
          <Button
            onClick={() => setCurrentStep(Math.min(ONBOARDING_STEPS.length - 1, currentStep + 1))}
            disabled={currentStep === ONBOARDING_STEPS.length - 1}
            className="bg-blue-600 hover:bg-blue-700"
          >
            Next
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}