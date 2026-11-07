import React from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, FileSearch, Shield, Archive, Wifi, CheckCircle } from 'lucide-react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { createPageUrl } from '../components/utils';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function ReviewHub() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ['home-nav-summary'],
    queryFn: async () => {
      const result = await base44.functions.invoke('homeNavSummary');
      return result.data;
    },
    refetchInterval: 30000
  });

  const queues = [
    {
      key: 'criticalAlerts',
      label: 'Critical Alerts',
      icon: AlertTriangle,
      count: data?.reviewQueues?.criticalAlertsCount || 0,
      description: 'High-severity alerts requiring immediate attention',
      route: 'Dashboard', // Adjust to actual alerts page
      query: 'severity=critical&status=open',
      color: 'red'
    },
    {
      key: 'untriagedAlerts',
      label: 'Untriaged Alerts',
      icon: FileSearch,
      count: data?.reviewQueues?.untriagedAlertsCount || 0,
      description: 'Alerts pending initial review',
      route: 'Dashboard',
      query: 'status=open&triaged=false',
      color: 'orange'
    },
    {
      key: 'evidencePending',
      label: 'Evidence Pending Review',
      icon: FileSearch,
      count: data?.reviewQueues?.evidencePendingReviewCount || 0,
      description: 'Evidence awaiting verification',
      route: 'Evidence',
      query: 'status=pending_review',
      color: 'blue'
    },
    {
      key: 'complianceExceptions',
      label: 'Compliance Exceptions',
      icon: Shield,
      count: data?.reviewQueues?.complianceExceptionsCount || 0,
      description: 'Devices with compliance issues',
      route: 'PolicyComplianceDashboard',
      query: 'compliance=noncompliant',
      color: 'yellow'
    },
    {
      key: 'quarantine',
      label: 'Quarantine Items',
      icon: Archive,
      count: data?.reviewQueues?.quarantineItemsCount || 0,
      description: 'Quarantined threats requiring action',
      route: 'RemediationSuite',
      query: 'status=quarantined',
      color: 'purple'
    },
    {
      key: 'riskyDevices',
      label: 'Risky Devices',
      icon: Wifi,
      count: data?.reviewQueues?.riskyDevicesCount || 0,
      description: 'Devices with high risk scores',
      route: 'Devices',
      query: 'risk=high',
      color: 'red'
    }
  ];

  const handleQueueClick = (queue) => {
    const url = createPageUrl(queue.route) + (queue.query ? `?${queue.query}` : '');
    navigate(url);
  };

  const getColorClasses = (color, count) => {
    if (count === 0) {
      return {
        bg: 'bg-green-50',
        text: 'text-green-700',
        border: 'border-green-200',
        badge: 'bg-green-100 text-green-700'
      };
    }

    const colorMap = {
      red: {
        bg: 'bg-red-50',
        text: 'text-red-700',
        border: 'border-red-200',
        badge: 'bg-red-100 text-red-700'
      },
      orange: {
        bg: 'bg-orange-50',
        text: 'text-orange-700',
        border: 'border-orange-200',
        badge: 'bg-orange-100 text-orange-700'
      },
      yellow: {
        bg: 'bg-yellow-50',
        text: 'text-yellow-700',
        border: 'border-yellow-200',
        badge: 'bg-yellow-100 text-yellow-700'
      },
      blue: {
        bg: 'bg-blue-50',
        text: 'text-blue-700',
        border: 'border-blue-200',
        badge: 'bg-blue-100 text-blue-700'
      },
      purple: {
        bg: 'bg-purple-50',
        text: 'text-purple-700',
        border: 'border-purple-200',
        badge: 'bg-purple-100 text-purple-700'
      }
    };

    return colorMap[color] || colorMap.blue;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Review Hub</h1>
          <p className="text-gray-600">Track and manage items requiring attention</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-40 bg-gray-200 rounded animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {queues.map(queue => {
              const Icon = queue.icon;
              const colors = getColorClasses(queue.color, queue.count);
              const isCleared = queue.count === 0;

              return (
                <Card 
                  key={queue.key}
                  className={`hover:shadow-lg transition-all cursor-pointer border-2 ${colors.border} ${colors.bg}`}
                  onClick={() => handleQueueClick(queue)}
                >
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Icon className={`w-6 h-6 ${colors.text}`} />
                        <span className="text-base">{queue.label}</span>
                      </div>
                      <Badge className={`${colors.badge} ${!isCleared && queue.count > 0 ? 'animate-pulse' : ''}`}>
                        {isCleared ? <CheckCircle className="w-3 h-3" /> : queue.count}
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-gray-600 mb-4">{queue.description}</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      disabled={isCleared}
                    >
                      {isCleared ? 'All Clear' : 'Review Now'}
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}