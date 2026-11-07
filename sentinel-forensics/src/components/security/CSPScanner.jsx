import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Code, Hash, CheckCircle, AlertTriangle, Copy, Shield } from 'lucide-react';
import { toast } from 'sonner';

/**
 * CSP Scanner - Scans for inline scripts and generates SHA-256 hashes
 */
export default function CSPScanner() {
  const [scanResults, setScanResults] = useState(null);
  const [scanning, setScanning] = useState(false);

  const scanInlineScripts = async () => {
    setScanning(true);
    
    try {
      // Scan DOM for inline scripts
      const inlineScripts = Array.from(document.querySelectorAll('script:not([src])')).filter(
        script => script.textContent.trim().length > 0
      );
      
      const inlineStyles = Array.from(document.querySelectorAll('style')).filter(
        style => style.textContent.trim().length > 0
      );

      const scriptHashes = [];
      const styleHashes = [];

      // Generate SHA-256 hashes for scripts
      for (const script of inlineScripts) {
        const content = script.textContent;
        const hash = await generateSHA256(content);
        scriptHashes.push({
          content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
          hash: `'sha256-${hash}'`,
          fullHash: hash,
          length: content.length
        });
      }

      // Generate SHA-256 hashes for styles
      for (const style of inlineStyles) {
        const content = style.textContent;
        const hash = await generateSHA256(content);
        styleHashes.push({
          content: content.substring(0, 100) + (content.length > 100 ? '...' : ''),
          hash: `'sha256-${hash}'`,
          fullHash: hash,
          length: content.length
        });
      }

      setScanResults({
        scriptCount: inlineScripts.length,
        styleCount: inlineStyles.length,
        scriptHashes,
        styleHashes,
        timestamp: new Date().toISOString()
      });

      setScanning(false);

      if (inlineScripts.length === 0) {
        toast.success('No inline scripts found - CSP compliant! ✅');
      } else {
        toast.warning(`Found ${inlineScripts.length} inline scripts requiring hashes`);
      }

    } catch (error) {
      setScanning(false);
      toast.error('Scan failed: ' + error.message);
    }
  };

  const generateSHA256 = async (content) => {
    const encoder = new TextEncoder();
    const data = encoder.encode(content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return btoa(String.fromCharCode(...hashArray));
  };

  const copyCSPDirective = () => {
    if (!scanResults) return;

    const scriptSrc = scanResults.scriptHashes.length > 0
      ? `script-src 'self' ${scanResults.scriptHashes.map(h => h.hash).join(' ')} https://cdn.jsdelivr.net https://unpkg.com;`
      : `script-src 'self' https://cdn.jsdelivr.net https://unpkg.com;`;

    const styleSrc = scanResults.styleHashes.length > 0
      ? `style-src 'self' 'unsafe-inline' ${scanResults.styleHashes.map(h => h.hash).join(' ')};`
      : `style-src 'self' 'unsafe-inline';`;

    const fullCSP = `default-src 'self'; ${scriptSrc} ${styleSrc} img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'none'; base-uri 'self'; form-action 'self';`;

    navigator.clipboard.writeText(fullCSP);
    toast.success('CSP directive copied to clipboard!');
  };

  const copyHashesArray = (type) => {
    if (!scanResults) return;
    
    const hashes = type === 'script' ? scanResults.scriptHashes : scanResults.styleHashes;
    const hashArray = hashes.map(h => h.hash).join('\n');
    
    navigator.clipboard.writeText(hashArray);
    toast.success(`${type} hashes copied!`);
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Hash className="w-5 h-5 text-purple-400" />
            CSP Inline Script Scanner
          </div>
          <Button
            onClick={scanInlineScripts}
            disabled={scanning}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {scanning ? (
              <>
                <Code className="w-4 h-4 mr-2 animate-spin" />
                Scanning...
              </>
            ) : (
              <>
                <Code className="w-4 h-4 mr-2" />
                Scan DOM
              </>
            )}
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!scanResults ? (
          <div className="text-center py-8">
            <Code className="w-16 h-16 mx-auto mb-4 text-slate-600" />
            <p className="text-slate-400">
              Click "Scan DOM" to detect inline scripts and styles
            </p>
          </div>
        ) : (
          <>
            {/* Summary */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-slate-800/50 p-4 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">Inline Scripts</p>
                <p className="text-2xl font-bold text-white">{scanResults.scriptCount}</p>
                {scanResults.scriptCount === 0 && (
                  <Badge className="mt-2 bg-green-500/20 text-green-400">
                    <CheckCircle className="w-3 h-3 mr-1" />
                    Clean
                  </Badge>
                )}
                {scanResults.scriptCount > 0 && (
                  <Badge className="mt-2 bg-yellow-500/20 text-yellow-400">
                    <AlertTriangle className="w-3 h-3 mr-1" />
                    Needs Hashes
                  </Badge>
                )}
              </div>

              <div className="bg-slate-800/50 p-4 rounded-lg">
                <p className="text-xs text-slate-400 mb-1">Inline Styles</p>
                <p className="text-2xl font-bold text-white">{scanResults.styleCount}</p>
                <Badge className="mt-2 bg-blue-500/20 text-blue-400">
                  <CheckCircle className="w-3 h-3 mr-1" />
                  Handled
                </Badge>
              </div>
            </div>

            {/* Script Hashes */}
            {scanResults.scriptHashes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">Script Hashes (SHA-256)</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyHashesArray('script')}
                    className="border-slate-700 text-slate-300"
                  >
                    <Copy className="w-3 h-3 mr-2" />
                    Copy Hashes
                  </Button>
                </div>
                <div className="space-y-2">
                  {scanResults.scriptHashes.map((item, idx) => (
                    <div key={idx} className="bg-slate-950/50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className="bg-purple-500/20 text-purple-400">
                          Script #{idx + 1}
                        </Badge>
                        <span className="text-xs text-slate-500">{item.length} bytes</span>
                      </div>
                      <div className="font-mono text-xs text-green-400 bg-slate-900 p-2 rounded mb-2 break-all">
                        {item.hash}
                      </div>
                      <details className="text-xs">
                        <summary className="text-slate-400 cursor-pointer hover:text-white">
                          Preview content
                        </summary>
                        <pre className="mt-2 text-slate-300 bg-slate-900 p-2 rounded overflow-x-auto">
                          {item.content}
                        </pre>
                      </details>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Style Hashes */}
            {scanResults.styleHashes.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-white font-semibold">Style Hashes (SHA-256)</h3>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => copyHashesArray('style')}
                    className="border-slate-700 text-slate-300"
                  >
                    <Copy className="w-3 h-3 mr-2" />
                    Copy Hashes
                  </Button>
                </div>
                <div className="space-y-2">
                  {scanResults.styleHashes.slice(0, 3).map((item, idx) => (
                    <div key={idx} className="bg-slate-950/50 p-3 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <Badge className="bg-blue-500/20 text-blue-400">
                          Style #{idx + 1}
                        </Badge>
                        <span className="text-xs text-slate-500">{item.length} bytes</span>
                      </div>
                      <div className="font-mono text-xs text-blue-400 bg-slate-900 p-2 rounded break-all">
                        {item.hash}
                      </div>
                    </div>
                  ))}
                  {scanResults.styleHashes.length > 3 && (
                    <p className="text-xs text-slate-500 text-center">
                      ... and {scanResults.styleHashes.length - 3} more styles
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* Complete CSP Directive */}
            <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-white font-semibold flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-400" />
                  Complete CSP Directive
                </h3>
                <Button
                  size="sm"
                  onClick={copyCSPDirective}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Copy className="w-3 h-3 mr-2" />
                  Copy CSP
                </Button>
              </div>
              <pre className="text-xs text-blue-200 bg-slate-950/50 p-3 rounded overflow-x-auto whitespace-pre-wrap">
                {scanResults.scriptHashes.length > 0
                  ? `default-src 'self'; script-src 'self' ${scanResults.scriptHashes.map(h => h.hash).join(' ')} https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'none'; base-uri 'self'; form-action 'self';`
                  : `default-src 'self'; script-src 'self' https://cdn.jsdelivr.net https://unpkg.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: blob:; font-src 'self' data:; connect-src 'self' https: wss:; frame-src 'none'; base-uri 'self'; form-action 'self';`
                }
              </pre>
            </div>

            {scanResults.scriptCount === 0 && (
              <div className="bg-green-900/20 border border-green-500/30 rounded-lg p-4 text-center">
                <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-400" />
                <p className="text-green-200 font-semibold mb-2">
                  ✅ No Inline Scripts Detected
                </p>
                <p className="text-sm text-green-300/80">
                  Your application is CSP-compliant without requiring script hashes. 
                  You can safely remove 'unsafe-inline' from script-src.
                </p>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}