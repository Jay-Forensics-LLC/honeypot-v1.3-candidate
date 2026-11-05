import React from 'react';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { useQuery } from '@tanstack/react-query';

export default function DrilldownDrawer({ 
  isOpen, 
  onClose, 
  entityType, 
  filters 
}) {
  const [page, setPage] = React.useState(1);
  const pageSize = 50;

  const { data, isLoading } = useQuery({
    queryKey: ['drilldown', entityType, filters, page],
    queryFn: async () => {
      const result = await base44.functions.invoke('dashboardDrilldown', {
        entity_type: entityType,
        filters: filters || {},
        page,
        page_size: pageSize
      });
      return result.data;
    },
    enabled: isOpen && !!entityType
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 w-full md:w-2/3 lg:w-1/2 bg-white shadow-2xl z-50 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <h2 className="text-lg font-semibold">{entityType} Details</h2>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="w-5 h-5" />
        </Button>
      </div>

      {/* Filters Summary */}
      {filters && Object.keys(filters).length > 0 && (
        <div className="p-4 border-b bg-gray-50">
          <div className="flex flex-wrap gap-2">
            {Object.entries(filters).map(([key, value]) => (
              <Badge key={key} variant="secondary">
                {key}: {value}
              </Badge>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <div className="space-y-3">
            {[...Array(10)].map((_, i) => (
              <div key={i} className="animate-pulse">
                <div className="h-16 bg-gray-200 rounded" />
              </div>
            ))}
          </div>
        ) : data?.results?.length > 0 ? (
          <div className="space-y-2">
            {data.results.map((row, idx) => (
              <div key={idx} className="p-4 border rounded-lg hover:bg-gray-50">
                <pre className="text-xs overflow-auto">
                  {JSON.stringify(row, null, 2)}
                </pre>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center text-gray-500 py-8">
            No results found
          </div>
        )}
      </div>

      {/* Pagination */}
      {data?.pagination && (
        <div className="flex items-center justify-between p-4 border-t">
          <div className="text-sm text-gray-600">
            Page {data.pagination.page} of {data.pagination.total_pages}
            {' '}({data.pagination.total_records} total)
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p - 1)}
              disabled={!data.pagination.has_prev}
            >
              <ChevronLeft className="w-4 h-4" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage(p => p + 1)}
              disabled={!data.pagination.has_next}
            >
              Next
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}