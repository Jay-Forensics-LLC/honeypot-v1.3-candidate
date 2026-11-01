import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Activity, AlertTriangle, CheckCircle, XCircle, TrendingUp, TrendingDown } from 'lucide-react';
import { usePerformanceStore } from '../stores';

/**
 * APP HEALTH MONITOR
 * Production-grade performance and health tracking
 */
class AppHealthMonitorService {
  constructor() {
    this.metrics = {
      fps: [],
      memory: [],
      latency: [],
      errors: [],
      warnings: []
    };
    this.thresholds = {
      fps: { warning: 45, critical: 30 },
      memory: { warning: 80, critical: 90 },
      latency: { warning: 1000, critical: 3000 },
      errorRate: { warning: 0.05, critical: 0.1 }
    };
    this.isMonitoring = false;
    this.observers = [];
  }

  /**
   * Start monitoring
   */
  start() {
    if (this.isMonitoring) return;
    this.isMonitoring = true;

    // FPS monitoring
    this.startFPSMonitoring();

    // Memory monitoring
    this.startMemoryMonitoring();

    // Error monitoring
    this.startErrorMonitoring();

    // Performance observer
    this.startPerformanceObserver();
  }

  /**
   * Stop monitoring
   */
  stop() {
    this.isMonitoring = false;
    this.observers.forEach(observer => observer.disconnect());
    this.observers = [];
  }

  /**
   * Monitor FPS
   */
  startFPSMonitoring() {
    let lastTime = performance.now();
    let frames = 0;

    const measureFPS = () => {
      if (!this.isMonitoring) return;

      frames++;
      const currentTime = performance.now();
      const delta = currentTime - lastTime;

      if (delta >= 1000) {
        const fps = Math.round((frames * 1000) / delta);
        this.recordMetric('fps', fps);

        if (fps < this.thresholds.fps.critical) {
          this.recordWarning('critical', `Critical FPS drop: ${fps}`);
        } else if (fps < this.thresholds.fps.warning) {
          this.recordWarning('warning', `Low FPS: ${fps}`);
        }

        frames = 0;
        lastTime = currentTime;
      }

      requestAnimationFrame(measureFPS);
    };

    requestAnimationFrame(measureFPS);
  }

  /**
   * Monitor memory
   */
  startMemoryMonitoring() {
    if (!performance.memory) return;

    const checkMemory = () => {
      if (!this.isMonitoring) return;

      const used = performance.memory.usedJSHeapSize;
      const limit = performance.memory.jsHeapSizeLimit;
      const percent = (used / limit) * 100;

      this.recordMetric('memory', percent);

      if (percent > this.thresholds.memory.critical) {
        this.recordWarning('critical', `Critical memory usage: ${percent.toFixed(1)}%`);
      } else if (percent > this.thresholds.memory.warning) {
        this.recordWarning('warning', `High memory usage: ${percent.toFixed(1)}%`);
      }

      setTimeout(checkMemory, 5000);
    };

    checkMemory();
  }

  /**
   * Monitor errors
   */
  startErrorMonitoring() {
    window.addEventListener('error', (event) => {
      this.recordMetric('errors', 1);
      this.recordWarning('error', event.message);
    });

    window.addEventListener('unhandledrejection', (event) => {
      this.recordMetric('errors', 1);
      this.recordWarning('error', event.reason);
    });
  }

