const STORAGE_KEY = 'storyboard_generation_journal_v1';
const MAX_RUNS = 250;
const PROCESS_STARTED_AT = Date.now();

export type GenerationSubmissionStatus =
  | 'preparing'
  | 'prepared'
  | 'submitting'
  | 'accepted'
  | 'submission_unknown'
  | 'rejected'
  | 'failed_before_submission'
  | 'running'
  | 'complete'
  | 'error'
  | 'cancel_requested'
  | 'cancelled'
  | 'partial';

export interface GenerationJournalJob {
  backendId: string;
  seed: number;
  status: GenerationSubmissionStatus;
  promptId?: string;
  updatedAt: number;
  message?: string;
}

export interface GenerationJournalRun {
  runId: string;
  commandId: string;
  idempotencyKey: string;
  projectIdentity: string;
  panelId: number;
  workflowId: string;
  workflowRevision: number;
  mode: 'single' | 'parallel';
  status: GenerationSubmissionStatus;
  createdAt: number;
  updatedAt: number;
  jobs: GenerationJournalJob[];
}

export class GenerationJournalError extends Error {
  constructor(readonly code: string, message: string, readonly existingRun?: GenerationJournalRun) {
    super(message);
    this.name = 'GenerationJournalError';
  }
}

export class GenerationSubmissionError extends Error {
  constructor(readonly code: string, message: string, readonly state: GenerationSubmissionStatus) {
    super(message);
    this.name = 'GenerationSubmissionError';
  }
}

function asRun(value: unknown): value is GenerationJournalRun {
  if (!value || typeof value !== 'object') return false;
  const run = value as Partial<GenerationJournalRun>;
  return typeof run.runId === 'string' && typeof run.commandId === 'string'
    && typeof run.idempotencyKey === 'string' && typeof run.projectIdentity === 'string'
    && typeof run.panelId === 'number' && typeof run.workflowId === 'string'
    && typeof run.workflowRevision === 'number' && (run.mode === 'single' || run.mode === 'parallel')
    && typeof run.status === 'string' && typeof run.createdAt === 'number'
    && typeof run.updatedAt === 'number' && Array.isArray(run.jobs)
    && run.jobs.every(job => Boolean(job) && typeof job.backendId === 'string'
      && typeof job.seed === 'number' && typeof job.status === 'string'
      && typeof job.updatedAt === 'number');
}

function readRuns(): GenerationJournalRun[] {
  let raw: string | null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    throw new GenerationJournalError('journal_unavailable', 'Generation history storage is unavailable; no ComfyUI prompt was submitted.');
  }
  if (!raw) return [];
  let values: unknown;
  try {
    values = JSON.parse(raw);
  } catch {
    throw new GenerationJournalError('journal_corrupt', 'Generation history could not be read safely; existing data was left untouched.');
  }
  if (!Array.isArray(values) || !values.every(asRun)) {
    throw new GenerationJournalError('journal_corrupt', 'Generation history has an unsupported shape; existing data was left untouched.');
  }
  let recovered = false;
  const runs = values.map(run => {
    const copy = { ...run, jobs: run.jobs.map(job => ({ ...job })) };
    if (copy.updatedAt < PROCESS_STARTED_AT) {
      let recoveredRun = false;
      for (const job of copy.jobs) {
        if (job.status === 'prepared') {
          job.status = 'failed_before_submission';
          job.message = 'The page stopped before this backend prompt request began.';
          job.updatedAt = PROCESS_STARTED_AT;
          recovered = true;
          recoveredRun = true;
        }
        if (job.status === 'submitting') {
          job.status = 'submission_unknown';
          job.message = 'The page stopped during submission; inspect this exact backend and prompt before any retry.';
          job.updatedAt = PROCESS_STARTED_AT;
          recovered = true;
          recoveredRun = true;
        }
      }
      if (copy.jobs.some(job => job.status === 'submission_unknown')) copy.status = 'submission_unknown';
      else if (copy.jobs.length === 0 && copy.status === 'preparing') {
        copy.status = 'failed_before_submission';
        recovered = true;
        recoveredRun = true;
      }
      if (recoveredRun) refreshRunStatus(copy);
      if (recoveredRun) copy.updatedAt = PROCESS_STARTED_AT;
    }
    return copy;
  });
  if (recovered) writeRuns(runs);
  return runs;
}

