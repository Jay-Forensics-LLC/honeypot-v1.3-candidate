import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Lock, Unlock, Copy, Download, Key } from 'lucide-react';
import { toast } from 'sonner';

export default function EncryptionUtility() {
  const [plainText, setPlainText] = useState('');
  const [encryptedText, setEncryptedText] = useState('');
  const [decryptedText, setDecryptedText] = useState('');
  const [password, setPassword] = useState('');
  const [decryptPassword, setDecryptPassword] = useState('');

  // AES-GCM Encryption using Web Crypto API
  const encryptData = async () => {
    if (!plainText || !password) {
      toast.error('Please enter both text and password');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const data = encoder.encode(plainText);
      
      // Derive key from password
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(password),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );
      
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['encrypt']
      );
      
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const encrypted = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      
      // Combine salt + iv + encrypted data
      const result = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
      result.set(salt, 0);
      result.set(iv, salt.length);
      result.set(new Uint8Array(encrypted), salt.length + iv.length);
      
      const base64 = btoa(String.fromCharCode(...result));
      setEncryptedText(base64);
      toast.success('Text encrypted successfully!');
    } catch (error) {
      toast.error('Encryption failed');
      console.error(error);
    }
  };

  // AES-GCM Decryption
  const decryptData = async () => {
    if (!encryptedText || !decryptPassword) {
      toast.error('Please enter both encrypted text and password');
      return;
    }

    try {
      const encoder = new TextEncoder();
      const encryptedData = Uint8Array.from(atob(encryptedText), c => c.charCodeAt(0));
      
      const salt = encryptedData.slice(0, 16);
      const iv = encryptedData.slice(16, 28);
      const data = encryptedData.slice(28);
      
      const passwordKey = await crypto.subtle.importKey(
        'raw',
        encoder.encode(decryptPassword),
        { name: 'PBKDF2' },
        false,
        ['deriveBits', 'deriveKey']
      );
      
      const key = await crypto.subtle.deriveKey(
        {
          name: 'PBKDF2',
          salt,
          iterations: 100000,
          hash: 'SHA-256'
        },
        passwordKey,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );
      
      const decrypted = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        key,
        data
      );
      
      const decoder = new TextDecoder();
      const text = decoder.decode(decrypted);
      setDecryptedText(text);
      toast.success('Text decrypted successfully!');
    } catch (error) {
      toast.error('Decryption failed - wrong password or corrupted data');
      console.error(error);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  const downloadAsFile = (content, filename) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${filename}`);
  };

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Key className="w-5 h-5 text-blue-400" />
          Encryption Utility
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="encrypt" className="w-full">
          <TabsList className="grid w-full grid-cols-2 bg-slate-800">
            <TabsTrigger value="encrypt">Encrypt</TabsTrigger>
            <TabsTrigger value="decrypt">Decrypt</TabsTrigger>
          </TabsList>

          <TabsContent value="encrypt" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-white">Text to Encrypt</Label>
              <Textarea
                value={plainText}
                onChange={(e) => setPlainText(e.target.value)}
                placeholder="Enter sensitive text here..."
                className="bg-slate-800 border-slate-700 text-white h-32"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Encryption Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Strong password (min 12 characters)"
                className="bg-slate-800 border-slate-700 text-white"
              />
              <p className="text-xs text-slate-400">
                Use a strong password. This cannot be recovered if lost.
              </p>
            </div>

            <Button
              onClick={encryptData}
              className="w-full bg-blue-600 hover:bg-blue-700"
              disabled={!plainText || !password}
            >
              <Lock className="w-4 h-4 mr-2" />
              Encrypt (AES-256-GCM)
            </Button>

            {encryptedText && (
              <div className="space-y-2">
                <Label className="text-white">Encrypted Output</Label>
                <Textarea
                  value={encryptedText}
                  readOnly
                  className="bg-slate-800 border-slate-700 text-white font-mono text-xs h-32"
                />
                <div className="flex gap-2">
                  <Button
                    onClick={() => copyToClipboard(encryptedText)}
                    variant="outline"
                    className="flex-1"
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy
                  </Button>
                  <Button
                    onClick={() => downloadAsFile(encryptedText, 'encrypted.txt')}
                    variant="outline"
                    className="flex-1"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Download
                  </Button>
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="decrypt" className="space-y-4 mt-4">
            <div className="space-y-2">
              <Label className="text-white">Encrypted Text</Label>
              <Textarea
                value={encryptedText}
                onChange={(e) => setEncryptedText(e.target.value)}
                placeholder="Paste encrypted text here..."
                className="bg-slate-800 border-slate-700 text-white font-mono text-xs h-32"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Decryption Password</Label>
              <Input
                type="password"
                value={decryptPassword}
                onChange={(e) => setDecryptPassword(e.target.value)}
                placeholder="Enter password"
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <Button
              onClick={decryptData}
              className="w-full bg-green-600 hover:bg-green-700"
              disabled={!encryptedText || !decryptPassword}
            >
              <Unlock className="w-4 h-4 mr-2" />
              Decrypt
            </Button>

            {decryptedText && (
              <div className="space-y-2">
                <Label className="text-white">Decrypted Output</Label>
                <Textarea
                  value={decryptedText}
                  readOnly
                  className="bg-slate-800 border-slate-700 text-white h-32"
                />
                <Button
                  onClick={() => copyToClipboard(decryptedText)}
                  variant="outline"
                  className="w-full"
                >
                  <Copy className="w-4 h-4 mr-2" />
                  Copy Decrypted Text
                </Button>
              </div>
            )}
          </TabsContent>
        </Tabs>

        <div className="mt-6 bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
          <p className="text-sm text-blue-300 font-semibold mb-2">Security Notes:</p>
          <ul className="text-xs text-blue-200 space-y-1 list-disc list-inside">
            <li>Uses AES-256-GCM encryption (military-grade)</li>
            <li>Password is hashed with PBKDF2 (100,000 iterations)</li>
            <li>Each encryption uses random salt and IV</li>
            <li>Passwords are never stored or transmitted</li>
            <li>All encryption happens in your browser</li>
          </ul>
        </div>
      </CardContent>
    </Card>
  );
}