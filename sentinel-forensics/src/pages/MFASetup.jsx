
import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Shield,
  Smartphone,
  Mail,
  Key,
  Copy,
  Check,
  AlertTriangle,
  ArrowLeft,
  Loader2,
  Download
} from 'lucide-react';
import { toast } from 'sonner';

export default function MFASetup() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState(1);
  const [mfaMethod, setMfaMethod] = useState(null);
  const [totpSecret, setTotpSecret] = useState('');
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState([]);
  const [copiedBackupCodes, setCopiedBackupCodes] = useState(false);

  const { data: user, refetch: refetchUser } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  // Generate QR code as data URL using Canvas API (no external library needed)
  const generateQRCodeCanvas = (text) => {
    // Simple text-based fallback instead of actual QR code
    // For production, use a proper QR code library on the backend
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');
    
    // White background
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, 256, 256);
    
    // Display text (simplified - not a real QR code)
    ctx.fillStyle = '#000000';
    ctx.font = '12px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('Scan with authenticator app', 128, 60);
    ctx.fillText('or enter secret manually:', 128, 80);
    
    // Display secret in readable chunks
    // Use the `text` parameter which is the `totpSecret`
    const chunks = text.match(/.{1,4}/g) || [];
    chunks.forEach((chunk, i) => {
      ctx.fillText(chunk, 128, 120 + i * 20);
    });
    
    return canvas.toDataURL();
  };

  // Generate TOTP secret and QR code
  const generateTOTPSecret = () => {
    // Generate a random base32 secret
    const base32chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += base32chars.charAt(Math.floor(Math.random() * base32chars.length));
    }
    setTotpSecret(secret);

    // Generate simple QR code representation
    // The commented-out part below is the original QR code generation using the library
    // For now, we use the canvas fallback.
    // const otpauthUrl = `otpauth://totp/Sentinel:${user?.email}?secret=${secret}&issuer=Sentinel Forensics`;
    // QRCode.toDataURL(otpauthUrl)
    //   .then(url => setQrCodeUrl(url))
    //   .catch(err => console.error('QR Code generation error:', err));
    
    const qrUrl = generateQRCodeCanvas(secret);
    setQrCodeUrl(qrUrl);
  };

  // Generate backup codes
  const generateBackupCodes = () => {
    const codes = [];
    for (let i = 0; i < 10; i++) {
      const code = Math.random().toString(36).substring(2, 10).toUpperCase();
      codes.push(code);
    }
    setBackupCodes(codes);
    return codes;
  };

  // Send MFA code via SMS/Email
  const sendCodeMutation = useMutation({
    mutationFn: async (method) => {
      const response = await base44.functions.invoke('sendMFACode', {
        user_email: user?.email,
        method: method,
        phone_number: user?.phone || ''
      });
      return response.data;
    },
    onSuccess: () => {
      toast.success(`Verification code sent via ${mfaMethod}`);
      setStep(3);
    },
    onError: (error) => {
      toast.error('Failed to send verification code');
      console.error(error);
    }
  });

  // Verify MFA code
  const verifyMutation = useMutation({
    mutationFn: async () => {
      // Hash backup codes before sending
      const hashedBackupCodes = await Promise.all(
        backupCodes.map(async (code) => {
          const encoder = new TextEncoder();
          const data = encoder.encode(code);
          const hashBuffer = await crypto.subtle.digest('SHA-256', data);
          const hashArray = Array.from(new Uint8Array(hashBuffer));
          return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        })
      );

      const response = await base44.functions.invoke('verifyMFA', {
        user_email: user?.email,
        code: verificationCode,
        secret: totpSecret,
        method: mfaMethod,
        backup_codes: hashedBackupCodes
      });
      return response.data;
    },
    onSuccess: async (data) => {
      if (data.valid) {
        // Update user with MFA settings
        await base44.auth.updateMe({
          mfa_enabled: true,
          mfa_method: mfaMethod,
          mfa_secret: totpSecret,
          mfa_backup_codes: data.remaining_codes || await Promise.all(
            backupCodes.map(async (code) => {
              const encoder = new TextEncoder();
              const codeData = encoder.encode(code);
              const hashBuffer = await crypto.subtle.digest('SHA-256', codeData);
              const hashArray = Array.from(new Uint8Array(hashBuffer));
              return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
            })
          ),
          mfa_verified_at: new Date().toISOString()
        });

        // Create audit log
        await base44.entities.AuditLog.create({
          event_type: 'mfa_enabled',
          severity: 'info',
          description: `MFA enabled using ${mfaMethod}`,
          user_id: user?.email,
          timestamp: new Date().toISOString(),
          success: true,
          metadata: { method: mfaMethod }
        });

        refetchUser();
        setStep(4);
        toast.success('MFA enabled successfully!');
      } else {
        toast.error('Invalid verification code');
      }
    },
    onError: (error) => {
      toast.error('Verification failed');
      console.error(error);
    }
  });

  const handleMethodSelect = (method) => {
    setMfaMethod(method);
    setStep(2);

    if (method === 'totp') {
      generateTOTPSecret();
      generateBackupCodes();
    } else {
      generateBackupCodes();
      sendCodeMutation.mutate(method);
    }
  };

  const copyBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    navigator.clipboard.writeText(codesText);
    setCopiedBackupCodes(true);
    toast.success('Backup codes copied to clipboard');
    setTimeout(() => setCopiedBackupCodes(false), 3000);
  };

  const downloadBackupCodes = () => {
    const codesText = backupCodes.join('\n');
    const blob = new Blob([codesText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'sentinel-backup-codes.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Backup codes downloaded');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 to-slate-900 p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => window.history.back()}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-white">Enable Multi-Factor Authentication</h1>
            <p className="text-slate-400">Add an extra layer of security to your account</p>
          </div>
        </div>

        {/* Step 1: Choose Method */}
        {step === 1 && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Choose Your MFA Method</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <button
                onClick={() => handleMethodSelect('totp')}
                className="w-full p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-blue-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">Authenticator App (Recommended)</h3>
                    <p className="text-sm text-slate-400">
                      Use Google Authenticator, Authy, or similar apps to generate time-based codes
                    </p>
                    <Badge className="mt-2 bg-green-500/20 text-green-400">Most Secure</Badge>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelect('email')}
                className="w-full p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Mail className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">Email Code</h3>
                    <p className="text-sm text-slate-400">
                      Receive a verification code via email each time you log in
                    </p>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleMethodSelect('sms')}
                className="w-full p-6 bg-slate-800/50 hover:bg-slate-800 border border-slate-700 rounded-lg transition-all text-left"
              >
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-green-600 rounded-lg flex items-center justify-center flex-shrink-0">
                    <Smartphone className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-white mb-1">SMS Code</h3>
                    <p className="text-sm text-slate-400">
                      Receive a verification code via text message
                    </p>
                  </div>
                </div>
              </button>
            </CardContent>
          </Card>
        )}

        {/* Step 2: TOTP Setup */}
        {step === 2 && mfaMethod === 'totp' && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Setup Authenticator App</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="text-center">
                <p className="text-slate-400 mb-6">
                  Scan this code with your authenticator app or enter the secret manually
                </p>
                {qrCodeUrl && (
                  <div className="inline-block p-4 bg-white rounded-lg">
                    <img src={qrCodeUrl} alt="Setup Guide" className="w-64 h-64" />
                  </div>
                )}
              </div>

              <div className="bg-slate-800/50 p-4 rounded-lg">
                <p className="text-sm text-slate-400 mb-2">Or enter this code manually:</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 px-3 py-2 bg-slate-900 rounded text-white font-mono text-sm">
                    {totpSecret}
                  </code>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      navigator.clipboard.writeText(totpSecret);
                      toast.success('Secret copied to clipboard');
                    }}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-white">Enter Verification Code</Label>
                <Input
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  maxLength={6}
                  className="bg-slate-800 border-slate-700 text-white text-center text-2xl tracking-widest"
                />
              </div>

              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={verificationCode.length !== 6 || verifyMutation.isPending}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Verify & Enable MFA
                  </>
                )}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 3: Email/SMS Verification */}
        {step === 3 && (mfaMethod === 'email' || mfaMethod === 'sms') && (
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Enter Verification Code</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <p className="text-slate-400">
                We've sent a 6-digit verification code to your {mfaMethod === 'email' ? 'email' : 'phone'}.
              </p>

              <div className="space-y-2">
                <Label className="text-white">Verification Code</Label>
                <Input
                  placeholder="Enter 6-digit code"
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value)}
                  maxLength={6}
                  className="bg-slate-800 border-slate-700 text-white text-center text-2xl tracking-widest"
                />
              </div>

              <Button
                onClick={() => verifyMutation.mutate()}
                disabled={verificationCode.length !== 6 || verifyMutation.isPending}
                className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
              >
                {verifyMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4 mr-2" />
                    Verify & Enable MFA
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={() => sendCodeMutation.mutate(mfaMethod)}
                disabled={sendCodeMutation.isPending}
                className="w-full"
              >
                Resend Code
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Step 4: Success & Backup Codes */}
        {step === 4 && (
          <div className="space-y-6">
            <Card className="bg-green-900/20 border-green-500/30">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-green-600 rounded-full flex items-center justify-center flex-shrink-0">
                    <Check className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-green-300">MFA Enabled Successfully!</h3>
                    <p className="text-green-200">Your account is now more secure</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <CardTitle className="text-white flex items-center gap-2">
                  <Key className="w-5 h-5" />
                  Backup Codes
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-yellow-200">
                      <p className="font-semibold mb-1">Save These Backup Codes</p>
                      <p className="text-yellow-300/80">
                        Use these codes to access your account if you lose access to your authenticator. 
                        Each code can only be used once.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 p-4 bg-slate-800/50 rounded-lg">
                  {backupCodes.map((code, idx) => (
                    <div key={idx} className="font-mono text-sm text-white bg-slate-900 px-3 py-2 rounded">
                      {code}
                    </div>
                  ))}
                </div>

                <div className="flex gap-3">
                  <Button
                    onClick={copyBackupCodes}
                    variant="outline"
                    className="flex-1"
                  >
                    {copiedBackupCodes ? (
                      <>
                        <Check className="w-4 h-4 mr-2" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4 mr-2" />
                        Copy Codes
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={downloadBackupCodes}
                    variant="outline"
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>

                <Button
                  onClick={() => window.location.href = '/'}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                >
                  Go to Dashboard
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Info Card */}
        {step === 1 && (
          <Card className="bg-blue-900/20 border-blue-500/30">
            <CardContent className="p-6">
              <div className="flex items-start gap-4">
                <Shield className="w-6 h-6 text-blue-400 flex-shrink-0 mt-1" />
                <div className="text-sm text-blue-200">
                  <p className="font-semibold mb-2">Why enable MFA?</p>
                  <ul className="space-y-1 text-blue-300/80">
                    <li>• Protects against unauthorized access</li>
                    <li>• Required for sensitive operations</li>
                    <li>• Industry best practice for security</li>
                    <li>• Compliant with security standards</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
