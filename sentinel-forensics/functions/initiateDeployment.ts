import { createClientFromRequest } from 'npm:@base44/sdk@0.8.4';

/**
 * Initiate Agent Deployment
 * 
 * Creates deployment job and generates deployment scripts/configs
 * for enterprise deployment tools (Intune, Jamf, Ansible, etc.)
 */

Deno.serve(async (req) => {
    try {
        const base44 = createClientFromRequest(req);
        const user = await base44.auth.me();

        if (!user) {
            return Response.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const {
            deployment_name,
            deployment_method,
            platform,
            target_endpoints,
            configuration
        } = await req.json();

        if (!deployment_name || !deployment_method || !platform) {
            return Response.json({
                error: 'Missing required fields',
                required: ['deployment_name', 'deployment_method', 'platform']
            }, { status: 400 });
        }

        // Generate enrollment token
        const enrollmentToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');

        const serverUrl = Deno.env.get('WS_URL') || 'wss://sentinel-forensics.com/agent-ws';

        // Generate deployment script based on method
        let deploymentScript = '';
        let packageUrl = '';

        switch (deployment_method) {
            case 'intune':
                deploymentScript = generateIntuneScript(platform, enrollmentToken, serverUrl, configuration);
                packageUrl = getPackageUrl(platform);
                break;
            case 'jamf':
                deploymentScript = generateJamfScript(enrollmentToken, serverUrl, configuration);
                packageUrl = getPackageUrl('macos');
                break;
            case 'ansible':
                deploymentScript = generateAnsiblePlaybook(platform, enrollmentToken, serverUrl, configuration);
                break;
            case 'chef':
                deploymentScript = generateChefRecipe(platform, enrollmentToken, serverUrl, configuration);
                break;
            case 'puppet':
                deploymentScript = generatePuppetManifest(platform, enrollmentToken, serverUrl, configuration);
                break;
            case 'sccm':
                deploymentScript = generateSCCMScript(enrollmentToken, serverUrl, configuration);
                packageUrl = getPackageUrl('windows');
                break;
            case 'manual_script':
                deploymentScript = generateManualScript(platform, enrollmentToken, serverUrl, configuration);
                packageUrl = getPackageUrl(platform);
                break;
        }

        // Initialize endpoint statuses
        const endpointStatuses = (target_endpoints || []).map(endpoint => ({
            hostname: endpoint.hostname,
            status: 'pending',
            started_at: new Date().toISOString()
        }));

        // Create deployment job
        const job = await base44.asServiceRole.entities.DeploymentJob.create({
            job_id: `DEPLOY-${Date.now()}`,
            deployment_name,
            deployment_method,
            platform,
            target_endpoints: target_endpoints || [],
            total_targets: target_endpoints?.length || 0,
            deployment_config: {
                agent_version: 'latest',
                enrollment_token: enrollmentToken,
                server_url: serverUrl,
                configuration: configuration || {
                    monitoring_enabled: true,
                    log_collection_enabled: true,
                    network_capture_enabled: false,
                    reporting_interval_seconds: 300,
                    log_level: 'info'
                },
                auto_update_channel: 'stable'
            },
            status: 'preparing',
            progress: {
                total: target_endpoints?.length || 0,
                pending: target_endpoints?.length || 0,
                in_progress: 0,
                succeeded: 0,
                failed: 0,
                percentage: 0
            },
            endpoint_statuses: endpointStatuses,
            deployment_script: deploymentScript,
            deployment_package_url: packageUrl,
            started_at: new Date().toISOString(),
            initiated_by: user.email,
            rollback_available: true,
            rollback_executed: false,
            notifications_sent: []
        });

        // Audit log
        await base44.asServiceRole.entities.AuditLog.create({
            event_type: 'deployment_initiated',
            severity: 'info',
            description: `Agent deployment initiated: ${deployment_name} (${deployment_method} on ${platform})`,
            user_id: user.email,
            timestamp: new Date().toISOString(),
            success: true,
            metadata: {
                job_id: job.job_id,
                deployment_method,
                platform,
                targets: target_endpoints?.length || 0
            }
        });

        return Response.json({
            success: true,
            job_id: job.job_id,
            deployment_name,
            enrollment_token: enrollmentToken,
            deployment_script: deploymentScript,
            package_url: packageUrl,
            targets: target_endpoints?.length || 0,
            next_steps: getNextSteps(deployment_method),
            message: 'Deployment job created. Follow the next steps to execute.'
        });

    } catch (error) {
        console.error('Deployment initiation error:', error);
        return Response.json({
            error: 'Deployment initiation failed',
            message: error.message
        }, { status: 500 });
    }
});

function getPackageUrl(platform) {
    const baseUrl = 'https://sentinel-forensics.com/agents';
    switch (platform) {
        case 'windows':
            return `${baseUrl}/windows/sentinel-agent-latest.msi`;
        case 'macos':
            return `${baseUrl}/macos/sentinel-agent-latest.pkg`;
        case 'linux':
            return `${baseUrl}/linux/sentinel-agent-latest.deb`;
        default:
            return baseUrl;
    }
}

function generateIntuneScript(platform, token, serverUrl, config) {
    return `# Microsoft Intune Win32 App Deployment Configuration
# ============================================================

# Install Command:
msiexec /i sentinel-agent.msi /quiet /qn ENROLLMENT_TOKEN="${token}" SERVER_URL="${serverUrl}" MONITORING_ENABLED="${config?.monitoring_enabled ? '1' : '0'}"

# Uninstall Command:
msiexec /x {PRODUCT_GUID} /quiet /qn

# Detection Rules:
# Registry Key: HKEY_LOCAL_MACHINE\\SOFTWARE\\Sentinel\\Agent
# Value: Version
# Operator: Greater than or equal to
# Version: 1.0.0

# Requirements:
# OS: Windows 10/11 (64-bit)
# Disk: 500 MB
# RAM: 512 MB

# Post-Install Verification:
# File: C:\\Program Files\\Sentinel Agent\\sentinel-agent.exe
# Version: >= 1.0.0`;
}

function generateJamfScript(token, serverUrl, config) {
    return `#!/bin/bash
# Jamf Pro Post-Install Script
# ==============================

# Configure Sentinel Agent
cat > /Library/Application\\ Support/Sentinel/config.json << EOF
{
  "enrollment_token": "${token}",
  "server_url": "${serverUrl}",
  "monitoring_enabled": ${config?.monitoring_enabled !== false},
  "log_collection_enabled": ${config?.log_collection_enabled !== false},
  "network_capture_enabled": ${config?.network_capture_enabled === true},
  "reporting_interval_seconds": ${config?.reporting_interval_seconds || 300},
  "log_level": "${config?.log_level || 'info'}"
}
EOF

# Set permissions
chmod 600 /Library/Application\\ Support/Sentinel/config.json

# Load launch daemon
launchctl load /Library/LaunchDaemons/com.sentinel.agent.plist

# Verify agent status
sleep 5
/opt/sentinel/bin/sentinel-agent --status

exit 0`;
}

function generateAnsiblePlaybook(platform, token, serverUrl, config) {
    return `---
# Ansible Playbook: Deploy Sentinel Agent
# =========================================
- name: Deploy Sentinel Agent on ${platform}
  hosts: all
  become: yes
  vars:
    sentinel_enrollment_token: "${token}"
    sentinel_server_url: "${serverUrl}"
    sentinel_config:
      monitoring_enabled: ${config?.monitoring_enabled !== false}
      log_collection_enabled: ${config?.log_collection_enabled !== false}
      network_capture_enabled: ${config?.network_capture_enabled === true}
      reporting_interval_seconds: ${config?.reporting_interval_seconds || 300}
      log_level: "${config?.log_level || 'info'}"

  tasks:
    - name: Download Sentinel Agent
      get_url:
        url: ${getPackageUrl(platform)}
        dest: /tmp/sentinel-agent
        mode: '0644'

    - name: Install Sentinel Agent (${platform})
      ${platform === 'windows' ? 'win_package' : platform === 'macos' ? 'command' : 'apt'}:
        ${platform === 'windows' ? 'path: /tmp/sentinel-agent\n        state: present' : 
          platform === 'macos' ? 'cmd: installer -pkg /tmp/sentinel-agent -target /' :
          'deb: /tmp/sentinel-agent\n        state: present'}

    - name: Create config file
      copy:
        content: "{{ sentinel_config | to_json }}"
        dest: ${platform === 'windows' ? 'C:\\ProgramData\\Sentinel\\config.json' : '/etc/sentinel/config.json'}
        mode: '0600'

    - name: Start Sentinel Agent
      ${platform === 'windows' ? 'win_service' : 'systemd'}:
        name: sentinel-agent
        state: started
        enabled: yes

    - name: Verify agent connection
      wait_for:
        timeout: 60
      register: agent_verification`;
}

function generateChefRecipe(platform, token, serverUrl, config) {
    return `# Chef Recipe: Sentinel Agent Deployment
# ========================================

package_url = '${getPackageUrl(platform)}'

remote_file '/tmp/sentinel-agent' do
  source package_url
  mode '0644'
  action :create
end

${platform === 'debian' ? 'dpkg_package' : 'rpm_package'} 'sentinel-agent' do
  source '/tmp/sentinel-agent'
  action :install
end

directory '${platform === 'windows' ? 'C:\\\\ProgramData\\\\Sentinel' : '/etc/sentinel'}' do
  mode '0755'
  action :create
end

file '${platform === 'windows' ? 'C:\\\\ProgramData\\\\Sentinel\\\\config.json' : '/etc/sentinel/config.json'}' do
  content({
    enrollment_token: '${token}',
    server_url: '${serverUrl}',
    monitoring_enabled: ${config?.monitoring_enabled !== false},
    log_collection_enabled: ${config?.log_collection_enabled !== false},
    network_capture_enabled: ${config?.network_capture_enabled === true},
    reporting_interval_seconds: ${config?.reporting_interval_seconds || 300},
    log_level: '${config?.log_level || 'info'}'
  }.to_json)
  mode '0600'
  action :create
end

service 'sentinel-agent' do
  action [:enable, :start]
end`;
}

function generatePuppetManifest(platform, token, serverUrl, config) {
    return `# Puppet Manifest: Sentinel Agent
# =================================

class sentinel_agent (
  String $enrollment_token = '${token}',
  String $server_url = '${serverUrl}',
  Boolean $monitoring_enabled = ${config?.monitoring_enabled !== false},
  Boolean $log_collection_enabled = ${config?.log_collection_enabled !== false},
  Boolean $network_capture_enabled = ${config?.network_capture_enabled === true},
  Integer $reporting_interval_seconds = ${config?.reporting_interval_seconds || 300},
  String $log_level = '${config?.log_level || 'info'}',
) {

  package { 'sentinel-agent':
    ensure   => installed,
    provider => ${platform === 'windows' ? 'windows' : platform === 'macos' ? 'pkgdmg' : 'dpkg'},
    source   => '${getPackageUrl(platform)}',
  }

  file { '${platform === 'windows' ? 'C:/ProgramData/Sentinel' : '/etc/sentinel'}':
    ensure => directory,
    mode   => '0755',
  }

  file { '${platform === 'windows' ? 'C:/ProgramData/Sentinel/config.json' : '/etc/sentinel/config.json'}':
    ensure  => file,
    mode    => '0600',
    content => template('sentinel_agent/config.json.erb'),
    require => File['${platform === 'windows' ? 'C:/ProgramData/Sentinel' : '/etc/sentinel'}'],
    notify  => Service['sentinel-agent'],
  }

  service { 'sentinel-agent':
    ensure     => running,
    enable     => true,
    hasrestart => true,
    require    => [Package['sentinel-agent'], File['${platform === 'windows' ? 'C:/ProgramData/Sentinel/config.json' : '/etc/sentinel/config.json'}']],
  }
}`;
}

function generateSCCMScript(token, serverUrl, config) {
    return `# SCCM Application Deployment
# ============================

# Installation Command:
msiexec /i sentinel-agent.msi /quiet /qn ENROLLMENT_TOKEN="${token}" SERVER_URL="${serverUrl}" MONITORING="${config?.monitoring_enabled ? '1' : '0'}"

# Uninstall Command:
msiexec /x {PRODUCT_GUID} /quiet /qn

# Detection Method (Registry):
HKEY_LOCAL_MACHINE\\SOFTWARE\\Sentinel\\Agent
Value: Version (Greater than or equal to 1.0.0)

# Detection Method (File):
C:\\Program Files\\Sentinel Agent\\sentinel-agent.exe
Version >= 1.0.0

# Return Codes:
# 0 = Success
# 1603 = Fatal error
# 3010 = Reboot required`;
}

function generateManualScript(platform, token, serverUrl, config) {
    switch (platform) {
        case 'windows':
            return `# Windows PowerShell Deployment Script
# ======================================

# Download agent
Invoke-WebRequest -Uri "${getPackageUrl('windows')}" -OutFile "sentinel-agent.msi"

# Install with configuration
msiexec /i sentinel-agent.msi /quiet /qn ENROLLMENT_TOKEN="${token}" SERVER_URL="${serverUrl}"

# Verify installation
Start-Sleep -Seconds 5
Get-Service -Name "SentinelAgent" | Format-List

# Check agent status
cd "C:\\Program Files\\Sentinel Agent"
.\\sentinel-agent.exe --status`;

        case 'macos':
            return `#!/bin/bash
# macOS Deployment Script
# =======================

# Download agent
curl -O ${getPackageUrl('macos')}

# Install package
sudo installer -pkg sentinel-agent-latest.pkg -target /

# Configure
sudo cat > /Library/Application\\ Support/Sentinel/config.json << EOF
{
  "enrollment_token": "${token}",
  "server_url": "${serverUrl}",
  "monitoring_enabled": ${config?.monitoring_enabled !== false},
  "log_collection_enabled": ${config?.log_collection_enabled !== false}
}
EOF

# Load daemon
sudo launchctl load /Library/LaunchDaemons/com.sentinel.agent.plist

# Verify
/opt/sentinel/bin/sentinel-agent --status`;

        case 'linux':
            return `#!/bin/bash
# Linux Deployment Script
# =======================

# Download agent
wget ${getPackageUrl('linux')}

# Install
sudo dpkg -i sentinel-agent-latest.deb
sudo apt-get install -f

# Configure
sudo mkdir -p /etc/sentinel
sudo cat > /etc/sentinel/config.json << EOF
{
  "enrollment_token": "${token}",
  "server_url": "${serverUrl}",
  "monitoring_enabled": ${config?.monitoring_enabled !== false},
  "log_collection_enabled": ${config?.log_collection_enabled !== false}
}
EOF

# Start service
sudo systemctl enable sentinel-agent
sudo systemctl start sentinel-agent

# Verify
sudo systemctl status sentinel-agent`;
    }
}

function getNextSteps(method) {
    const steps = {
        intune: [
            'Upload the MSI to Microsoft Intune Admin Center',
            'Create a Win32 app with the provided install command',
            'Configure detection rules as specified',
            'Assign to target device groups',
            'Monitor deployment status in Intune and this dashboard'
        ],
        jamf: [
            'Upload the PKG to Jamf Pro',
            'Create a new Policy in Jamf Pro',
            'Add the post-install script provided above',
            'Scope to target computers or smart groups',
            'Monitor deployment in Jamf and this dashboard'
        ],
        ansible: [
            'Save the playbook to your Ansible repository',
            'Update your inventory file with target hosts',
            'Run: ansible-playbook -i inventory deploy-sentinel.yml',
            'Monitor output for any errors',
            'Check agent status in this dashboard'
        ],
        chef: [
            'Add the recipe to your Chef cookbook',
            'Upload cookbook to Chef Server',
            'Add sentinel_agent recipe to node run lists',
            'Run chef-client on target nodes',
            'Monitor deployment status'
        ],
        puppet: [
            'Deploy the manifest to your Puppet master',
            'Classify nodes with sentinel_agent class',
            'Wait for next Puppet run or trigger manually',
            'Verify agents appear in this dashboard',
            'Check /var/log/puppet for any errors'
        ],
        sccm: [
            'Import the MSI to SCCM Console',
            'Create a new Application with deployment type',
            'Use the installation command provided',
            'Distribute content to distribution points',
            'Deploy to target collections',
            'Monitor in SCCM Console and this dashboard'
        ],
        manual_script: [
            'Copy the deployment script to target systems',
            'Execute with appropriate privileges (admin/sudo)',
            'Verify agent installation completes',
            'Check agents appear in Endpoint Agents dashboard',
            'Review logs if any installation fails'
        ]
    };

    return steps[method] || [];
}

return Response.json({ error: 'This line should never execute' }, { status: 500 });