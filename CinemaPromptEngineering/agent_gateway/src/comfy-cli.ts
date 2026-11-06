import { createHash, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  realpath,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";

export const COMFY_CLI_RELEASE = {
  version: "1.22.0",
  tag: "v1.22.0",
  commit: "1ae8f40",
  source: "https://github.com/Comfy-Org/comfy-cli/tree/v1.22.0",
} as const;

const MAX_OUTPUT_BYTES = 4 * 1024 * 1024;
const MAX_WORKFLOW_BYTES = 8 * 1024 * 1024;
const MAX_SCHEMA_BYTES = 16 * 1024 * 1024;
const MAX_RECIPES = 100;
const OPERATION_TIMEOUT_MS = 30_000;
const VERSION_TIMEOUT_MS = 5_000;
const TEMPLATE_ID = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,127}$/;
const WORKFLOW_ID = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/;
const RECIPE_ID = /^comfy-template-[a-f0-9]{24}-[a-f0-9]{24}$/;

type RecordValue = Record<string, unknown>;
type TemplateType = "image" | "video" | "audio" | "3d";

export type ComfyCliOperation =
  | {
      operation: "templates.list";
      filters?: {
        type?: TemplateType;
        category?: string;
        tag?: string;
        model?: string;
        provider?: string;
        name?: string;
        limit?: number;
      };
    }
  | { operation: "templates.show" | "templates.export"; templateId: string }
  | { operation: "knowledge.resolve"; query: string }
  | { operation: "knowledge.pick"; capability?: string }
  | { operation: "workflow.slots" | "workflow.notes" | "workflow.validate"; workflowId: string };

type ComfyCliOperationName = ComfyCliOperation["operation"] | "unknown";

export interface SavedSelectedBackendSchema {
  backendId: string;
  source: "selected-backend-saved";
  currentForSelection: true;
  capturedAt: string;
  objectInfoFingerprint: string;
  objectInfo: Record<string, unknown>;
}

export interface SavedApplicationWorkflow {
  workflowId: string;
  revision: number;
  source: "application-saved-workflow";
  workflow: Record<string, unknown>;
}

export interface ComfyCliAdapterContext {
  /** T10 supplies only a saved schema for the application's currently selected backend. */
  getSavedSelectedBackendSchema?: () => Promise<SavedSelectedBackendSchema | null>;
  /** T10 resolves IDs through the application store; this callback never accepts a path. */
  getSavedApplicationWorkflow?: (workflowId: string) => Promise<SavedApplicationWorkflow | null>;
}

export type ComfyCliResult =
  | {
      ok: true;
      status: "ok";
      operation: ComfyCliOperationName;
      data: unknown;
      provenance: RecordValue;
    }
  | {
      ok: false;
      status: "unavailable" | "error";
      operation: ComfyCliOperationName;
      error: { code: string; message: string; retryable: false };
    };

interface CliEnvelope {
  ok: boolean;
  command?: string;
  version: string;
  data?: unknown;
  error?: { code?: string; message?: string } | null;
}

interface ProcessResult {
  code: number | null;
  stdout: string;
  stderr: string;
  failure?: "missing" | "timeout" | "output_limit" | "spawn_error";
}

interface RecipeManifest extends RecordValue {
  recipeId: string;
  templateId: string;
  recipeFingerprint: string;
  format: "frontend" | "api";
  retrievedAt: string;
}

interface WorkflowInspectionTarget {
  workflowId: string;
  workflowPath: string;
  format: "frontend" | "api";
  fingerprint: string;
  source: RecordValue;
}

