/**
 * Job Queue Manager
 * Handles background job scheduling, prioritization, and execution
 * Integrates with agent system and API rate limiters
 */

import { base44 } from '@/api/base44Client';

export class JobQueueManager {
  constructor() {
    this.processing = false;
    this.currentJob = null;
    this.processors = new Map();
    
    // Register job processors
    this.registerProcessors();
  }

  registerProcessors() {
    // VirusTotal scans
    this.processors.set('virustotal_scan', async (job) => {
      const result = await base44.functions.invoke('virusTotal', {
        hash: job.payload.hash,
        type: job.payload.type || 'file'
      });
      return { result: result.data, cost: 0 };
    });

    // Shodan lookups
    this.processors.set('shodan_lookup', async (job) => {
      const result = await base44.functions.invoke('proxyShodan', {
        ip: job.payload.ip
      });
      return { result: result.data, cost: 0.01 };
    });

    // Censys queries
    this.processors.set('censys_enumeration', async (job) => {
      const result = await base44.functions.invoke('proxyCensys', {
        query: job.payload.query
      });
      return { result: result.data, cost: 0 };
    });

    // HIBP checks
    this.processors.set('hibp_check', async (job) => {
      const result = await base44.functions.invoke('proxyHIBP', {
        email: job.payload.email
      });
      return { result: result.data, cost: 0 };
    });

    // LLM analysis
    this.processors.set('llm_analysis', async (job) => {
      const result = await base44.integrations.Core.InvokeLLM({
        prompt: job.payload.prompt,
        add_context_from_internet: job.payload.add_context_from_internet || false,
        response_json_schema: job.payload.response_json_schema
      });
      
      const tokens = result.usage?.total_tokens || 1000;
      const cost = job.payload.use_anthropic 
        ? tokens * 0.000008 
        : tokens * 0.000002;
      
      return { result, cost };
    });

    // Threat enrichment batch
    this.processors.set('threat_enrichment', async (job) => {
      const result = await base44.functions.invoke('enrichBatch', {
        indicator_ids: job.payload.indicator_ids,
        providers: job.payload.providers || ['virustotal', 'abuseipdb']
      });
      return { result: result.data, cost: 0.05 };
    });

    // Forensic summary
    this.processors.set('forensic_summary', async (job) => {
      const result = await base44.functions.invoke('generateForensicSummary', {
        case_id: job.payload.case_id
      });
      return { result: result.data, cost: 0.10 };
    });
  }

  async queueJob(jobType, provider, payload, priority = 5) {
    try {
      const job = await base44.entities.JobQueue.create({
        job_id: `JOB-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        job_type: jobType,
        provider: provider,
        status: 'queued',
        priority: priority,
        payload: payload,
        scheduled_at: new Date().toISOString(),
        retry_count: 0,
        max_retries: 3
      });

      console.log(`✅ Job queued: ${job.job_id} (${jobType})`);
      return job;
    } catch (error) {
      console.error('Failed to queue job:', error);
      throw error;
    }
  }

  async processNextJob() {
    if (this.currentJob) {
      console.log('Job already processing, skipping');
      return null;
    }

    try {
      // Get highest priority queued job
      const jobs = await base44.entities.JobQueue.filter({ status: 'queued' });
      
      if (jobs.length === 0) {
        return null;
      }

      // Sort by priority (descending) and scheduled time
      const readyJobs = jobs
        .filter(j => !j.scheduled_at || new Date(j.scheduled_at) <= new Date())
        .sort((a, b) => (b.priority || 5) - (a.priority || 5));

      if (readyJobs.length === 0) {
        return null;
      }

      const job = readyJobs[0];
      this.currentJob = job;

      // Get processor
      const processor = this.processors.get(job.job_type);
      if (!processor) {
        throw new Error(`No processor registered for job type: ${job.job_type}`);
      }

      // Update status
      await base44.entities.JobQueue.update(job.id, {
        status: 'processing',
        started_at: new Date().toISOString()
      });

      const startTime = Date.now();

      // Execute job
      const { result, cost } = await processor(job);

      // Update with success
      await base44.entities.JobQueue.update(job.id, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        execution_time_ms: Date.now() - startTime,
        result: result,
        estimated_cost: cost
      });

      console.log(`✅ Job completed: ${job.job_id} (${Date.now() - startTime}ms, $${cost.toFixed(4)})`);

      return { success: true, job, result };

    } catch (error) {
      console.error('Job processing error:', error);

      if (this.currentJob) {
        const retryCount = (this.currentJob.retry_count || 0) + 1;
        const maxRetries = this.currentJob.max_retries || 3;

        if (retryCount < maxRetries) {
          // Retry with exponential backoff
          const backoffMs = Math.pow(2, retryCount) * 10000;
          await base44.entities.JobQueue.update(this.currentJob.id, {
            status: 'queued',
            retry_count: retryCount,
            scheduled_at: new Date(Date.now() + backoffMs).toISOString(),
            error: error.message
          });
        } else {
          // Dead letter
          await base44.entities.JobQueue.update(this.currentJob.id, {
            status: 'dead_letter',
            completed_at: new Date().toISOString(),
            error: error.message,
            retry_count: retryCount
          });
        }
      }

      throw error;
    } finally {
      this.currentJob = null;
    }
  }

  async startProcessing() {
    if (this.processing) {
      console.log('Queue processor already running');
      return;
    }

    this.processing = true;
    console.log('🚀 Job queue processor started');

    while (this.processing) {
      try {
        await this.processNextJob();
        // Wait 2 seconds between jobs
        await this.sleep(2000);
      } catch (error) {
        console.error('Queue processor error:', error);
        // Continue processing despite errors
        await this.sleep(5000);
      }
    }
  }

  stopProcessing() {
    this.processing = false;
    console.log('⏸️ Job queue processor stopped');
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Singleton instance
export const jobQueue = new JobQueueManager();

// Helper functions
export async function queueThreatEnrichment(indicatorIds, providers = ['virustotal', 'abuseipdb', 'shodan']) {
  return jobQueue.queueJob(
    'threat_enrichment',
    'multiple',
    { indicator_ids: indicatorIds, providers },
    8 // High priority
  );
}

export async function queueForensicSummary(caseId) {
  return jobQueue.queueJob(
    'forensic_summary',
    'anthropic',
    { case_id: caseId },
    7
  );
}

export async function queueVirusTotalScan(hash, type = 'file') {
  return jobQueue.queueJob(
    'virustotal_scan',
    'virustotal',
    { hash, type },
    6
  );
}

export async function queueLLMAnalysis(prompt, useAnthropic = true, addContext = false) {
  return jobQueue.queueJob(
    'llm_analysis',
    useAnthropic ? 'anthropic' : 'openai',
    { prompt, use_anthropic: useAnthropic, add_context_from_internet: addContext },
    5
  );
}