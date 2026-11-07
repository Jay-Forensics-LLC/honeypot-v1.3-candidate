import React from 'react';
import { useMutation } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Bell } from 'lucide-react';
import { toast } from 'sonner';

export default function FindingNotifications({ finding }) {
  const notifyTeam = useMutation({
    mutationFn: async () => {
      const user = await base44.auth.me();
      await base44.entities.Notification.create({
        organization_id: user.organization_id,
        title: `Critical Finding: ${finding.title}`,
        message: finding.hypothesis,
        severity: finding.severity,
        category: 'threat_hunt',
        metadata: {
          finding_id: finding.finding_id,
          risk_score: finding.risk_score
        }
      });
    },
    onSuccess: () => {
      toast.success('Team notified');
    }
  });

  return (
    <Card className="bg-slate-900 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Bell className="w-5 h-5 text-yellow-400" />
          Notifications
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Button
          onClick={() => notifyTeam.mutate()}
          disabled={notifyTeam.isPending}
          className="w-full bg-yellow-600 hover:bg-yellow-700"
        >
          <Bell className="w-4 h-4 mr-2" />
          Notify Security Team
        </Button>
      </CardContent>
    </Card>
  );
}