function isRecord(value: unknown): value is RecordValue {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function stableJson(value: unknown, maxBytes = MAX_SCHEMA_BYTES): string {
  const parts: string[] = [];
  let bytes = 0;
  const append = (part: string) => {
    bytes += Buffer.byteLength(part);
    if (bytes > maxBytes) throw new Error("json_size");
    parts.push(part);
  };
  const visit = (item: unknown, depth: number): void => {
    if (depth > 64) throw new Error("json_depth");
    if (item === null || typeof item === "boolean") return append(JSON.stringify(item));
    if (typeof item === "string") {
      if (item.length > maxBytes) throw new Error("json_size");
      return append(JSON.stringify(item));
    }
    if (typeof item === "number" && Number.isFinite(item)) return append(JSON.stringify(item));
    if (Array.isArray(item)) {
      append("[");
      item.forEach((child, index) => {
        if (index > 0) append(",");
        visit(child, depth + 1);
      });
      return append("]");
    }
    if (isRecord(item) && (Object.getPrototypeOf(item) === Object.prototype || Object.getPrototypeOf(item) === null)) {
      append("{");
      Object.keys(item).sort().forEach((key, index) => {
        if (index > 0) append(",");
        append(JSON.stringify(key));
        append(":");
        visit(item[key], depth + 1);
      });
      return append("}");
    }
    throw new Error("json_value_invalid");
  };
  visit(value, 0);
  return parts.join("");
}

function fingerprint(value: unknown): string {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

export { fingerprint as fingerprintComfySchema };

function invalid(operation: ComfyCliOperationName): ComfyCliResult {
  return {
    ok: false,
    status: "error",
    operation,
    error: { code: "invalid_arguments", message: "The comfy-cli operation arguments are invalid.", retryable: false },
  };
}

function unavailable(
  operation: ComfyCliOperation["operation"],
  code: string,
  message: string,
): ComfyCliResult {
  return { ok: false, status: "unavailable", operation, error: { code, message, retryable: false } };
}

function failed(
  operation: ComfyCliOperation["operation"],
  code: string,
  message: string,
): ComfyCliResult {
  return { ok: false, status: "error", operation, error: { code, message, retryable: false } };
}

function expandHome(value: string): string {
  if (value === "~") return homedir();
  if (value.startsWith("~/") || value.startsWith("~\\")) return join(homedir(), value.slice(2));
  return value;
}

function cliCacheRoot(): string {
  const configured = process.env.COMFY_CACHE_DIR?.trim();
  const xdg = process.env.XDG_CACHE_HOME?.trim();
  const base = configured || (xdg ? join(expandHome(xdg), "comfy-cli") : join(homedir(), ".cache", "comfy-cli"));
  return resolve(process.cwd(), expandHome(base));
}

function appDataDirectory(): string {
  const home = homedir();
  if (process.platform === "win32") return join(home, "AppData", "Local", "DirectorsConsole", "agent-gateway");
  if (process.platform === "darwin") return join(home, "Library", "Application Support", "DirectorsConsole", "agent-gateway");
  return join(home, ".local", "share", "directors-console", "agent-gateway");
}

function recipeCacheDirectory(): string {
  return join(appDataDirectory(), "comfy-cli-recipes");
}

function makeEnv(cacheRoot: string): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.PYTHONHOME;
  delete env.PYTHONPATH;
  delete env.PYTHONSTARTUP;
  delete env.COMFY_WHERE;
  delete env.COMFY_LOCAL_URL;
  delete env.COMFY_KNOWLEDGE_URL;
  env.COMFY_KNOWLEDGE_DISABLE = "1";
  env.COMFY_CACHE_DIR = cacheRoot;
  delete env.COMFY_KNOWLEDGE_FILE;
  env.DO_NOT_TRACK = "1";
  env.COMFY_NO_TELEMETRY = "1";
  return env;
}

async function runCli(
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  timeoutMs: number,
): Promise<ProcessResult> {
  return new Promise((resolveResult) => {
    const child = spawn("comfy", [...args], {
      cwd,
      env,
      shell: false,
      detached: process.platform !== "win32",
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];
    let outputBytes = 0;
    let failure: ProcessResult["failure"];
    let settled = false;
    const timer = setTimeout(() => {
      failure = "timeout";
      killChild(child);
    }, timeoutMs);
    const finish = (code: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolveResult({
        code,
        stdout: Buffer.concat(stdout).toString("utf8"),
        stderr: Buffer.concat(stderr).toString("utf8"),
        failure,
      });
    };
    const collect = (chunks: Buffer[], chunk: Buffer) => {
      outputBytes += chunk.length;
      if (outputBytes > MAX_OUTPUT_BYTES) {
        failure = "output_limit";
        killChild(child);
        return;
      }
      chunks.push(chunk);
    };
    child.stdout?.on("data", (chunk: Buffer) => collect(stdout, chunk));
    child.stderr?.on("data", (chunk: Buffer) => collect(stderr, chunk));
    child.once("error", (error: NodeJS.ErrnoException) => {
      failure = error.code === "ENOENT" ? "missing" : "spawn_error";
      finish(null);
    });
    child.once("close", (code) => finish(code));
  });
}

function killChild(child: ReturnType<typeof spawn>): void {
  if (child.pid && process.platform !== "win32") {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      // Fall through to killing the direct child.
    }
  }
  child.kill("SIGKILL");
}

function parseEnvelope(result: ProcessResult, expectedCommand?: string): CliEnvelope | null {
  if (result.failure || result.stdout.length === 0) return null;
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    if (
      !isRecord(parsed) ||
      typeof parsed.ok !== "boolean" ||
      parsed.version !== COMFY_CLI_RELEASE.version ||
      (expectedCommand !== undefined && parsed.command !== expectedCommand)
    ) {
      return null;
    }
    return parsed as unknown as CliEnvelope;
  } catch {
    return null;
  }
}

