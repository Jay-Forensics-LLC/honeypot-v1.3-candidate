import React from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { TrendingUp } from 'lucide-react';
import { format } from 'date-fns';

/**
 * RISK TIMELINE
 * Shows risk score evolution over time for indicators and findings
 */

export default function RiskTimeline({ ipProfiles, emailProfiles, findings }) {
  // Build timeline data
  const timelineData = new Map();

  // Add IP risk scores
  ipProfiles.forEach(profile => {
    const date = format(new Date(profile.updated_date), 'MMM d');
    if (!timelineData.has(date)) {
      timelineData.set(date, { date, ipRisk: [], emailRisk: [], findingRisk: [] });
    }
    timelineData.get(date).ipRisk.push(profile.current_risk_score);
  });

  // Add email risk scores
  emailProfiles.forEach(profile => {
    const date = format(new Date(profile.updated_date), 'MMM d');
    if (!timelineData.has(date)) {
      timelineData.set(date, { date, ipRisk: [], emailRisk: [], findingRisk: [] });
    }
    timelineData.get(date).emailRisk.push(profile.current_risk_score);
  });

  // Add findings
  findings.forEach(finding => {
    const date = format(new Date(finding.created_date), 'MMM d');
    if (!timelineData.has(date)) {
      timelineData.set(date, { date, ipRisk: [], emailRisk: [], findingRisk: [] });
    }
    timelineData.get(date).findingRisk.push(finding.risk_score);
  });

  // Calculate averages
  const chartData = Array.from(timelineData.values()).map(day => ({
    date: day.date,
    avgIPRisk: day.ipRisk.length > 0 ? Math.round(day.ipRisk.reduce((a, b) => a + b, 0) / day.ipRisk.length) : null,
    avgEmailRisk: day.emailRisk.length > 0 ? Math.round(day.emailRisk.reduce((a, b) => a + b, 0) / day.emailRisk.length) : null,
    avgFindingRisk: day.findingRisk.length > 0 ? Math.round(day.findingRisk.reduce((a, b) => a + b, 0) / day.findingRisk.length) : null
  })).sort((a, b) => new Date(a.date) - new Date(b.date));

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-[#EF4444]" />
          Risk Score Timeline
        </CardTitle>
      </CardHeader>
      <CardContent>
        {chartData.length === 0 ? (
          <p className="text-slate-400 text-center py-12">No timeline data available</p>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="date" stroke="#9ca3af" />
              <YAxis stroke="#9ca3af" domain={[0, 100]} />
              <Tooltip
                contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #334155' }}
                labelStyle={{ color: '#e5e7eb' }}
              />
              <Legend />
              <Line 
                type="monotone" 
                dataKey="avgIPRisk" 
                stroke="#EF4444" 
                name="Avg IP Risk"
                strokeWidth={2}
                dot={{ fill: '#EF4444', r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="avgEmailRisk" 
                stroke="#F59E0B" 
                name="Avg Email Risk"
                strokeWidth={2}
                dot={{ fill: '#F59E0B', r: 4 }}
              />
              <Line 
                type="monotone" 
                dataKey="avgFindingRisk" 
                stroke="#8B5CF6" 
                name="Avg Finding Risk"
                strokeWidth={2}
                dot={{ fill: '#8B5CF6', r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}