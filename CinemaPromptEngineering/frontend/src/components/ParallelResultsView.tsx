/** Parallel Results View Component
 *
 * Displays streaming results from multi-node parallel generation.
 * Results appear as they complete with progress indicators for running jobs.
 */

import { useState, useCallback } from 'react';
import type {
  ChildJob,
  JobGroupWithCounts,
  ChildJobStatus,
} from '@/types/jobGroup';
import {
  Check,
  X,
  Loader2,
  Clock,
  AlertTriangle,
  Maximize2,
  Download,
  Grid3X3,
  List,
  Zap,
} from 'lucide-react';
import './ParallelResultsView.css';

// =============================================================================
// Props Interface
// =============================================================================

export interface ParallelResultsViewProps {
  /** The job group to display results for */
  jobGroup: JobGroupWithCounts | null;
  /** Callback when a result is selected */
  onResultSelect?: (job: ChildJob, index: number) => void;
  /** Callback when the view is closed */
  onClose?: () => void;
  /** Currently selected result index */
  selectedIndex?: number;
  /** Whether to show the view in compact mode */
  compact?: boolean;
}

// =============================================================================
// Helper Components
// =============================================================================

interface JobCardProps {
  job: ChildJob;
  index: number;
  isSelected: boolean;
  onClick: () => void;
  compact?: boolean;
}

