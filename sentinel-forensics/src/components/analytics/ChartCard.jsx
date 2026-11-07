import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, Info, Maximize2 } from 'lucide-react';
import AboutPanel from './AboutPanel';

export default function ChartCard({ 
  title, 
  subtitle, 
  children, 
  onExport, 
  onDrilldown,
  meta,
  provenance 
}) {
  const [showAbout, setShowAbout] = useState(false);

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-white">{title}</CardTitle>
            {subtitle && <p className="text-sm text-slate-400 mt-1">{subtitle}</p>}
          </div>
          <div className="flex gap-2">
            {onExport && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={onExport}
                aria-label={`Export ${title} chart`}
                className="text-slate-400 hover:text-white"
              >
                <Download className="w-4 h-4" />
              </Button>
            )}
            {(meta || provenance) && (
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setShowAbout(!showAbout)}
                aria-label={`Toggle data provenance for ${title}`}
                aria-expanded={showAbout}
                className="text-slate-400 hover:text-white"
              >
                <Info className="w-4 h-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {showAbout && (meta || provenance) && (
          <AboutPanel meta={meta} provenance={provenance} className="mb-4" />
        )}
        {children}
      </CardContent>
    </Card>
  );
}