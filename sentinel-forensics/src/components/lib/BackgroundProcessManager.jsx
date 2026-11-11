/**
 * Background Process Manager
 * Handles long-running processes that persist across navigation
 */

class BackgroundProcessManager {
  constructor() {
    this.processes = new Map();
    this.listeners = new Set();
    this.dbName = 'sentinel_background_processes';
    this.storeName = 'processes';
    this.db = null;
    this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        this.db = request.result;
        this.loadProcesses();
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id' });
        }
      };
    });
  }

  async loadProcesses() {
    if (!this.db) return;
    
    const transaction = this.db.transaction([this.storeName], 'readonly');
    const store = transaction.objectStore(this.storeName);
    const request = store.getAll();
    
    request.onsuccess = () => {
      request.result.forEach(process => {
        this.processes.set(process.id, process);
        // Resume active processes
        if (process.status === 'running') {
          this.resumeProcess(process.id);
        }
      });
      this.notifyListeners();
    };
  }

  async saveProcess(process) {
    if (!this.db) return;
    
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.put(process);
  }

  async deleteProcess(processId) {
    if (!this.db) return;
    
    const transaction = this.db.transaction([this.storeName], 'readwrite');
    const store = transaction.objectStore(this.storeName);
    store.delete(processId);
  }

  startProcess(config) {
    const process = {
      id: config.id || `process_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      type: config.type,
      name: config.name,
      status: 'running',
      progress: 0,
      startTime: Date.now(),
      data: config.data || {},
      metadata: config.metadata || {}
    };

    this.processes.set(process.id, process);
    this.saveProcess(process);
    this.notifyListeners();

    // Start the actual work
    if (config.executor) {
      this.executeProcess(process.id, config.executor);
    }

    return process.id;
  }

  async executeProcess(processId, executor) {
    const process = this.processes.get(processId);
    if (!process) return;

    try {
      const updateProgress = (progress, data = {}) => {
        const proc = this.processes.get(processId);
        if (proc) {
          proc.progress = progress;
          proc.data = { ...proc.data, ...data };
          this.processes.set(processId, proc);
          this.saveProcess(proc);
          this.notifyListeners();
        }
      };

      await executor(updateProgress);

      // Mark complete
      const proc = this.processes.get(processId);
      if (proc) {
        proc.status = 'completed';
        proc.progress = 100;
        proc.endTime = Date.now();
        this.processes.set(processId, proc);
        this.saveProcess(proc);
        this.notifyListeners();
      }
    } catch (error) {
      console.error('Process execution error:', error);
      const proc = this.processes.get(processId);
      if (proc) {
        proc.status = 'failed';
        proc.error = error.message;
        proc.endTime = Date.now();
        this.processes.set(processId, proc);
        this.saveProcess(proc);
        this.notifyListeners();
      }
    }
  }

  resumeProcess(processId) {
    const process = this.processes.get(processId);
    if (!process || process.status !== 'running') return;

    // Dispatch custom event for page-specific resume logic
    window.dispatchEvent(new CustomEvent('background_process_resume', {
      detail: { processId, process }
    }));
  }

  stopProcess(processId) {
    const process = this.processes.get(processId);
    if (!process) return;

    process.status = 'stopped';
    process.endTime = Date.now();
    this.processes.set(processId, process);
    this.saveProcess(process);
    this.notifyListeners();
  }

  getProcess(processId) {
    return this.processes.get(processId);
  }

  getAllProcesses() {
    return Array.from(this.processes.values());
  }

  getActiveProcesses() {
    return Array.from(this.processes.values()).filter(
      p => p.status === 'running'
    );
  }

  clearCompleted() {
    const completed = Array.from(this.processes.values()).filter(
      p => p.status === 'completed' || p.status === 'failed'
    );
    
    completed.forEach(p => {
      this.processes.delete(p.id);
      this.deleteProcess(p.id);
    });
    
    this.notifyListeners();
  }

  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener(this.getAllProcesses());
      } catch (error) {
        console.error('Listener error:', error);
      }
    });
  }
}

export const backgroundProcessManager = new BackgroundProcessManager();