import React, { useState } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Bell, Check, Trash2, AlertTriangle, Info, Shield, Sparkles } from 'lucide-react';
import { useUser } from '../hooks/useUser';
import { Link } from 'react-router-dom';
import { createPageUrl } from '../utils';

export default function NotificationCenter() {
  const { data: user } = useUser();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);

  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications', user?.email],
    queryFn: async () => {
      const [userNotifications, systemEvents, aiInsights] = await Promise.allSettled([
        base44.entities.Notification.filter({ user_email: user.email }, '-created_date', 20),
        base44.entities.AuditLog.filter(
          { user_email: user.email, action: { $in: ['ai_security_assistant_query', 'compliance_check_completed', 'alert_created'] } },
          '-timestamp',
          10
        ),
        base44.entities.SystemHealthMetric.list('-recorded_at', 5)
      ]);

      const allNotifications = [];
      
      // User notifications
      if (userNotifications.status === 'fulfilled') {
        allNotifications.push(...userNotifications.value.map(n => ({
          ...n,
          type: 'notification'
        })));
      }

      // AI insights from audit logs
      if (aiInsights.status === 'fulfilled' && systemEvents.status === 'fulfilled') {
        systemEvents.value.forEach(event => {
          if (event.action === 'ai_security_assistant_query') {
            allNotifications.push({
              id: event.id,
              title: 'AI Security Insight',
              message: `AI analyzed your security query`,
              severity: 'info',
              created_date: event.timestamp,
              read: false,
              link: '/AISecurityAssistant',
              type: 'ai_insight'
            });
          }
        });
      }

      return allNotifications.sort((a, b) => 
        new Date(b.created_date) - new Date(a.created_date)
      );
    },
    refetchInterval: 10000,
    enabled: !!user,
    suspense: false,
    useErrorBoundary: false
  });

  const unreadCount = notifications.filter(n => !n.read).length;

  const markReadMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.update(id, { 
      read: true, 
      read_at: new Date().toISOString() 
    }),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.Notification.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    }
  });

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await Promise.all(
        notifications.filter(n => !n.read).map(n => 
          base44.entities.Notification.update(n.id, { 
            read: true, 
            read_at: new Date().toISOString() 
          })
        )
      );
    },
    onSuccess: () => {
      queryClient.invalidateQueries(['notifications']);
    }
  });

  const getSeverityIcon = (notification) => {
    if (notification.type === 'ai_insight') {
      return <Shield className="w-4 h-4 text-purple-400" />;
    }
    switch (notification.severity) {
      case 'critical': return <AlertTriangle className="w-4 h-4 text-red-400" />;
      case 'warning': return <Shield className="w-4 h-4 text-yellow-400" />;
      default: return <Info className="w-4 h-4 text-blue-400" />;
    }
  };

  const getSeverityColor = (severity) => {
    switch (severity) {
      case 'critical': return 'bg-red-500/20 border-red-500/50';
      case 'warning': return 'bg-yellow-500/20 border-yellow-500/50';
      default: return 'bg-blue-500/20 border-blue-500/50';
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="w-5 h-5 text-slate-400" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 bg-slate-900 border-slate-800 text-white p-0" align="end">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center">
          <div>
            <h3 className="font-semibold">Notifications</h3>
            <p className="text-xs text-slate-400">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 && (
            <Button size="sm" variant="ghost" onClick={() => markAllReadMutation.mutate()}>
              <Check className="w-4 h-4 mr-2" />
              Mark all read
            </Button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-8 text-center">
              <Bell className="w-12 h-12 mx-auto mb-3 text-slate-600" />
              <p className="text-slate-400">No notifications</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-800">
              {notifications.map((notification) => (
                <div
                  key={notification.id}
                  className={`p-4 hover:bg-slate-800/50 transition-colors ${!notification.read ? 'bg-slate-800/30' : ''}`}
                >
                  <div className="flex gap-3">
                    <div className="flex-shrink-0">
                      {getSeverityIcon(notification)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2 mb-1">
                        <h4 className="text-sm font-semibold text-white truncate">
                          {notification.title}
                        </h4>
                        {!notification.read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-slate-300 mb-2">{notification.message}</p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-slate-500">
                          {new Date(notification.created_date).toLocaleString()}
                        </span>
                        <div className="flex gap-2">
                          {notification.link && (
                            <Link to={createPageUrl(notification.link.replace(/^\//, ''))} onClick={() => setOpen(false)}>
                              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs">
                                View
                              </Button>
                            </Link>
                          )}
                          {!notification.read && notification.type === 'notification' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() => markReadMutation.mutate(notification.id)}
                            >
                              <Check className="w-3 h-3" />
                            </Button>
                          )}
                          {notification.type === 'notification' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2"
                              onClick={() => deleteMutation.mutate(notification.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}