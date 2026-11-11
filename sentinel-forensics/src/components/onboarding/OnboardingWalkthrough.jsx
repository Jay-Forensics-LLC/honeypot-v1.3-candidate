import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { createPageUrl } from '../utils';
import {
  X,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Shield,
  Radio,
  Database,
  FileText,
  Target,
  Sparkles,
  Loader2,
  Monitor,
  Lock,
  AlertTriangle
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { toast } from 'sonner';

const ONBOARDING_STEPS = [
  {
    id: 'welcome',
    title: 'Welcome to Sentinel Forensics',
    description: 'Your professional digital forensics and security platform',
    icon: Shield,
    content: 'Sentinel Forensics helps you detect surveillance, manage digital evidence, and respond to security threats. Let\'s get you started!',
    action: null
  },
  {
    id: 'first_device',
    title: 'Add Your First Device',
    description: 'Start monitoring your devices',
    icon: Monitor,
    content: 'Add a device to start monitoring for security threats and surveillance attempts.',
    action: {
      label: 'Go to Devices',
      link: createPageUrl('Devices')
    }
  },
  {
    id: 'run_scan',
    title: 'Run a Security Scan',
    description: 'Detect surveillance devices',
    icon: Radio,
    content: 'Use BLE monitoring to detect suspicious Bluetooth devices that might be used for surveillance or tracking.',
    action: {
      label: 'Start BLE Scan',
      link: createPageUrl('BLEMonitor')
    }
  },
  {
    id: 'view_alerts',
    title: 'Monitor Security Alerts',
    description: 'Stay informed about threats',
    icon: AlertTriangle,
    content: 'Check your alert dashboard for any detected threats or anomalies. The system continuously monitors for suspicious activity.',
    action: {
      label: 'View Alerts',
      link: createPageUrl('AlertManagement')
    }
  },
  {
    id: 'create_evidence',
    title: 'Create Evidence Record',
    description: 'Document findings with chain-of-custody',
    icon: Database,
    content: 'Upload and manage digital evidence with tamper-proof chain-of-custody logging for legal admissibility.',
    action: {
      label: 'Upload Evidence',
      link: createPageUrl('Evidence')
    }
  },
  {
    id: 'complete',
    title: 'You\'re All Set!',
    description: 'Start investigating',
    icon: Sparkles,
    content: 'You\'ve completed the onboarding! Optional: Enable MFA for extra security. Explore the dashboard and start using Sentinel Forensics.',
    action: null
  }
];

// Pages where onboarding should NOT be shown
const EXCLUDED_PAGES = ['mfa-setup', 'subscription', 'profile', 'settings'];

export default function OnboardingWalkthrough({ onComplete }) {
  const queryClient = useQueryClient();
  const [currentStep, setCurrentStep] = useState(0);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    suspense: false,
    useErrorBoundary: false,
    staleTime: 10 * 60 * 1000
  });

  const { data: onboardingData, isLoading } = useQuery({
    queryKey: ['user-onboarding'],
    queryFn: async () => {
      if (!user?.email) return null;
      const records = await base44.entities.UserOnboarding.filter({
        user_email: user.email
      });
      return records[0] || null;
    },
    enabled: !!user?.email,
    staleTime: 10000,
    suspense: false,
    useErrorBoundary: false
  });

  const updateOnboarding = useMutation({
    mutationFn: async (updates) => {
      if (onboardingData?.id) {
        return await base44.entities.UserOnboarding.update(onboardingData.id, updates);
      } else {
        return await base44.entities.UserOnboarding.create({
          user_email: user?.email,
          ...updates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-onboarding'] });
    }
  });

  const completeOnboarding = useMutation({
    mutationFn: async () => {
      const updates = {
        onboarding_status: 'completed',
        completed_at: new Date().toISOString(),
        progress_percentage: 100
      };
      
      if (onboardingData?.id) {
        return await base44.entities.UserOnboarding.update(onboardingData.id, updates);
      } else {
        return await base44.entities.UserOnboarding.create({
          user_email: user?.email,
          ...updates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-onboarding'] });
      toast.success('Onboarding completed! Welcome to Sentinel Forensics.');
      setShowOnboarding(false);
      setIsProcessing(false);
      if (onComplete) onComplete();
      
      // Redirect to dashboard
      setTimeout(() => {
        window.location.href = createPageUrl('Dashboard');
      }, 1000);
    }
  });

  const skipOnboarding = useMutation({
    mutationFn: async () => {
      const updates = {
        onboarding_status: 'skipped',
        skip_reason: 'User skipped',
        progress_percentage: 0,
        completed_at: new Date().toISOString()
      };
      
      if (onboardingData?.id) {
        return await base44.entities.UserOnboarding.update(onboardingData.id, updates);
      } else {
        return await base44.entities.UserOnboarding.create({
          user_email: user?.email,
          ...updates
        });
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user-onboarding'] });
      setShowOnboarding(false);
      setIsProcessing(false);
      toast.info('You can restart onboarding anytime from your profile settings');
    }
  });

  // Check if we should show onboarding
  useEffect(() => {
    if (isLoading || !user) return;

    const currentPath = window.location.pathname;
    const isExcludedPage = EXCLUDED_PAGES.some(page => currentPath.includes(page));

    if (isExcludedPage) {
      setShowOnboarding(false);
      return;
    }

    if (onboardingData) {
      const status = onboardingData.onboarding_status;
      
      if (status === 'completed' || status === 'skipped') {
        setShowOnboarding(false);
        return;
      }
      
      if (status === 'in_progress') {
        const stepIndex = ONBOARDING_STEPS.findIndex(s => s.id === onboardingData.current_step);
        setCurrentStep(stepIndex >= 0 ? stepIndex : 0);
        setShowOnboarding(true);
      }
    } else if (user && !onboardingData) {
      // New user - start onboarding
      updateOnboarding.mutate({
        onboarding_status: 'in_progress',
        started_at: new Date().toISOString(),
        current_step: 'welcome',
        progress_percentage: 0
      });
      setCurrentStep(0);
      setShowOnboarding(true);
    }
  }, [onboardingData, user, isLoading]);

  const nextStep = async () => {
    if (isProcessing) return;
    setIsProcessing(true);

    const newStep = currentStep + 1;
    
    // If we're at the last step, complete onboarding
    if (currentStep === ONBOARDING_STEPS.length - 1) {
      await completeOnboarding.mutateAsync();
      return;
    }
    
    const step = ONBOARDING_STEPS[newStep];
    const currentStepData = ONBOARDING_STEPS[currentStep];
    const completedSteps = [...(onboardingData?.steps_completed || []), currentStepData?.id].filter(Boolean);
    
    try {
      await updateOnboarding.mutateAsync({
        current_step: step.id,
        steps_completed: completedSteps,
        progress_percentage: ((newStep + 1) / ONBOARDING_STEPS.length) * 100,
        onboarding_status: 'in_progress'
      });
      setCurrentStep(newStep);
      setIsProcessing(false);
    } catch (error) {
      console.error('Failed to move to next step:', error);
      setIsProcessing(false);
    }
  };

  const prevStep = async () => {
    if (isProcessing || currentStep === 0) return;
    const newStep = currentStep - 1;
    setCurrentStep(newStep);
  };

  const handleClose = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    await skipOnboarding.mutateAsync();
  };

  const handleActionClick = async (action) => {
    if (!action || isProcessing) return;
    setIsProcessing(true);
    
    const currentStepData = ONBOARDING_STEPS[currentStep];
    const completedSteps = [...(onboardingData?.steps_completed || []), currentStepData.id];
    
    try {
      await updateOnboarding.mutateAsync({
        steps_completed: completedSteps,
        onboarding_status: 'in_progress',
        progress_percentage: ((currentStep + 1) / ONBOARDING_STEPS.length) * 100
      });
      
      // Hide onboarding temporarily
      setShowOnboarding(false);
      setIsProcessing(false);
      
      // Navigate to the action link
      window.location.href = action.link;
    } catch (error) {
      console.error('Failed to handle action click:', error);
      setIsProcessing(false);
    }
  };

  if (!showOnboarding || isLoading) return null;

  const safeCurrentStep = Math.min(Math.max(0, currentStep), ONBOARDING_STEPS.length - 1);
  const currentStepData = ONBOARDING_STEPS[safeCurrentStep];
  
  if (!currentStepData) return null;

  const Icon = currentStepData.icon || Shield;
  const progress = ((safeCurrentStep + 1) / ONBOARDING_STEPS.length) * 100;
  const isLastStep = safeCurrentStep === ONBOARDING_STEPS.length - 1;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.9 }}
          className="relative w-full max-w-2xl"
        >
          <Card className="w-full bg-slate-900 border-slate-800 shadow-2xl">
            {/* Close Button */}
            <button
              onClick={handleClose}
              disabled={isProcessing}
              className="absolute top-4 right-4 text-slate-400 hover:text-white z-10 p-2 hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
              aria-label="Close onboarding"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <X className="w-5 h-5" />}
            </button>

            <CardHeader className="pb-4">
              {/* Progress Bar */}
              <div className="mb-6 pr-12">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-slate-400 font-medium">
                    Step {safeCurrentStep + 1} of {ONBOARDING_STEPS.length}
                  </span>
                  <span className="text-sm text-slate-400 font-medium">{Math.round(progress)}%</span>
                </div>
                <Progress value={progress} className="h-2" />
              </div>

              {/* Step Icon & Title */}
              <div className="flex items-center gap-4 mb-4 pr-12">
                <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-600 to-blue-600 flex items-center justify-center flex-shrink-0 shadow-lg">
                  <Icon className="w-8 h-8 text-white" />
                </div>
                <div>
                  <CardTitle className="text-2xl text-white mb-1">
                    {currentStepData.title}
                  </CardTitle>
                  <p className="text-slate-400 text-sm">{currentStepData.description}</p>
                </div>
              </div>
            </CardHeader>

            <CardContent className="pt-0">
              {/* Step Content */}
              <div className="mb-8">
                <p className="text-slate-300 text-base leading-relaxed">
                  {currentStepData.content}
                </p>
              </div>

              {/* Action Button (if step has an action) */}
              {currentStepData.action && (
                <div className="mb-6">
                  <Button
                    onClick={() => handleActionClick(currentStepData.action)}
                    disabled={isProcessing}
                    className="w-full bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-700 hover:to-blue-700 text-white font-semibold h-12 text-base"
                    size="lg"
                  >
                    {isProcessing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Loading...
                      </>
                    ) : (
                      <>
                        {currentStepData.action.label}
                        <ArrowRight className="w-5 h-5 ml-2" />
                      </>
                    )}
                  </Button>
                </div>
              )}

              {/* Navigation Buttons */}
              <div className="flex justify-between items-center pt-4 border-t border-slate-800 gap-3">
                <Button
                  variant="outline"
                  onClick={prevStep}
                  disabled={safeCurrentStep === 0 || isProcessing}
                  className="border-slate-700 hover:bg-slate-800 flex-1 h-11"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Previous
                </Button>

                <Button
                  onClick={nextStep}
                  disabled={isProcessing}
                  className="bg-purple-600 hover:bg-purple-700 text-white font-semibold flex-1 h-11"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {isLastStep ? 'Completing...' : 'Processing...'}
                    </>
                  ) : isLastStep ? (
                    <>
                      <CheckCircle className="w-4 h-4 mr-2" />
                      Complete Setup
                    </>
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </>
                  )}
                </Button>
              </div>

              {/* Skip Option */}
              <div className="text-center mt-4">
                <button
                  onClick={handleClose}
                  disabled={isProcessing}
                  className="text-sm text-slate-400 hover:text-white transition-colors disabled:opacity-50 underline"
                >
                  {isProcessing ? 'Skipping...' : 'Skip onboarding for now'}
                </button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}