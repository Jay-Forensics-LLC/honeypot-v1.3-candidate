import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Link } from 'react-router-dom';
import { Zap } from 'lucide-react';

/**
 * Quick actions grid component
 * @param {Object} props - Component props
 * @param {Array} props.actions - Array of action objects
 * @returns {JSX.Element} Quick actions grid
 */
export default function QuickActionsGrid({ actions = [] }) {
  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <CardTitle className="text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-yellow-400" />
          Quick Actions
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {actions.map((action, index) => (
            <Link key={index} to={action.link} className="block">
              <Button 
                className={`w-full h-24 ${action.gradient} flex flex-col gap-2`}
              >
                <action.icon className="w-6 h-6" />
                <span>{action.label}</span>
              </Button>
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}