import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Mic, MicOff, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

/**
 * CRITICAL iOS FIX: WebSocket-free Voice Control
 * Removed WebSocket to prevent "WebSocket closed without opened" errors
 * Uses Web Speech API only (built-in browser feature)
 */
export default function VoiceControl({ isOpen, onClose }) {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const [error, setError] = useState(null);

  // Check if browser supports Speech Recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    
    if (!SpeechRecognition) {
      console.warn('Speech Recognition not supported in this browser');
      setIsSupported(false);
      setError('Voice control not supported on this device');
      return;
    }

    try {
      const recognitionInstance = new SpeechRecognition();
      recognitionInstance.continuous = true;
      recognitionInstance.interimResults = true;
      recognitionInstance.lang = 'en-US';

      recognitionInstance.onresult = (event) => {
        let finalTranscript = '';
        
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          }
        }

        if (finalTranscript) {
          setTranscript(prev => prev + finalTranscript);
          handleVoiceCommand(finalTranscript.trim().toLowerCase());
        }
      };

      recognitionInstance.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        
        // Don't show errors for common issues
        if (event.error === 'no-speech' || event.error === 'aborted') {
          return;
        }
        
        setError(`Voice error: ${event.error}`);
        setIsListening(false);
      };

      recognitionInstance.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognitionInstance);
      setIsSupported(true);
    } catch (err) {
      console.error('Failed to initialize speech recognition:', err);
      setIsSupported(false);
      setError('Could not initialize voice control');
    }
  }, []);

  const handleVoiceCommand = (command) => {
    console.log('Voice command:', command);
    
    // Simple navigation commands
    const commands = {
      'dashboard': '/Dashboard',
      'go to dashboard': '/Dashboard',
      'cases': '/Cases',
      'go to cases': '/Cases',
      'evidence': '/Evidence',
      'go to evidence': '/Evidence',
      'devices': '/Devices',
      'go to devices': '/Devices',
      'settings': '/Profile',
      'go to settings': '/Profile',
    };

    for (const [key, path] of Object.entries(commands)) {
      if (command.includes(key)) {
        window.location.href = path;
        setTranscript('');
        if (onClose) onClose();
        return;
      }
    }

    // Close commands
    if (command.includes('close') || command.includes('stop') || command.includes('cancel')) {
      stopListening();
      if (onClose) onClose();
    }
  };

  const startListening = () => {
    if (!recognition || !isSupported) {
      setError('Voice control not available');
      return;
    }

    try {
      setError(null);
      setTranscript('');
      recognition.start();
      setIsListening(true);
    } catch (err) {
      console.error('Failed to start recognition:', err);
      setError('Could not start voice control');
    }
  };

  const stopListening = () => {
    if (recognition) {
      try {
        recognition.stop();
      } catch (err) {
        console.warn('Error stopping recognition:', err);
      }
    }
    setIsListening(false);
  };

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (recognition && isListening) {
        try {
          recognition.stop();
        } catch (err) {
          console.warn('Cleanup error:', err);
        }
      }
    };
  }, [recognition, isListening]);

  // Don't render if not supported
  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="bg-slate-900 border-slate-800 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-xl flex items-center gap-2">
            <Mic className="w-5 h-5 text-blue-400" />
            Voice Control
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!isSupported ? (
            <Card className="bg-red-900/20 border-red-500/30">
              <CardContent className="p-4">
                <p className="text-red-200 text-sm">
                  {error || 'Voice control is not supported on this device or browser. Try using Chrome or Safari on desktop.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-300">Status</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center gap-3">
                    {isListening ? (
                      <>
                        <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                        <span className="text-sm text-green-300">Listening...</span>
                      </>
                    ) : (
                      <>
                        <div className="w-3 h-3 bg-slate-500 rounded-full"></div>
                        <span className="text-sm text-slate-400">Ready</span>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>

              {transcript && (
                <Card className="bg-blue-900/20 border-blue-500/30">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-sm text-blue-300">You said:</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-blue-100">{transcript}</p>
                  </CardContent>
                </Card>
              )}

              {error && (
                <Card className="bg-red-900/20 border-red-500/30">
                  <CardContent className="p-3">
                    <p className="text-red-200 text-xs">{error}</p>
                  </CardContent>
                </Card>
              )}

              <Card className="bg-slate-800/30 border-slate-700/50">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm text-slate-300">Voice Commands</CardTitle>
                </CardHeader>
                <CardContent className="text-xs text-slate-400 space-y-1">
                  <p>• "Go to Dashboard"</p>
                  <p>• "Go to Cases"</p>
                  <p>• "Go to Evidence"</p>
                  <p>• "Go to Devices"</p>
                  <p>• "Close" or "Stop"</p>
                </CardContent>
              </Card>

              <div className="flex gap-2">
                {!isListening ? (
                  <Button
                    onClick={startListening}
                    className="flex-1 bg-blue-600 hover:bg-blue-700"
                  >
                    <Mic className="w-4 h-4 mr-2" />
                    Start Listening
                  </Button>
                ) : (
                  <Button
                    onClick={stopListening}
                    className="flex-1 bg-red-600 hover:bg-red-700"
                  >
                    <MicOff className="w-4 h-4 mr-2" />
                    Stop Listening
                  </Button>
                )}
                
                <Button
                  onClick={onClose}
                  variant="outline"
                  className="border-slate-700"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}