import type { ApplicationResult } from "./contracts.js";

const PENDING_STATUSES = new Set([
  "preparing",
  "prepared",
  "submitting",
  "accepted",
  "running",
  "cancel_requested",
]);

export async function waitForTrackedRun(
  read: () => Promise<ApplicationResult>,
  runId: string,
  signal?: AbortSignal,
): Promise<ApplicationResult> {
  // shortcut: deadline is checked between reads; add a per-read deadline if a hard wall-clock limit is required.
  const deadline = Date.now() + 20 * 60 * 1000;
  let lastResult: ApplicationResult | undefined;

  for (let reads = 0; reads < 20; reads++) {
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    const result = await read();
    if (signal?.aborted) throw new DOMException("The operation was aborted.", "AbortError");
    lastResult = result;
    if (!result.ok) return result;

    const data = result.data;
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Tracked run response did not match the requested run.");
    }
    const run = data as { runId?: unknown; status?: unknown; jobs?: unknown; [key: string]: unknown };
    if (run.runId !== runId) throw new Error("Tracked run response did not match the requested run.");
    const needsManualResolution = Array.isArray(run.jobs) && run.jobs.some(job =>
      !!job && typeof job === "object" && (job as { requiresManualResolution?: unknown }).requiresManualResolution === true,
    );
    if (needsManualResolution || !PENDING_STATUSES.has(run.status as string)) return result;
    if (reads === 19 || Date.now() >= deadline) {
      return { ...result, data: { ...run, waitTimedOut: true } };
    }
  }

  return lastResult!;
}