function processError(operation: ComfyCliOperation["operation"], result: ProcessResult): ComfyCliResult {
  if (result.failure === "missing") {
    return unavailable(operation, "comfy_cli_missing", "comfy-cli is not installed or is not available on PATH; no installation was attempted.");
  }
  if (result.failure === "timeout") return failed(operation, "comfy_cli_timeout", "The bounded comfy-cli operation timed out and was stopped.");
  if (result.failure === "output_limit") return failed(operation, "comfy_cli_output_limit", "comfy-cli exceeded the output limit and was stopped.");
  return failed(operation, "comfy_cli_failed", "comfy-cli could not complete the bounded operation.");
}

async function checkVersion(
  operation: ComfyCliOperation["operation"],
  cwd: string,
  env: NodeJS.ProcessEnv,
): Promise<ComfyCliResult | null> {
  const result = await runCli(["--json", "--version"], cwd, env, VERSION_TIMEOUT_MS);
  if (result.failure || result.code !== 0) return processError(operation, result);
  let envelope: RecordValue;
  try {
    const parsed: unknown = JSON.parse(result.stdout);
    if (!isRecord(parsed) || parsed.ok !== true) throw new Error("invalid_envelope");
    envelope = parsed;
  } catch {
    return unavailable(operation, "comfy_cli_incompatible", "comfy-cli returned an unrecognized version response.");
  }
  const dataVersion = isRecord(envelope.data) ? envelope.data.version : undefined;
  const actual = typeof dataVersion === "string" ? dataVersion : envelope.version;
  if (actual !== COMFY_CLI_RELEASE.version) {
    return unavailable(
      operation,
      "comfy_cli_version_mismatch",
      `This wrapper requires comfy-cli ${COMFY_CLI_RELEASE.version}; found ${typeof actual === "string" ? actual : "an unknown version"}. No installation was attempted.`,
    );
  }
  return null;
}

async function checkedCommand(
  operation: ComfyCliOperation["operation"],
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv,
  acceptInvalidValidation = false,
): Promise<{ envelope?: CliEnvelope; error?: ComfyCliResult }> {
  const result = await runCli(args, cwd, env, OPERATION_TIMEOUT_MS);
  if (result.failure) return { error: processError(operation, result) };
  const envelope = parseEnvelope(result, `${args[1]} ${args[2]}`);
  if (!envelope) {
    if (result.code !== 0) return { error: failed(operation, "comfy_cli_command_failed", "comfy-cli rejected or could not complete the supported command.") };
    return { error: unavailable(operation, "comfy_cli_incompatible", "comfy-cli returned an unrecognized command response.") };
  }
  if (!envelope.ok) {
    if (
      acceptInvalidValidation &&
      isRecord(envelope.data) &&
      typeof envelope.data.valid === "boolean" &&
      result.code === 1
    ) return { envelope };
    const code = isRecord(envelope.error) && typeof envelope.error.code === "string" ? envelope.error.code : "comfy_cli_rejected";
    return { error: failed(operation, code.slice(0, 80), "comfy-cli rejected the supported operation; no fallback command was run.") };
  }
  if (result.code !== 0) return { error: failed(operation, "comfy_cli_command_failed", "comfy-cli exited unsuccessfully after emitting a success envelope.") };
  return { envelope };
}

