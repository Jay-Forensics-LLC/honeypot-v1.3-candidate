import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Shield, Play, Zap, BookOpen, ArrowRight, SkipForward } from 'lucide-react';
import { toast } from 'sonner';
import { createPageUrl } from '../components/utils';

export default function WelcomeOnboarding() {
  const navigate = useNavigate();
  const [showVideo, setShowVideo] = useState(false);

  const completeOnboarding = useMutation({
    mutationFn: async (skipTips = false) => {
      const user = await base44.auth.me();
      
      // SECURITY: Ensure organization_id exists - create if missing
      if (!user.organization_id) {
        const orgId = `org_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await base44.auth.updateMe({
          organization_id: orgId,
          organization_name: user.email.split('@')[0] + "'s Organization",
          onboarding_completed: true,
          show_tooltips: !skipTips
        });
      } else {
        await base44.auth.updateMe({
          onboarding_completed: true,
          show_tooltips: !skipTips
        });
      }
    },
    onSuccess: () => {
      window.location.href = createPageUrl('App');
    },
    onError: (error) => {
      toast.error('Failed to save preferences', { description: error.message });
    }
  });

  return (
    <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center p-6">
      <div className="max-w-5xl w-full space-y-8">
        {/* Header */}
        <div className="text-center space-y-3">
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 bg-red-500 rounded-full flex items-center justify-center">
              <Shield className="w-12 h-12 text-white" />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white">Welcome to Sentinel Forensics</h1>
          <p className="text-xl text-slate-400">In 2 minutes, you'll know exactly where to start.</p>
        </div>

        {/* Three Cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Quick Start */}
          <Card className="bg-slate-900 border-slate-800 hover:border-red-500 transition-colors cursor-pointer group">
            <CardContent className="p-6 space-y-4">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center group-hover:bg-blue-500/30 transition-colors">
                <Zap className="w-6 h-6 text-blue-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Quick Start</h3>
                <p className="text-sm text-slate-400">We'll guide you to your first scan and show results.</p>
                <div className="mt-4 flex items-center text-sm text-blue-400 font-medium">
                  Recommended
                  <ArrowRight className="w-4 h-4 ml-1" />
                </div>
              </div>
              <Button 
                className="w-full bg-blue-600 hover:bg-blue-700"
                onClick={() => navigate(createPageUrl('QuickStartWizard'))}
              >
                Start Setup
              </Button>
            </CardContent>
          </Card>

          {/* Video */}
          <Card className="bg-slate-900 border-slate-800 hover:border-purple-500 transition-colors cursor-pointer group">
            <CardContent className="p-6 space-y-4">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center group-hover:bg-purple-500/30 transition-colors">
                <Play className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Watch Intro Video</h3>
                <p className="text-sm text-slate-400">2-minute overview of key features and workflows.</p>
                <div className="mt-4 text-sm text-slate-500">
                  Optional • 2-3 min
                </div>
              </div>
              <Button 
                variant="outline"
                className="w-full border-purple-500/50 text-purple-400 hover:bg-purple-500/10"
                onClick={() => setShowVideo(!showVideo)}
              >
                {showVideo ? 'Hide Video' : 'Watch Now'}
              </Button>
            </CardContent>
          </Card>

          {/* Tour */}
          <Card className="bg-slate-900 border-slate-800 hover:border-green-500 transition-colors cursor-pointer group">
            <CardContent className="p-6 space-y-4">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center group-hover:bg-green-500/30 transition-colors">
                <BookOpen className="w-6 h-6 text-green-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Take a Tour</h3>
                <p className="text-sm text-slate-400">60-second walkthrough of the dashboard sections.</p>
                <div className="mt-4 text-sm text-slate-500">
                  Optional • 1 min
                </div>
              </div>
              <Button 
                variant="outline"
                className="w-full border-green-500/50 text-green-400 hover:bg-green-500/10"
                onClick={() => completeOnboarding.mutate()}
              >
                Start Tour
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* Video Embed */}
        {showVideo && (
          <Card className="bg-slate-900 border-purple-500">
            <CardContent className="p-6">
              <div className="aspect-video bg-slate-800 rounded-lg flex items-center justify-center">
                <p className="text-slate-400 text-sm">Video placeholder - embed your intro video here</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Bottom Actions */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <Button
            size="lg"
            className="bg-blue-600 hover:bg-blue-700"
            onClick={() => navigate(createPageUrl('QuickStartWizard'))}
          >
            Start Quick Setup
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-slate-700"
            onClick={() => completeOnboarding.mutate()}
          >
            <SkipForward className="w-4 h-4 mr-2" />
            Skip to Dashboard
          </Button>
        </div>

        {/* Advanced Link */}
        <div className="text-center">
          <button
            onClick={() => completeOnboarding.mutate(true)}
            className="text-sm text-slate-500 hover:text-slate-400 underline"
          >
            I'm advanced — disable tips
          </button>
        </div>
      </div>
    </div>
  );
}