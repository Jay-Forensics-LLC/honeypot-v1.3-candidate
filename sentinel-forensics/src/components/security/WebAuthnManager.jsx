/**
 * WebAuthn Manager - DISABLED TEMPORARILY
 * Will be re-enabled after platform WebAuthn support is confirmed
 */
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Shield, AlertTriangle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export default function WebAuthnManager({ user }) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          WebAuthn Security Keys
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Alert className="bg-blue-900/20 border-blue-500/30">
          <AlertTriangle className="h-4 w-4 text-blue-400" />
          <AlertDescription className="text-blue-200">
            WebAuthn support coming soon. Use email-based MFA for now.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}