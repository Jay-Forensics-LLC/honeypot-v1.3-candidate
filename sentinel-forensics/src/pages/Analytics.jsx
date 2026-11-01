
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  Loader2
} from 'lucide-react';
import { resilientAPI } from '../components/utils/ResilientAPIClient';
import TierBadge from '../components/subscription/TierBadge';
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

export default function Analytics() {
  const { data: user } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me()
  });

  const { data: events = [], isLoading } = useQuery({
    queryKey: ['analytics-events'],
    queryFn: async () => {
      try {
        return await resilientAPI.listEntity('AnalyticsEvent', '-timestamp', 1000);
      } catch (error) {
        console.error('Failed to load analytics:', error);
        return [];
      }
    },
    enabled: user?.role === 'admin',
    initialData: []
  });

  if (!user || user.role !== 'admin') {
    return (
      <div className="min-h-screen bg-[#0B0B0C] p-6">
        <div className="max-w-2xl mx-auto mt-12 text-center">
          <p className="text-slate-400">Analytics are only available to administrators</p>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#0B0B0C] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
      </div>
    );
  }

  // Calculate metrics
  const pricingViews = events.filter(e => e.event_type === 'pricing_viewed').length;
  const upgradeClicks = events.filter(e => e.event_type === 'upgrade_clicked').length;
  const paymentsCompleted = events.filter(e => e.event_type === 'payment_completed').length;
  const paymentsFailed = events.filter(e => e.event_type === 'payment_failed').length;
  const subscriptionsCancelled = events.filter(e => e.event_type === 'subscription_cancelled').length;

  const conversionRate = pricingViews > 0 ? ((paymentsCompleted / pricingViews) * 100).toFixed(2) : 0;
  const churnRate = paymentsCompleted > 0 ? ((subscriptionsCancelled / paymentsCompleted) * 100).toFixed(2) : 0;

  // Chart data
  const eventsByType = [
    { name: 'Pricing Views', value: pricingViews },
    { name: 'Upgrade Clicks', value: upgradeClicks },
    { name: 'Payments', value: paymentsCompleted },
    { name: 'Cancellations', value: subscriptionsCancelled }
  ];

  const COLORS = ['#3B82F6', '#8B5CF6', '#10B981', '#EF4444'];

  return (
    <div className="min-h-screen bg-[#0B0B0C] p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-white mb-2">Analytics Dashboard</h1>
          <p className="text-slate-400">Subscription metrics and conversion tracking</p>
        </div>

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Users className="w-10 h-10 text-blue-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{paymentsCompleted}</p>
                  <p className="text-xs text-slate-400">Total Subscribers</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <TrendingUp className="w-10 h-10 text-green-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{conversionRate}%</p>
                  <p className="text-xs text-slate-400">Conversion Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <Activity className="w-10 h-10 text-purple-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{churnRate}%</p>
                  <p className="text-xs text-slate-400">Churn Rate</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardContent className="p-6">
              <div className="flex items-center gap-3">
                <DollarSign className="w-10 h-10 text-yellow-400" />
                <div>
                  <p className="text-3xl font-bold text-white">{upgradeClicks}</p>
                  <p className="text-xs text-slate-400">Upgrade Clicks</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Charts */}
        <div className="grid md:grid-cols-2 gap-6">
          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Events by Type</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={eventsByType}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={100}
                    label
                  >
                    {eventsByType.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{
                      background: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#F8FAFC'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card className="bg-slate-900/50 border-slate-800">
            <CardHeader>
              <CardTitle className="text-white">Conversion Funnel</CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={eventsByType}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                  <XAxis dataKey="name" stroke="#94A3B8" />
                  <YAxis stroke="#94A3B8" />
                  <Tooltip 
                    contentStyle={{
                      background: '#1E293B',
                      border: '1px solid #334155',
                      borderRadius: '8px',
                      color: '#F8FAFC'
                    }}
                  />
                  <Bar dataKey="value" fill="#3B82F6" />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>

        {/* Recent Events */}
        <Card className="bg-slate-900/50 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white">Recent Events</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {events.slice(0, 20).map((event) => (
                <div
                  key={event.id}
                  className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg"
                >
                  <div>
                    <p className="font-semibold text-white text-sm">
                      {event.event_type.replace(/_/g, ' ')}
                    </p>
                    <p className="text-xs text-slate-400">
                      {event.user_email || 'Anonymous'} • {new Date(event.timestamp).toLocaleString()}
                    </p>
                  </div>
                  {event.metadata?.tier && (
                    <TierBadge tier={event.metadata.tier} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
