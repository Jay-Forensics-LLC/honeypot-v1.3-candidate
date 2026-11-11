/**
 * PHASE 4: Code Split Boundary
 * Error boundary specifically for lazy-loaded components
 */

import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';

export class CodeSplitBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    // Check if it's a chunk loading error
    const isChunkError = 
      error?.name === 'ChunkLoadError' ||
      error?.message?.includes('Loading chunk') ||
      error?.message?.includes('Failed to fetch');

    if (isChunkError) {
      return { hasError: true, error, isChunkError: true };
    }

    return { hasError: true, error, isChunkError: false };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Code split error:', error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
    // Force reload for chunk errors
    if (this.state.isChunkError) {
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="max-w-md text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              {this.state.isChunkError ? 'Failed to Load Component' : 'Component Error'}
            </h2>
            <p className="text-slate-400 mb-4">
              {this.state.isChunkError
                ? 'The component failed to load. This might be due to a network issue.'
                : 'An error occurred while rendering this component.'}
            </p>
            <Button
              onClick={this.handleRetry}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              {this.state.isChunkError ? 'Reload Page' : 'Try Again'}
            </Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default CodeSplitBoundary;