function writeRuns(runs: GenerationJournalRun[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(runs));
  } catch {
    throw new GenerationJournalError('journal_write_failed', 'Generation history could not be saved. The prompt was not submitted.');
  }
}

function updateRun(runs: GenerationJournalRun[], runId: string, update: (run: GenerationJournalRun) => void): GenerationJournalRun {
  const run = runs.find(item => item.runId === runId);
  if (!run) throw new GenerationJournalError('run_not_found', 'The generation run is not in the durable journal.');
  update(run);
  run.updatedAt = Date.now();
  refreshRunStatus(run);
  return run;
}

function refreshRunStatus(run: GenerationJournalRun): void {
  if (run.jobs.length > 0) {
    if (run.jobs.some(job => job.status === 'submission_unknown')) run.status = 'submission_unknown';
    else if (run.jobs.some(job => job.status === 'submitting')) run.status = 'submitting';
    else if (run.jobs.some(job => job.status === 'prepared')) run.status = 'prepared';
    else if (run.jobs.some(job => job.status === 'accepted' || job.status === 'running' || job.status === 'cancel_requested')) run.status = 'accepted';
    else if (run.jobs.every(job => ['complete', 'cancelled', 'error', 'rejected', 'failed_before_submission'].includes(job.status))) {
      if (run.jobs.every(job => job.status === 'complete')) run.status = 'complete';
      else if (run.jobs.every(job => job.status === 'cancelled')) run.status = 'cancelled';
      else if (run.jobs.every(job => job.status === 'error')) run.status = 'error';
      else if (run.jobs.every(job => job.status === 'rejected')) run.status = 'rejected';
      else if (run.jobs.every(job => job.status === 'failed_before_submission')) run.status = 'failed_before_submission';
      else run.status = 'partial';
    }
  }
}

function saveUpdatedRun(runId: string, update: (run: GenerationJournalRun) => void): GenerationJournalRun {
  const runs = readRuns();
  const run = updateRun(runs, runId, update);
  writeRuns(runs);
  return run;
}

export function createGenerationRun(input: Omit<GenerationJournalRun, 'createdAt' | 'updatedAt' | 'status' | 'jobs'>): GenerationJournalRun {
  const runs = readRuns();
  const duplicate = runs.find(run => run.idempotencyKey === input.idempotencyKey);
  if (duplicate) throw new GenerationJournalError('duplicate_idempotency_key', 'This generation request already has a durable run. Inspect it instead of submitting again.', duplicate);
  const terminal = new Set<GenerationSubmissionStatus>(['complete', 'error', 'cancelled', 'rejected', 'failed_before_submission', 'partial']);
  const retained = runs.filter(run => !terminal.has(run.status));
  const pruneCount = Math.max(0, MAX_RUNS - retained.length - 1);
  const pruned = pruneCount > 0 ? runs.filter(run => terminal.has(run.status)).slice(-pruneCount) : [];
  if (retained.length >= MAX_RUNS) throw new GenerationJournalError('journal_full', 'Generation history is full of active or unresolved runs. Resolve or archive those runs before submitting another prompt.');
  const now = Date.now();
  const run: GenerationJournalRun = { ...input, status: 'preparing', createdAt: now, updatedAt: now, jobs: [] };
  writeRuns([...retained, ...pruned, run]);
  return run;
}

export function prepareGenerationJob(runId: string, backendId: string, seed: number): GenerationJournalJob {
  let job!: GenerationJournalJob;
  saveUpdatedRun(runId, run => {
    const existing = run.jobs.find(item => item.backendId === backendId);
    if (existing) {
      if (existing.status === 'prepared' && existing.seed === seed) {
        job = existing;
        return;
      }
      throw new GenerationJournalError('duplicate_backend_submission', `Backend '${backendId}' already has a submission record for this run.`);
    }
    job = { backendId, seed, status: 'prepared', updatedAt: Date.now() };
    run.jobs.push(job);
  });
  return job;
}

export function updateGenerationJob(
  runId: string,
  backendId: string,
  status: GenerationSubmissionStatus,
  values: { promptId?: string; message?: string } = {},
): GenerationJournalRun {
  return saveUpdatedRun(runId, run => {
    const job = run.jobs.find(item => item.backendId === backendId);
    if (!job) throw new GenerationJournalError('job_not_found', `Backend '${backendId}' has no submission record for this run.`);
    job.status = status;
    job.updatedAt = Date.now();
    if (values.promptId !== undefined) job.promptId = values.promptId;
    if (values.message !== undefined) job.message = values.message;
  });
}

