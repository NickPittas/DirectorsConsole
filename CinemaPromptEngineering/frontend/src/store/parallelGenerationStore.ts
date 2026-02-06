/** Zustand store for parallel generation state management */

import { create } from 'zustand';
import type {
  ChildJob,
  ChildJobStatus,
  JobGroupStatus,
  JobGroupWithCounts,
  PanelParallelState,
} from '@/types/jobGroup';

// =============================================================================
// Store State Interface
// =============================================================================

interface ParallelGenerationState {
  // Per-panel job groups (panel_id -> job group state)
  panelStates: Map<string, PanelParallelState>;

  // Per-job-group data (job_group_id -> full job group)
  jobGroups: Map<string, JobGroupWithCounts>;

  // Actions
  startJobGroup: (
    panelId: string,
    jobGroupId: string,
    childJobs: ChildJob[]
  ) => void;
  updateChildJob: (
    groupId: string,
    childId: string,
    updates: Partial<ChildJob>
  ) => void;
  updateChildProgress: (
    groupId: string,
    childId: string,
    progress: number,
    currentStep?: string | null
  ) => void;
  completeChildJob: (
    groupId: string,
    childId: string,
    outputs: ChildJob['outputs']
  ) => void;
  failChildJob: (
    groupId: string,
    childId: string,
    error: string,
    errorType?: string
  ) => void;
  timeoutChildJob: (groupId: string, childId: string, timeoutSeconds: number) => void;
  completeJobGroup: (groupId: string, finalStatus: JobGroupStatus) => void;
  cancelJobGroup: (groupId: string) => void;
  clearJobGroup: (groupId: string) => void;
  clearPanelState: (panelId: string) => void;
  selectResult: (panelId: string, resultIndex: number) => void;

  // Getters
  getPanelState: (panelId: string) => PanelParallelState | undefined;
  getJobGroup: (groupId: string) => JobGroupWithCounts | undefined;
  getCompletedResults: (groupId: string) => ChildJob[];
  getPanelForJobGroup: (groupId: string) => string | undefined;
}

// =============================================================================
// Helper Functions
// =============================================================================

const calculateJobGroupStatus = (childJobs: ChildJob[]): JobGroupStatus => {
  const allCompleted = childJobs.every((j) => j.status === 'completed');
  const allFailed = childJobs.every(
    (j) => j.status === 'failed' || j.status === 'timeout'
  );
  const anyRunning = childJobs.some(
    (j) => j.status === 'running' || j.status === 'pending'
  );
  const hasCompleted = childJobs.some((j) => j.status === 'completed');
  const hasFailed = childJobs.some(
    (j) => j.status === 'failed' || j.status === 'timeout'
  );
  const allCancelled = childJobs.every((j) => j.status === 'cancelled');

  if (allCancelled) return 'cancelled';
  if (allCompleted) return 'completed';
  if (allFailed) return 'failed';
  if (hasCompleted || hasFailed) return 'partial_complete';
  if (anyRunning) return 'running';
  return 'pending';
};

const calculateCounts = (childJobs: ChildJob[]) => {
  const completed_count = childJobs.filter((j) => j.status === 'completed').length;
  const failed_count = childJobs.filter(
    (j) => j.status === 'failed' || j.status === 'timeout'
  ).length;
  return { completed_count, failed_count, total_count: childJobs.length };
};

// =============================================================================
// Store Implementation
// =============================================================================

