import React, { createContext, useContext, useEffect, useState } from 'react';
import { backgroundProcessManager } from '../lib/BackgroundProcessManager';

const BackgroundProcessContext = createContext(null);

export function BackgroundProcessProvider({ children }) {
  const [processes, setProcesses] = useState([]);

  useEffect(() => {
    // Initial load
    setProcesses(backgroundProcessManager.getAllProcesses());

    // Subscribe to updates
    const unsubscribe = backgroundProcessManager.subscribe((updatedProcesses) => {
      setProcesses(updatedProcesses);
    });

    return unsubscribe;
  }, []);

  const startProcess = (config) => {
    return backgroundProcessManager.startProcess(config);
  };

  const stopProcess = (processId) => {
    backgroundProcessManager.stopProcess(processId);
  };

  const getProcess = (processId) => {
    return backgroundProcessManager.getProcess(processId);
  };

  const clearCompleted = () => {
    backgroundProcessManager.clearCompleted();
  };

  const value = {
    processes,
    activeProcesses: processes.filter(p => p.status === 'running'),
    startProcess,
    stopProcess,
    getProcess,
    clearCompleted
  };

  return (
    <BackgroundProcessContext.Provider value={value}>
      {children}
    </BackgroundProcessContext.Provider>
  );
}

export function useBackgroundProcess() {
  const context = useContext(BackgroundProcessContext);
  if (!context) {
    console.warn('useBackgroundProcess used outside BackgroundProcessProvider, returning defaults');
    return {
      processes: [],
      activeProcesses: [],
      startProcess: () => {},
      stopProcess: () => {},
      getProcess: () => null,
      clearCompleted: () => {}
    };
  }
  return context;
}