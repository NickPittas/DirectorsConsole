/**
 * WorkflowStorageService - revision-checked persistence through the CPE API.
 *
 * Mutations require a prior load (or a successful mutation response). The
 * service serializes requests, snapshots JSON payloads at call time, and rejects
 * queued snapshots whose collection revision was superseded. HTTP 409 is
 * exposed as WorkflowStorageConflictError; callers must reconcile explicitly.
 */

export interface WorkflowStorageInfo {
  storage_path: string;
  workflow_count: number;
  total_size_bytes: number;
  total_size_mb: number;
}

type StoredWorkflow = Record<string, unknown> & { id: string; revision: number };

export class WorkflowStorageConflictError extends Error {
  readonly code = 'WORKFLOW_STORAGE_CONFLICT';

  constructor(message: string, readonly serverConflict: boolean) {
    super(message);
    this.name = 'WorkflowStorageConflictError';
  }
}

class WorkflowStorageService {
  // The workflow storage router is mounted at /api/workflows on the CPE backend.
  // Use relative path — works in both dev (Vite proxy) and production (same origin).
  private baseUrl = '/api/workflows';
  private collectionRevision: number | null = null;
  private workflows = new Map<string, StoredWorkflow>();
  private deletedWorkflowIds = new Set<string>();
  private singleWriteRevisions = new Map<string, number>();
  private snapshotBarrier = 0;
  private reloadRequired = false;
  private mutationQueue: Promise<void> = Promise.resolve();

  /** Load the canonical collection and seed the expected revisions for writes. */
  async loadAll(): Promise<{
    workflows: unknown[];
    count: number;
    storage_path: string;
    collectionRevision: number;
  }> {
    return this.enqueue(async () => {
      const response = await fetch(this.baseUrl, { signal: AbortSignal.timeout(10000) });
      if (!response.ok) throw new Error(`Failed to load workflows: HTTP ${response.status}`);
      const result = await response.json() as {
        workflows?: unknown[];
        count?: number;
        storage_path?: string;
        collectionRevision?: number;
      };
      const workflows = result.workflows;
      const collectionRevision = result.collectionRevision;
      if (!Array.isArray(workflows) || typeof collectionRevision !== 'number' || !Number.isInteger(collectionRevision) || collectionRevision < 0) {
        throw new Error('Workflow storage response is missing canonical revisions');
      }
      let canonical: StoredWorkflow[];
      try {
        canonical = workflows.map(workflow => this.asStoredWorkflow(workflow));
      } catch (error) {
        this.reloadRequired = true;
        throw error;
      }
      this.workflows = new Map(canonical.map(workflow => [workflow.id, this.cloneRecord(workflow) as StoredWorkflow]));
      this.deletedWorkflowIds.clear();
      this.singleWriteRevisions.clear();
      this.collectionRevision = collectionRevision;
      this.snapshotBarrier += 1;
      this.reloadRequired = false;
      return {
        workflows: canonical,
        count: typeof result.count === 'number' ? result.count : canonical.length,
        storage_path: result.storage_path || '',
        collectionRevision,
      };
    });
  }

