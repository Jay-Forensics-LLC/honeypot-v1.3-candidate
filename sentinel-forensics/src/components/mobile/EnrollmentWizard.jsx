import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Smartphone,
  QrCode,
  Download,
  Link as LinkIcon,
  CheckCircle,
  ArrowRight,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';

export default function EnrollmentWizard({ platform, onComplete, onCancel }) {
  const [step, setStep] = useState(1);
  const [deviceName, setDeviceName] = useState('');

  const enrollmentToken = `ENR-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const enrollmentUrl = `sentinel://enroll?token=${enrollmentToken}&platform=${platform}`;

  const copyEnrollmentLink = () => {
    navigator.clipboard.writeText(enrollmentUrl);
    toast.success('Enrollment link copied!', {
      style: {
        background: '#14532D',
        border: '1px solid #16A34A',
        color: '#D1FAE5'
      }
    });
  };

  const steps = {
    android: [
      {
        title: 'Install Sentinel Mobile',
        description: 'Download and install the Sentinel Mobile app from Google Play Store',
        icon: Download
      },
      {
        title: 'Scan QR Code',
        description: 'Open the app and scan the QR code below to link your device',
        icon: QrCode
      },
      {
        title: 'Grant Permissions',
        description: 'Allow Device Admin permissions when prompted for full protection',
        icon: CheckCircle
      }
    ],
    ios: [
      {
        title: 'Install Sentinel Mobile',
        description: 'Download and install the Sentinel Mobile app from the App Store',
        icon: Download
      },
      {
        title: 'Tap Enrollment Link',
        description: 'Click the link below or scan the QR code in the app',
        icon: LinkIcon
      },
      {
        title: 'Install Profile',
        description: 'Follow iOS prompts to install the configuration profile',
        icon: CheckCircle
      }
    ]
  };

  const currentSteps = steps[platform] || [];

  return (
    <div className="space-y-6">
      {/* Progress Steps */}
      <div className="flex items-center justify-between">
        {currentSteps.map((s, idx) => (
          <div key={idx} className="flex items-center">
            <div className={`flex items-center gap-2 ${
              idx <= step - 1 ? 'text-blue-400' : 'text-slate-500'
            }`}>
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                idx <= step - 1 ? 'bg-blue-600' : 'bg-slate-700'
              }`}>
                {idx < step - 1 ? (
                  <CheckCircle className="w-5 h-5 text-white" />
                ) : (
                  <span className="text-sm font-bold text-white">{idx + 1}</span>
                )}
              </div>
              <span className="hidden md:block text-sm font-medium">{s.title}</span>
            </div>
            {idx < currentSteps.length - 1 && (
              <div className={`h-px w-12 md:w-24 mx-2 ${
                idx < step - 1 ? 'bg-blue-600' : 'bg-slate-700'
              }`} />
            )}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardContent className="p-6 space-y-4">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 bg-blue-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              {React.createElement(currentSteps[step - 1]?.icon || Smartphone, {
                className: "w-6 h-6 text-blue-400"
              })}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-semibold text-white mb-2">
                {currentSteps[step - 1]?.title}
              </h3>
              <p className="text-slate-400 text-sm">
                {currentSteps[step - 1]?.description}
              </p>
            </div>
          </div>

          {step === 1 && (
            <div>
              <Input
                value={deviceName}
                onChange={(e) => setDeviceName(e.target.value)}
                placeholder="Enter device name (e.g., My iPhone, Work Phone)"
                className="bg-slate-900 border-slate-700 text-white"
              />
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="bg-slate-900 rounded-lg p-8 text-center">
                <QrCode className="w-48 h-48 mx-auto text-slate-600 mb-4" />
                <p className="text-slate-400 text-sm">Enrollment QR Code</p>
              </div>
              
              <div className="flex items-center gap-2">
                <Input
                  value={enrollmentUrl}
                  readOnly
                  className="bg-slate-900 border-slate-700 text-white font-mono text-xs"
                />
                <Button
                  onClick={copyEnrollmentLink}
                  size="icon"
                  variant="outline"
                  className="border-slate-700"
                >
                  <Copy className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-3 pt-4">
            <Button
              onClick={onCancel}
              variant="outline"
              className="flex-1 border-slate-700 text-white"
            >
              Cancel
            </Button>
            
            {step < 3 ? (
              <Button
                onClick={() => setStep(step + 1)}
                disabled={step === 1 && !deviceName.trim()}
                className="flex-1 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                Next
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            ) : (
              <Button
                onClick={() => onComplete({ deviceName, platform, enrollmentToken })}
                className="flex-1 bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700"
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Complete Enrollment
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}