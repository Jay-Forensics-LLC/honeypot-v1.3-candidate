import { Button } from '@/components/ui/button';
import { Zap, ArrowRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { Link } from 'react-router-dom';
import { createPageUrl } from '@/utils';

/**
 * CRITICAL iOS FIX: Error-safe UpgradeButton
 */
export default function UpgradeButton({ feature, className = '' }) {
  const { data: user, error } = useQuery({
    queryKey: ['user'],
    queryFn: () => base44.auth.me(),
    retry: 0,
    useErrorBoundary: false
  });

  // iOS FIX: Don't render if user unavailable
  if (error || !user) {
    console.warn('UpgradeButton: User not available');
    return null;
  }

  const tier = user?.subscription_tier || 'free';

  if (tier !== 'free') return null;

  try {
    return (
      <Link to={createPageUrl('Pricing')}>
        <Button className={`bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 ${className}`}>
          <Zap className="w-4 h-4 mr-2" />
          Upgrade to unlock {feature}
          <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </Link>
    );
  } catch (error) {
    console.error('UpgradeButton render error:', error);
    return null;
  }
}