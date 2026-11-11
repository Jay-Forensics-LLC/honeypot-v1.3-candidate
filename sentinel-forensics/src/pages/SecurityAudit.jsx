import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Shield,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Lock,
  Key,
  Database,
  ArrowLeft,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '../components/utils';

export default function SecurityAudit() {
  const navigate = useNavigate();
  const [expandedItems, setExpandedItems] = useState({});
  const securityFindings = [
    {
      category: 'Authentication & Authorization',
      status: 'pass',
      items: [
        {
          check: 'Hardcoded Secrets',
          status: 'fixed',
          severity: 'critical',
          finding: 'agentEnrollmentToken had hardcoded AGENT_SECRET_TOKEN',
          fix: 'Now retrieves from Deno.env.get() with error handling',
          commit: 'Latest'
        },
        {
          check: 'RLS Bypass Protection',
          status: 'fixed',
          severity: 'critical',
          finding: 'Functions using asServiceRole without permission checks',
          fix: 'Added user validation before asServiceRole access in all backend functions',
          commit: 'Latest'
        },
        {
          check: 'MFA Enforcement',
          status: 'pass',
          severity: 'high',
          finding: 'MFA properly enforced for admin users',
          fix: 'N/A - working correctly'
        },
        {
          check: 'Session Management',
          status: 'pass',
          severity: 'high',
          finding: 'Secure cookies with rotation',
          fix: 'N/A - working correctly'
        }
      ]
    },
    {
      category: 'Data Access Control',
      status: 'pass',
      items: [
        {
          check: 'Entity RLS Rules',
          status: 'pass',
          severity: 'critical',
          finding: 'All entities have proper RLS rules',
          fix: 'N/A - comprehensive RLS across all entities'
        },
        {
          check: 'Cross-User Data Leakage',
          status: 'fixed',
          severity: 'critical',
          finding: 'Potential leakage via asServiceRole',
          fix: 'All functions now validate user access before using asServiceRole'
        },
        {
          check: 'Audit Log Protection',
          status: 'pass',
          severity: 'high',
          finding: 'Admin-only read access',
          fix: 'N/A - properly restricted'
        }
      ]
    },
    {
      category: 'API Security',
      status: 'pass',
      items: [
        {
          check: 'API Key Storage',
          status: 'pass',
          severity: 'critical',
          finding: 'All API keys in environment variables',
          fix: 'N/A - no keys in code'
        },
        {
          check: 'Rate Limiting',
          status: 'pass',
          severity: 'medium',
          finding: 'Token bucket algorithm with 429 responses',
          fix: 'N/A - working correctly with proper HTTP status codes'
        },
        {
          check: 'Request Validation',
          status: 'pass',
          severity: 'high',
          finding: 'All endpoints validate required fields',
          fix: 'N/A - comprehensive validation'
        },
        {
          check: 'Error Information Leakage',
          status: 'pass',
          severity: 'medium',
          finding: 'Generic error messages, no stack traces to client',
          fix: 'N/A - proper error handling'
        }
      ]
    },
    {
      category: 'Cryptography',
      status: 'pass',
      items: [
        {
          check: 'Hash Functions',
          status: 'pass',
          severity: 'high',
          finding: 'SHA-256 used for all security-critical hashing',
          fix: 'N/A - Web Crypto API properly used'
        },
        {
          check: 'Encryption Implementation',
          status: 'pass',
          severity: 'high',
          finding: 'AES-256-GCM with PBKDF2 key derivation',
          fix: 'N/A - proper encryption'
        },
        {
          check: 'Random Number Generation',
          status: 'pass',
          severity: 'high',
          finding: 'crypto.getRandomValues() used',
          fix: 'N/A - cryptographically secure'
        },
        {
          check: 'CSRF Token Storage',
          status: 'fixed',
          severity: 'high',
          finding: 'CSRF tokens previously stored in sessionStorage (XSS vulnerability)',
          fix: 'Moved to HTTP-only cookies with SameSite=Strict, removed client storage entirely',
          commit: 'Latest'
        }
      ]
    },
    {
      category: 'Agent Security',
      status: 'pass',
      items: [
        {
          check: 'Agent Token Management',
          status: 'pass',
          severity: 'high',
          finding: 'Tokens hashed, IP whitelisting supported',
          fix: 'N/A - secure implementation'
        },
        {
          check: 'Agent Permission Scoping',
          status: 'pass',
          severity: 'high',
          finding: 'Agents have minimal required permissions',
          fix: 'N/A - principle of least privilege applied'
        },
        {
          check: 'Command Signing',
          status: 'pass',
          severity: 'critical',
          finding: 'Ed25519 signatures on agent commands',
          fix: 'N/A - properly implemented'
        },
        {
          check: 'Enrollment Token Security',
          status: 'fixed',
          severity: 'critical',
          finding: 'Token generation failed for all platforms due to missing device validation',
          fix: 'Implemented pre-enrollment tokens that work before device exists',
          commit: 'Latest'
        }
      ]
    },
    {
      category: 'Web Application Security',
      status: 'warning', // Category status should reflect items within, 'warning' is appropriate for 'not_performed'
      items: [
        {
          check: 'XSS Prevention',
          status: 'not_performed',
          severity: 'high',
          finding: 'No automated XSS scanning performed yet',
          fix: 'RECOMMENDED: Run automated penetration tests via Pen Test Management page'
        },
        {
          check: 'SQL Injection Prevention',
          status: 'not_performed',
          severity: 'high',
          finding: 'Base44 platform handles database queries (assumed safe)',
          fix: 'RECOMMENDED: Verify via penetration testing'
        },
        {
          check: 'Content Security Policy',
          status: 'not_performed',
          severity: 'medium',
          finding: 'CSP headers not verified in automated checks',
          fix: 'RECOMMENDED: Add CSP configuration validation to audit'
        },
        {
          check: 'Dependency Vulnerabilities',
          status: 'not_performed',
          severity: 'medium',
          finding: 'No automated dependency scanning configured',
          fix: 'RECOMMENDED: Integrate npm audit or Snyk scanning'
        }
      ]
    }
  ];

  const totalChecks = securityFindings.reduce((sum, cat) => sum + cat.items.length, 0);
  const passedChecks = securityFindings.reduce((sum, cat) =>
    sum + cat.items.filter(i => i.status === 'pass' || i.status === 'fixed').length, 0);
  const notPerformedChecks = securityFindings.reduce((sum, cat) =>
    sum + cat.items.filter(i => i.status === 'not_performed').length, 0);
  const criticalFixed = securityFindings.reduce((sum, cat) =>
    sum + cat.items.filter(i => i.severity === 'critical' && i.status === 'fixed').length, 0);

  const toggleItem = (catIdx, itemIdx) => {
    const key = `${catIdx}-${itemIdx}`;
    setExpandedItems(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl('Dashboard'))}
            className="text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div className="w-16 h-16 bg-gradient-to-br from-red-600 to-orange-600 rounded-lg flex items-center justify-center">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Security Audit Report</h1>
            <p className="text-slate-400">Comprehensive security review - Pre-launch validation</p>
          </div>
        </div>

        {/* Summary */}
        <div className="grid md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-10 h-10 text-green-400" />
              <div>
                <p className="text-3xl font-bold text-white">{passedChecks}</p>
                <p className="text-xs text-green-400">Passed/Fixed</p>
              </div>
            </div>
          </CardContent>
        </Card>

          <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Shield className="w-10 h-10 text-blue-400" />
              <div>
                <p className="text-3xl font-bold text-white">{totalChecks}</p>
                <p className="text-xs text-blue-400">Total Checks</p>
              </div>
            </div>
          </CardContent>
        </Card>

          <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-10 h-10 text-orange-400" />
              <div>
                <p className="text-3xl font-bold text-white">{notPerformedChecks}</p>
                <p className="text-xs text-orange-400">Not Tested</p>
              </div>
            </div>
          </CardContent>
        </Card>

          <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <Lock className="w-10 h-10 text-purple-400" />
              <div>
                <p className="text-3xl font-bold text-white">{Math.round((passedChecks / totalChecks) * 100)}%</p>
                <p className="text-xs text-purple-400">Coverage</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

        {/* Critical Fixes Alert */}
        {criticalFixed > 0 && (
          <Alert className="bg-slate-900/50 border-green-500/30">
          <CheckCircle className="h-5 w-5 text-green-400" />
          <AlertDescription className="text-green-300">
            <strong>Security Hardening Complete:</strong> {criticalFixed} critical vulnerabilities identified and fixed in this release.
          </AlertDescription>
        </Alert>
      )}

        {/* Not Performed Checks Warning */}
        {notPerformedChecks > 0 && (
          <Alert className="bg-slate-900/50 border-yellow-500/30">
          <AlertTriangle className="h-5 w-5 text-yellow-400" />
          <AlertDescription className="text-yellow-200">
            <strong>⚠️ Incomplete Security Audit:</strong> {notPerformedChecks} check(s) have not been performed yet.
            <p className="text-sm mt-2">
              These checks are marked as "NOT PERFORMED" rather than passing by default.
              Run automated penetration tests and manual validation to complete the audit.
            </p>
          </AlertDescription>
        </Alert>
      )}

        {/* Detailed Findings */}
        <div className="space-y-6">
          {securityFindings.map((category, catIdx) => (
            <Card key={catIdx} className="bg-slate-900/50 border-slate-800">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Database className="w-5 h-5 text-cyan-400" />
                    {category.category}
                  </CardTitle>
                  <Badge className={`${
                    category.status === 'pass' ? 'bg-green-500/20 text-green-400' :
                    category.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                    'bg-red-500/20 text-red-400'
                  }`}>
                    {category.status.toUpperCase()}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {category.items.map((item, itemIdx) => {
                    const StatusIcon = item.status === 'pass' || item.status === 'fixed' ? CheckCircle :
                                      item.status === 'warning' || item.status === 'not_performed' ? AlertTriangle : XCircle;
                    const statusColor = item.status === 'pass' || item.status === 'fixed' ? 'text-green-400' :
                                       item.status === 'warning' || item.status === 'not_performed' ? 'text-yellow-400' :
                                       'text-red-400';
                    const itemKey = `${catIdx}-${itemIdx}`;
                    const isExpanded = expandedItems[itemKey];

                    return (
                      <div
                        key={itemIdx}
                        onClick={() => toggleItem(catIdx, itemIdx)}
                        className={`rounded-lg p-4 cursor-pointer transition-all hover:bg-slate-800/70 ${
                          item.status === 'not_performed'
                            ? 'bg-slate-800/30 border border-yellow-500/30'
                            : 'bg-slate-800/50 border border-slate-700'
                        }`}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-3 flex-1">
                            <StatusIcon className={`w-5 h-5 ${statusColor} flex-shrink-0`} />
                            <div className="flex-1">
                              <h3 className="font-semibold text-white">{item.check}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                <Badge className={`${
                                  item.severity === 'critical' ? 'bg-red-500/20 text-red-400' :
                                  item.severity === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                  item.severity === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-blue-500/20 text-blue-400'
                                }`}>
                                  {item.severity.toUpperCase()}
                                </Badge>
                                <Badge className={`${
                                  item.status === 'pass' || item.status === 'fixed' ? 'bg-green-500/20 text-green-400' :
                                  item.status === 'not_performed' ? 'bg-yellow-500/20 text-yellow-400' :
                                  item.status === 'warning' ? 'bg-yellow-500/20 text-yellow-400' :
                                  'bg-red-500/20 text-red-400'
                                }`}>
                                  {item.status === 'not_performed' ? 'NOT TESTED' : item.status.toUpperCase()}
                                </Badge>
                              </div>
                            </div>
                          </div>
                          {isExpanded ? (
                            <ChevronUp className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          ) : (
                            <ChevronDown className="w-5 h-5 text-slate-400 flex-shrink-0" />
                          )}
                        </div>

                        {isExpanded && (
                          <div className="ml-8 mt-4 space-y-3 border-t border-slate-700 pt-3">
                            <div>
                              <p className="text-xs text-slate-400 mb-1">Finding:</p>
                              <p className="text-sm text-slate-200">{item.finding}</p>
                            </div>
                            {item.fix && (
                              <div>
                                <p className="text-xs text-slate-400 mb-1">
                                  {item.status === 'not_performed' ? 'Recommendation:' : 'Resolution:'}
                                </p>
                                <p className={`text-sm ${
                                  item.status === 'not_performed' ? 'text-yellow-300' : 'text-green-300'
                                }`}>
                                  {item.fix}
                                </p>
                              </div>
                            )}
                            {item.commit && item.status !== 'not_performed' && (
                              <div>
                                <p className="text-xs text-slate-400 mb-1">Commit:</p>
                                <code className="text-xs text-cyan-400 bg-slate-950 px-2 py-1 rounded">
                                  {item.commit}
                                </code>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

      {/* Recommendations */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Key className="w-5 h-5 text-yellow-400" />
            Security Hardening Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold">Environment Variable Validation</p>
                <p className="text-sm text-slate-400">
                  All critical secrets now fail fast at startup if missing, preventing runtime errors
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold">RLS-First Architecture</p>
                <p className="text-sm text-slate-400">
                  User permissions validated before any asServiceRole access, preventing privilege escalation
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <CheckCircle className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold">Audit Trail Integrity</p>
                <p className="text-sm text-slate-400">
                  All unauthorized access attempts logged with SHA-256 hashing for forensic analysis
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold">Future Enhancement: Rate Limiting per User</p>
                <p className="text-sm text-slate-400">
                  Consider adding per-user rate limits on expensive operations (enrichment, correlation)
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-yellow-400 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-white font-semibold">Future Enhancement: Agent Permission Auditing</p>
                <p className="text-sm text-slate-400">
                  Implement real-time monitoring of agent entity access patterns to detect anomalies
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

        {/* Production Readiness */}
        <Card className={notPerformedChecks > 0
          ? "bg-slate-900/50 border-yellow-500/30"
          : "bg-slate-900/50 border-green-500/30"
        }>
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            {notPerformedChecks > 0 ? (
              <>
                <AlertTriangle className="w-12 h-12 text-yellow-400" />
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">
                    ⚠️ Partial Security Validation
                  </h2>
                  <p className="text-yellow-300">
                    {passedChecks} of {totalChecks} checks passed. {notPerformedChecks} checks require manual validation or automated testing.
                    All critical vulnerabilities have been fixed, but complete the remaining tests before production deployment.
                  </p>
                </div>
              </>
            ) : (
              <>
                <Shield className="w-12 h-12 text-green-400" />
                <div>
                  <h2 className="text-xl font-bold text-white mb-2">
                    🎯 Production Security: CLEARED
                  </h2>
                  <p className="text-green-300">
                    All {totalChecks} security checks have been validated.
                    The application is ready for production deployment with comprehensive security controls.
                  </p>
                </div>
              </>
            )}
          </div>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}