async function withTempDirectory<T>(operation: (directory: string) => Promise<T>): Promise<T> {
  const directory = await mkdtemp(join(tmpdir(), "dc-comfy-cli-"));
  try {
    return await operation(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

async function safeCliCacheFile(
  root: string,
  relativePath: string,
  maxBytes: number,
  operation: ComfyCliOperation["operation"],
): Promise<{ path: string } | { error: ComfyCliResult }> {
  try {
    const realRoot = await realpath(root);
    const file = join(realRoot, relativePath);
    const info = await lstat(file);
    if (info.isSymbolicLink() || !info.isFile() || info.size > maxBytes || await realpath(file) !== file) {
      return { error: unavailable(operation, "comfy_cli_cache_unsafe", "The comfy-cli cache file is unavailable or outside its configured cache directory.") };
    }
    return { path: file };
  } catch {
    const gallery = relativePath.startsWith("gallery/");
    return {
      error: unavailable(
        operation,
        gallery ? "comfy_cli_template_cache_unavailable" : "comfy_cli_knowledge_cache_unavailable",
        `The comfy-cli ${gallery ? "template" : "knowledge"} cache is unavailable; no refresh or fetch was started.`,
      ),
    };
  }
}

function validateOperation(value: unknown): ComfyCliOperation | null {
  if (!isRecord(value) || typeof value.operation !== "string") return null;
  switch (value.operation) {
    case "templates.list": {
      const filters = value.filters;
      if (filters === undefined) return { operation: value.operation };
      if (!isRecord(filters)) return null;
      const allowed = new Set(["type", "category", "tag", "model", "provider", "name", "limit"]);
      if (Object.keys(filters).some((key) => !allowed.has(key))) return null;
      if (filters.type !== undefined && !["image", "video", "audio", "3d"].includes(String(filters.type))) return null;
      for (const key of ["category", "tag", "model", "provider", "name"] as const) {
        if (filters[key] !== undefined && (typeof filters[key] !== "string" || !filters[key].trim() || filters[key].length > 128)) return null;
      }
      if (filters.limit !== undefined && (typeof filters.limit !== "number" || !Number.isInteger(filters.limit) || filters.limit < 1 || filters.limit > 50)) return null;
      return { operation: value.operation, filters: filters as Extract<ComfyCliOperation, { operation: "templates.list" }>['filters'] };
    }
    case "templates.show":
    case "templates.export":
      return typeof value.templateId === "string" && TEMPLATE_ID.test(value.templateId)
        ? { operation: value.operation, templateId: value.templateId }
        : null;
    case "knowledge.resolve":
      return typeof value.query === "string" && value.query.trim() === value.query && value.query.length > 0 && value.query.length <= 200
        ? { operation: value.operation, query: value.query }
        : null;
    case "knowledge.pick":
      return value.capability === undefined || (typeof value.capability === "string" && value.capability.trim() === value.capability && value.capability.length <= 200)
        ? { operation: value.operation, capability: value.capability as string | undefined }
        : null;
    case "workflow.slots":
    case "workflow.notes":
    case "workflow.validate":
      return typeof value.workflowId === "string" && WORKFLOW_ID.test(value.workflowId)
        ? { operation: value.operation, workflowId: value.workflowId }
        : null;
    default:
      return null;
  }
}

function workflowFormat(value: unknown): "frontend" | "api" | null {
  if (!isRecord(value)) return null;
  if (Array.isArray(value.nodes)) return "frontend";
  const entries = Object.entries(value);
  return entries.length > 0 && entries.every(([id, node]) =>
    id.length <= 128 && isRecord(node) && typeof node.class_type === "string" && isRecord(node.inputs),
  ) ? "api" : null;
}

function workflowResultData(value: unknown, workflowId: string): unknown {
  if (Array.isArray(value)) return value.map((item) => workflowResultData(item, workflowId));
  if (!isRecord(value)) return value;
  const sanitized: RecordValue = {};
  for (const [key, item] of Object.entries(value)) {
    if (key === "path") continue;
    if (key === "workflow" && typeof item === "string") sanitized.workflow = workflowId;
    else if (key === "object_info_source") sanitized.object_info_source = { mode: "saved-selected-backend-schema" };
    else sanitized[key] = workflowResultData(item, workflowId);
  }
  return sanitized;
}

async function safeRecipeFile(directory: string, recipeId: string, suffix: string): Promise<string | null> {
  const file = join(directory, `${recipeId}${suffix}`);
  try {
    const directoryInfo = await lstat(directory);
    if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || await realpath(directory) !== directory) return null;
    const info = await lstat(file);
    return info.isFile() && !info.isSymbolicLink() && info.size <= MAX_WORKFLOW_BYTES && await realpath(file) === file ? file : null;
  } catch {
    return null;
  }
}

async function resolveWorkflowTarget(
  workflowId: string,
  context: ComfyCliAdapterContext,
  workDirectory: string,
  operation: ComfyCliOperation["operation"],
): Promise<WorkflowInspectionTarget | { error: ComfyCliResult }> {
  if (RECIPE_ID.test(workflowId)) {
    const directory = recipeCacheDirectory();
    const workflowPath = await safeRecipeFile(directory, workflowId, ".json");
    const manifestPath = await safeRecipeFile(directory, workflowId, ".provenance.json");
    if (!workflowPath || !manifestPath) {
      return { error: unavailable(operation, "recipe_not_found", "The requested application recipe is not present in the comfy-cli export cache.") };
    }
    try {
      const workflow: unknown = JSON.parse(await readFile(workflowPath, "utf8"));
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as RecipeManifest;
      if (
        manifest.recipeId !== workflowId ||
        !isRecord(manifest.source) ||
        !TEMPLATE_ID.test(manifest.templateId) ||
        manifest.recipeFingerprint !== fingerprint(workflow) ||
        workflowId !== `comfy-template-${createHash("sha256").update(manifest.templateId).digest("hex").slice(0, 24)}-${manifest.recipeFingerprint.slice(0, 24)}`
      ) {
        return { error: failed(operation, "recipe_integrity_error", "The cached recipe provenance or fingerprint does not match its workflow.") };
      }
      const format = workflowFormat(workflow);
      if (format !== manifest.format) {
        return { error: failed(operation, "recipe_format_error", "The cached recipe format does not match its provenance record.") };
      }
      return {
        workflowId,
        workflowPath,
        format,
        fingerprint: manifest.recipeFingerprint,
        source: { kind: "comfy-cli-template-cache", ...manifest.source },
      };
    } catch {
      return { error: failed(operation, "recipe_integrity_error", "The cached recipe or its provenance record is invalid.") };
    }
  }

  if (!context.getSavedApplicationWorkflow) {
    return { error: unavailable(operation, "saved_workflow_unavailable", "No application saved-workflow resolver is registered for this workflow ID.") };
  }
  try {
    const saved = await context.getSavedApplicationWorkflow(workflowId);
    if (
      !saved ||
      saved.workflowId !== workflowId ||
      !Number.isSafeInteger(saved.revision) ||
      saved.revision < 0 ||
      saved.source !== "application-saved-workflow" ||
      !isRecord(saved.workflow)
    ) {
      return { error: unavailable(operation, "saved_workflow_unavailable", "The application did not provide a valid saved workflow revision for this ID.") };
    }
    const json = stableJson(saved.workflow, MAX_WORKFLOW_BYTES);
    const format = workflowFormat(saved.workflow);
    if (!format) {
      return { error: unavailable(operation, "workflow_format_unsupported", "The saved workflow is not a supported frontend or API workflow format.") };
    }
    const workflowPath = join(workDirectory, "application-saved-workflow.json");
    await writeFile(workflowPath, json, { flag: "wx", mode: 0o600 });
    return {
      workflowId,
      workflowPath,
      format,
      fingerprint: fingerprint(saved.workflow),
      source: { kind: saved.source, workflowId, revision: saved.revision },
    };
  } catch {
    return { error: unavailable(operation, "saved_workflow_unavailable", "The saved workflow could not be resolved safely; no caller-provided path was read.") };
  }
}

async function atomicWrite(directory: string, target: string, contents: string): Promise<void> {
  const temporary = join(directory, `.tmp-${randomUUID()}`);
  try {
    await writeFile(temporary, contents, { flag: "wx", mode: 0o600 });
    await rename(temporary, target);
  } finally {
    await rm(temporary, { force: true });
  }
}

function checkedSchema(value: SavedSelectedBackendSchema | null):
  | { snapshot: SavedSelectedBackendSchema; json: string; fingerprint: string }
  | null {
  if (
    !value ||
    !isRecord(value) ||
    typeof value.backendId !== "string" ||
    !/^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value.backendId) ||
    value.source !== "selected-backend-saved" ||
    value.currentForSelection !== true ||
    typeof value.capturedAt !== "string" ||
    !Number.isFinite(Date.parse(value.capturedAt)) ||
    !isRecord(value.objectInfo) ||
    Object.keys(value.objectInfo).length === 0
  ) return null;
  try {
    const json = stableJson(value.objectInfo);
    if (Buffer.byteLength(json) > MAX_SCHEMA_BYTES) return null;
    const schemaFingerprint = fingerprint(value.objectInfo);
    if (value.objectInfoFingerprint !== schemaFingerprint) return null;
    return { snapshot: value, json, fingerprint: schemaFingerprint };
  } catch {
    return null;
  }
}

async function invoke(
  rawOperation: unknown,
  context: ComfyCliAdapterContext,
): Promise<ComfyCliResult> {
  if (!isRecord(rawOperation) || typeof rawOperation.operation !== "string") return invalid("unknown");
  const operation = validateOperation(rawOperation);
  if (!operation) {
    const knownOperations = ["templates.list", "templates.show", "templates.export", "knowledge.resolve", "knowledge.pick", "workflow.slots", "workflow.notes", "workflow.validate"];
    return invalid(knownOperations.includes(rawOperation.operation)
      ? rawOperation.operation as ComfyCliOperation["operation"]
      : "unknown");
  }

  return withTempDirectory<ComfyCliResult>(async (workDirectory) => {
    const cacheRoot = cliCacheRoot();
    const env = makeEnv(cacheRoot);
    const versionError = await checkVersion(operation.operation, workDirectory, env);
    if (versionError) return versionError;

    if (operation.operation === "templates.list") {
      const gallery = await safeCliCacheFile(cacheRoot, "gallery/index.json", MAX_WORKFLOW_BYTES, operation.operation);
      if ("error" in gallery) return gallery.error;
      const filters = operation.filters ?? {};
      const args = ["--json", "templates", "ls", "--gallery", gallery.path, "--limit", String(filters.limit ?? 25)];
      for (const [key, flag] of [["type", "--type"], ["category", "--category"], ["tag", "--tag"], ["model", "--model"], ["provider", "--provider"], ["name", "--name"]] as const) {
        const value = filters[key];
        if (value !== undefined) args.push(flag, value);
      }
      const result = await checkedCommand(operation.operation, args, workDirectory, env);
      if (result.error) return result.error;
      return {
        ok: true,
        status: "ok",
        operation: operation.operation,
        data: result.envelope?.data,
        provenance: { source: "Comfy-Org/workflow_templates cached gallery", cache: "comfy-cli-owned", backendAvailability: "not_checked", comfyCli: COMFY_CLI_RELEASE },
      };
    }

    if (operation.operation === "templates.show") {
      const gallery = await safeCliCacheFile(cacheRoot, "gallery/index.json", MAX_WORKFLOW_BYTES, operation.operation);
      if ("error" in gallery) return gallery.error;
      const result = await checkedCommand(operation.operation, ["--json", "templates", "show", operation.templateId, "--gallery", gallery.path], workDirectory, env);
      if (result.error) return result.error;
      return {
        ok: true,
        status: "ok",
        operation: operation.operation,
        data: result.envelope?.data,
        provenance: { source: "Comfy-Org/workflow_templates cached gallery", templateId: operation.templateId, backendAvailability: "not_checked", comfyCli: COMFY_CLI_RELEASE },
      };
    }

    if (operation.operation === "templates.export") {
      const gallery = await safeCliCacheFile(cacheRoot, "gallery/index.json", MAX_WORKFLOW_BYTES, operation.operation);
      if ("error" in gallery) return gallery.error;
      const details = await checkedCommand(operation.operation, ["--json", "templates", "show", operation.templateId, "--gallery", gallery.path], workDirectory, env);
      if (details.error) return details.error;
      const output = join(workDirectory, "template.json");
      const fetched = await checkedCommand(operation.operation, ["--json", "templates", "fetch", operation.templateId, "--gallery", gallery.path, "--out", output], workDirectory, env);
      if (fetched.error) return fetched.error;
      try {
        const outputInfo = await lstat(output);
        if (!outputInfo.isFile() || outputInfo.isSymbolicLink() || outputInfo.size > MAX_WORKFLOW_BYTES) return failed(operation.operation, "template_too_large", "The curated template exceeds the application recipe cache limit or is not a regular file.");
        const bytes = await readFile(output);
        const workflow: unknown = JSON.parse(bytes.toString("utf8"));
        const format = workflowFormat(workflow);
        if (!format) return failed(operation.operation, "template_format_unsupported", "The curated template is not a supported ComfyUI workflow format.");
        const recipeFingerprint = fingerprint(workflow);
        const recipeId = `comfy-template-${createHash("sha256").update(operation.templateId).digest("hex").slice(0, 24)}-${recipeFingerprint.slice(0, 24)}`;
        const cacheDirectory = recipeCacheDirectory();
        await mkdir(cacheDirectory, { recursive: true, mode: 0o700 });
        if (process.platform !== "win32") await chmod(cacheDirectory, 0o700);
        const directoryInfo = await lstat(cacheDirectory);
        if (!directoryInfo.isDirectory() || directoryInfo.isSymbolicLink() || await realpath(cacheDirectory) !== cacheDirectory) return unavailable(operation.operation, "recipe_cache_unsafe", "The application recipe cache is not a private, canonical directory.");
        const existing = await readdir(cacheDirectory);
        const cachedIds = new Set(existing.flatMap((entry) => {
          const match = /^(comfy-template-[a-f0-9]{24}-[a-f0-9]{24})\.(?:json|provenance\.json)$/.exec(entry);
          return match ? [match[1]] : [];
        }));
        if (!cachedIds.has(recipeId) && cachedIds.size >= MAX_RECIPES) {
          return unavailable(operation.operation, "recipe_cache_full", "The application recipe cache reached its fixed entry limit; remove old cached exports manually.");
        }
        const retrievedAt = new Date().toISOString();
        const source = {
          repository: "Comfy-Org/workflow_templates",
          path: `templates/${operation.templateId}.json`,
          url: `https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates/${encodeURIComponent(operation.templateId)}.json`,
          ref: "main",
          revision: "not-exposed-by-comfy-cli",
          license: "not-reported-by-comfy-cli",
          retrievedAt,
        };
        const manifest: RecipeManifest = {
          recipeId,
          templateId: operation.templateId,
          format,
          recipeFingerprint,
          retrievedAt,
          source,
          comfyCli: COMFY_CLI_RELEASE,
        };
        await atomicWrite(cacheDirectory, join(cacheDirectory, `${recipeId}.json`), JSON.stringify(workflow));
        await atomicWrite(cacheDirectory, join(cacheDirectory, `${recipeId}.provenance.json`), JSON.stringify(manifest, null, 2));
        return {
          ok: true,
          status: "ok",
          operation: operation.operation,
          data: { recipeId, format, recipeFingerprint, attachedToPanel: false },
          provenance: { ...source, comfyCli: COMFY_CLI_RELEASE, templateMetadata: details.envelope?.data ?? null },
        };
      } catch {
        return failed(operation.operation, "template_export_failed", "The curated template could not be safely validated and saved to the application recipe cache.");
      }
    }

    if (operation.operation === "knowledge.resolve" || operation.operation === "knowledge.pick") {
      const knowledge = await safeCliCacheFile(cacheRoot, "knowledge/knowledge.json", MAX_SCHEMA_BYTES, operation.operation);
      if ("error" in knowledge) return knowledge.error;
      env.COMFY_KNOWLEDGE_FILE = knowledge.path;
      delete env.COMFY_KNOWLEDGE_DISABLE;
      const args = operation.operation === "knowledge.resolve"
        ? ["--json", "knowledge", "resolve", operation.query]
        : operation.capability === undefined
          ? ["--json", "knowledge", "pick"]
          : ["--json", "knowledge", "pick", operation.capability];
      const result = await checkedCommand(operation.operation, args, workDirectory, env);
      if (result.error) return result.error;
      return {
        ok: true,
        status: "ok",
        operation: operation.operation,
        data: result.envelope?.data,
        provenance: { source: "comfy-cli knowledge cache", cacheOnly: true, modelAvailability: "not_checked", comfyCli: COMFY_CLI_RELEASE },
      };
    }

    if (operation.operation !== "workflow.slots" && operation.operation !== "workflow.notes" && operation.operation !== "workflow.validate") {
      return unavailable(operation.operation, "comfy_cli_operation_unsupported", "This operation is not supported by the pinned comfy-cli wrapper.");
    }
    const target = await resolveWorkflowTarget(operation.workflowId, context, workDirectory, operation.operation);
    if ("error" in target) return target.error;
    const { workflowPath, format } = target;

    if (operation.operation === "workflow.notes") {
      if (format !== "frontend") return unavailable(operation.operation, "workflow_format_unsupported", "comfy-cli workflow notes accepts frontend-format workflows; use manual inspection for this recipe.");
      const result = await checkedCommand(operation.operation, ["--json", "workflow", "notes", workflowPath], workDirectory, env);
      if (result.error) return result.error;
      return {
        ok: true,
        status: "ok",
        operation: operation.operation,
        data: workflowResultData(result.envelope?.data, target.workflowId),
        provenance: { workflowId: target.workflowId, workflowFingerprint: target.fingerprint, source: target.source, inspectionScope: "local saved workflow; no backend checked", comfyCli: COMFY_CLI_RELEASE },
      };
    }

    if (operation.operation === "workflow.slots" && format !== "frontend") {
      return unavailable(operation.operation, "workflow_format_unsupported", "comfy-cli workflow slots accepts frontend-format workflows; use manual inspection for this recipe.");
    }
    if (!context.getSavedSelectedBackendSchema) {
      return unavailable(operation.operation, "selected_schema_unavailable", "No selected-backend schema resolver is registered; manual validation is required.");
    }
    let rawSchema: SavedSelectedBackendSchema | null;
    try {
      rawSchema = await context.getSavedSelectedBackendSchema();
    } catch {
      return unavailable(operation.operation, "selected_schema_unavailable", "The saved schema for the selected backend could not be loaded; no live query was attempted.");
    }
    const schema = checkedSchema(rawSchema);
    if (!schema) return unavailable(operation.operation, "selected_schema_unavailable", "A current saved schema for the selected backend is unavailable; no live query was attempted.");
    const schemaPath = join(workDirectory, "selected-backend-object-info.json");
    await writeFile(schemaPath, schema.json, { flag: "wx", mode: 0o600 });
    const args = operation.operation === "workflow.slots"
      ? ["--json", "workflow", "slots", workflowPath, "--input", schemaPath]
      : ["--json", "workflow", "validate", "--workflow", workflowPath, "--input", schemaPath];
    const result = await checkedCommand(operation.operation, args, workDirectory, env, operation.operation === "workflow.validate");
    if (result.error) return result.error;
    return {
      ok: true,
      status: "ok",
      operation: operation.operation,
      data: workflowResultData(result.envelope?.data, target.workflowId),
      provenance: {
        workflowId: target.workflowId,
        workflowFingerprint: target.fingerprint,
        schemaFingerprint: schema.fingerprint,
        backendId: schema.snapshot.backendId,
        schemaCapturedAt: schema.snapshot.capturedAt,
        schemaSource: "saved-selected-backend-schema",
        source: target.source,
        inspectionScope: "selected backend snapshot; no live backend query",
        comfyCli: COMFY_CLI_RELEASE,
      },
    };
  }).catch(() => failed(operation.operation, "comfy_cli_operation_failed", "The bounded comfy-cli operation failed; temporary-file cleanup was attempted."));
}

export function createComfyCliAdapter(context: ComfyCliAdapterContext = {}) {
  return Object.freeze({ invoke: (operation: unknown) => invoke(operation, context) });
}
