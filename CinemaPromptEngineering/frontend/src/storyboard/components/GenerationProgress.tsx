/**
 * GenerationProgress — Sidebar component showing detailed per-node generation progress.
 *
 * Replaces the old overlay-on-panel approach. Sits inside the right sidebar
 * ("System Stats" area) and shows progress for every active generation across
 * all panels, grouped by panel then by render node.
 */

import type { Panel } from '../StoryboardUI';

export interface GenerationProgressProps {
  /** All panels — component filters to only those currently generating */
  panels: Panel[];
  /** Callback to cancel the single-node generation for a panel */
  onCancelSingle?: (panelId: number) => void;
  /** Callback to cancel a specific parallel job */
  onCancelParallelJob?: (panelId: number, nodeId: string) => void;
}

/**
 * A single job progress row — used for both single-node and parallel jobs.
 */
function JobRow({
  nodeName,
  progress,
  status,
  phase,
  currentNode,
}: {
  nodeName: string;
  progress: number;
  status: string;
  phase?: string;
  currentNode?: string;
}) {
  const statusLabel =
    status === 'running'
      ? `${progress}%`
      : status === 'pending'
        ? 'Queued'
        : status === 'complete'
          ? 'Done'
          : status === 'error'
            ? 'Error'
            : status;

  // Build descriptive text line: "Phase 1/2 · KSampler" or just "KSampler" or "Queued"
  const parts: string[] = [];
  if (phase) parts.push(phase);
  if (currentNode) parts.push(currentNode);
  const stageText = parts.length > 0 ? parts.join(' · ') : undefined;

  return (
    <div className="gen-progress-job">
      <div className="gen-progress-job-header">
        <span className="gen-progress-node-name">{nodeName}</span>
        <span
          className={`gen-progress-status ${status}`}
        >
          {statusLabel}
        </span>
      </div>
      {stageText && (
        <div className="gen-progress-stage">{stageText}</div>
      )}
      <div className="gen-progress-bar-track">
        <div
          className={`gen-progress-bar-fill ${status}`}
          style={{ width: `${Math.min(100, progress)}%` }}
        />
      </div>
    </div>
  );
}

export default function GenerationProgress({
  panels,
  onCancelSingle,
  onCancelParallelJob,
}: GenerationProgressProps) {
  // Collect only panels that are actively generating
  const generatingPanels = panels.filter(p => p.status === 'generating');

  if (generatingPanels.length === 0) return null;

  return (
    <div className="gen-progress-section">
      <div className="gen-progress-header">
        <span className="gen-progress-title">Generation Progress</span>
        <span className="gen-progress-count">
          {generatingPanels.length} active
        </span>
      </div>

      {generatingPanels.map(panel => {
        const panelLabel = panel.name || `Panel ${panel.id}`;
        const hasParallelJobs =
          panel.parallelJobs && panel.parallelJobs.length > 0;

        return (
          <div key={panel.id} className="gen-progress-panel-card">
            <div className="gen-progress-panel-header">
              <span className="gen-progress-panel-name">{panelLabel}</span>
              {!hasParallelJobs && onCancelSingle && (
                <button
                  className="gen-progress-cancel-btn"
                  onClick={() => onCancelSingle(panel.id)}
                  title="Cancel generation"
                >
                  ✕
                </button>
              )}
            </div>

            {hasParallelJobs ? (
              /* Parallel jobs: one row per render node */
              panel.parallelJobs!
                .filter(j => j.status !== 'complete')
                .map(job => (
                  <div key={`${panel.id}-${job.nodeId}`} className="gen-progress-job-wrapper">
                    <JobRow
                      nodeName={job.nodeName}
                      progress={job.progress}
                      status={job.status}
                    />
                    {onCancelParallelJob && job.status === 'running' && (
                      <button
                        className="gen-progress-cancel-job-btn"
                        onClick={() => onCancelParallelJob(panel.id, job.nodeId)}
                        title={`Cancel on ${job.nodeName}`}
                      >
                        ✕
                      </button>
                    )}
                  </div>
                ))
            ) : (
              /* Single-node generation */
              <JobRow
                nodeName="Render Node"
                progress={panel.progress}
                status="running"
                phase={panel.progressPhase}
                currentNode={panel.progressNodeName}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}
