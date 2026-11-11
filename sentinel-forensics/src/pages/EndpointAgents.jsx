import { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Monitor,
  Download,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Shield,
  Zap,
  Loader2,
  RefreshCw,
  BarChart3,
  Settings,
  Users,
  Copy
} from 'lucide-react';
import { toast } from 'sonner';
import { formatRelativeTime } from '../components/utils/formatters';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import DeviceRiskScore from '../components/devices/DeviceRiskScore';
import { executeRemoteCommand } from '../functions/executeRemoteCommand';
import { analyzeEndpointThreats } from '../functions/analyzeEndpointThreats';
import { analyzeSecurityPosture } from '../functions/analyzeSecurityPosture';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';

export default function EndpointAgents() {
  const [commandDialogOpen, setCommandDialogOpen] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState(null);
  const [commandType, setCommandType] = useState('');
  const [commandParams, setCommandParams] = useState('');
  const [configDialogOpen, setConfigDialogOpen] = useState(false);
  const [bulkConfig, setBulkConfig] = useState({
    monitoring_enabled: true,
    log_collection_enabled: true,
    network_capture_enabled: false,
    reporting_interval_seconds: 300,
    log_level: 'info'
  });
  const [deploymentGuide, setDeploymentGuide] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [postureDialogOpen, setPostureDialogOpen] = useState(false);
  const [selectedAgentPosture, setSelectedAgentPosture] = useState(null);
  const queryClient = useQueryClient();

  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: agents = [], isLoading } = useQuery({
    queryKey: ['endpoint-agents'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('EndpointAgent', '-last_heartbeat', 100, 15000);
      } catch (error) {
        console.warn('Failed to load agents:', error);
        return [];
      }
    },
    initialData: [],
    staleTime: 30000,
    refetchInterval: 30000
  });

  const executeCommandMutation = useMutation({
    mutationFn: async ({ agentId, commandType, params }) => {
      const { data } = await executeRemoteCommand({ agentId, commandType, params });
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-agents'] });
      setCommandDialogOpen(false);
      setSelectedAgent(null);
      setCommandType('');
      setCommandParams('');
      toast.success('Command queued successfully!', {
        description: data.message
      });
    },
    onError: (error) => {
      toast.error('Failed to execute command: ' + error.message);
    }
  });

  const analyzeAgentMutation = useMutation({
    mutationFn: async (agentId) => {
      const { data } = await analyzeEndpointThreats({ agent_id: agentId });
      return data;
    },
    onSuccess: (data, agentId) => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-agents'] });
      
      queryClient.setQueryData(['endpoint-agents'], (oldAgents) => 
        oldAgents.map(agent => agent.agent_id === agentId ? { ...agent, ai_threat_analysis: data.analysis } : agent)
      );

      toast.success('AI threat analysis completed!', {
        description: `Threat level: ${data.analysis?.threat_level || 'Unknown'}`
      });
    },
    onError: (error) => {
      toast.error('Analysis failed: ' + error.message);
    }
  });

  const analyzePostureMutation = useMutation({
    mutationFn: async (agentId) => {
      const { data } = await analyzeSecurityPosture({ agent_id: agentId });
      return data;
    },
    onSuccess: (data, agentId) => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-agents'] });
      
      const agent = agents.find(a => a.agent_id === agentId);
      setSelectedAgentPosture({ ...agent, posture_analysis: data });
      setPostureDialogOpen(true);
      
      toast.success('Security posture analyzed!', {
        description: `Compliance: ${data.compliance_score}% | Risk: ${data.risk_level}`
      });
    },
    onError: (error) => {
      toast.error('Posture analysis failed: ' + error.message);
    }
  });

  const bulkUpdateConfigMutation = useMutation({
    mutationFn: async (config) => {
      const selectedAgents = agents.filter(a => a.status === 'online');
      const updates = selectedAgents.map(agent =>
        base44.entities.EndpointAgent.update(agent.id, { configuration: config })
      );
      return Promise.all(updates);
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries({ queryKey: ['endpoint-agents'] });
      setConfigDialogOpen(false);
      toast.success(`Configuration updated for ${results.length} agents`);
    },
    onError: (error) => {
      toast.error('Bulk config update failed: ' + error.message);
    }
  });

  const onlineAgents = agents.filter(a => a.status === 'online').length;
  const offlineAgents = agents.filter(a => a.status === 'offline').length;
  const errorAgents = agents.filter(a => a.status === 'error').length;

  const openCommandDialog = (agent) => {
    setSelectedAgent(agent);
    setCommandDialogOpen(true);
  };

  const handleExecuteCommand = () => {
    let params = {};
    try {
      if (commandParams) {
        params = JSON.parse(commandParams);
      }
    } catch (error) {
      toast.error('Invalid JSON parameters');
      return;
    }

    executeCommandMutation.mutate({
      agentId: selectedAgent.agent_id,
      commandType,
      params
    });
  };

  const getInstallationInstructions = (platform) => {
    const instructions = {
      windows: {
        title: 'Windows Installation Guide',
        steps: [
          {
            step: '1. Download the Agent',
            command: '# Download MSI installer\nInvoke-WebRequest -Uri "https://sentinel-forensics.com/agents/windows/sentinel-agent-latest.msi" -OutFile "sentinel-agent.msi"',
            description: 'Download the latest Windows agent MSI package'
          },
          {
            step: '2. Install the Agent',
            command: '# Standard Installation (Run as Administrator)\nmsiexec /i sentinel-agent.msi /quiet /qn /norestart\n\n# Or with logging\nmsiexec /i sentinel-agent.msi /quiet /qn /norestart /L*v install.log',
            description: 'Install the agent silently without restart'
          },
          {
            step: '3. Configure Enrollment Token',
            command: '# Set enrollment token\n$token = "YOUR_ENROLLMENT_TOKEN_HERE"\n[Environment]::SetEnvironmentVariable("SENTINEL_TOKEN", $token, "Machine")',
            description: 'Configure the agent with your unique enrollment token'
          },
          {
            step: '4. Start the Agent Service',
            command: '# Start the Sentinel Agent service\nStart-Service -Name "SentinelAgent"\n\n# Verify service is running\nGet-Service -Name "SentinelAgent"',
            description: 'Start the agent service and verify it\'s running'
          },
          {
            step: '5. Verify Installation',
            command: '# Check agent status\ncd "C:\\Program Files\\Sentinel Agent"\n.\\sentinel-agent.exe --status\n\n# View logs\nGet-Content "C:\\ProgramData\\Sentinel\\logs\\agent.log" -Tail 20',
            description: 'Verify the agent is running and connected to the server'
          }
        ],
        enterprise: {
          title: 'Enterprise Deployment (SCCM/Intune)',
          sccm: '# SCCM Application Deployment\n# 1. Create Application in SCCM Console\n# 2. Use these installation commands:\n\n# Installation Command:\nmsiexec /i sentinel-agent.msi /quiet /qn ENROLLMENT_TOKEN="%SENTINEL_TOKEN%" TRANSFORMS=config.mst\n\n# Uninstall Command:\nmsiexec /x {PRODUCT_GUID} /quiet /qn\n\n# Detection Method (Registry):\nHKEY_LOCAL_MACHINE\\SOFTWARE\\Sentinel\\Agent\nValue: Version (Greater than or equal to 1.0.0)\n\n# Distribute to collection and deploy',
          intune: '# Intune Win32 App Deployment\n# 1. Package as .intunewin using Microsoft Win32 Content Prep Tool\n# 2. Upload to Intune\n\n# Install Command:\nmsiexec /i sentinel-agent.msi /quiet /qn ENROLLMENT_TOKEN="%SENTINEL_TOKEN%"\n\n# Uninstall Command:\nmsiexec /x {PRODUCT_GUID} /quiet /qn\n\n# Detection Rules:\nFile: C:\\Program Files\\Sentinel Agent\\sentinel-agent.exe\nVersion: >= 1.0.0\n\n# Requirements:\nOS: Windows 10/11 (64-bit)\nDisk: 500 MB\nRAM: 512 MB'
        }
      },
      macos: {
        title: 'macOS Installation Guide',
        steps: [
          {
            step: '1. Download the Agent',
            command: '# Download PKG installer\ncurl -O https://sentinel-forensics.com/agents/macos/sentinel-agent-latest.pkg',
            description: 'Download the latest macOS agent PKG package'
          },
          {
            step: '2. Install the Agent',
            command: '# Install package (requires sudo)\nsudo installer -pkg sentinel-agent-latest.pkg -target /\n\n# Verify installation\nls -la /Library/Application\\ Support/Sentinel/',
            description: 'Install the agent to the system'
          },
          {
            step: '3. Configure Enrollment Token',
            command: '# Create configuration file\nsudo bash -c \'cat > /Library/Application\\ Support/Sentinel/config.json << EOF\n{\n  "enrollment_token": "YOUR_ENROLLMENT_TOKEN_HERE",\n  "server_url": "wss://sentinel-forensics.com/agent-ws"\n}\nEOF\'',
            description: 'Configure the agent with your enrollment token'
          },
          {
            step: '4. Load the Launch Daemon',
            command: '# Load the agent daemon\nsudo launchctl load /Library/LaunchDaemons/com.sentinel.agent.plist\n\n# Verify it\'s running\nsudo launchctl list | grep sentinel',
            description: 'Start the agent as a system daemon'
          },
          {
            step: '5. Verify Installation',
            command: '# Check agent status\n/opt/sentinel/bin/sentinel-agent --status\n\n# View logs\nsudo tail -f /var/log/sentinel/agent.log',
            description: 'Verify the agent is running and connected'
          }
        ],
        enterprise: {
          title: 'Enterprise Deployment (Jamf Pro)',
          jamf: '# Jamf Pro Policy Configuration\n\n# 1. Upload PKG to Jamf Pro\nUpload: sentinel-agent-latest.pkg\n\n# 2. Create Configuration Profile\n<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN">\n<plist version="1.0">\n<dict>\n    <key>PayloadContent</key>\n    <array>\n        <dict>\n            <key>enrollment_token</key>\n            <string>YOUR_TOKEN_HERE</string>\n            <key>server_url</key>\n            <string>wss://sentinel-forensics.com/agent-ws</string>\n        </dict>\n    </array>\n</dict>\n</plist>\n\n# 3. Create Policy:\n- General: Install Sentinel Agent\n- Packages: sentinel-agent-latest.pkg\n- Scripts: Post-install configuration\n- Scope: Target computers or groups\n\n# 4. Post-Install Script:\n#!/bin/bash\nsudo launchctl load /Library/LaunchDaemons/com.sentinel.agent.plist\nexit 0',
          ansible: '# Ansible Playbook for macOS\n\n- name: Deploy Sentinel Agent on macOS\n  hosts: macos_endpoints\n  become: yes\n  tasks:\n    - name: Download Sentinel Agent\n      get_url:\n        url: https://sentinel-forensics.com/agents/macos/sentinel-agent-latest.pkg\n        dest: /tmp/sentinel-agent.pkg\n        mode: \'0644\'\n\n    - name: Install Sentinel Agent\n      command: installer -pkg /tmp/sentinel-agent.pkg -target /\n\n    - name: Create config file\n      copy:\n        content: |\n          {\n            "enrollment_token": "{{ sentinel_enrollment_token }}",\n            "server_url": "wss://sentinel-forensics.com/agent-ws"\n          }\n        dest: /Library/Application Support/Sentinel/config.json\n        mode: \'0600\'\n\n    - name: Load launch daemon\n      command: launchctl load /Library/LaunchDaemons/com.sentinel.agent.plist\n\n    - name: Verify agent status\n      command: /opt/sentinel/bin/sentinel-agent --status\n      register: agent_status\n\n    - debug:\n        var: agent_status.stdout'
        }
      },
      linux: {
        title: 'Linux Installation Guide',
        steps: [
          {
            step: '1. Download the Agent',
            command: '# For Debian/Ubuntu (DEB)\nwget https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.deb\n\n# For RHEL/CentOS/Fedora (RPM)\nwget https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.rpm',
            description: 'Download the appropriate package for your distribution'
          },
          {
            step: '2. Install the Agent',
            command: '# Debian/Ubuntu\nsudo dpkg -i sentinel-agent-latest.deb\nsudo apt-get install -f  # Fix dependencies if needed\n\n# RHEL/CentOS/Fedora\nsudo rpm -ivh sentinel-agent-latest.rpm\n# OR\nsudo dnf install sentinel-agent-latest.rpm',
            description: 'Install the package using your distribution\'s package manager'
          },
          {
            step: '3. Configure Enrollment Token',
            command: '# Create configuration file\nsudo mkdir -p /etc/sentinel\nsudo cat > /etc/sentinel/config.json << EOF\n{\n  "enrollment_token": "YOUR_ENROLLMENT_TOKEN_HERE",\n  "server_url": "wss://sentinel-forensics.com/agent-ws"\n}\nEOF\n\nsudo chmod 600 /etc/sentinel/config.json',
            description: 'Configure the agent with your enrollment token'
          },
          {
            step: '4. Enable and Start the Service',
            command: '# Enable service to start on boot\nsudo systemctl enable sentinel-agent\n\n# Start the service now\nsudo systemctl start sentinel-agent\n\n# Check status\nsudo systemctl status sentinel-agent',
            description: 'Enable and start the Sentinel agent systemd service'
          },
          {
            step: '5. Verify Installation',
            command: '# Check agent status\nsudo sentinel-agent --status\n\n# View logs\nsudo journalctl -u sentinel-agent -f\n# OR\nsudo tail -f /var/log/sentinel/agent.log',
            description: 'Verify the agent is running and connected to the server'
          }
        ],
        enterprise: {
          title: 'Enterprise Deployment (Ansible/Chef/Puppet)',
          ansible: '# Ansible Playbook for Linux Deployment\n\n---\n- name: Deploy Sentinel Agent on Linux\n  hosts: linux_endpoints\n  become: yes\n  vars:\n    sentinel_enrollment_token: "YOUR_TOKEN_HERE"\n    sentinel_server_url: "wss://sentinel-forensics.com/agent-ws"\n\n  tasks:\n    - name: Install Sentinel Agent (Debian/Ubuntu)\n      apt:\n        deb: https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.deb\n        state: present\n      when: ansible_os_family == "Debian"\n\n    - name: Install Sentinel Agent (RHEL/CentOS)\n      yum:\n        name: https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.rpm\n        state: present\n      when: ansible_os_family == "RedHat"\n\n    - name: Create config directory\n      file:\n        path: /etc/sentinel\n        state: directory\n        mode: \'0755\'\n\n    - name: Deploy configuration\n      copy:\n        content: |\n          {\n            "enrollment_token": "{{ sentinel_enrollment_token }}",\n            "server_url": "{{ sentinel_server_url }}"\n          }\n        dest: /etc/sentinel/config.json\n        mode: \'0600\'\n\n    - name: Enable and start service\n      systemd:\n        name: sentinel-agent\n        enabled: yes\n        state: started\n\n    - name: Wait for agent to connect\n      wait_for:\n        path: /var/log/sentinel/agent.log\n        search_regex: "Connected to server"\n        timeout: 60\n\n    - name: Verify agent status\n      command: sentinel-agent --status\n      register: agent_status\n\n    - debug:\n        var: agent_status.stdout',
          chef: '# Chef Recipe for Sentinel Agent\n\n# recipes/default.rb\n\n# Determine package type based on platform\npackage_url = case node[\'platform_family\']\nwhen \'debian\'\n  \'https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.deb\'\nwhen \'rhel\', \'fedora\'\n  \'https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.rpm\'\nend\n\n# Download package\nremote_file \'/tmp/sentinel-agent\' do\n  source package_url\n  mode \'0644\'\n  action :create\nend\n\n# Install package\ncase node[\'platform_family\']\nwhen \'debian\'\n  dpkg_package \'sentinel-agent\' do\n    source \'/tmp/sentinel-agent\'\n    action :install\n  end\nwhen \'rhel\', \'fedora\'\n  rpm_package \'sentinel-agent\' do\n    source \'/tmp/sentinel-agent\'\n    action :install\n  end\nend\n\n# Create config directory\ndirectory \'/etc/sentinel\' do\n  mode \'0755\'\n  action :create\nend\n\n# Deploy configuration\nfile \'/etc/sentinel/config.json\' do\n  content({\n    enrollment_token: node[\'sentinel\'][\'enrollment_token\'],\n    server_url: node[\'sentinel\'][\'server_url\']\n  }.to_json)\n  mode \'0600\'\n  action :create\nend\n\n# Enable and start service\nservice \'sentinel-agent\' do\n  action [:enable, :start]\nend',
          puppet: '# Puppet Manifest for Sentinel Agent\n# manifests/init.pp\n\nclass sentinel_agent (\n  String $enrollment_token,\n  String $server_url = \'wss://sentinel-forensics.com/agent-ws\',\n  String $agent_pkg_version = \'latest\',\n) {\n\n  # Install package based on OS family\n  case $::osfamily {\n    \'Debian\': {\n      package { \'sentinel-agent\':\n        ensure   => installed,\n        provider => dpkg,\n        source   => "https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.deb",\n      }\n    }\n    \'RedHat\': {\n      package { \'sentinel-agent\':\n        ensure   => installed,\n        provider => rpm,\n        source   => "https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.rpm",\n      }\n    }\n  }\n\n  # Config directory\n  file { \'/etc/sentinel\':\n    ensure => directory,\n    mode   => \'0755\',\n  }\n\n  # Configuration file\n  file { \'/etc/sentinel/config.json\':\n    ensure  => file,\n    mode    => \'0600\',\n    content => template(\'sentinel_agent/config.json.erb\'),\n    require => File[\'/etc/sentinel\'],\n    notify  => Service[\'sentinel-agent\'],\n  }\n\n  # Service management\n  service { \'sentinel-agent\':\n    ensure     => running,\n    enable     => true,\n    hasrestart => true,\n    require    => [Package[\'sentinel-agent\'], File[\'/etc/sentinel/config.json\']],\n  }\n}\n\n# templates/config.json.erb\n{\n  "enrollment_token": "<%= @enrollment_token %>",\n  "server_url": "<%= @server_url %>"\n}'
        }
      }
    };

    return instructions[platform];
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  const filteredAgents = agents.filter(a =>
    a.hostname?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.platform?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="p-4 md:p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Endpoint Agents</h1>
          <p className="text-slate-400">Enterprise endpoint monitoring and threat detection</p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['endpoint-agents'] })}
            variant="outline"
            className="border-slate-700 text-white hover:bg-slate-800"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button
            onClick={() => setConfigDialogOpen(true)}
            variant="outline"
            className="border-purple-500/50 text-purple-400 hover:bg-purple-900/20"
          >
            <Settings className="w-4 h-4 mr-2" />
            Bulk Config
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <Monitor className="w-8 h-8 md:w-10 md:h-10 text-blue-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">{agents.length}</p>
                <p className="text-xs text-slate-400">Total Agents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-8 h-8 md:w-10 md:h-10 text-green-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">{onlineAgents}</p>
                <p className="text-xs text-slate-400">Online</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <XCircle className="w-8 h-8 md:w-10 md:h-10 text-slate-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">{offlineAgents}</p>
                <p className="text-xs text-slate-400">Offline</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-4 md:p-6">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-8 h-8 md:w-10 md:h-10 text-red-400 flex-shrink-0" />
              <div>
                <p className="text-2xl md:text-3xl font-bold text-white">{errorAgents}</p>
                <p className="text-xs text-slate-400">Errors</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="bg-gradient-to-br from-blue-900/30 to-purple-900/30 border-blue-500/50">
        <CardHeader>
          <CardTitle className="text-white flex items-center gap-2">
            <Download className="w-5 h-5" />
            Agent Installation & Deployment
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="windows" className="w-full">
            <TabsList className="grid w-full grid-cols-3 bg-slate-800">
              <TabsTrigger value="windows">Windows</TabsTrigger>
              <TabsTrigger value="macos">macOS</TabsTrigger>
              <TabsTrigger value="linux">Linux</TabsTrigger>
            </TabsList>

            <TabsContent value="windows" className="space-y-4 mt-4">
              <div className="space-y-6">
                {getInstallationInstructions('windows').steps.map((step, idx) => (
                  <div key={idx} className="bg-slate-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-white">{step.step}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(step.command)}
                        className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{step.description}</p>
                    <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto">
                      {step.command}
                    </pre>
                  </div>
                ))}

                <div className="border-t border-slate-700 pt-6 mt-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-blue-400" />
                    Enterprise Deployment
                  </h3>

                  <Tabs defaultValue="sccm" className="w-full">
                    <TabsList className="bg-slate-800">
                      <TabsTrigger value="sccm">SCCM</TabsTrigger>
                      <TabsTrigger value="intune">Intune</TabsTrigger>
                    </TabsList>

                    <TabsContent value="sccm" className="mt-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white">SCCM Deployment Configuration</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(getInstallationInstructions('windows').enterprise.sccm)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                          {getInstallationInstructions('windows').enterprise.sccm}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="intune" className="mt-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white">Intune Win32 App Configuration</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(getInstallationInstructions('windows').enterprise.intune)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                          {getInstallationInstructions('windows').enterprise.intune}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="macos" className="space-y-4 mt-4">
              <div className="space-y-6">
                {getInstallationInstructions('macos').steps.map((step, idx) => (
                  <div key={idx} className="bg-slate-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-white">{step.step}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(step.command)}
                        className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{step.description}</p>
                    <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto">
                      {step.command}
                    </pre>
                  </div>
                ))}

                <div className="border-t border-slate-700 pt-6 mt-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-purple-400" />
                    Enterprise Deployment
                  </h3>

                  <Tabs defaultValue="jamf" className="w-full">
                    <TabsList className="bg-slate-800">
                      <TabsTrigger value="jamf">Jamf Pro</TabsTrigger>
                      <TabsTrigger value="ansible">Ansible</TabsTrigger>
                    </TabsList>

                    <TabsContent value="jamf" className="mt-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white">Jamf Pro Policy Configuration</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(getInstallationInstructions('macos').enterprise.jamf)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                          {getInstallationInstructions('macos').enterprise.jamf}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="ansible" className="mt-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white">Ansible Playbook</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(getInstallationInstructions('macos').enterprise.ansible)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                          {getInstallationInstructions('macos').enterprise.ansible}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="linux" className="space-y-4 mt-4">
              <div className="space-y-6">
                {getInstallationInstructions('linux').steps.map((step, idx) => (
                  <div key={idx} className="bg-slate-800/50 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-white">{step.step}</h4>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => copyToClipboard(step.command)}
                        className="text-blue-400 hover:text-blue-300 hover:bg-slate-700"
                      >
                        <Copy className="w-4 h-4 mr-2" />
                        Copy
                      </Button>
                    </div>
                    <p className="text-sm text-slate-400 mb-3">{step.description}</p>
                    <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto">
                      {step.command}
                    </pre>
                  </div>
                ))}

                <div className="border-t border-slate-700 pt-6 mt-6">
                  <h3 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
                    <Users className="w-5 h-5 text-green-400" />
                    Enterprise Deployment
                  </h3>

                  <Tabs defaultValue="ansible" className="w-full">
                    <TabsList className="bg-slate-800">
                      <TabsTrigger value="ansible">Ansible</TabsTrigger>
                      <TabsTrigger value="chef">Chef</TabsTrigger>
                      <TabsTrigger value="puppet">Puppet</TabsTrigger>
                    </TabsList>

                    <TabsContent value="ansible" className="mt-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white">Ansible Playbook (Multi-Distribution)</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(getInstallationInstructions('linux').enterprise.ansible)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                          {getInstallationInstructions('linux').enterprise.ansible}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="chef" className="mt-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white">Chef Recipe</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(getInstallationInstructions('linux').enterprise.chef)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                          {getInstallationInstructions('linux').enterprise.chef}
                        </pre>
                      </div>
                    </TabsContent>

                    <TabsContent value="puppet" className="mt-4">
                      <div className="bg-slate-800/50 rounded-lg p-4">
                        <div className="flex items-center justify-between mb-3">
                          <h4 className="font-semibold text-white">Puppet Manifest</h4>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => copyToClipboard(getInstallationInstructions('linux').enterprise.puppet)}
                            className="text-blue-400 hover:text-blue-300"
                          >
                            <Copy className="w-4 h-4 mr-2" />
                            Copy
                          </Button>
                        </div>
                        <pre className="bg-slate-900 p-3 rounded text-xs text-green-400 overflow-x-auto whitespace-pre-wrap">
                          {getInstallationInstructions('linux').enterprise.puppet}
                        </pre>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div className="mt-6 p-4 bg-blue-900/20 border border-blue-500/30 rounded-lg">
            <h4 className="font-semibold text-white mb-3 flex items-center gap-2">
              <Download className="w-4 h-4" />
              Direct Downloads
            </h4>
            <div className="grid md:grid-cols-3 gap-3">
              <Button
                variant="outline"
                className="border-blue-500/50 text-blue-400 hover:bg-blue-900/20 justify-start"
                onClick={() => toast.info('Download would start from: https://sentinel-forensics.com/agents/windows/sentinel-agent-latest.msi')}
              >
                <Download className="w-4 h-4 mr-2" />
                Windows MSI
              </Button>
              <Button
                variant="outline"
                className="border-purple-500/50 text-purple-400 hover:bg-purple-900/20 justify-start"
                onClick={() => toast.info('Download would start from: https://sentinel-forensics.com/agents/macos/sentinel-agent-latest.pkg')}
              >
                <Download className="w-4 h-4 mr-2" />
                macOS PKG
              </Button>
              <Button
                variant="outline"
                className="border-green-500/50 text-green-400 hover:bg-green-900/20 justify-start"
                onClick={() => toast.info('Download would start from: https://sentinel-forensics.com/agents/linux/sentinel-agent-latest.deb')}
              >
                <Download className="w-4 h-4 mr-2" />
                Linux DEB/RPM
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-slate-900/50 border-slate-800">
        <CardHeader>
          <CardTitle className="text-white">Deployed Agents</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="mb-4">
            <Input
              placeholder="Search agents by hostname, platform or ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="bg-slate-800 border-slate-700 text-white"
            />
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center py-12">
              <Loader2 className="w-8 h-8 animate-spin text-blue-400" />
              <p className="ml-3 text-white">Loading agents...</p>
            </div>
          ) : filteredAgents.length === 0 && agents.length === 0 ? (
            <div className="text-center py-12">
              <Monitor className="w-16 h-16 mx-auto mb-4 text-slate-600" />
              <p className="text-white mb-2">No agents deployed yet</p>
              <p className="text-sm text-slate-400 mb-4">Follow the installation guide above to deploy your first agent</p>
            </div>
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-slate-400">No agents match your search</p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredAgents.map((agent) => (
                <Card key={agent.id} className="bg-slate-800/50 border-slate-700">
                  <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                      <div className="flex items-start gap-4 flex-1 w-full md:w-auto">
                        <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                          agent.status === 'online' ? 'bg-green-500/20' :
                          agent.status === 'error' ? 'bg-red-500/20' :
                          'bg-slate-500/20'
                        }`}>
                          <Monitor className={`w-6 h-6 ${
                            agent.status === 'online' ? 'text-green-400' :
                            agent.status === 'error' ? 'text-red-400' :
                            'text-slate-400'
                          }`} />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-2 flex-wrap">
                            <h3 className="text-lg font-semibold text-white">{agent.hostname}</h3>
                            <Badge className={
                              agent.status === 'online' ? 'bg-green-500/20 text-green-400' :
                              agent.status === 'offline' ? 'bg-slate-500/20 text-slate-400' :
                              'bg-red-500/20 text-red-400'
                            }>
                              {agent.status}
                            </Badge>
                            <Badge className="bg-blue-500/20 text-blue-400">
                              {agent.platform}
                            </Badge>
                            {agent.deployment_metadata?.deployment_tool && (
                              <Badge className="bg-purple-500/20 text-purple-400">
                                {agent.deployment_metadata.deployment_tool}
                              </Badge>
                            )}
                          </div>

                          {agent.health_metrics && (
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3 text-xs">
                              <div>
                                <p className="text-slate-500">CPU</p>
                                <p className="text-white font-semibold">
                                  {agent.health_metrics.cpu_usage_percent?.toFixed(1) || 'N/A'}%
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Memory</p>
                                <p className="text-white font-semibold">
                                  {(agent.health_metrics.memory_usage_mb / 1024).toFixed(1) || 'N/A'} GB
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Latency</p>
                                <p className="text-white font-semibold">
                                  {agent.network_summary?.avg_latency_ms?.toFixed(0) || 'N/A'}ms
                                </p>
                              </div>
                              <div>
                                <p className="text-slate-500">Disk</p>
                                <p className="text-white font-semibold">
                                  {agent.health_metrics.disk_usage_percent?.toFixed(1) || 'N/A'}%
                                </p>
                              </div>
                            </div>
                          )}

                          {agent.security_posture?.risk_score !== undefined && (
                            <DeviceRiskScore riskScore={agent.security_posture.risk_score} />
                          )}

                          <div className="text-xs text-slate-400 mt-2">
                            <p>Agent v{agent.agent_version} • ID: {agent.agent_id}</p>
                            {agent.last_heartbeat && (
                              <p>Last heartbeat: {formatRelativeTime(agent.last_heartbeat)}</p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap md:flex-col gap-2 w-full md:w-auto">
                        <Button
                          size="sm"
                          onClick={() => openCommandDialog(agent)}
                          disabled={agent.status !== 'online'}
                          className="flex-1 md:flex-none bg-blue-600 hover:bg-blue-700 min-h-[44px]"
                        >
                          <Zap className="w-4 h-4 mr-2" />
                          Command
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => analyzeAgentMutation.mutate(agent.agent_id)}
                          disabled={analyzeAgentMutation.isPending || agent.status !== 'online'}
                          className="flex-1 md:flex-none bg-purple-600 hover:bg-purple-700 min-h-[44px]"
                          title="AI Threat Analysis"
                        >
                          {analyzeAgentMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <BarChart3 className="w-4 h-4 mr-2" />
                              Analyze
                            </>
                          )}
                        </Button>

                        <Button
                          size="sm"
                          onClick={() => analyzePostureMutation.mutate(agent.agent_id)}
                          disabled={analyzePostureMutation.isPending || agent.status !== 'online'}
                          className="flex-1 md:flex-none bg-green-600 hover:bg-green-700 min-h-[44px]"
                          title="Security Posture"
                        >
                          {analyzePostureMutation.isPending ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <>
                              <Shield className="w-4 h-4 mr-2" />
                              Posture
                            </>
                          )}
                        </Button>
                      </div>
                    </div>

                    {agent.ai_threat_analysis && (
                      <div className="mt-4 pt-4 border-t border-slate-700 bg-purple-900/20 border border-purple-500/30 rounded-lg p-4">
                        <div className="flex items-center gap-2 mb-3">
                          <BarChart3 className="w-5 h-5 text-purple-400" />
                          <h4 className="font-semibold text-purple-300">AI Threat Analysis</h4>
                          <Badge className={
                            agent.ai_threat_analysis.threat_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                            agent.ai_threat_analysis.threat_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                            agent.ai_threat_analysis.threat_level === 'medium' ? 'bg-yellow-500/20 text-yellow-400' :
                            'bg-green-500/20 text-green-400'
                          }>
                            {agent.ai_threat_analysis.threat_level}
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-300">{agent.ai_threat_analysis.summary}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={configDialogOpen} onOpenChange={setConfigDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Bulk Agent Configuration</DialogTitle>
            <DialogDescription className="text-slate-400">
              Apply configuration to all online agents ({agents.filter(a => a.status === 'online').length} agents)
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="text-white">Enable Monitoring</Label>
              <Switch
                checked={bulkConfig.monitoring_enabled}
                onCheckedChange={(checked) => setBulkConfig({ ...bulkConfig, monitoring_enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-white">Enable Log Collection</Label>
              <Switch
                checked={bulkConfig.log_collection_enabled}
                onCheckedChange={(checked) => setBulkConfig({ ...bulkConfig, log_collection_enabled: checked })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label className="text-white">Enable Network Capture</Label>
              <Switch
                checked={bulkConfig.network_capture_enabled}
                onCheckedChange={(checked) => setBulkConfig({ ...bulkConfig, network_capture_enabled: checked })}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Reporting Interval (seconds)</Label>
              <Input
                type="number"
                value={bulkConfig.reporting_interval_seconds}
                onChange={(e) => setBulkConfig({ ...bulkConfig, reporting_interval_seconds: parseInt(e.target.value) })}
                className="bg-slate-800 border-slate-700 text-white"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-white">Log Level</Label>
              <Select value={bulkConfig.log_level} onValueChange={(value) => setBulkConfig({ ...bulkConfig, log_level: value })}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select log level" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="debug">Debug</SelectItem>
                  <SelectItem value="info">Info</SelectItem>
                  <SelectItem value="warn">Warn</SelectItem>
                  <SelectItem value="error">Error</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <Button variant="outline" onClick={() => setConfigDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => bulkUpdateConfigMutation.mutate(bulkConfig)}
                disabled={bulkUpdateConfigMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {bulkUpdateConfigMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Settings className="w-4 h-4 mr-2" />
                )}
                Apply to All
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={commandDialogOpen} onOpenChange={setCommandDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white">
          <DialogHeader>
            <DialogTitle>Execute Remote Command</DialogTitle>
            <DialogDescription className="text-slate-400">
              Send command to {selectedAgent?.hostname}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-white">Command Type</Label>
              <Select value={commandType} onValueChange={setCommandType}>
                <SelectTrigger className="bg-slate-800 border-slate-700 text-white">
                  <SelectValue placeholder="Select command" />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700 text-white">
                  <SelectItem value="isolate_device">Isolate Device (Network)</SelectItem>
                  <SelectItem value="kill_process">Kill Process</SelectItem>
                  <SelectItem value="update_agent">Update Agent</SelectItem>
                  <SelectItem value="collect_logs">Collect Logs</SelectItem>
                  <SelectItem value="restart_service">Restart Service</SelectItem>
                  <SelectItem value="run_health_check">Run Health Check</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className="text-white">Parameters (JSON)</Label>
              <Textarea
                value={commandParams}
                onChange={(e) => setCommandParams(e.target.value)}
                placeholder='{"process_name": "malware.exe"}'
                className="bg-slate-800 border-slate-700 text-white font-mono text-xs"
              />
            </div>

            {commandType === 'isolate_device' && (
              <div className="bg-red-900/20 border border-red-500/30 rounded-lg p-3">
                <p className="text-sm text-red-200">
                  ⚠️ Warning: Network isolation will disconnect the device.
                </p>
              </div>
            )}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCommandDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleExecuteCommand}
                disabled={!commandType || executeCommandMutation.isPending}
                className="bg-red-600 hover:bg-red-700"
              >
                {executeCommandMutation.isPending ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4 mr-2" />
                )}
                Execute
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={postureDialogOpen} onOpenChange={setPostureDialogOpen}>
        <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl">
              Security Posture: {selectedAgentPosture?.hostname}
            </DialogTitle>
          </DialogHeader>
          
          {selectedAgentPosture?.posture_analysis && (
            <div className="space-y-4">
              <Card className="bg-slate-800/50 border-slate-700">
                <CardContent className="p-4">
                  <div className="grid md:grid-cols-3 gap-4 mb-4">
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Compliance Score</p>
                      <Badge className="bg-green-500/20 text-green-400 text-lg">
                        {selectedAgentPosture.posture_analysis.compliance_score}%
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Risk Level</p>
                      <Badge className={
                        selectedAgentPosture.posture_analysis.risk_level === 'critical' ? 'bg-red-500/20 text-red-400' :
                        selectedAgentPosture.posture_analysis.risk_level === 'high' ? 'bg-orange-500/20 text-orange-400' :
                        'bg-yellow-500/20 text-yellow-400'
                      }>
                        {selectedAgentPosture.posture_analysis.risk_level?.toUpperCase()}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-xs text-slate-400 mb-1">Vulnerabilities</p>
                      <Badge className="bg-red-500/20 text-red-400">
                        {selectedAgentPosture.posture_analysis.vulnerabilities?.length || 0}
                      </Badge>
                    </div>
                  </div>

                  {selectedAgentPosture.posture_analysis.ai_recommendations && (
                    <div className="mt-4">
                      <h4 className="font-semibold text-white mb-3">🤖 AI Recommendations</h4>
                      <div className="space-y-2">
                        {selectedAgentPosture.posture_analysis.ai_recommendations.slice(0, 5).map((rec, i) => (
                          <div key={i} className="bg-slate-900/50 p-3 rounded">
                            <div className="flex items-start gap-2">
                              <Badge className={
                                rec.priority === 'critical' ? 'bg-red-500/20 text-red-400' :
                                rec.priority === 'high' ? 'bg-orange-500/20 text-orange-400' :
                                'bg-blue-500/20 text-blue-400'
                              }>
                                {rec.priority}
                              </Badge>
                              <div className="flex-1">
                                <p className="text-sm font-medium text-white">{rec.action}</p>
                                <p className="text-xs text-slate-400 mt-1">{rec.reasoning}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}