import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { base44 } from '@/api/base44Client';
import { toast } from 'sonner';
import {
  Sparkles,
  Loader2,
  Plus,
  X,
  Link as LinkIcon,
  CheckCircle
} from 'lucide-react';

export default function AITaggingPanel({ asset, onUpdate }) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [suggestedTags, setSuggestedTags] = useState(asset.ai_suggested_tags || []);
  const [appliedTags, setAppliedTags] = useState(asset.tags || []);

  const analyzeWithAI = async () => {
    setIsAnalyzing(true);
    try {
      const response = await base44.functions.invoke('aiAssetTagging', {
        asset_id: asset.id
      });
      
      setSuggestedTags(response.data.tags);
      toast.success('AI analysis complete', {
        description: response.data.reasoning
      });
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('AI analysis failed', { description: error.message });
    } finally {
      setIsAnalyzing(false);
    }
  };

  const applyTag = async (tag) => {
    const newTags = [...appliedTags, tag];
    const newSuggested = suggestedTags.filter(t => t !== tag);
    
    try {
      await base44.entities.Asset.update(asset.id, {
        tags: newTags,
        ai_suggested_tags: newSuggested
      });
      setAppliedTags(newTags);
      setSuggestedTags(newSuggested);
      toast.success('Tag applied');
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Failed to apply tag');
    }
  };

  const removeTag = async (tag) => {
    const newTags = appliedTags.filter(t => t !== tag);
    
    try {
      await base44.entities.Asset.update(asset.id, {
        tags: newTags
      });
      setAppliedTags(newTags);
      toast.success('Tag removed');
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error('Failed to remove tag');
    }
  };

  return (
    <Card className="bg-slate-900/50 border-slate-800">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-purple-400" />
            AI-Powered Tagging
          </CardTitle>
          <Button
            size="sm"
            onClick={analyzeWithAI}
            disabled={isAnalyzing}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {isAnalyzing ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                AI Analyze
              </>
            )}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Applied Tags */}
        <div>
          <h4 className="text-sm font-semibold text-white mb-2">Applied Tags</h4>
          <div className="flex flex-wrap gap-2">
            {appliedTags.length === 0 ? (
              <p className="text-sm text-slate-400">No tags applied yet</p>
            ) : (
              appliedTags.map((tag, idx) => (
                <Badge
                  key={idx}
                  className="bg-blue-500/20 text-blue-400 border-blue-500/30 pr-1"
                >
                  {tag}
                  <button
                    onClick={() => removeTag(tag)}
                    className="ml-1 hover:bg-blue-500/30 rounded p-0.5"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </Badge>
              ))
            )}
          </div>
        </div>

        {/* AI Suggested Tags */}
        {suggestedTags.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold text-white mb-2">AI Suggestions</h4>
            <div className="flex flex-wrap gap-2">
              {suggestedTags.map((tag, idx) => (
                <Badge
                  key={idx}
                  className="bg-purple-500/20 text-purple-400 border-purple-500/30 cursor-pointer hover:bg-purple-500/30 pr-1"
                  onClick={() => applyTag(tag)}
                >
                  {tag}
                  <Plus className="w-3 h-3 ml-1" />
                </Badge>
              ))}
            </div>
          </div>
        )}

        {/* Relationships */}
        {asset.relationships && asset.relationships.length > 0 && (
          <div className="pt-4 border-t border-slate-700">
            <h4 className="text-sm font-semibold text-white mb-2 flex items-center gap-2">
              <LinkIcon className="w-4 h-4" />
              Detected Relationships
            </h4>
            <div className="space-y-2">
              {asset.relationships.map((rel, idx) => (
                <div key={idx} className="p-2 bg-slate-800/50 rounded text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-300">{rel.relationship_type}</span>
                    <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">
                      {Math.round(rel.confidence * 100)}% confidence
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}