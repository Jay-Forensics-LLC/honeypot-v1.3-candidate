import { Card, CardContent } from '@/components/ui/card';
import { Database, CheckCircle, AlertTriangle, FolderOpen } from 'lucide-react';

/**
 * Evidence statistics cards component
 * @param {Object} props - Component props
 * @param {number} props.total - Total evidence count
 * @param {number} props.verified - Verified evidence count
 * @param {number} props.pending - Pending verification count
 * @param {number} props.activeCases - Active cases count
 * @returns {JSX.Element} Evidence statistics
 */
export default function EvidenceStatistics({
  total = 0,
  verified = 0,
  pending = 0,
  activeCases = 0
}) {
  const stats = [
    { label: 'Total Evidence', value: total, icon: Database, color: 'text-blue-400' },
    { label: 'Verified', value: verified, icon: CheckCircle, color: 'text-green-400' },
    { label: 'Pending Verification', value: pending, icon: AlertTriangle, color: 'text-yellow-400' },
    { label: 'Active Cases', value: activeCases, icon: FolderOpen, color: 'text-purple-400' }
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
      {stats.map((stat, index) => (
        <Card key={index} className="bg-slate-900/50 border-slate-800">
          <CardContent className="p-6">
            <div className="flex items-center gap-3">
              <stat.icon className={`w-10 h-10 ${stat.color}`} />
              <div>
                <p className="text-3xl font-bold text-white">{stat.value}</p>
                <p className="text-xs text-slate-400">{stat.label}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}