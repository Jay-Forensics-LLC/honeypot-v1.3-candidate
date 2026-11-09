import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Cloud,
  Server,
  Terminal,
  FileCode,
  Download
} from 'lucide-react';

const DEPLOYMENT_TEMPLATES = {
  intune: {
    name: 'Microsoft Intune',
    description: 'Cloud-based MDM for Windows endpoints',
    icon: Cloud,
    color: 'blue',
    platform: 'windows',
    difficulty: 'Easy',
    features: ['Cloud-based', 'Auto-enrollment', 'Compliance policies', 'Reporting']
  },
  jamf: {
    name: 'Jamf Pro',
    description: 'Apple device management platform',
    icon: Cloud,
    color: 'purple',
    platform: 'macos',
    difficulty: 'Easy',
    features: ['macOS/iOS MDM', 'Self Service', 'Smart Groups', 'Automated patching']
  },
  sccm: {
    name: 'SCCM',
    description: 'Microsoft System Center Configuration Manager',
    icon: Server,
    color: 'green',
    platform: 'windows',
    difficulty: 'Medium',
    features: ['On-premises', 'Software deployment', 'Compliance', 'Inventory']
  },
  ansible: {
    name: 'Ansible',
    description: 'Agentless automation platform',
    icon: Terminal,
    color: 'red',
    platform: 'mixed',
    difficulty: 'Medium',
    features: ['Agentless', 'YAML playbooks', 'Multi-platform', 'Idempotent']
  },
  chef: {
    name: 'Chef',
    description: 'Infrastructure as code automation',
    icon: FileCode,
    color: 'orange',
    platform: 'mixed',
    difficulty: 'Medium',
    features: ['Ruby DSL', 'Chef Server', 'Cookbooks', 'Test Kitchen']
  },
  puppet: {
    name: 'Puppet',
    description: 'Declarative configuration management',
    icon: FileCode,
    color: 'yellow',
    platform: 'mixed',
    difficulty: 'Medium',
    features: ['Declarative', 'Puppet Master', 'Modules', 'Reporting']
  },
  manual_script: {
    name: 'Manual Script',
    description: 'Shell/PowerShell scripts for manual deployment',
    icon: Terminal,
    color: 'slate',
    platform: 'mixed',
    difficulty: 'Easy',
    features: ['Simple', 'No dependencies', 'Direct control', 'Quick deployment']
  }
};

export default function DeploymentTemplates({ onSelectTemplate }) {
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
      {Object.entries(DEPLOYMENT_TEMPLATES).map(([key, template]) => {
        const Icon = template.icon;
        return (
          <Card key={key} className="bg-slate-800/50 border-slate-700 hover:border-blue-500/50 transition-all">
            <CardContent className="p-6">
              <div className="flex items-start gap-4 mb-4">
                <div className={`w-12 h-12 rounded-lg flex items-center justify-center bg-${template.color}-500/20`}>
                  <Icon className={`w-6 h-6 text-${template.color}-400`} />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-white mb-1">{template.name}</h3>
                  <p className="text-xs text-slate-400">{template.description}</p>
                </div>
              </div>

              <div className="flex items-center gap-2 mb-3">
                <Badge className="bg-blue-500/20 text-blue-400 text-xs">
                  {template.platform}
                </Badge>
                <Badge className={
                  template.difficulty === 'Easy' ? 'bg-green-500/20 text-green-400 text-xs' :
                  'bg-yellow-500/20 text-yellow-400 text-xs'
                }>
                  {template.difficulty}
                </Badge>
              </div>

              <ul className="space-y-1 mb-4 text-xs text-slate-400">
                {template.features.slice(0, 3).map((feature, i) => (
                  <li key={i}>• {feature}</li>
                ))}
              </ul>

              <Button
                onClick={() => onSelectTemplate(key)}
                className="w-full bg-blue-600 hover:bg-blue-700"
                size="sm"
              >
                <Download className="w-4 h-4 mr-2" />
                Use Template
              </Button>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export { DEPLOYMENT_TEMPLATES };