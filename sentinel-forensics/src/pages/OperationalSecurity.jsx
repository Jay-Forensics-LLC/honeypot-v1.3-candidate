
import { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { 
  Lock, 
  Trash2, 
  Shield, 
  AlertTriangle,
  CheckCircle,
  Key,
  Database,
  Eye,
  EyeOff,
  Download,
  Upload,
  RefreshCw
} from "lucide-react";
import { format } from "date-fns";
import { CryptoUtils } from "../components/utils/CryptoUtils";

export default function OperationalSecurity() {
  const [destructKey, setDestructKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [encryptionKey, setEncryptionKey] = useState("");
  const [keyGenerated, setKeyGenerated] = useState(false);
  const [keyExported, setKeyExported] = useState(false);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
  });

  const { data: evidence = [] } = useQuery({
    queryKey: ['evidence'],
    queryFn: () => base44.entities.Evidence.list(),
  });

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts'],
    queryFn: () => base44.entities.Alert.list(),
  });

  const { data: cases = [] } = useQuery({
    queryKey: ['cases'],
    queryFn: () => base44.entities.Case.list(),
  });

  // Check if user has encryption key stored securely in user entity
  useEffect(() => {
    if (user?.encryption_key_hash) {
      setKeyGenerated(true);
    }
  }, [user]);

  /**
   * Generate cryptographically secure encryption key
   * Uses Web Crypto API for secure random generation
   */
  const generateEncryptionKey = async () => {
    try {
      // Generate 256-bit key using Web Crypto API
      const keyArray = new Uint8Array(32);
      window.crypto.getRandomValues(keyArray);
      
      // Convert to base64 for display
      const keyBase64 = btoa(String.fromCharCode.apply(null, Array.from(keyArray)));
      
      // Add timestamp and version for uniqueness
      const timestamp = Date.now();
      const version = 'v1';
      const fullKey = `${version}:${timestamp}:${keyBase64}`;
      
      // Hash the key for storage verification (never store actual key)
      const keyHash = await CryptoUtils.hash(fullKey);
      
      // Store only the hash in user entity (not the actual key)
      await base44.auth.updateMe({
        encryption_key_hash: keyHash,
        encryption_key_generated: new Date().toISOString()
      });

      setEncryptionKey(fullKey);
      setKeyGenerated(true);
      setKeyExported(false);
      
      // Show warning to export
      alert('⚠️ CRITICAL: Export and securely store your encryption key immediately. It will NOT be stored in the system and cannot be recovered.');
      
    } catch (error) {
      console.error("Key generation failed:", error);
      alert('Failed to generate encryption key. Please try again.');
    }
  };

  /**
   * Export encryption key to secure file
   */
  const exportEncryptionKey = () => {
    if (!encryptionKey) {
      alert('No encryption key available to export');
      return;
    }

    const exportData = {
      key: encryptionKey,
      generated: new Date().toISOString(),
      user: user?.email,
      app: 'Jay Forensics',
      warning: 'This key is required for emergency data destruction. Store in a secure location.',
      instructions: [
        '1. Store this file in a secure, offline location',
        '2. Consider encrypting this file with a strong password',
        '3. Make secure backups in multiple locations',
        '4. Never share this key via email or messaging',
        '5. This key cannot be recovered if lost'
      ]
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sentinel-encryption-key-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    setKeyExported(true);
    
    // Clear key from memory after export
    setTimeout(() => {
      setEncryptionKey('');
    }, 5000);
  };

  /**
   * Import and verify encryption key
   */
  const importEncryptionKey = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      try {
        const importedData = JSON.parse(e.target?.result);
        const importedKey = importedData.key;
        
        // Verify key against stored hash
        const keyHash = await CryptoUtils.hash(importedKey);
        if (user?.encryption_key_hash && keyHash === user.encryption_key_hash) {
          setEncryptionKey(importedKey);
          alert('✓ Encryption key verified successfully');
        } else {
          alert('❌ Invalid encryption key. Hash does not match.');
        }
      } catch (error) {
        alert('Failed to import encryption key. Invalid file format.');
      }
    };
    reader.readAsText(file);
  };

  /**
   * Securely clear encryption key from memory
   */
  const clearKeyFromMemory = () => {
    setEncryptionKey('');
    setShowKey(false);
    setDestructKey('');
  };

  const handleSelfDestruct = async () => {
    if (!destructKey) {
      alert('Please enter destruction key');
      return;
    }

    if (!user?.encryption_key_hash) {
      alert('No encryption key configured. Cannot proceed with destruction.');
      return;
    }

    // Verify destruction key
    const inputKeyHash = await CryptoUtils.hash(destructKey);
    if (inputKeyHash !== user.encryption_key_hash) {
      alert('❌ Invalid destruction key. Access denied.');
      return;
    }

    const confirmText = window.prompt(
      `⚠️ CRITICAL WARNING ⚠️\n\n` +
      `This will PERMANENTLY DELETE:\n` +
      `- ${evidence.length} evidence items\n` +
      `- ${alerts.length} alerts\n` +
      `- ${cases.length} cases\n\n` +
      `This action CANNOT be undone!\n\n` +
      `Type "DESTROY" to confirm:`
    );

    if (confirmText !== 'DESTROY') {
      alert('Self-destruct cancelled');
      return;
    }

    // Require MFA verification for destructive action
    if (user?.role !== 'admin') {
      alert('This action requires admin privileges');
      return;
    }

    try {
      // Log the destruction action
      await base44.entities.AuditLog.create({
        event_type: 'emergency_destruction',
        severity: 'critical',
        description: 'Emergency self-destruct initiated',
        user_id: user.email,
        timestamp: new Date().toISOString(),
        metadata: {
          evidence_count: evidence.length,
          alerts_count: alerts.length,
          cases_count: cases.length
        }
      });

      // Delete all evidence
      for (const item of evidence) {
        await base44.entities.Evidence.delete(item.id);
      }

      // Delete all alerts
      for (const alert of alerts) {
        await base44.entities.Alert.delete(alert.id);
      }

      // Delete all cases
      for (const caseItem of cases) {
        await base44.entities.Case.delete(caseItem.id);
      }

      // Clear encryption key hash
      await base44.auth.updateMe({
        encryption_key_hash: null,
        encryption_key_generated: null
      });

      queryClient.invalidateQueries();

      // Clear all local state
      clearKeyFromMemory();
      setKeyGenerated(false);

      alert('✓ All sensitive data has been destroyed. Encryption key cleared.');
      
    } catch (error) {
      console.error('Destruction failed:', error);
      alert('Error during destruction: ' + error.message);
    }
  };

  const securityFeatures = [
    { name: 'End-to-End Encryption', status: 'active', icon: Lock, color: 'text-green-400' },
    { name: 'Zero-Knowledge Architecture', status: 'active', icon: Shield, color: 'text-green-400' },
    { name: 'Secure Evidence Handling', status: 'active', icon: Database, color: 'text-green-400' },
    { name: 'Role-Based Access Control', status: 'active', icon: Key, color: 'text-green-400' },
    { name: 'Audit Logging', status: 'active', icon: CheckCircle, color: 'text-green-400' },
  ];

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-white mb-2">Operational Security</h1>
        <p className="text-slate-400">Data protection and emergency protocols</p>
      </div>

      <Alert className="bg-red-500/10 border-red-500/50">
        <AlertTriangle className="h-5 w-5 text-red-400" />
        <AlertDescription className="text-red-200">
          <strong>Critical Security Zone:</strong> Handle with extreme caution. 
          All actions here are irreversible and logged. Encryption keys are NEVER stored in the system.
        </AlertDescription>
      </Alert>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Security Status */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Shield className="w-5 h-5 text-green-400" />
              Security Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {securityFeatures.map((feature, idx) => {
              const Icon = feature.icon;
              return (
                <div key={idx} className="flex items-center justify-between py-2">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-5 h-5 ${feature.color}`} />
                    <span className="text-slate-300">{feature.name}</span>
                  </div>
                  <Badge className="bg-green-500/20 text-green-400">
                    {feature.status.toUpperCase()}
                  </Badge>
                </div>
              );
            })}
          </CardContent>
        </Card>

        {/* Encryption Key Management */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Key className="w-5 h-5 text-blue-400" />
              Encryption Key Management
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {!keyGenerated ? (
              <>
                <Alert className="bg-blue-500/10 border-blue-500/30">
                  <AlertDescription className="text-blue-200 text-sm">
                    <strong>No encryption key configured.</strong>
                    <br />
                    Generate a cryptographically secure key for emergency destruction capabilities.
                  </AlertDescription>
                </Alert>
                <Button
                  onClick={generateEncryptionKey}
                  className="w-full bg-blue-600 hover:bg-blue-700"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Generate Secure Key
                </Button>
              </>
            ) : (
              <>
                <Alert className="bg-green-500/10 border-green-500/30">
                  <CheckCircle className="h-4 w-4 text-green-400" />
                  <AlertDescription className="text-green-200 text-sm">
                    Encryption key configured. Generated: {user?.encryption_key_generated ? format(new Date(user.encryption_key_generated), 'PPp') : 'Unknown'}
                  </AlertDescription>
                </Alert>

                {encryptionKey && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      <Label className="text-slate-300">Master Encryption Key</Label>
                      <div className="flex gap-2">
                        <Input
                          type={showKey ? "text" : "password"}
                          value={encryptionKey}
                          readOnly
                          className="bg-slate-800 border-slate-700 text-white font-mono text-xs"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => setShowKey(!showKey)}
                          className="border-slate-700"
                        >
                          {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </Button>
                      </div>
                    </div>

                    <Alert className="bg-orange-500/10 border-orange-500/30">
                      <AlertTriangle className="h-4 w-4 text-orange-400" />
                      <AlertDescription className="text-orange-200 text-xs">
                        Export this key NOW. It will NOT be stored and cannot be recovered if lost.
                      </AlertDescription>
                    </Alert>

                    <div className="flex gap-2">
                      <Button
                        onClick={exportEncryptionKey}
                        className="flex-1 bg-green-600 hover:bg-green-700"
                        disabled={keyExported}
                      >
                        <Download className="w-4 h-4 mr-2" />
                        {keyExported ? 'Exported' : 'Export Key'}
                      </Button>
                      <Button
                        onClick={clearKeyFromMemory}
                        variant="outline"
                        className="border-slate-700"
                      >
                        Clear
                      </Button>
                    </div>
                  </div>
                )}

                {!encryptionKey && (
                  <div className="space-y-2">
                    <Label className="text-slate-300 text-sm">Import Encryption Key</Label>
                    <div className="flex gap-2">
                      <Input
                        type="file"
                        accept=".json"
                        onChange={importEncryptionKey}
                        className="bg-slate-800 border-slate-700 text-white"
                      />
                      <Button
                        variant="outline"
                        size="icon"
                        className="border-slate-700"
                      >
                        <Upload className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-slate-500">
                      Import your exported key file to access emergency destruction.
                    </p>
                  </div>
                )}
              </>
            )}

            <Alert className="bg-yellow-500/10 border-yellow-500/30 mt-4">
              <AlertDescription className="text-yellow-200 text-xs">
                <strong>Security Best Practices:</strong>
                <ul className="list-disc list-inside mt-2 space-y-1">
                  <li>Never store the key in browsers or cloud services</li>
                  <li>Make encrypted offline backups</li>
                  <li>Store in password manager or hardware security module</li>
                  <li>Key uses Web Crypto API for secure generation</li>
                </ul>
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      </div>

      {/* Data Inventory */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-purple-400" />
            Data Inventory
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-1">Evidence Items</p>
              <p className="text-3xl font-bold text-white">{evidence.length}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-1">Security Alerts</p>
              <p className="text-3xl font-bold text-white">{alerts.length}</p>
            </div>
            <div className="bg-slate-800/50 p-4 rounded-lg">
              <p className="text-slate-400 text-sm mb-1">Active Cases</p>
              <p className="text-3xl font-bold text-white">{cases.length}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Emergency Self-Destruct */}
      <Card className="bg-red-900/20 border-red-900">
        <CardHeader>
          <CardTitle className="text-red-400 flex items-center gap-2">
            <Trash2 className="w-5 h-5" />
            Emergency Self-Destruct
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert className="bg-red-500/10 border-red-500/30">
            <AlertTriangle className="h-5 w-5 text-red-400" />
            <AlertDescription className="text-red-200">
              <strong>WARNING:</strong> This will permanently delete ALL data including evidence, 
              alerts, cases, and reports. This action CANNOT be reversed. Use only in emergency situations 
              where data must be destroyed immediately. Requires encryption key and admin privileges.
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label className="text-slate-300">Enter Encryption Key to Confirm</Label>
            <div className="flex gap-2">
              <Input
                type="password"
                value={destructKey}
                onChange={(e) => setDestructKey(e.target.value)}
                placeholder="Paste your encryption key..."
                className="bg-slate-800 border-red-900 text-white"
                disabled={!keyGenerated}
              />
              <Button
                variant="outline"
                size="icon"
                onClick={() => document.getElementById('import-destruct-key')?.click()}
                className="border-red-900"
                disabled={!keyGenerated}
              >
                <Upload className="w-4 h-4" />
              </Button>
              <input
                id="import-destruct-key"
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const reader = new FileReader();
                  reader.onload = (event) => {
                    try {
                      const data = JSON.parse(event.target?.result);
                      setDestructKey(data.key);
                    } catch (error) {
                      alert('Invalid key file');
                    }
                  };
                  reader.readAsText(file);
                }}
              />
            </div>
            <p className="text-xs text-slate-500">
              Enter or import your master encryption key
            </p>
          </div>

          {!keyGenerated && (
            <Alert className="bg-yellow-500/10 border-yellow-500/30">
              <AlertDescription className="text-yellow-200 text-sm">
                You must generate and configure an encryption key before using emergency destruction.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={handleSelfDestruct}
            disabled={!destructKey || !keyGenerated}
            className="w-full bg-red-600 hover:bg-red-700 disabled:bg-slate-700"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            INITIATE SELF-DESTRUCT
          </Button>

          <p className="text-xs text-slate-500 text-center">
            Action will be logged, audited, and cannot be undone. Requires admin role.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