/** Individual job result card */
function JobCard({ job, index: _index, isSelected, onClick, compact }: JobCardProps) {
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageError, setImageError] = useState(false);

  const statusConfig: Record<
    ChildJobStatus,
    {
      icon: React.ReactNode;
      label: string;
      className: string;
    }
  > = {
    pending: {
      icon: <Clock size={compact ? 16 : 20} />,
      label: 'Pending',
      className: 'status-pending',
    },
    queued: {
      icon: <Clock size={compact ? 16 : 20} />,
      label: 'Queued',
      className: 'status-pending',
    },
    running: {
      icon: <Loader2 size={compact ? 16 : 20} className="spin" />,
      label: 'Running',
      className: 'status-running',
    },
    completed: {
      icon: <Check size={compact ? 16 : 20} />,
      label: 'Complete',
      className: 'status-completed',
    },
    failed: {
      icon: <X size={compact ? 16 : 20} />,
      label: 'Failed',
      className: 'status-failed',
    },
    timeout: {
      icon: <Clock size={compact ? 16 : 20} />,
      label: 'Timeout',
      className: 'status-timeout',
    },
    cancelled: {
      icon: <X size={compact ? 16 : 20} />,
      label: 'Cancelled',
      className: 'status-cancelled',
    },
  };

  const config = statusConfig[job.status];
  const hasImage = job.outputs?.images && job.outputs.images.length > 0;
  const imageUrl = hasImage ? job.outputs!.images[0].url : null;

  return (
    <div
      className={`job-card ${config.className} ${isSelected ? 'selected' : ''} ${
        compact ? 'compact' : ''
      }`}
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === 'Enter' && onClick()}
    >
      {/* Image or placeholder */}
      <div className="card-image-container">
        {job.status === 'completed' && imageUrl && !imageError ? (
          <>
            {!imageLoaded && (
              <div className="image-loading">
                <Loader2 size={24} className="spin" />
              </div>
            )}
            <img
              src={imageUrl}
              alt={`Result from ${job.backend_id}`}
              className={`card-image ${imageLoaded ? 'loaded' : ''}`}
              onLoad={() => setImageLoaded(true)}
              onError={() => setImageError(true)}
            />
          </>
        ) : (
          <div className={`card-placeholder ${config.className}`}>
            {config.icon}
          </div>
        )}

        {/* Progress overlay for running jobs */}
        {job.status === 'running' && (
          <div className="progress-overlay">
            <svg viewBox="0 0 36 36" className="progress-ring">
              <path
                className="progress-ring-bg"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              />
              <path
                className="progress-ring-fill"
                d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                strokeDasharray={`${job.progress}, 100`}
              />
            </svg>
            <span className="progress-text">{Math.round(job.progress)}%</span>
          </div>
        )}

        {/* Status badge */}
        <div className={`status-badge ${config.className}`}>
          {config.icon}
          <span>{config.label}</span>
        </div>

        {/* Selection indicator */}
        {isSelected && (
          <div className="selection-indicator">
            <Check size={16} />
          </div>
        )}
      </div>

      {/* Card info */}
      <div className="card-info">
        <div className="info-row">
          <span className="seed-label">Seed: {job.seed}</span>
          <span className="backend-label">{job.backend_id.split('_')[0]}</span>
        </div>
        {job.current_step && job.status === 'running' && (
          <div className="current-step">{job.current_step}</div>
        )}
        {job.error_message && (
          <div className="error-message" title={job.error_message}>
            <AlertTriangle size={12} />
            <span>{job.error_message}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function ParallelResultsView({
  jobGroup,
  onResultSelect,
  onClose,
  selectedIndex = 0,
  compact = false,
}: ParallelResultsViewProps) {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [enlargedImage, setEnlargedImage] = useState<string | null>(null);

  if (!jobGroup || jobGroup.child_jobs.length === 0) {
    return (
      <div className="parallel-results-view empty">
        <div className="empty-state">
          <Zap size={32} />
          <p>No parallel generation results available</p>
        </div>
      </div>
    );
  }

  const { child_jobs, status, completed_count, failed_count, total_count } = jobGroup;

  const completedJobs = child_jobs.filter((j: ChildJob) => j.status === 'completed');
  const runningJobs = child_jobs.filter((j: ChildJob) => j.status === 'running');
  const pendingJobs = child_jobs.filter((j: ChildJob) => j.status === 'pending');

  const isComplete = status === 'completed' || status === 'failed' || status === 'partial_complete';

  const handleCardClick = useCallback(
    (job: ChildJob, index: number) => {
      if (job.status === 'completed') {
        onResultSelect?.(job, index);
      }
    },
    [onResultSelect]
  );

  const handleDownload = useCallback((job: ChildJob) => {
    if (job.outputs?.images && job.outputs.images.length > 0) {
      const image = job.outputs.images[0];
      const link = document.createElement('a');
      link.href = image.url;
      link.download = image.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }, []);

  const enlargeImage = useCallback((job: ChildJob) => {
    if (job.outputs?.images && job.outputs.images.length > 0) {
      setEnlargedImage(job.outputs.images[0].url);
    }
  }, []);

  return (
    <div className={`parallel-results-view ${compact ? 'compact' : ''}`}>
      {/* Header */}
      <div className="results-header">
        <div className="header-title">
          <Zap size={20} />
          <h3>Parallel Results</h3>
          <span className={`status-pill ${status}`}>{status.replace('_', ' ')}</span>
        </div>

        <div className="header-summary">
          {completed_count > 0 && (
            <span className="summary-item success">{completed_count} completed</span>
          )}
          {failed_count > 0 && (
            <span className="summary-item error">{failed_count} failed</span>
          )}
          {runningJobs.length > 0 && (
            <span className="summary-item running">{runningJobs.length} running</span>
          )}
          {pendingJobs.length > 0 && (
            <span className="summary-item pending">{pendingJobs.length} pending</span>
          )}
          <span className="summary-total">of {total_count}</span>
        </div>

        <div className="header-actions">
          {/* View mode toggle */}
          <div className="view-toggle">
            <button
              className={viewMode === 'grid' ? 'active' : ''}
              onClick={() => setViewMode('grid')}
              title="Grid view"
            >
              <Grid3X3 size={16} />
            </button>
            <button
              className={viewMode === 'list' ? 'active' : ''}
              onClick={() => setViewMode('list')}
              title="List view"
            >
              <List size={16} />
            </button>
          </div>

          {/* Close button */}
          {onClose && (
            <button className="close-btn" onClick={onClose} title="Close">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Results grid */}
      <div className={`results-container ${viewMode}`}>
        {child_jobs.map((job, index) => (
          <JobCard
            key={job.job_id}
            job={job}
            index={index}
            isSelected={index === selectedIndex}
            onClick={() => handleCardClick(job, index)}
            compact={compact}
          />
        ))}
      </div>

      {/* Footer with actions */}
      {isComplete && completedJobs.length > 0 && (
        <div className="results-footer">
          <div className="footer-info">
            {completedJobs.length === 1 ? (
              <span>1 result available</span>
            ) : (
              <span>{completedJobs.length} results available</span>
            )}
          </div>

          <div className="footer-actions">
            {completedJobs.length > 1 && (
              <button
                className="action-btn secondary"
                onClick={() => {
                  // Download all completed results
                  completedJobs.forEach((job) => handleDownload(job));
                }}
              >
                <Download size={14} />
                Download All
              </button>
            )}

            {selectedIndex !== undefined && completedJobs[selectedIndex] && (
              <>
                <button
                  className="action-btn secondary"
                  onClick={() => enlargeImage(completedJobs[selectedIndex])}
                >
                  <Maximize2 size={14} />
                  View
                </button>
                <button
                  className="action-btn"
                  onClick={() => handleDownload(completedJobs[selectedIndex])}
                >
                  <Download size={14} />
                  Download Selected
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* Enlarged image modal */}
      {enlargedImage && (
        <div className="image-modal" onClick={() => setEnlargedImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <button
              className="modal-close"
              onClick={() => setEnlargedImage(null)}
              title="Close"
            >
              <X size={24} />
            </button>
            <img src={enlargedImage} alt="Enlarged result" />
          </div>
        </div>
      )}
    </div>
  );
}

export default ParallelResultsView;