export const useParallelGenerationStore = create<ParallelGenerationState>(
  (set, get) => ({
    // Initial state
    panelStates: new Map(),
    jobGroups: new Map(),

    // -------------------------------------------------------------------------
    // Actions
    // -------------------------------------------------------------------------

    startJobGroup: (panelId, jobGroupId, childJobs) => {
      set((state) => {
        const newPanelStates = new Map(state.panelStates);
        const newJobGroups = new Map(state.jobGroups);

        // Set panel state
        newPanelStates.set(panelId, {
          jobGroupId,
          isGenerating: true,
          childJobs: [...childJobs],
          selectedResultIndex: 0,
          allResultsReceived: false,
        });

        // Store job group
        const counts = calculateCounts(childJobs);
        newJobGroups.set(jobGroupId, {
          id: jobGroupId,
          panel_id: parseInt(panelId, 10) || null,
          child_jobs: [...childJobs],
          status: 'running',
          seed_strategy: 'random',
          base_seed: null,
          timeout_seconds: 300,
          metadata: {},
          created_at: new Date().toISOString(),
          completed_at: null,
          ...counts,
        });

        return { panelStates: newPanelStates, jobGroups: newJobGroups };
      });
    },

    updateChildJob: (groupId, childId, updates) => {
      set((state) => {
        const newJobGroups = new Map(state.jobGroups);
        const jobGroup = newJobGroups.get(groupId);
        if (!jobGroup) return state;

        const updatedChildJobs = jobGroup.child_jobs.map((job) =>
          job.job_id === childId ? { ...job, ...updates } : job
        );

        const counts = calculateCounts(updatedChildJobs);
        const newStatus = calculateJobGroupStatus(updatedChildJobs);

        newJobGroups.set(groupId, {
          ...jobGroup,
          child_jobs: updatedChildJobs,
          status: newStatus,
          ...counts,
        });

        // Also update panel state if exists
        const newPanelStates = new Map(state.panelStates);
        const panelId = get().getPanelForJobGroup(groupId);
        if (panelId) {
          const panelState = newPanelStates.get(panelId);
          if (panelState) {
            newPanelStates.set(panelId, {
              ...panelState,
              childJobs: updatedChildJobs,
            });
          }
        }

        return { jobGroups: newJobGroups, panelStates: newPanelStates };
      });
    },

    updateChildProgress: (groupId, childId, progress, currentStep = null) => {
      get().updateChildJob(groupId, childId, {
        progress,
        current_step: currentStep,
        status: 'running',
        started_at: new Date().toISOString(),
      });
    },

    completeChildJob: (groupId, childId, outputs) => {
      get().updateChildJob(groupId, childId, {
        status: 'completed',
        progress: 100,
        outputs,
        completed_at: new Date().toISOString(),
      });
    },

    failChildJob: (groupId, childId, error, errorType = 'UnknownError') => {
      get().updateChildJob(groupId, childId, {
        status: 'failed',
        error_message: error,
        error_type: errorType,
        completed_at: new Date().toISOString(),
      });
    },

    timeoutChildJob: (groupId, childId, timeoutSeconds) => {
      get().updateChildJob(groupId, childId, {
        status: 'timeout',
        error_message: `Job timed out after ${timeoutSeconds} seconds`,
        error_type: 'TimeoutError',
        completed_at: new Date().toISOString(),
      });
    },

    completeJobGroup: (groupId, finalStatus) => {
      set((state) => {
        const newJobGroups = new Map(state.jobGroups);
        const jobGroup = newJobGroups.get(groupId);
        if (!jobGroup) return state;

        newJobGroups.set(groupId, {
          ...jobGroup,
          status: finalStatus,
          completed_at: new Date().toISOString(),
        });

        const newPanelStates = new Map(state.panelStates);
        const panelId = get().getPanelForJobGroup(groupId);
        if (panelId) {
          const panelState = newPanelStates.get(panelId);
          if (panelState) {
            newPanelStates.set(panelId, {
              ...panelState,
              isGenerating: false,
              allResultsReceived: true,
            });
          }
        }

        return { jobGroups: newJobGroups, panelStates: newPanelStates };
      });
    },

    cancelJobGroup: (groupId) => {
      set((state) => {
        const newJobGroups = new Map(state.jobGroups);
        const jobGroup = newJobGroups.get(groupId);
        if (!jobGroup) return state;

        const updatedChildJobs = jobGroup.child_jobs.map((job) =>
          job.status === 'pending' || job.status === 'running'
            ? { ...job, status: 'cancelled' as ChildJobStatus }
            : job
        );

        newJobGroups.set(groupId, {
          ...jobGroup,
          child_jobs: updatedChildJobs,
          status: 'cancelled',
          completed_at: new Date().toISOString(),
        });

        const newPanelStates = new Map(state.panelStates);
        const panelId = get().getPanelForJobGroup(groupId);
        if (panelId) {
          const panelState = newPanelStates.get(panelId);
          if (panelState) {
            newPanelStates.set(panelId, {
              ...panelState,
              isGenerating: false,
              childJobs: updatedChildJobs,
              allResultsReceived: true,
            });
          }
        }

        return { jobGroups: newJobGroups, panelStates: newPanelStates };
      });
    },

    clearJobGroup: (groupId) => {
      set((state) => {
        const newJobGroups = new Map(state.jobGroups);
        newJobGroups.delete(groupId);
        return { jobGroups: newJobGroups };
      });
    },

    clearPanelState: (panelId) => {
      set((state) => {
        const newPanelStates = new Map(state.panelStates);
        const panelState = newPanelStates.get(panelId);
        if (panelState?.jobGroupId) {
          // Also clear associated job group
          const newJobGroups = new Map(state.jobGroups);
          newJobGroups.delete(panelState.jobGroupId);
          newPanelStates.delete(panelId);
          return { panelStates: newPanelStates, jobGroups: newJobGroups };
        }
        newPanelStates.delete(panelId);
        return { panelStates: newPanelStates };
      });
    },

    selectResult: (panelId, resultIndex) => {
      set((state) => {
        const newPanelStates = new Map(state.panelStates);
        const panelState = newPanelStates.get(panelId);
        if (!panelState) return state;

        newPanelStates.set(panelId, {
          ...panelState,
          selectedResultIndex: resultIndex,
        });
        return { panelStates: newPanelStates };
      });
    },

    // -------------------------------------------------------------------------
    // Getters
    // -------------------------------------------------------------------------

    getPanelState: (panelId) => {
      return get().panelStates.get(panelId);
    },

    getJobGroup: (groupId) => {
      return get().jobGroups.get(groupId);
    },

    getCompletedResults: (groupId) => {
      const jobGroup = get().jobGroups.get(groupId);
      if (!jobGroup) return [];
      return jobGroup.child_jobs.filter((j) => j.status === 'completed');
    },

    getPanelForJobGroup: (groupId) => {
      const state = get();
      for (const [panelId, panelState] of state.panelStates.entries()) {
        if (panelState.jobGroupId === groupId) {
          return panelId;
        }
      }
      return undefined;
    },
  })
);