  /**
   * Performance observer
   */
  startPerformanceObserver() {
    if (!window.PerformanceObserver) return;

    // Long tasks
    try {
      const longTaskObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.duration > 50) {
            this.recordWarning('warning', `Long task: ${entry.duration}ms`);
          }
        }
      });
      longTaskObserver.observe({ entryTypes: ['longtask'] });
      this.observers.push(longTaskObserver);
    } catch (error) {
      // longtask not supported
    }

    // Layout shifts
    try {
      const clsObserver = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          if (entry.value > 0.1) {
            this.recordWarning('warning', `Layout shift: ${entry.value}`);
          }
        }
      });
      clsObserver.observe({ entryTypes: ['layout-shift'] });
      this.observers.push(clsObserver);
    } catch (error) {
      // layout-shift not supported
    }
  }

  /**
   * Record metric
   */
  recordMetric(type, value) {
    if (!this.metrics[type]) {
      this.metrics[type] = [];
    }

    this.metrics[type].push({
      value,
      timestamp: Date.now()
    });

    // Keep last 100 entries
    if (this.metrics[type].length > 100) {
      this.metrics[type].shift();
    }
  }

  /**
   * Record warning
   */
  recordWarning(severity, message) {
    this.metrics.warnings.push({
      severity,
      message,
      timestamp: Date.now()
    });

    // Keep last 50 warnings
    if (this.metrics.warnings.length > 50) {
      this.metrics.warnings.shift();
    }

    // Update store
    usePerformanceStore.getState().addWarning({ severity, message });
  }

  /**
   * Get health status
   */
  getHealthStatus() {
    const latestFPS = this.getLatestMetric('fps');
    const latestMemory = this.getLatestMetric('memory');
    const recentErrors = this.metrics.errors.filter(
      e => Date.now() - e.timestamp < 60000
    ).length;

    let status = 'healthy';
    const issues = [];

    if (latestFPS < this.thresholds.fps.critical) {
      status = 'critical';
      issues.push('Critical FPS');
    } else if (latestFPS < this.thresholds.fps.warning) {
      status = status === 'healthy' ? 'warning' : status;
      issues.push('Low FPS');
    }

    if (latestMemory > this.thresholds.memory.critical) {
      status = 'critical';
      issues.push('Critical Memory');
    } else if (latestMemory > this.thresholds.memory.warning) {
      status = status === 'healthy' ? 'warning' : status;
      issues.push('High Memory');
    }

    if (recentErrors > 5) {
      status = 'critical';
      issues.push('High Error Rate');
    }

    return { status, issues };
  }

  /**
   * Get latest metric value
   */
  getLatestMetric(type) {
    const metrics = this.metrics[type];
    return metrics.length > 0 ? metrics[metrics.length - 1].value : 0;
  }

  /**
   * Get metric average
   */
  getMetricAverage(type, periodMs = 60000) {
    const cutoff = Date.now() - periodMs;
    const recent = this.metrics[type].filter(m => m.timestamp > cutoff);
    
    if (recent.length === 0) return 0;
    
    const sum = recent.reduce((acc, m) => acc + m.value, 0);
    return sum / recent.length;
  }

  /**
   * Get all metrics
   */
  getAllMetrics() {
    return {
      fps: {
        current: this.getLatestMetric('fps'),
        average: this.getMetricAverage('fps')
      },
      memory: {
        current: this.getLatestMetric('memory'),
        average: this.getMetricAverage('memory')
      },
      errors: {
        recent: this.metrics.errors.filter(e => Date.now() - e.timestamp < 60000).length,
        total: this.metrics.errors.length
      },
      warnings: this.metrics.warnings.slice(-10)
    };
  }

  /**
   * Clear metrics
   */
  clearMetrics() {
    this.metrics = {
      fps: [],
      memory: [],
      latency: [],
      errors: [],
      warnings: []
    };
  }
}

// Global instance
export const appHealthMonitor = new AppHealthMonitorService();

/**
 * Health Monitor Dashboard Component
 */
export default function AppHealthMonitor() {
  const [health, setHealth] = useState({ status: 'healthy', issues: [] });
  const [metrics, setMetrics] = useState(null);

  useEffect(() => {
    appHealthMonitor.start();

    const updateHealth = () => {
      setHealth(appHealthMonitor.getHealthStatus());
      setMetrics(appHealthMonitor.getAllMetrics());
    };

    updateHealth();
    const interval = setInterval(updateHealth, 2000);

    return () => {
      clearInterval(interval);
      appHealthMonitor.stop();
    };
  }, []);

  if (!metrics) return null;

  const statusColors = {
    healthy: 'text-green-400 border-green-500/30',
    warning: 'text-yellow-400 border-yellow-500/30',
    critical: 'text-red-400 border-red-500/30'
  };

  const StatusIcon = health.status === 'healthy' ? CheckCircle :
                     health.status === 'warning' ? AlertTriangle : XCircle;

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-blue-400" />
          Application Health
          <Badge variant="outline" className={statusColors[health.status]}>
            <StatusIcon className="w-3 h-3 mr-1" />
            {health.status.toUpperCase()}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-slate-400 mb-1">FPS</div>
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              {Math.round(metrics.fps.current)}
              {metrics.fps.current < 45 ? (
                <TrendingDown className="w-4 h-4 text-red-400" />
              ) : (
                <TrendingUp className="w-4 h-4 text-green-400" />
              )}
            </div>
            <div className="text-xs text-slate-500">
              Avg: {Math.round(metrics.fps.average)}
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-1">Memory</div>
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              {Math.round(metrics.memory.current)}%
              {metrics.memory.current > 80 ? (
                <TrendingUp className="w-4 h-4 text-red-400" />
              ) : (
                <TrendingDown className="w-4 h-4 text-green-400" />
              )}
            </div>
            <div className="text-xs text-slate-500">
              Avg: {Math.round(metrics.memory.average)}%
            </div>
          </div>

          <div>
            <div className="text-xs text-slate-400 mb-1">Errors</div>
            <div className="text-2xl font-bold text-white">
              {metrics.errors.recent}
            </div>
            <div className="text-xs text-slate-500">
              Last 1m
            </div>
          </div>
        </div>

        {health.issues.length > 0 && (
          <div className="space-y-2">
            <div className="text-xs text-slate-400">Active Issues:</div>
            {health.issues.map((issue, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs text-orange-400">
                <AlertTriangle className="w-3 h-3" />
                {issue}
              </div>
            ))}
          </div>
        )}

        {metrics.warnings.length > 0 && (
          <div className="mt-4 space-y-1">
            <div className="text-xs text-slate-400">Recent Warnings:</div>
            {metrics.warnings.slice(0, 3).map((warning, idx) => (
              <div key={idx} className="text-xs text-slate-500 truncate">
                {warning.message}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}