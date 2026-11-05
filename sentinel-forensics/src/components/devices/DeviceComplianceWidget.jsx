import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, CheckCircle, Shield, XCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function DeviceComplianceWidget({ devices }) {
  const compliantDevices = devices.filter(d => d.compliance_status === 'compliant');
  const nonCompliantDevices = devices.filter(d => d.compliance_status === 'non_compliant');
  const partiallyCompliantDevices = devices.filter(d => d.compliance_status === 'partially_compliant');

  const complianceIssues = devices.filter(d => d.compliance_status !== 'compliant').map(device => {
    const issues = [];
    const secProfile = device.security_profile || {};
    
    if (!secProfile.disk_encrypted) issues.push('Disk not encrypted');
    if (!secProfile.firewall_enabled) issues.push('Firewall disabled');
    if (!secProfile.os_patched) issues.push('OS outdated');
    if (!secProfile.antimalware_running) issues.push('No antimalware');
    
    return {
      device_name: device.display_name,
      device_id: device.id,
      issues
    };
  }).filter(d => d.issues.length > 0);

  const compliancePercentage = devices.length > 0 
    ? Math.round((compliantDevices.length / devices.length) * 100) 
    : 0;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Shield className="w-5 h-5 text-blue-400" />
          Device Compliance
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Compliance Overview */}
        <div className="grid grid-cols-3 gap-4">
          <div className="text-center p-3 bg-green-500/10 rounded-lg border border-green-500/30">
            <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
            <p className="text-2xl font-bold text-white">{compliantDevices.length}</p>
            <p className="text-xs text-slate-400">Compliant</p>
          </div>

          <div className="text-center p-3 bg-yellow-500/10 rounded-lg border border-yellow-500/30">
            <AlertTriangle className="w-8 h-8 mx-auto mb-2 text-yellow-400" />
            <p className="text-2xl font-bold text-white">{partiallyCompliantDevices.length}</p>
            <p className="text-xs text-slate-400">Partial</p>
          </div>

          <div className="text-center p-3 bg-red-500/10 rounded-lg border border-red-500/30">
            <XCircle className="w-8 h-8 mx-auto mb-2 text-red-400" />
            <p className="text-2xl font-bold text-white">{nonCompliantDevices.length}</p>
            <p className="text-xs text-slate-400">Non-Compliant</p>
          </div>
        </div>

        {/* Compliance Score */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-slate-400">Overall Compliance</span>
            <span className="text-sm font-bold text-white">{compliancePercentage}%</span>
          </div>
          <div className="w-full bg-slate-700 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all ${
                compliancePercentage >= 80 ? 'bg-green-500' :
                compliancePercentage >= 60 ? 'bg-yellow-500' : 'bg-red-500'
              }`}
              style={{ width: `${compliancePercentage}%` }}
            />
          </div>
        </div>

        {/* Compliance Issues */}
        {complianceIssues.length > 0 && (
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-300">Devices Requiring Attention</h4>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {complianceIssues.slice(0, 5).map(device => (
                <div key={device.device_id} className="p-2 bg-slate-800/50 rounded border border-slate-700">
                  <p className="text-sm text-white font-medium mb-1">{device.device_name}</p>
                  <div className="flex flex-wrap gap-1">
                    {device.issues.map((issue, idx) => (
                      <Badge key={idx} className="bg-red-500/20 text-red-400 border-red-500/50 text-xs">
                        {issue}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <Link to={createPageUrl('Devices')}>
              <p className="text-xs text-blue-400 hover:underline text-center mt-2">
                View all devices →
              </p>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}