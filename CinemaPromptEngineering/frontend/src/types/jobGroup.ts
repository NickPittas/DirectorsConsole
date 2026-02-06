/** Types for multi-node parallel generation job groups */

// =============================================================================
// Enums
// =============================================================================

/** Strategy for generating unique seeds per backend */
export type SeedStrategy = 'random' | 'sequential' | 'fibonacci' | 'golden_ratio';

/** Status of an individual child job */
export type ChildJobStatus =
  | 'pending'
  | 'queued'
  | 'running'
  | 'completed'
  | 'failed'
  | 'timeout'
  | 'cancelled';

/** Status of the entire job group */
export type JobGroupStatus =
  | 'pending'
  | 'running'
  | 'partial_complete'
  | 'completed'
  | 'failed'
  | 'cancelled';

// =============================================================================
// Child Job Types
// =============================================================================

/** Output image from a completed job */
export interface JobOutputImage {
  filename: string;
  url: string;
  subfolder: string;
  type: string;
}

/** Outputs from a completed child job */
export interface ChildJobOutputs {
  images: JobOutputImage[];
  execution_time?: number;
  [key: string]: unknown;
}

/** A single job within a parallel job group */
export interface ChildJob {
  job_id: string;
  backend_id: string;
  seed: number;
  status: ChildJobStatus;
  progress: number;
  current_step: string | null;
  outputs: ChildJobOutputs | null;
  error_message: string | null;
  error_type: string | null;
  queued_at: string;
  started_at: string | null;
  completed_at: string | null;
}

// =============================================================================
// Job Group Types
// =============================================================================

/** A group of parallel jobs for multi-node generation */
export interface JobGroup {
  id: string;
  panel_id: number | null;
  child_jobs: ChildJob[];
  status: JobGroupStatus;
  seed_strategy: SeedStrategy;
  base_seed: number | null;
  timeout_seconds: number;
  metadata: Record<string, unknown>;
  created_at: string;
  completed_at: string | null;
}

/** Summary counts for a job group */
export interface JobGroupCounts {
  completed_count: number;
  failed_count: number;
  total_count: number;
}

/** Full job group with counts */
export interface JobGroupWithCounts extends JobGroup, JobGroupCounts {}

// =============================================================================
// API Request/Response Types
// =============================================================================

/** Request to create a parallel job group */
export interface JobGroupRequest {
  workflow_json: Record<string, unknown>;
  parameters?: Record<string, unknown>;
  backend_ids: string[];
  seed_strategy?: SeedStrategy;
  base_seed?: number | null;
  metadata?: Record<string, unknown>;
  timeout_seconds?: number;
  required_capabilities?: string[];
}

/** Response after submitting a job group */
export interface JobGroupResponse {
  job_group_id: string;
  child_jobs: ChildJob[];
  status: JobGroupStatus;
  created_at: string;
}

/** Response for job group status query */
export interface JobGroupStatusResponse extends JobGroupCounts {
  job_group_id: string;
  status: JobGroupStatus;
  child_jobs: ChildJob[];
  created_at: string;
  completed_at: string | null;
}

// =============================================================================
// WebSocket Event Types
// =============================================================================

/** Base WebSocket event */
export interface JobGroupEventBase {
  type: string;
}

/** Initial state sent on WebSocket connection */
export interface InitialStateEvent extends JobGroupEventBase {
  type: 'initial_state';
  job_group_id: string;
  status: JobGroupStatus;
  child_jobs: Array<{
    job_id: string;
    backend_id: string;
    seed: number;
    status: ChildJobStatus;
    progress: number;
  }>;
}

/** Child job progress update */
export interface ChildProgressEvent extends JobGroupEventBase {
  type: 'child_progress';
  job_id: string;
  backend_id: string;
  progress: number;
  current_step: string | null;
  steps_completed: number;
  steps_total: number;
}

/** Child job completed */
export interface ChildCompletedEvent extends JobGroupEventBase {
  type: 'child_completed';
  job_id: string;
  backend_id: string;
  seed: number;
  outputs: ChildJobOutputs;
  completed_at: string;
}

/** Child job failed */
export interface ChildFailedEvent extends JobGroupEventBase {
  type: 'child_failed';
  job_id: string;
  backend_id: string;
  error: string;
  error_type: string;
  failed_at: string;
}

/** Child job timed out */
export interface ChildTimeoutEvent extends JobGroupEventBase {
  type: 'child_timeout';
  job_id: string;
  backend_id: string;
  timeout_seconds: number;
  timed_out_at: string;
}

/** Job group fully complete */
export interface GroupCompleteEvent extends JobGroupEventBase {
  type: 'group_complete';
  job_group_id: string;
  total: number;
  succeeded: number;
  failed: number;
  results: Array<{
    job_id: string;
    status: ChildJobStatus;
    outputs?: ChildJobOutputs;
    error?: string;
  }>;
}

/** Ping/pong for connection keepalive */
export interface PongEvent extends JobGroupEventBase {
  type: 'pong';
}

/** Union type of all job group events */
export type JobGroupEvent =
  | InitialStateEvent
  | ChildProgressEvent
  | ChildCompletedEvent
  | ChildFailedEvent
  | ChildTimeoutEvent
  | GroupCompleteEvent
  | PongEvent;

// =============================================================================
// Component Props Types
// =============================================================================

/** Props for MultiNodeSelector component */
export interface MultiNodeSelectorProps {
  selectedNodeIds: string[];
  onChange: (nodeIds: string[]) => void;
  maxSelections?: number;
  disabled?: boolean;
}

/** Props for ParallelResultsView component */
export interface ParallelResultsViewProps {
  jobGroup: JobGroupWithCounts | null;
  onResultSelect?: (job: ChildJob, index: number) => void;
  onClose?: () => void;
  selectedIndex?: number;
}

// =============================================================================
// Store Types
// =============================================================================

/** State for a single panel's parallel generation */
export interface PanelParallelState {
  jobGroupId: string | null;
  isGenerating: boolean;
  childJobs: ChildJob[];
  selectedResultIndex: number;
  allResultsReceived: boolean;
}

/** WebSocket connection state */
export interface WebSocketConnectionState {
  connected: boolean;
  reconnecting: boolean;
  error: string | null;
}