  /** Save or create one workflow and return the server's canonical record. */
  async save(workflow: Record<string, unknown>): Promise<{
    success: boolean;
    id: string;
    path: string;
    workflow: StoredWorkflow;
    collectionRevision: number;
  }> {
    const snapshot = this.cloneRecord(workflow);
    const id = this.workflowId(snapshot);
    this.assertLatestSingleWriteRevision(id, snapshot);
    const expected = this.captureMutation([id]);
    return this.enqueue(async () => {
      this.assertSnapshot(expected.collectionRevision);
      const response = await this.sendMutation<{
        success: boolean;
        id: string;
        path: string;
        workflow: unknown;
        collectionRevision: number;
      }>(this.baseUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...snapshot,
          expectedCollectionRevision: expected.collectionRevision,
          expectedRevision: expected.revisions[id],
        }),
      }, 'Failed to save workflow');
      const canonical = this.acceptMutation(response.collectionRevision, response.workflow);
      return { ...response, workflow: canonical };
    });
  }

  /** Upsert a collection snapshot. Omitted records are never deleted. */
  async saveAll(workflows: Record<string, unknown>[]): Promise<{
    success: boolean;
    saved: number;
    removed: number;
    total: number;
    errors: string[];
    workflows: StoredWorkflow[];
    storage_path: string;
    collectionRevision: number;
  }> {
    const snapshot = workflows.map(workflow => this.cloneRecord(workflow));
    const ids = snapshot.map(workflow => this.workflowId(workflow));
    if (new Set(ids).size !== ids.length) throw new Error('Workflow snapshot contains duplicate IDs');
    for (const workflow of snapshot) {
      const id = this.workflowId(workflow);
      if (this.deletedWorkflowIds.has(id)) {
        throw new WorkflowStorageConflictError(`Workflow '${id}' was deleted after this snapshot was created.`, false);
      }
      this.assertLatestSingleWriteRevision(id, workflow);
    }
    this.captureMutation(ids);
    const snapshotBarrier = this.snapshotBarrier;

    return this.enqueue(async () => {
      if (snapshotBarrier !== this.snapshotBarrier) {
        throw new WorkflowStorageConflictError('This workflow snapshot predates a reload, direct save or deletion. Reconcile it with the latest workflow state.', false);
      }
      // Ordered bulk snapshots may include newer user edits while an earlier bulk save is in flight.
      const expected = this.captureMutation(ids);
      const expectedRevisions = Object.fromEntries(ids.map(id => [id, expected.revisions[id]]));
      const response = await this.sendMutation<{
        success: boolean;
        saved: number;
        removed?: number;
        total: number;
        errors?: string[];
        workflows: unknown[];
        storage_path: string;
        collectionRevision: number;
      }>(`${this.baseUrl}/bulk`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workflows: snapshot,
          expectedCollectionRevision: expected.collectionRevision,
          expectedRevisions,
        }),
      }, 'Failed to bulk save workflows');
      if (!Array.isArray(response.workflows)) {
        this.reloadRequired = true;
        throw new Error('Bulk save response is missing canonical workflows');
      }
      let canonical: StoredWorkflow[];
      try {
        canonical = response.workflows.map(workflow => this.asStoredWorkflow(workflow));
      } catch (error) {
        this.reloadRequired = true;
        throw error;
      }
      const revision = this.acceptCollectionRevision(response.collectionRevision);
      for (const workflow of canonical) {
        this.workflows.set(workflow.id, this.cloneRecord(workflow) as StoredWorkflow);
        this.singleWriteRevisions.delete(workflow.id);
      }
      return { ...response, removed: response.removed || 0, errors: response.errors || [], workflows: canonical, collectionRevision: revision };
    });
  }

  /** Replace one existing workflow and return its canonical revision. */
  async update(workflowId: string, workflow: Record<string, unknown>): Promise<{
    success: boolean;
    id: string;
    workflow: StoredWorkflow;
    collectionRevision: number;
  }> {
    const snapshot = this.cloneRecord(workflow);
    if (snapshot.id !== undefined && snapshot.id !== workflowId) throw new Error('Workflow ID cannot be changed by update');
    snapshot.id = workflowId;
    this.assertLatestSingleWriteRevision(workflowId, snapshot);
    const expected = this.captureMutation([workflowId]);
    return this.enqueue(async () => {
      this.assertSnapshot(expected.collectionRevision);
      const response = await this.sendMutation<{
        success: boolean;
        id: string;
        workflow: unknown;
        collectionRevision: number;
      }>(`${this.baseUrl}/${encodeURIComponent(workflowId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...snapshot,
          expectedCollectionRevision: expected.collectionRevision,
          expectedRevision: expected.revisions[workflowId],
        }),
      }, 'Failed to update workflow');
      const canonical = this.acceptMutation(response.collectionRevision, response.workflow);
      return { ...response, workflow: canonical };
    });
  }

  /** Delete one workflow with its current record and collection revisions. */
  async delete(workflowId: string): Promise<{
    success: boolean;
    id: string;
    collectionRevision: number;
  }> {
    return this.enqueue(async () => {
      if (this.reloadRequired) throw new Error('Reload workflow storage before saving after an unresolved conflict or request failure');
      if (this.collectionRevision === null) throw new Error('Load workflow storage before saving');
      // Deletion is an explicit ID-targeted action, so re-read cached revisions after earlier queued writes.
      const expectedCollectionRevision = this.collectionRevision;
      const expectedRevision = this.workflows.get(workflowId)?.revision ?? null;
      const response = await this.sendMutation<{
        success: boolean;
        id: string;
        collectionRevision: number;
      }>(`${this.baseUrl}/${encodeURIComponent(workflowId)}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedCollectionRevision,
          expectedRevision,
        }),
      }, 'Failed to delete workflow');
      this.acceptCollectionRevision(response.collectionRevision);
      this.workflows.delete(workflowId);
      this.deletedWorkflowIds.add(workflowId);
      this.singleWriteRevisions.delete(workflowId);
      this.snapshotBarrier += 1;
      return response;
    });
  }

  /** Get storage location info. */
  async getStorageInfo(): Promise<WorkflowStorageInfo> {
    const response = await fetch(`${this.baseUrl}/storage-info`);
    if (!response.ok) throw new Error(`Failed to get storage info: HTTP ${response.status}`);
    return response.json();
  }

  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.mutationQueue.then(operation);
    this.mutationQueue = result.then(() => undefined, () => undefined);
    return result;
  }

  private captureMutation(ids: string[]): { collectionRevision: number; revisions: Record<string, number | null> } {
    if (this.reloadRequired) throw new Error('Reload workflow storage before saving after an unresolved conflict or request failure');
    if (this.collectionRevision === null) throw new Error('Load workflow storage before saving');
    return {
      collectionRevision: this.collectionRevision,
      revisions: Object.fromEntries(ids.map(id => [id, this.workflows.get(id)?.revision ?? null])),
    };
  }

  private assertSnapshot(expectedCollectionRevision: number): void {
    if (this.reloadRequired || this.collectionRevision === null) {
      throw new Error('Reload workflow storage before saving after an unresolved conflict or request failure');
    }
    if (this.collectionRevision !== expectedCollectionRevision) {
      throw new WorkflowStorageConflictError(
        'This queued workflow snapshot was superseded by an earlier save and was not sent. Reconcile it with the latest workflow state.',
        false,
      );
    }
  }

  private assertLatestSingleWriteRevision(id: string, workflow: Record<string, unknown>): void {
    const requiredRevision = this.singleWriteRevisions.get(id);
    if (requiredRevision !== undefined && workflow.revision !== requiredRevision) {
      throw new WorkflowStorageConflictError(`Workflow '${id}' has not adopted its latest saved revision.`, false);
    }
  }

  private async sendMutation<T>(url: string, init: RequestInit, fallback: string): Promise<T> {
    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (error) {
      this.reloadRequired = true;
      throw error;
    }

    const payload = await response.json().catch(() => null) as (T & {
      success?: boolean;
      detail?: string;
      errors?: string[];
    }) | null;
    if (response.status === 409) {
      this.reloadRequired = true;
      throw new WorkflowStorageConflictError(payload?.detail || `${fallback}: stale workflow revision`, true);
    }
    if (!response.ok) {
      if (response.status >= 500) this.reloadRequired = true;
      throw new Error(payload?.detail || `${fallback}: HTTP ${response.status}`);
    }
    if (!payload) {
      this.reloadRequired = true;
      throw new Error(`${fallback}: invalid response body`);
    }
    if (payload.success === false || (Array.isArray(payload.errors) && payload.errors.length > 0)) {
      this.reloadRequired = true;
      const errors = Array.isArray(payload.errors) ? payload.errors.join('; ') : '';
      throw new Error(errors || payload.detail || fallback);
    }
    return payload;
  }

  private acceptMutation(collectionRevision: number, rawWorkflow: unknown): StoredWorkflow {
    try {
      const workflow = this.asStoredWorkflow(rawWorkflow);
      this.acceptCollectionRevision(collectionRevision);
      this.workflows.set(workflow.id, this.cloneRecord(workflow) as StoredWorkflow);
      this.deletedWorkflowIds.delete(workflow.id);
      this.singleWriteRevisions.set(workflow.id, workflow.revision);
      this.snapshotBarrier += 1;
      return workflow;
    } catch (error) {
      this.reloadRequired = true;
      throw error;
    }
  }

  private acceptCollectionRevision(revision: unknown): number {
    if (typeof revision !== 'number' || !Number.isInteger(revision) || revision < 0) {
      this.reloadRequired = true;
      throw new Error('Workflow storage response is missing a valid collection revision');
    }
    this.collectionRevision = revision;
    return revision;
  }

  private asStoredWorkflow(value: unknown): StoredWorkflow {
    if (!value || typeof value !== 'object' || !('id' in value) || !('revision' in value)) {
      throw new Error('Workflow storage response contains a record without canonical revisions');
    }
    const workflow = value as Record<string, unknown>;
    if (typeof workflow.id !== 'string' || typeof workflow.revision !== 'number' || !Number.isInteger(workflow.revision) || workflow.revision < 1) {
      throw new Error('Workflow storage response contains an invalid canonical revision');
    }
    return workflow as StoredWorkflow;
  }

  private workflowId(workflow: Record<string, unknown>): string {
    if (typeof workflow.id !== 'string' || !workflow.id.trim()) throw new Error('Workflow ID must be a non-empty string');
    return workflow.id;
  }

  private cloneRecord(workflow: Record<string, unknown>): Record<string, unknown> {
    const serialized = JSON.stringify(workflow);
    if (serialized === undefined) throw new Error('Workflow must be JSON serializable');
    return JSON.parse(serialized) as Record<string, unknown>;
  }
}

// Singleton instance
export const workflowStorage = new WorkflowStorageService();
