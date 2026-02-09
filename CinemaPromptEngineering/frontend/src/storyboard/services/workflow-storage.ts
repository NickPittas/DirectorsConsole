/**
 * WorkflowStorageService - Persistent workflow storage via CPE backend API.
 *
 * Workflows are stored as individual JSON files on the server filesystem
 * at %APPDATA%/CinemaPromptEngineering/workflows/ (Windows).
 *
 * This replaces the old localStorage-based storage which was volatile and
 * could lose all workflow data on browser cache clear.
 */

export interface WorkflowStorageInfo {
  storage_path: string;
  workflow_count: number;
  total_size_bytes: number;
  total_size_mb: number;
}

class WorkflowStorageService {
  // The workflow storage router is mounted at /api/workflows on the CPE backend.
  // Use relative path — works in both dev (Vite proxy) and production (same origin).
  private baseUrl = '/api/workflows';

  /**
   * Load all workflows from persistent storage.
   */
  async loadAll(): Promise<{ workflows: unknown[]; count: number; storage_path: string }> {
    const response = await fetch(this.baseUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      throw new Error(`Failed to load workflows: HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Save a single workflow to persistent storage.
   */
  async save(workflow: Record<string, unknown>): Promise<{ success: boolean; id: string; path: string }> {
    const response = await fetch(this.baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to save workflow: HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Save all workflows at once (bulk sync).
   */
  async saveAll(workflows: Record<string, unknown>[]): Promise<{
    success: boolean;
    saved: number;
    total: number;
    errors: string[];
    storage_path: string;
  }> {
    const response = await fetch(`${this.baseUrl}/bulk`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflows }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to bulk save workflows: HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Update an existing workflow.
   */
  async update(workflowId: string, workflow: Record<string, unknown>): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(workflowId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(workflow),
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to update workflow: HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Delete a workflow from persistent storage.
   */
  async delete(workflowId: string): Promise<{ success: boolean }> {
    const response = await fetch(`${this.baseUrl}/${encodeURIComponent(workflowId)}`, {
      method: 'DELETE',
    });
    if (!response.ok) {
      const err = await response.json().catch(() => ({}));
      throw new Error(err.detail || `Failed to delete workflow: HTTP ${response.status}`);
    }
    return response.json();
  }

  /**
   * Get storage location info.
   */
  async getStorageInfo(): Promise<WorkflowStorageInfo> {
    const response = await fetch(`${this.baseUrl}/storage-info`);
    if (!response.ok) {
      throw new Error(`Failed to get storage info: HTTP ${response.status}`);
    }
    return response.json();
  }
}

// Singleton instance
export const workflowStorage = new WorkflowStorageService();
