import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle, XCircle, Shield, Crown, Zap } from 'lucide-react';

/**
 * Feature availability matrix showing what's available in each tier
 */
export default function FeatureMatrix() {
  const features = [
    {
      category: 'Core Features',
      items: [
        { name: 'Case Management', free: true, professional: true, enterprise: true, forensic: true },
        { name: 'Evidence Upload & Storage', free: true, professional: true, enterprise: true, forensic: true },
        { name: 'Basic Reporting', free: true, professional: true, enterprise: true, forensic: true },
        { name: 'Audit Logging', free: true, professional: true, enterprise: true, forensic: true },
        { name: 'User Management', free: false, professional: true, enterprise: true, forensic: true }
      ]
    },
    {
      category: 'Security Features',
      items: [
        { name: 'MFA (TOTP/SMS)', free: true, professional: true, enterprise: true, forensic: true },
        { name: 'RBAC Access Control', free: true, professional: true, enterprise: true, forensic: true },
        { name: 'BLE Device Monitoring', free: false, professional: true, enterprise: true, forensic: true },
        { name: 'Threat Detection', free: false, professional: true, enterprise: true, forensic: true },
        { name: 'Threat Hunting', free: false, professional: true, enterprise: true, forensic: true },
        { name: 'Pegasus Defense', free: false, professional: false, enterprise: true, forensic: true },
        { name: 'Zero-Click Detection', free: false, professional: false, enterprise: true, forensic: true }
      ]
    },
    {
      category: 'Advanced Features',
      items: [
        { name: 'Honeypots', free: false, professional: true, enterprise: true, forensic: true },
        { name: 'Correlation Engine', free: false, professional: true, enterprise: true, forensic: true },
        { name: 'Automation Playbooks', free: false, professional: false, enterprise: true, forensic: true },
        { name: 'Covert Operations', free: false, professional: false, enterprise: true, forensic: true },
        { name: 'Agent Deployment', free: false, professional: false, enterprise: false, forensic: true },
        { name: 'Live Defense', free: false, professional: false, enterprise: false, forensic: true }
      ]
    },
    {
      category: 'Integrations',
      items: [
        { name: 'VirusTotal', free: true, professional: true, enterprise: true, forensic: true },
        { name: 'Shodan', free: false, professional: true, enterprise: true, forensic: true },
        { name: 'HIBP', free: false, professional: true, enterprise: true, forensic: true },
        { name: 'Custom Integrations', free: false, professional: false, enterprise: true, forensic: true }
      ]
    },
    {
      category: 'Support & Limits',
      items: [
        { name: 'Max Cases', free: '5', professional: '50', enterprise: 'Unlimited', forensic: 'Unlimited' },
        { name: 'Evidence Storage', free: '1GB', professional: '50GB', enterprise: '500GB', forensic: '5TB' },
        { name: 'API Rate Limit', free: '100/hour', professional: '1000/hour', enterprise: '10000/hour', forensic: 'Unlimited' },
        { name: 'Support Level', free: 'Community', professional: 'Email', enterprise: 'Priority', forensic: '24/7' }
      ]
    }
  ];

  const tiers = [
    { id: 'free', name: 'Free', icon: null, color: 'slate' },
    { id: 'professional', name: 'Professional', icon: Shield, color: 'blue' },
    { id: 'enterprise', name: 'Enterprise', icon: Crown, color: 'purple' },
    { id: 'forensic', name: 'Forensic Suite', icon: Zap, color: 'yellow' }
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white mb-2">Feature Availability Matrix</h2>
        <p className="text-slate-400">Compare features across subscription tiers</p>
      </div>

      {features.map((category) => (
        <Card key={category.category} className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">{category.category}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-3 px-4 text-slate-400 font-medium">Feature</th>
                    {tiers.map((tier) => {
                      const Icon = tier.icon;
                      return (
                        <th key={tier.id} className="text-center py-3 px-4">
                          <div className="flex items-center justify-center gap-2">
                            {Icon && <Icon className={`w-4 h-4 text-${tier.color}-400`} />}
                            <span className="text-white font-medium">{tier.name}</span>
                          </div>
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {category.items.map((item, index) => (
                    <tr key={index} className="border-b border-slate-800/50">
                      <td className="py-3 px-4 text-slate-300">{item.name}</td>
                      {tiers.map((tier) => {
                        const value = item[tier.id];
                        const isBoolean = typeof value === 'boolean';
                        
                        return (
                          <td key={tier.id} className="text-center py-3 px-4">
                            {isBoolean ? (
                              value ? (
                                <CheckCircle className="w-5 h-5 text-green-400 mx-auto" />
                              ) : (
                                <XCircle className="w-5 h-5 text-slate-600 mx-auto" />
                              )
                            ) : (
                              <Badge variant="outline" className="border-slate-700 text-slate-300">
                                {value}
                              </Badge>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}