export function updateGenerationJobByPrompt(
  runId: string,
  promptId: string,
  status: 'running' | 'complete' | 'error' | 'cancel_requested' | 'cancelled',
  message?: string,
): GenerationJournalRun | null {
  const runs = readRuns();
  const run = runs.find(item => item.runId === runId);
  const job = run?.jobs.find(item => item.promptId === promptId);
  if (!run || !job) return null;
  const updated = updateRun(runs, runId, current => {
    const target = current.jobs.find(item => item.promptId === promptId);
    if (!target) return;
    target.status = status;
    target.updatedAt = Date.now();
    if (message !== undefined) target.message = message;
  });
  writeRuns(runs);
  return updated;
}

export function failGenerationBeforeSubmission(runId: string, message: string): GenerationJournalRun {
  return saveUpdatedRun(runId, run => {
    if (run.jobs.length === 0) {
      run.status = 'failed_before_submission';
      run.updatedAt = Date.now();
      return;
    }
    for (const job of run.jobs.filter(item => item.status === 'prepared')) {
      job.status = 'failed_before_submission';
      job.message = message;
      job.updatedAt = Date.now();
    }
  });
}

export function getGenerationRun(runId: string): GenerationJournalRun | null {
  return readRuns().find(run => run.runId === runId) || null;
}

export function getGenerationRunByIdempotencyKey(key: string): GenerationJournalRun | null {
  return readRuns().find(run => run.idempotencyKey === key) || null;
}

export function listGenerationRuns(projectIdentity?: string): GenerationJournalRun[] {
  return readRuns().filter(run => projectIdentity === undefined || run.projectIdentity === projectIdentity);
}

export async function submitPromptWithJournal(input: {
  runId: string;
  backendId: string;
  seed: number;
  url: string;
  body: Record<string, unknown>;
}): Promise<{ promptId: string }> {
  prepareGenerationJob(input.runId, input.backendId, input.seed);
  updateGenerationJob(input.runId, input.backendId, 'submitting');
  let response: Response;
  try {
    response = await fetch(input.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input.body),
    });
  } catch (error) {
    updateGenerationJob(input.runId, input.backendId, 'submission_unknown', { message: 'The response was lost after the prompt request began; do not submit it again automatically.' });
    throw new GenerationSubmissionError('submission_unknown', error instanceof Error ? error.message : 'The ComfyUI response was lost.', 'submission_unknown');
  }
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const payload = await response.json() as { error?: unknown; node_errors?: unknown };
      if (payload.error) message = typeof payload.error === 'string' ? payload.error : JSON.stringify(payload.error);
      if (payload.node_errors) message += ` | Node errors: ${JSON.stringify(payload.node_errors)}`;
    } catch { /* The HTTP status still identifies a rejection for 4xx responses. */ }
    const state = response.status >= 500 ? 'submission_unknown' : 'rejected';
    updateGenerationJob(input.runId, input.backendId, state, { message });
    throw new GenerationSubmissionError(state, message, state);
  }
  let payload: { prompt_id?: unknown };
  try {
    payload = await response.json() as { prompt_id?: unknown };
  } catch {
    updateGenerationJob(input.runId, input.backendId, 'submission_unknown', { message: 'ComfyUI accepted the request but its response body could not be read.' });
    throw new GenerationSubmissionError('submission_unknown', 'ComfyUI accepted the request but returned an unreadable response.', 'submission_unknown');
  }
  if (typeof payload.prompt_id !== 'string' || payload.prompt_id.length === 0) {
    updateGenerationJob(input.runId, input.backendId, 'submission_unknown', { message: 'The response did not include a prompt ID, so the submission cannot be reconciled.' });
    throw new GenerationSubmissionError('submission_unknown', 'ComfyUI returned no prompt ID; the submission outcome is unknown.', 'submission_unknown');
  }
  try {
    updateGenerationJob(input.runId, input.backendId, 'accepted', { promptId: payload.prompt_id });
  } catch (error) {
    throw new GenerationSubmissionError('journal_write_failed_after_acceptance', 'ComfyUI accepted the prompt, but its prompt ID could not be saved to generation history.', 'submission_unknown');
  }
  return { promptId: payload.prompt_id };
}
