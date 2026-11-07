/**
 * AI ANALYTICS TYPE DEFINITIONS
 * Aligned with JSON schemas for runtime validation
 */

export type ArtifactType = 
  | 'pcap_metadata' 
  | 'netflow' 
  | 'dns_log' 
  | 'tls_log' 
  | 'memory_dump' 
  | 'memory_extraction' 
  | 'system_log' 
  | 'edr_log' 
  | 'browser_log' 
  | 'custom';

export type EventType =
  | 'net_flow'
  | 'dns_query'
  | 'tls_handshake'
  | 'http_meta'
  | 'process_start'
  | 'process_end'
  | 'file_access'
  | 'auth'
  | 'usb'
  | 'scheduled_task'
  | 'powershell'
  | 'registry'
  | 'memory_proc'
  | 'memory_module'
  | 'memory_region'
  | 'memory_string';

export type RunType = 
  | 'network_anomaly' 
  | 'memory_anomaly' 
  | 'behavior_analytics' 
  | 'combined';

export type RunStatus = 'queued' | 'running' | 'success' | 'failed';

export type FindingType = 
  | 'anomaly' 
  | 'cluster' 
  | 'behavior_deviation' 
  | 'indicator' 
  | 'correlation' 
  | 'outlier';

export type Severity = 'info' | 'low' | 'medium' | 'high' | 'critical';

export type ReviewStatus = 'unreviewed' | 'reviewed' | 'dismissed';

export type VizType = 
  | 'network_graph' 
  | 'process_tree' 
  | 'timeline' 
  | 'heatmap';

export interface EvidenceArtifactDTO {
  id: string;
  case_id: string;
  organization_id: string;
  artifact_type: ArtifactType;
  file_url?: string;
  file_name?: string;
  sha256_hash: string;
  size_bytes?: number;
  source_device_id?: string;
  ingested_at?: string; // ISO 8601 date-time
  labels?: string[];
  notes?: string;
  created_date: string;
  updated_date: string;
  created_by: string;
}

export interface NormalizedEventDTO {
  id: string;
  case_id: string;
  organization_id: string;
  artifact_id: string;
  event_type: EventType;
  event_time: string; // ISO 8601 date-time
  host_id?: string;
  actor_user?: string;
  src_ip?: string;
  src_port?: number;
  dst_ip?: string;
  dst_port?: number;
  domain?: string;
  sni?: string;
  ja3?: string;
  ja4?: string;
  process_id?: number;
  parent_process_id?: number;
  process_name?: string;
  command_line?: string;
  file_path?: string;
  registry_path?: string;
  attributes_json: Record<string, any>;
  quality_score: number; // 0-1
  created_date: string;
  updated_date: string;
  created_by: string;
}

export interface TimeRange {
  start: string; // ISO 8601 date-time
  end: string; // ISO 8601 date-time
}

export interface AnalyticsRunDTO {
  id: string;
  case_id: string;
  organization_id: string;
  run_type: RunType;
  status: RunStatus;
  started_at?: string;
  finished_at?: string;
  model_provider?: string;
  model_name?: string;
  model_version?: string;
  prompt_version?: string;
  parameters_json?: Record<string, any>;
  input_artifact_ids?: string[];
  input_event_query?: string;
  output_summary?: string;
  court_admissible_mode?: boolean;
  run_fingerprint?: string;
  created_date: string;
  updated_date: string;
  created_by: string;
}

export interface EvidenceRef {
  artifact_id: string;
  event_ids?: string[];
  fields_used?: string[];
  time_range?: TimeRange;
}

export interface ReproducibilityBlock {
  model?: string;
  prompt_version?: string;
  detection_confidence?: number;
  anomaly_types?: string[];
}

export interface AIAnalyticsFindingDTO {
  id: string;
  case_id: string;
  organization_id: string;
  analytics_run_id: string;
  finding_type: FindingType;
  title: string;
  description: string;
  severity: Severity;
  confidence: number; // 0-1
  confidence_explain?: string;
  rationale?: string;
  recommended_actions?: string[];
  evidence_refs?: EvidenceRef[];
  reproducibility?: ReproducibilityBlock;
  analyst_notes?: string;
  reviewed?: boolean;
  created_date: string;
  updated_date: string;
  created_by: string;
}

export interface NetworkGraphSpec {
  nodes: Array<{
    id: string;
    type: string;
    label: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
    value?: number;
  }>;
}

export interface ProcessTreeSpec {
  nodes: Array<{
    id: string;
    name: string;
    command?: string;
  }>;
  edges: Array<{
    source: string;
    target: string;
  }>;
}

export interface TimelineSpec {
  events: Array<{
    time: string;
    type: string;
    label: string;
    id: string;
  }>;
  anomalies: Array<{
    time: string;
    type: string;
    label: string;
    severity: Severity;
    id: string;
  }>;
}

export interface VisualizationArtifactDTO {
  id: string;
  case_id: string;
  organization_id: string;
  analytics_run_id: string;
  viz_type: VizType;
  title: string;
  spec_json: NetworkGraphSpec | ProcessTreeSpec | TimelineSpec | Record<string, any>;
  preview_url?: string;
  created_date: string;
  updated_date: string;
  created_by: string;
}

// API Request/Response Types
export interface CreateAnalyticsRunRequest {
  caseId: string;
  runType: RunType;
  artifactIds?: string[];
  timeRange?: TimeRange;
  courtAdmissibleMode?: boolean;
}

export interface CreateAnalyticsRunResponse {
  success: boolean;
  run_id: string;
  findings_count: number;
  visualizations_count: number;
}

export interface FindingFilters {
  severity?: Severity;
  confidenceMin?: number;
  reviewedStatus?: ReviewStatus;
  timeRange?: TimeRange;
}

// Component Props
export interface AnalyticsRunComposerProps {
  caseId: string;
  onRunCreated?: (runId: string) => void;
}

export interface FindingsListProps {
  findings: AIAnalyticsFindingDTO[];
  loading?: boolean;
  onSelectFinding?: (findingId: string) => void;
}

export interface VisualizationViewerProps {
  visualization: VisualizationArtifactDTO;
  highlightEntities?: string[];
  onNodeClick?: (nodeId: string) => void;
}