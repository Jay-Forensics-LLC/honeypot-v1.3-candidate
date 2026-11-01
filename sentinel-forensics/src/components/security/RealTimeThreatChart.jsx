import React from 'react';
import { AreaChart, Area, BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

export default function RealTimeThreatChart({ data, chartType = 'area' }) {
  const ChartComponent = chartType === 'bar' ? BarChart : chartType === 'line' ? LineChart : AreaChart;
  const DataComponent = chartType === 'bar' ? Bar : chartType === 'line' ? Line : Area;

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ChartComponent data={data}>
        <defs>
          <linearGradient id="threatGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
          </linearGradient>
          <linearGradient id="criticalGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="#EF4444" stopOpacity={0.8}/>
            <stop offset="95%" stopColor="#EF4444" stopOpacity={0}/>
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis 
          dataKey="time" 
          stroke="#94A3B8" 
          style={{ fontSize: '12px' }}
        />
        <YAxis 
          stroke="#94A3B8"
          style={{ fontSize: '12px' }}
        />
        <Tooltip 
          contentStyle={{ 
            backgroundColor: '#1E293B', 
            border: '1px solid #334155', 
            borderRadius: '8px',
            color: '#E2E8F0'
          }}
          labelStyle={{ color: '#E2E8F0' }}
        />
        <Legend wrapperStyle={{ color: '#E2E8F0' }} />
        
        {chartType === 'area' && (
          <>
            <Area
              type="monotone"
              dataKey="threats"
              stroke="#3B82F6"
              fillOpacity={1}
              fill="url(#threatGradient)"
              strokeWidth={2}
              name="Total Threats"
            />
            <Area
              type="monotone"
              dataKey="critical"
              stroke="#EF4444"
              fillOpacity={1}
              fill="url(#criticalGradient)"
              strokeWidth={2}
              name="Critical"
            />
          </>
        )}
        
        {chartType === 'bar' && (
          <>
            <Bar dataKey="threats" fill="#3B82F6" name="Total Threats" radius={[8, 8, 0, 0]} />
            <Bar dataKey="critical" fill="#EF4444" name="Critical" radius={[8, 8, 0, 0]} />
          </>
        )}
        
        {chartType === 'line' && (
          <>
            <Line 
              type="monotone" 
              dataKey="threats" 
              stroke="#3B82F6" 
              strokeWidth={3}
              dot={{ fill: '#3B82F6', r: 4 }}
              name="Total Threats"
            />
            <Line 
              type="monotone" 
              dataKey="critical" 
              stroke="#EF4444" 
              strokeWidth={3}
              dot={{ fill: '#EF4444', r: 4 }}
              name="Critical"
            />
          </>
        )}
      </ChartComponent>
    </ResponsiveContainer>
  );
}