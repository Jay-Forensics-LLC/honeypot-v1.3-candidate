import { offlineDB } from '../lib/OfflineDB';
import { logForensicEvent, ForensicEventTypes } from './ForensicLogger';

/**
 * FORENSIC PLAYBACK ENGINE
 * Frame-accurate event replay with synchronization
 */
export class ForensicPlaybackEngine {
  constructor() {
    this.events = [];
    this.annotations = new Map();
    this.currentFrame = 0;
  }

  /**
   * Load all events from storage
   */
  async loadAllEvents() {
    try {
      const [forensicEvents, securityEvents, auditEvents] = await Promise.all([
        this.loadForensicEvents(),
        this.loadSecurityEvents(),
        this.loadAuditEvents()
      ]);

      // Merge and sort by timestamp
      const allEvents = [
        ...forensicEvents.map(e => ({ ...e, source: 'forensic' })),
        ...securityEvents.map(e => ({ ...e, source: 'security' })),
        ...auditEvents.map(e => ({ ...e, source: 'audit' }))
      ].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      this.events = allEvents;
      
      // Load annotations
      await this.loadAnnotations();
      
      return allEvents;
    } catch (error) {
      console.error('Failed to load events:', error);
      return [];
    }
  }

  /**
   * Load forensic logs from IndexedDB
   */
  async loadForensicEvents() {
    try {
      const db = await offlineDB.db;
      const events = await db.table('forensicEvents').toArray();
      return events;
    } catch (error) {
      console.error('Failed to load forensic events:', error);
      return [];
    }
  }

  /**
   * Load security events from append-only storage
   */
  async loadSecurityEvents() {
    try {
      const db = await offlineDB.db;
      const events = await db.table('securityEvents').toArray();
      return events;
    } catch (error) {
      console.error('Failed to load security events:', error);
      return [];
    }
  }

  /**
   * Load audit events from append-only storage
   */
  async loadAuditEvents() {
    try {
      const db = await offlineDB.db;
      const events = await db.table('auditEvents').toArray();
      return events;
    } catch (error) {
      console.error('Failed to load audit events:', error);
      return [];
    }
  }

  /**
   * Load annotations
   */
  async loadAnnotations() {
    try {
      const stored = localStorage.getItem('forensic_annotations');
      if (stored) {
        const annotations = JSON.parse(stored);
        this.annotations = new Map(Object.entries(annotations));
        
        // Apply annotations to events
        this.events = this.events.map(event => {
          const annotation = this.annotations.get(event.id);
          return annotation ? { ...event, ...annotation } : event;
        });
      }
    } catch (error) {
      console.error('Failed to load annotations:', error);
    }
  }

  /**
   * Add annotation to event
   */
  async addAnnotation(eventId, annotation) {
    try {
      this.annotations.set(eventId, annotation);
      
      // Persist annotations
      const annotationsObj = Object.fromEntries(this.annotations);
      localStorage.setItem('forensic_annotations', JSON.stringify(annotationsObj));
      
      // Log annotation action
      await logForensicEvent(ForensicEventTypes.CONFIG_CHANGE, {
        type: 'event_annotated',
        eventId,
        annotation: annotation.text,
        flagged: annotation.flagged
      });
      
      return true;
    } catch (error) {
      console.error('Failed to add annotation:', error);
      throw error;
    }
  }

  /**
   * Get events in time range
   */
  getEventsInRange(startTime, endTime) {
    return this.events.filter(event => {
      const timestamp = new Date(event.timestamp).getTime();
      return timestamp >= startTime && timestamp <= endTime;
    });
  }

  /**
   * Get event at specific time (frame-accurate)
   */
  getEventAtTime(time) {
    // Find the most recent event at or before the specified time
    const targetTime = new Date(this.events[0]?.timestamp).getTime() + time;
    
    for (let i = this.events.length - 1; i >= 0; i--) {
      const eventTime = new Date(this.events[i].timestamp).getTime();
      if (eventTime <= targetTime) {
        return this.events[i];
      }
    }
    
    return null;
  }

  /**
   * Calculate frame for timestamp (60 FPS)
   */
  calculateFrame(timestamp) {
    if (this.events.length === 0) return 0;
    
    const firstTime = new Date(this.events[0].timestamp).getTime();
    const eventTime = new Date(timestamp).getTime();
    const elapsed = eventTime - firstTime;
    
    // 60 FPS = 16.67ms per frame
    return Math.floor(elapsed / 16.67);
  }

  /**
   * Get events for current frame
   */
  getEventsForFrame(frame) {
    const frameTime = frame * 16.67; // Convert frame to milliseconds
    
    if (this.events.length === 0) return [];
    
    const firstTime = new Date(this.events[0].timestamp).getTime();
    const targetTime = firstTime + frameTime;
    
    // Return events within this frame (±8.33ms for 60fps tolerance)
    return this.events.filter(event => {
      const eventTime = new Date(event.timestamp).getTime();
      return Math.abs(eventTime - targetTime) < 8.33;
    });
  }

  /**
   * Export playback session
   */
  async exportSession(options = {}) {
    const session = {
      events: this.events,
      annotations: Object.fromEntries(this.annotations),
      filters: options.filters || {},
      duration: this.getDuration(),
      exportedAt: new Date().toISOString(),
      frameCount: this.getTotalFrames()
    };
    
    return session;
  }

  /**
   * Get total duration in milliseconds
   */
  getDuration() {
    if (this.events.length < 2) return 0;
    
    const firstTime = new Date(this.events[0].timestamp).getTime();
    const lastTime = new Date(this.events[this.events.length - 1].timestamp).getTime();
    
    return lastTime - firstTime;
  }

  /**
   * Get total frame count
   */
  getTotalFrames() {
    return Math.ceil(this.getDuration() / 16.67);
  }

  /**
   * Clear all data
   */
  clear() {
    this.events = [];
    this.annotations.clear();
    this.currentFrame = 0;
  }
}