import type { CodexCatalogModel } from "./codex-catalog.js";

export function resolveCodexSelection(
  selection: {
    harnessId: string;
    provider: string;
    modelId: string;
    thinkingLevel?: string | null;
  },
  catalog: readonly CodexCatalogModel[],
): { model: CodexCatalogModel; reasoningEffort: string } {
  const validId = (value: unknown): value is string => typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim().length > 0 && value === value.trim() && !value.includes("\0");
  if (!selection || selection.harnessId !== "codex" || !validId(selection.provider) || !validId(selection.modelId)) {
    throw new Error("Codex selection is invalid or unsupported.");
  }
  const matches = catalog.filter((model) =>
    model.provider === selection.provider && model.modelId === selection.modelId);
  if (matches.length !== 1) throw new Error("Codex selection is invalid or unsupported.");

  const model = matches[0]!;
  const reasoningEffort = selection.thinkingLevel == null
    ? model.defaultReasoningEffort
    : selection.thinkingLevel;
  if (typeof reasoningEffort !== "string" || !model.reasoningEfforts.includes(reasoningEffort)) {
    throw new Error("Codex selection is invalid or unsupported.");
  }
  return {
    model: {
      ...model,
      reasoningEfforts: [...model.reasoningEfforts],
      inputModalities: [...model.inputModalities],
    },
    reasoningEffort,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) throw new Error();
  return record[key];
}

export function validateCodexStartedThread(
  value: unknown,
  expected: {
    provider: string;
    modelId: string;
    reasoningEffort: string;
    cwd: string;
    permissions: string;
    workspaceRoots: readonly string[];
  },
): { threadId: string } {
  try {
    if (!isRecord(value)) throw new Error();
    const roots = field(value, "runtimeWorkspaceRoots");
    if (!Array.isArray(roots) || roots.some((root) => typeof root !== "string") ||
        new Set(roots).size !== roots.length || roots.length !== expected.workspaceRoots.length ||
        new Set(expected.workspaceRoots).size !== expected.workspaceRoots.length ||
        expected.workspaceRoots.some((root) => !roots.includes(root))) throw new Error();

    const sandbox = field(value, "sandbox");
    const profile = field(value, "activePermissionProfile");
    const sources = field(value, "instructionSources");
    const thread = field(value, "thread");
    if (field(value, "model") !== expected.modelId ||
        field(value, "modelProvider") !== expected.provider ||
        field(value, "reasoningEffort") !== expected.reasoningEffort ||
        field(value, "cwd") !== expected.cwd ||
        !Array.isArray(sources) || sources.length !== 0 ||
        field(value, "approvalPolicy") !== "never" ||
        // This checks the declared legacy policy shape, not filesystem enforcement.
        !isRecord(sandbox) || field(sandbox, "type") !== "readOnly" ||
        field(sandbox, "networkAccess") !== false ||
        !isRecord(profile) || field(profile, "id") !== expected.permissions ||
        !isRecord(thread)) throw new Error();

    const threadId = field(thread, "id");
    if (typeof threadId !== "string" || !/^[A-Za-z0-9._-]{1,128}$/.test(threadId) ||
        field(thread, "ephemeral") !== false) throw new Error();
    return { threadId };
  } catch {
    throw new Error("Codex returned an incompatible or unverified thread start response.");
  }
}
