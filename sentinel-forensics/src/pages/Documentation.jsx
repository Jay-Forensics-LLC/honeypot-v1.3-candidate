import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Book,
  Shield,
  Terminal,
  FileText,
  AlertTriangle,
  CheckCircle,
  Github,
  Zap,
  Database,
  Radio,
  Users,
  Lock
} from 'lucide-react';
import { FEATURE_FLAGS } from '../components/config/featureFlags';

export default function Documentation() {
  return (
    <div className="p-4 md:p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col md:flex-row items-start md:items-center gap-4 mb-8">
        <div className="w-12 h-12 md:w-16 md:h-16 bg-gradient-to-br from-blue-600 to-purple-600 rounded-lg flex items-center justify-center flex-shrink-0">
          <Book className="w-6 h-6 md:w-8 md:h-8 text-white" />
        </div>
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-white">Documentation</h1>
          <p className="text-slate-400 text-sm md:text-base">Sentinel Forensics v0.9.0 - Public Demo Release</p>
        </div>
      </div>

      {/* Demo Mode Notice */}
      {FEATURE_FLAGS.PUBLIC_DEMO_MODE && (
        <Alert className="bg-blue-500/10 border-blue-500/30">
          <Shield className="h-5 w-5 text-blue-400" />
          <AlertDescription className="text-blue-300">
            <strong>Public Demo Mode Active</strong> - No login required. All features unlocked until {FEATURE_FLAGS.FREE_TRIAL_UNTIL}. 
            Subscriptions resume after trial period.
          </AlertDescription>
        </Alert>
      )}

      {/* Quick Start */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Zap className="w-5 h-5 text-yellow-400" />
            Quick Start Guide
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h3 className="text-base md:text-lg font-semibold text-white mb-3">Getting Started in 5 Minutes</h3>
            <ol className="list-decimal list-inside space-y-3 text-sm md:text-base text-slate-300">
              <li>
                <strong className="text-white">Create a Case:</strong> Navigate to Cases → New Case to start an investigation
              </li>
              <li>
                <strong className="text-white">Upload Evidence:</strong> Go to Evidence → Upload Evidence and attach files with automatic SHA-256 hashing
              </li>
              <li>
                <strong className="text-white">Run Security Scan:</strong> Visit Threat Detection and click "Run Security Scan" to detect threats
              </li>
              <li>
                <strong className="text-white">Review Alerts:</strong> Check the Dashboard for security alerts and take recommended actions
              </li>
              <li>
                <strong className="text-white">Generate Report:</strong> In Reports, select a case and generate a forensic report
              </li>
            </ol>
          </div>
        </CardContent>
      </Card>

      {/* Feature Overview */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Database className="w-5 h-5 text-green-400" />
            Core Features
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="w-5 h-5 text-blue-400" />
                <h4 className="font-semibold text-white text-sm md:text-base">Case Management</h4>
              </div>
              <p className="text-xs md:text-sm text-slate-400">
                Create, track, and manage forensic investigation cases with full audit trails
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-5 h-5 text-green-400" />
                <h4 className="font-semibold text-white text-sm md:text-base">Evidence Vault</h4>
              </div>
              <p className="text-xs md:text-sm text-slate-400">
                Secure evidence storage with SHA-256 hashing and chain-of-custody tracking
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="w-5 h-5 text-red-400" />
                <h4 className="font-semibold text-white text-sm md:text-base">Threat Detection</h4>
              </div>
              <p className="text-xs md:text-sm text-slate-400">
                Real-time security monitoring with AI-powered threat analysis
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Radio className="w-5 h-5 text-purple-400" />
                <h4 className="font-semibold text-white text-sm md:text-base">BLE Monitoring</h4>
              </div>
              <p className="text-xs md:text-sm text-slate-400">
                Bluetooth Low Energy surveillance detection and forensic capture
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-5 h-5 text-orange-400" />
                <h4 className="font-semibold text-white text-sm md:text-base">Live Defense</h4>
              </div>
              <p className="text-xs md:text-sm text-slate-400">
                Immediate threat response with panic shield and network isolation
              </p>
            </div>

            <div className="p-4 bg-slate-800/50 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <Lock className="w-5 h-5 text-pink-400" />
                <h4 className="font-semibold text-white text-sm md:text-base">Pegasus Defense</h4>
              </div>
              <p className="text-xs md:text-sm text-slate-400">
                Zero-click exploit detection and memory forensics
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <FileText className="w-5 h-5 text-cyan-400" />
            Documentation & Resources
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Link
            to={createPageUrl('FunctionalReadinessReport')}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <CheckCircle className="w-5 h-5 text-green-400" />
              <div>
                <p className="font-semibold text-white text-sm md:text-base">Functional Readiness Report</p>
                <p className="text-xs text-slate-400">Pre-launch validation and testing results</p>
              </div>
            </div>
            <Badge className="bg-green-500/20 text-green-400">ADMIN</Badge>
          </Link>

          <Link
            to={createPageUrl('ProductionRunbook')}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Terminal className="w-5 h-5 text-blue-400" />
              <div>
                <p className="font-semibold text-white text-sm md:text-base">Production Runbook</p>
                <p className="text-xs text-slate-400">Deployment, configuration, and operations guide</p>
              </div>
            </div>
            <Badge className="bg-blue-500/20 text-blue-400">ADMIN</Badge>
          </Link>

          <Link
            to={createPageUrl('IntegrationsStatus')}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Zap className="w-5 h-5 text-purple-400" />
              <div>
                <p className="font-semibold text-white text-sm md:text-base">API Integrations Status</p>
                <p className="text-xs text-slate-400">Real-time monitoring of external services</p>
              </div>
            </div>
            <Badge className="bg-purple-500/20 text-purple-400">ADMIN</Badge>
          </Link>

          <Link
            to={createPageUrl('AgentTestingDashboard')}
            className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg hover:bg-slate-800 transition-colors"
          >
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-pink-400" />
              <div>
                <p className="font-semibold text-white text-sm md:text-base">Agent Testing Dashboard</p>
                <p className="text-xs text-slate-400">Test AI agents and inter-agent collaboration</p>
              </div>
            </div>
            <Badge className="bg-pink-500/20 text-pink-400">ADMIN</Badge>
          </Link>
        </CardContent>
      </Card>

      {/* GitHub & Release Info */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Github className="w-5 h-5 text-white" />
            Open Source & Community
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-4 p-4 bg-slate-800/50 rounded-lg">
            <div className="flex-1">
              <p className="font-semibold text-white mb-1">Source Code</p>
              <p className="text-sm text-slate-400">
                Sentinel Forensics is open source. View the code, report issues, and contribute on GitHub.
              </p>
            </div>
            <Button
              variant="outline"
              className="border-slate-700 w-full md:w-auto"
              onClick={() => window.open('https://github.com/jayforensics/sentinel-forensics', '_blank')}
            >
              <Github className="w-4 h-4 mr-2" />
              View on GitHub
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white mb-1">v0.9.0</p>
              <p className="text-xs text-slate-400">Current Version</p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white mb-1">MIT</p>
              <p className="text-xs text-slate-400">License</p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-2xl font-bold text-white mb-1">Active</p>
              <p className="text-xs text-slate-400">Development</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Support */}
      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-green-400" />
            Support & Contact
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-300">
            Need help? Contact Jay Forensics LLC support team:
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Email Support</p>
              <p className="text-sm text-white font-mono">support@jayforensics.com</p>
            </div>
            <div className="p-3 bg-slate-800/50 rounded-lg">
              <p className="text-xs text-slate-400 mb-1">Emergency Contact</p>
              <p className="text-sm text-white font-mono">emergency@jayforensics.com</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}