/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by failing fast when service is unhealthy
 * 
 * States: CLOSED (normal) → OPEN (failing) → HALF_OPEN (testing) → CLOSED
 */

export class CircuitBreaker {
  constructor(config = {}) {
    this.threshold = config.threshold || 5; // Failures before opening
    this.timeout = config.timeout || 60000; // Time in OPEN state
    this.resetTimeout = config.resetTimeout || 30000; // Cool-down period
    
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.lastStateChange = Date.now();
    this.halfOpenAttempts = 0;
  }

  canExecute() {
    const now = Date.now();

    switch (this.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Check if timeout has passed
        if (now - this.lastStateChange >= this.timeout) {
          this.transitionTo('HALF_OPEN');
          return true;
        }
        return false;

      case 'HALF_OPEN':
        // Allow limited requests to test if service recovered
        return this.halfOpenAttempts < 3;

      default:
        return false;
    }
  }

  recordSuccess() {
    this.failures = 0;
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      this.halfOpenAttempts++;
      if (this.halfOpenAttempts >= 3) {
        // Service recovered
        this.transitionTo('CLOSED');
      }
    }
  }

  recordFailure() {
    this.failures++;
    this.lastFailureTime = Date.now();

    if (this.state === 'HALF_OPEN') {
      // Failed during testing, go back to OPEN
      this.transitionTo('OPEN');
    } else if (this.state === 'CLOSED' && this.failures >= this.threshold) {
      // Too many failures, open circuit
      this.transitionTo('OPEN');
    }
  }

  transitionTo(newState) {
    const oldState = this.state;
    this.state = newState;
    this.lastStateChange = Date.now();

    if (newState === 'HALF_OPEN') {
      this.halfOpenAttempts = 0;
    }

    if (newState === 'CLOSED') {
      this.failures = 0;
      this.halfOpenAttempts = 0;
    }

    console.log(`🔌 Circuit Breaker: ${oldState} → ${newState}`);
  }

  getStatus() {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      lastFailure: this.lastFailureTime,
      healthy: this.state === 'CLOSED',
    };
  }

  reset() {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.halfOpenAttempts = 0;
  }
}