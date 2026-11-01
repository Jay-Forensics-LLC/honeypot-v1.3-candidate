import React from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * PRODUCTION: Reusable Pagination Component
 * Standardizes pagination across list views
 */
export default function Pagination({ 
  currentPage, 
  totalPages, 
  onPageChange,
  isLoading = false 
}) {
  if (totalPages <= 1) return null;

  const maxVisiblePages = 7;
  
  const getVisiblePages = () => {
    if (totalPages <= maxVisiblePages) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    
    if (currentPage <= 4) {
      return Array.from({ length: maxVisiblePages }, (_, i) => i + 1);
    }
    
    if (currentPage >= totalPages - 3) {
      return Array.from({ length: maxVisiblePages }, (_, i) => totalPages - maxVisiblePages + i + 1);
    }
    
    return Array.from({ length: maxVisiblePages }, (_, i) => currentPage - 3 + i);
  };

  return (
    <div className="flex items-center justify-between mt-6 pt-6 border-t border-slate-800">
      <Button
        variant="outline"
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1 || isLoading}
        className="border-slate-700 text-white hover:bg-slate-700"
      >
        <ChevronLeft className="w-4 h-4 mr-2" />
        Previous
      </Button>
      
      <div className="flex items-center gap-2">
        {getVisiblePages().map((pageNum) => (
          <Button
            key={pageNum}
            variant={currentPage === pageNum ? 'default' : 'outline'}
            onClick={() => onPageChange(pageNum)}
            disabled={isLoading}
            className={
              currentPage === pageNum 
                ? 'bg-blue-600 text-white' 
                : 'border-slate-700 text-white hover:bg-slate-700'
            }
          >
            {pageNum}
          </Button>
        ))}
      </div>

      <Button
        variant="outline"
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages || isLoading}
        className="border-slate-700 text-white hover:bg-slate-700"
      >
        Next
        <ChevronRight className="w-4 h-4 ml-2" />
      </Button>
    </div>
  );
}