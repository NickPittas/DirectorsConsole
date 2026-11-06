import { randomUUID } from "node:crypto";
import type { ServerResponse } from "node:http";
import type {
  ApplicationActionName,
  ApplicationCommand,
  ApplicationDispatchInput,
  ApplicationResult,
} from "./contracts.js";

const COMMAND_TIMEOUT_MS = 120_000;
const MAX_COMMANDS_PER_BRIDGE = 4096;
const MAX_COMMAND_BYTES = 8 * 1024 * 1024;
const MAX_RESULT_BYTES = 1024 * 1024;

type BridgeFailureCode = "bridge_disconnected" | "bridge_timeout" | "duplicate_command" | "duplicate_idempotency_key" | "command_cancelled";

interface ActiveStream {
  bridgeId: string;
  projectIdentity: string;
  connectionId: string;
  expiresAt: number;
  response: ServerResponse;
  heartbeat: ReturnType<typeof setInterval>;
}

interface PendingCommand {
  bridgeId: string;
  projectIdentity: string;
  sessionId: string;
  command: ApplicationCommand;
  connectionId: string;
  resolve: (result: ApplicationResult) => void;
  timer: ReturnType<typeof setTimeout>;
  cleanupAbort?: () => void;
}

export class ApplicationBridgeError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "ApplicationBridgeError";
  }
}

function failure(command: ApplicationCommand, code: BridgeFailureCode, message: string): ApplicationResult {
  return {
    ok: false,
    commandId: command.commandId,
    action: command.action,
    error: { code, message, retryable: false },
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function requireString(value: unknown, label: string, max = 1024): string {
  if (typeof value !== "string" || value.length === 0 || value.length > max || value.includes("\0")) {
    throw new ApplicationBridgeError("invalid_command", `${label} is invalid.`);
  }
  return value;
}

function requireRevision(value: unknown, label: string): asserts value is number | undefined {
  if (value !== undefined && (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)) {
    throw new ApplicationBridgeError("invalid_command", `${label} must be a non-negative integer.`);
  }
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ApplicationBridgeError("invalid_command", `${label} is invalid.`);
  return value;
}

function requireIds(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 32 || !value.every(id => typeof id === "string" && id.length > 0 && id.length <= 256)) {
    throw new ApplicationBridgeError("invalid_command", `${label} must contain between 1 and 32 stable IDs.`);
  }
  if (new Set(value).size !== value.length) throw new ApplicationBridgeError("invalid_command", `${label} cannot contain duplicate IDs.`);
  return value as string[];
}

function validateCommand(value: ApplicationCommand): ApplicationCommand {
  if (!isRecord(value)) throw new ApplicationBridgeError("invalid_command", "The application command is invalid.");
  const command = value as unknown as Record<string, unknown>;
  requireString(command.commandId, "Command ID", 128);
  requireString(command.projectIdentity, "Project identity", 2048);
  requireRevision(command.expectedProjectRevision, "Project revision");
  requireRevision(command.expectedPanelRevision, "Panel revision");
  requireRevision(command.expectedWorkflowRevision, "Workflow revision");
  const actions: ApplicationActionName[] = [
    "select_backends",
    "add_panels",
    "save_project",
    "new_project",
    "open_project",
    "remove_panels",
    "inspect_media",
    "get_prompt_guidance",
    "prompt_engineer_action",
    "gallery_action",
    "get_application_snapshot",
    "inspect_backend",
    "search_workflow_sources",
    "get_source_recipe",
    "plan_dependencies",
    "prepare_workflow_revision",
    "get_backend_node_definitions",
    "prepare_workflow_proposal",
    "save_and_attach_workflow",
    "bind_media",
    "set_panel_parameters",
    "show_panel_controls",
    "enhance_generation_prompt",
    "start_generation",
    "get_run",
    "cancel_run",
  ];
  if (!actions.includes(command.action as ApplicationActionName)) {
    throw new ApplicationBridgeError("invalid_action", "The application action is not supported.");
  }
  const action = command.action as ApplicationActionName;
  const requireRecipeSource = (value: unknown): Record<string, unknown> => {
    const source = requireRecord(value, "Pinned recipe source");
    const recipeId = requireString(source.recipeId, "Recipe ID", 64);
    if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(recipeId)) throw new ApplicationBridgeError("invalid_command", "Recipe ID is invalid.");
    const fingerprint = requireString(source.sourceGraphFingerprint, "Source graph fingerprint", 64);
    if (!/^[a-f0-9]{64}$/i.test(fingerprint)) throw new ApplicationBridgeError("invalid_command", "Source graph fingerprint is invalid.");
    return source;
  };
  if (action === "get_prompt_guidance") {
    const input = requireRecord(command.input, "Model prompt guidance");
    if (input.targetModel !== undefined) requireString(input.targetModel, "Generation target", 128);
    for (const field of ["modelVersion", "task", "dialectId", "conditioningAdapter"]) {
      if (input[field] !== undefined) requireString(input[field], field, 128);
    }
  } else if (action === "prompt_engineer_action") {
    const input = requireRecord(command.input, "Prompt Engineer action");
    if (input.operation === "prepare") {
      requireString(input.userPrompt, "Scene description", 20_000);
      if (input.targetModel !== undefined) requireString(input.targetModel, "Generation target", 128);
    } else if (input.operation === "validate_apply") {
      requireString(input.preparationId, "Preparation ID", 128);
      requireString(input.prompt, "Generation prompt", 64 * 1024);
      if (typeof input.apply !== "boolean") throw new ApplicationBridgeError("invalid_command", "Prompt apply must be a boolean.");
    } else if (input.operation !== "snapshot" && input.operation !== "constraints") throw new ApplicationBridgeError("invalid_command", "Unknown Prompt Engineer operation.");
  } else if (action === "select_backends") {
    const input = requireRecord(command.input, "Backend selection");
    if (!Array.isArray(input.backendIds) || input.backendIds.length > 32 || new Set(input.backendIds).size !== input.backendIds.length) throw new ApplicationBridgeError("invalid_command", "Select up to 32 unique configured backend IDs.");
    for (const id of input.backendIds) requireString(id, "Backend ID", 256);
  } else if (action === "add_panels") {
    const input = requireRecord(command.input, "Panel creation");
    if (typeof input.count !== "number" || !Number.isSafeInteger(input.count) || input.count < 1 || input.count > 16) throw new ApplicationBridgeError("invalid_command", "Panel count must be an integer between 1 and 16.");
  } else if (action === "save_project") {
    const input = requireRecord(command.input, "Project save");
    if (input.folderPath !== undefined) requireString(input.folderPath, "Project folder path", 4096);
    if (input.name !== undefined) requireString(input.name, "Project name", 50);
  } else if (action === "new_project") {
    const input = requireRecord(command.input, "New project");
    if (input.unsavedWorkChoice !== undefined && input.unsavedWorkChoice !== "save"
      && input.unsavedWorkChoice !== "discard" && input.unsavedWorkChoice !== "cancel") {
      throw new ApplicationBridgeError("invalid_command", "Unsaved work choice must be save, discard or cancel.");
    }
  } else if (action === "open_project") {
    const input = requireRecord(command.input, "Open project");
    requireString(input.projectPath, "Project path", 4096);
    if (input.unsavedWorkChoice !== undefined && input.unsavedWorkChoice !== "save"
      && input.unsavedWorkChoice !== "discard" && input.unsavedWorkChoice !== "cancel") {
      throw new ApplicationBridgeError("invalid_command", "Unsaved work choice must be save, discard or cancel.");
    }
    if (command.expectedPanelRevision !== undefined || command.expectedWorkflowRevision !== undefined) throw new ApplicationBridgeError("invalid_command", "Opening a project uses only the project revision.");
  } else if (action === "remove_panels") {
    const input = requireRecord(command.input, "Panel removal");
    if (!Array.isArray(input.panelIds) || input.panelIds.length < 1 || input.panelIds.length > 16
      || input.panelIds.some(id => typeof id !== "number" || !Number.isSafeInteger(id) || id < 1)
      || new Set(input.panelIds).size !== input.panelIds.length) {
      throw new ApplicationBridgeError("invalid_command", "Panel IDs must contain between 1 and 16 unique positive safe integers.");
    }
    const revisions = requireRecord(input.expectedPanelRevisions, "Panel revisions");
    const revisionKeys = Object.keys(revisions);
    if (revisionKeys.length !== input.panelIds.length
      || !input.panelIds.every(id => Object.prototype.hasOwnProperty.call(revisions, String(id)))) {
      throw new ApplicationBridgeError("invalid_command", "Panel revisions must match the exact requested panel IDs.");
    }
    for (const id of input.panelIds) {
      const revision = revisions[String(id)];
      if (typeof revision !== "number" || !Number.isSafeInteger(revision) || revision < 1) {
        throw new ApplicationBridgeError("invalid_command", "Each panel revision must be a positive safe integer.");
      }
    }
  } else if (action === "inspect_media") {
    const input = requireRecord(command.input, "Media inspection");
    const assetId = requireString(input.assetId, "Media asset ID", 128);
    if (!/^[A-Za-z0-9-]+$/.test(assetId)) throw new ApplicationBridgeError("invalid_command", "Media asset ID is invalid.");
  } else if (action === "gallery_action") {
    const input = requireRecord(command.input, "Gallery action");
    if (input.operation === "open_folder") requireString(input.rootPath, "Gallery folder", 4096);
    else if (input.operation === "file_info" || input.operation === "import_media") requireString(input.filePath, "Media path", 4096);
    else if (input.operation === "list" || input.operation === "search") {
      if (input.folderPath !== undefined) requireString(input.folderPath, "Gallery folder", 4096);
      if (input.operation === "search") requireString(input.query, "Search query", 512);
    } else if (input.operation === "rename") {
      requireString(input.filePath, "Media path", 4096);
      requireString(input.newName, "New name", 255);
    } else if (input.operation === "move" || input.operation === "trash" || input.operation === "restore") {
      if (!Array.isArray(input.filePaths) || input.filePaths.length < 1 || input.filePaths.length > 100) throw new ApplicationBridgeError("invalid_command", "Select between 1 and 100 media files.");
      for (const path of input.filePaths) requireString(path, "Media path", 4096);
      if (input.operation === "move") requireString(input.destination, "Destination folder", 4096);
    } else if (input.operation === "create_folder") {
      requireString(input.parentPath, "Parent folder", 4096);
      requireString(input.name, "Folder name", 255);
    } else if (input.operation === "rate") {
      const ratings = requireRecord(input.ratings, "Ratings");
      if (Object.keys(ratings).length > 100 || Object.values(ratings).some(value => !Number.isInteger(value) || Number(value) < 0 || Number(value) > 5)) throw new ApplicationBridgeError("invalid_command", "Supply at most 100 integer ratings from 0 to 5.");
    } else if (input.operation !== "snapshot") throw new ApplicationBridgeError("invalid_command", "Unknown Gallery operation.");
  } else if (action === "search_workflow_sources") {
    const input = requireRecord(command.input, "Workflow source search");
    if (input.query !== undefined) requireString(input.query, "Search query", 128);
  } else if (action === "get_source_recipe") {
    const input = requireRecord(command.input, "Workflow recipe request");
    const recipeId = requireString(input.recipeId, "Recipe ID", 64);
    if (!/^[a-z0-9][a-z0-9.-]{0,63}$/.test(recipeId)) throw new ApplicationBridgeError("invalid_command", "Recipe ID is invalid.");
  } else if (action === "enhance_generation_prompt") {
    const input = requireRecord(command.input, "Prompt preparation request");
    if (input.phase === "prepare") {
      // Context is captured by Storyboard from the selected handoff.
    } else if (input.phase === "validate") {
      requireString(input.preparationId, "Prompt preparation ID", 128);
      requireString(input.enhancedPrompt, "Enhanced prompt", 64 * 1024);
    } else throw new ApplicationBridgeError("invalid_command", "Prompt phase must be prepare or validate.");
  } else if (action !== "get_application_snapshot") {
    const target = requireRecord(command.target, "Application target");
    if (action === "get_run" || action === "cancel_run") {
      requireString(target.runId, "Run ID", 128);
      if (action === "get_run" && command.input !== undefined) {
        const input = requireRecord(command.input, "Run inspection options");
        if (input.waitSeconds !== undefined && (!Number.isInteger(input.waitSeconds) || Number(input.waitSeconds) < 0 || Number(input.waitSeconds) > 60)) throw new ApplicationBridgeError("invalid_command", "Run wait must be an integer between 0 and 60 seconds.");
      }
    } else if (action === "get_backend_node_definitions") {
      requireString(target.backendId, "Backend ID", 256);
      const input = requireRecord(command.input, "Node schema request");
      if (!Array.isArray(input.nodeClasses) || input.nodeClasses.length < 1 || input.nodeClasses.length > 64) throw new ApplicationBridgeError("invalid_command", "Request between 1 and 64 node classes.");
      for (const name of input.nodeClasses) requireString(name, "Node class", 256);
    } else if (action === "inspect_backend" || action === "plan_dependencies") {
      requireString(target.backendId, "Backend ID", 256);
      if (action === "inspect_backend") {
        const input = requireRecord(command.input, "Backend inspection options");
        if (input.refresh !== undefined && typeof input.refresh !== "boolean") throw new ApplicationBridgeError("invalid_command", "Backend refresh must be a boolean.");
      } else {
        const input = requireRecord(command.input, "Dependency plan request");
        requireRecipeSource({ recipeId: input.recipeId, sourceGraphFingerprint: input.sourceGraphFingerprint });
      }
    } else {
      if (!Number.isSafeInteger(target.panelId) || Number(target.panelId) < 0) {
        throw new ApplicationBridgeError("invalid_command", "The application target needs a valid panel ID.");
      }
    }
    if (action === "prepare_workflow_proposal") {
      requireString(target.backendId, "Backend ID", 256);
      if (target.workflowId !== undefined) {
        requireString(target.workflowId, "Workflow ID", 256);
        if (command.expectedWorkflowRevision === undefined || Number(command.expectedWorkflowRevision) < 1) throw new ApplicationBridgeError("invalid_command", "Editing a workflow requires its observed revision.");
      } else if (command.expectedWorkflowRevision !== undefined) throw new ApplicationBridgeError("invalid_command", "A new workflow has no base revision.");
      const input = requireRecord(command.input, "Workflow proposal");
      requireString(input.name, "Workflow name", 256);
      requireRecord(input.workflow, "Workflow graph");
      if (!Array.isArray(input.config) || input.config.length > 512 || !input.config.every(isRecord)) throw new ApplicationBridgeError("invalid_command", "Workflow controls must contain at most 512 records.");
      if (input.description !== undefined) requireString(input.description, "Workflow description", 4096);
      if (input.category !== undefined) requireString(input.category, "Workflow category", 64);
      if (input.subCategory !== undefined) requireString(input.subCategory, "Workflow subcategory", 64);
      if (input.provenance !== undefined && (!Array.isArray(input.provenance) || input.provenance.length > 32 || !input.provenance.every(isRecord))) throw new ApplicationBridgeError("invalid_command", "Workflow provenance must contain at most 32 records.");
    } else if (action === "prepare_workflow_revision") {
      requireString(target.backendId, "Backend ID", 256);
      if (target.workflowId !== undefined || command.expectedWorkflowRevision !== undefined) throw new ApplicationBridgeError("invalid_command", "Recipe preparation creates a new workflow and cannot overwrite an existing workflow.");
      requireRecipeSource(command.source);
    } else if (action === "save_and_attach_workflow") {
      if (target.workflowId !== undefined) requireString(target.workflowId, "Workflow ID", 256);
      const input = requireRecord(command.input, "Workflow attachment input");
      if (input.preparedRevisionId !== undefined) requireString(input.preparedRevisionId, "Prepared revision ID", 128);
      if (input.workflowId !== undefined) requireString(input.workflowId, "Workflow ID", 256);
      requireRevision(input.workflowRevision, "Saved workflow revision");
      if (!input.preparedRevisionId && (input.workflowRevision === undefined || input.workflowRevision < 1
        || command.expectedWorkflowRevision !== input.workflowRevision)) {
        throw new ApplicationBridgeError("invalid_command", "An attachment retry requires the exact saved workflow revision.");
      }
    } else if (action === "bind_media") {
      if (command.expectedWorkflowRevision === undefined || command.expectedWorkflowRevision < 1) throw new ApplicationBridgeError("invalid_command", "Media binding requires the current workflow revision.");
      requireString(target.workflowId, "Workflow ID", 256);
      requireIds(target.backendIds, "Backend IDs");
      const input = requireRecord(command.input, "Media binding input");
      requireString(input.bindingId, "Media binding ID", 256);
      if (input.assetId !== undefined) {
        const assetId = requireString(input.assetId, "Media library ID", 128);
        if (!/^[A-Za-z0-9-]+$/.test(assetId) || input.media !== undefined) throw new ApplicationBridgeError("invalid_command", "Use one media library ID or one inline image, not both.");
      } else {
        const media = requireRecord(input.media, "Media payload");
        if (media.kind !== "image" && media.kind !== "video") throw new ApplicationBridgeError("invalid_command", "Media kind must be image or video.");
        const dataUrl = requireString(media.dataUrl, "Media data URL", 5_600_000);
        if (!dataUrl.startsWith(`data:${media.kind}/`)) throw new ApplicationBridgeError("invalid_command", "Media data URL does not match its declared kind.");
      }
    } else if (action === "set_panel_parameters") {
      if (command.expectedWorkflowRevision === undefined || command.expectedWorkflowRevision < 1) throw new ApplicationBridgeError("invalid_command", "Parameter updates require the current workflow revision.");
      requireString(target.workflowId, "Workflow ID", 256);
      requireString(target.backendId, "Backend ID", 256);
      const input = requireRecord(command.input, "Panel parameter input");
      const values = requireRecord(input.values, "Panel parameter values");
      if (Object.keys(values).length > 256) throw new ApplicationBridgeError("invalid_command", "At most 256 exposed panel parameters can be updated at once.");
    } else if (action === "start_generation") {
      requireString(target.workflowId, "Workflow ID", 256);
      requireIds(target.backendIds, "Backend IDs");
      if (target.mode !== "single" && target.mode !== "parallel") throw new ApplicationBridgeError("invalid_command", "Generation mode must be single or parallel.");
      requireString(command.idempotencyKey, "Generation idempotency key", 256);
      if (target.mode === "single" && (target.backendIds as string[]).length !== 1 || target.mode === "parallel" && (target.backendIds as string[]).length < 2) {
        throw new ApplicationBridgeError("invalid_command", "Generation backend IDs do not match the requested mode.");
      }
    } else if (action === "show_panel_controls") {
      if (!Number.isSafeInteger(target.panelId) || Number(target.panelId) < 1) throw new ApplicationBridgeError("invalid_command", "The application target needs a positive safe panel ID.");
      requireString(target.workflowId, "Workflow ID", 256);
      if (typeof command.expectedWorkflowRevision !== "number" || !Number.isSafeInteger(command.expectedWorkflowRevision) || command.expectedWorkflowRevision < 1) {
        throw new ApplicationBridgeError("invalid_command", "Showing workflow controls requires the observed positive workflow revision.");
      }
    }
  }
  if (action === "start_generation") {
    requireString(command.idempotencyKey, "Generation idempotency key", 256);
  }
  let encoded: string;
  try { encoded = JSON.stringify(value); } catch { throw new ApplicationBridgeError("invalid_command", "The application command is not serializable."); }
  if (Buffer.byteLength(encoded, "utf8") > MAX_COMMAND_BYTES) {
    throw new ApplicationBridgeError("command_too_large", "The application command exceeds the 8 MiB local bridge limit.");
  }
  if (!["get_application_snapshot", "prompt_engineer_action", "gallery_action", "inspect_media", "get_prompt_guidance"].includes(action) && command.expectedProjectRevision === undefined) {
    throw new ApplicationBridgeError("invalid_command", "Application actions require the current project revision.");
  }
  if (["prompt_engineer_action", "gallery_action", "inspect_media", "get_prompt_guidance", "select_backends", "add_panels", "save_project", "new_project", "open_project", "remove_panels", "get_backend_node_definitions", "inspect_backend", "search_workflow_sources", "get_source_recipe", "plan_dependencies", "enhance_generation_prompt", "get_run", "cancel_run"].includes(action)) {
    return value;
  }
  if (action === "get_application_snapshot") return value;
  if (command.expectedPanelRevision === undefined) throw new ApplicationBridgeError("invalid_command", "Panel actions require the current panel revision.");
  if (action === "start_generation" && (command.expectedWorkflowRevision === undefined || command.expectedWorkflowRevision < 1)) {
    throw new ApplicationBridgeError("invalid_command", "Generation actions require a canonical workflow revision.");
  }
  return value;
}

function writeEvent(response: ServerResponse, eventName: string, payload: unknown): boolean {
  if (response.destroyed || response.writableEnded) return false;
  const encoded = JSON.stringify(payload);
  if (Buffer.byteLength(encoded, "utf8") > MAX_COMMAND_BYTES) return false;
  const frame = `event: ${eventName}\ndata: ${encoded}\n\n`;
  if (response.writableLength + Buffer.byteLength(frame, "utf8") > MAX_COMMAND_BYTES + 64 * 1024) return false;
  // A queued write is accepted even when the socket needs time to drain.
  response.write(frame);
  return true;
}

export class ApplicationBridgeDispatcher {
  constructor(private readonly workspace = false) {}

  private readonly streams = new Map<string, ActiveStream>();
  private readonly pending = new Map<string, PendingCommand>();
  private readonly commandIds = new Map<string, Map<string, string>>();
  private readonly idempotencyKeys = new Map<string, Set<string>>();

  attach(bridgeId: string, projectIdentity: string, expiresAt: number, response: ServerResponse): string {
    const previous = this.streams.get(bridgeId);
    if (previous) this.detach(bridgeId, previous.connectionId, "A newer application bridge connection replaced this one.");
    const connectionId = randomUUID();
    const stream: ActiveStream = {
      bridgeId,
      projectIdentity,
      connectionId,
      expiresAt,
      response,
      heartbeat: setInterval(() => {
        const current = this.streams.get(bridgeId);
        if (!current || current.connectionId !== connectionId) return;
        if (current.expiresAt <= Date.now()) {
          this.detach(bridgeId, connectionId, "The paired browser credential expired.");
          return;
        }
        if (response.destroyed || response.writableEnded) return;
        response.write(": heartbeat\n\n");
      }, 15_000),
    };
    stream.heartbeat.unref?.();
    this.streams.set(bridgeId, stream);
    return connectionId;
  }

  detach(bridgeId: string, connectionId: string, reason = "The Storyboard application bridge disconnected."): void {
    const stream = this.streams.get(bridgeId);
    if (!stream || stream.connectionId !== connectionId) return;
    this.streams.delete(bridgeId);
    clearInterval(stream.heartbeat);
    for (const [commandId, item] of this.pending) {
      if (item.bridgeId !== bridgeId || item.connectionId !== connectionId) continue;
      this.settle(commandId, failure(item.command, "bridge_disconnected", reason));
    }
    if (!stream.response.destroyed && !stream.response.writableEnded) stream.response.end();
  }

  disconnectBridge(bridgeId: string, reason: string): void {
    const stream = this.streams.get(bridgeId);
    if (stream) this.detach(bridgeId, stream.connectionId, reason);
  }

  refreshCredential(bridgeId: string, expiresAt: number): void {
    const stream = this.streams.get(bridgeId);
    if (stream) stream.expiresAt = expiresAt;
  }

  forgetBridge(bridgeId: string): void {
    this.disconnectBridge(bridgeId, "The paired browser bridge expired.");
    this.commandIds.delete(bridgeId);
    this.idempotencyKeys.delete(bridgeId);
  }

  cancelSession(bridgeId: string, sessionId: string): void {
    for (const [commandId, item] of this.pending) {
      if (item.bridgeId === bridgeId && item.sessionId === sessionId) {
        this.settle(commandId, failure(item.command, "bridge_disconnected", "The Console session closed before the application action completed."));
      }
    }
  }

  dispatch(input: ApplicationDispatchInput): Promise<ApplicationResult> {
    let command: ApplicationCommand;
    try {
      command = validateCommand(input.command);
      if (this.workspace) {
        if (command.projectIdentity !== input.bridgeId) throw new ApplicationBridgeError("invalid_command", "Workspace routing must use its owning browser bridge.");
        const independent = ["get_application_snapshot", "prompt_engineer_action", "gallery_action", "inspect_media", "get_prompt_guidance"].includes(command.action);
        if (independent && command.expectedConsoleBindingId !== undefined) throw new ApplicationBridgeError("invalid_command", "Independent application actions cannot require a Console binding.");
        if (!independent && (typeof command.expectedConsoleBindingId !== "string" || !/^[A-Za-z0-9_-]{16,128}$/.test(command.expectedConsoleBindingId))) throw new ApplicationBridgeError("invalid_command", "Console actions require the observed Console activation binding.");
      }
    } catch (error) {
      const action = isRecord(input.command) && typeof input.command.action === "string"
        ? input.command.action as ApplicationActionName
        : "get_application_snapshot";
      return Promise.resolve({
        ok: false,
        commandId: isRecord(input.command) && typeof input.command.commandId === "string" ? input.command.commandId : "invalid",
        action,
        error: { code: error instanceof ApplicationBridgeError ? error.code : "invalid_command", message: error instanceof Error ? error.message : "The application command is invalid.", retryable: false },
      });
    }
    if (command.projectIdentity !== input.command.projectIdentity) {
      return Promise.resolve(failure(command, "bridge_disconnected", "The application command is outside its project scope."));
    }
    if (input.signal?.aborted) {
      return Promise.resolve(failure(command, "command_cancelled", "The initiating tool cancelled this application read."));
    }
    const stream = this.streams.get(input.bridgeId);
    if (!stream || stream.expiresAt <= Date.now() || stream.projectIdentity !== command.projectIdentity || stream.response.destroyed || stream.response.writableEnded) {
      if (stream?.expiresAt && stream.expiresAt <= Date.now()) this.disconnectBridge(input.bridgeId, "The paired browser credential expired.");
      return Promise.resolve(failure(command, "bridge_disconnected", "The paired Storyboard tab is not connected to this project."));
    }
    let seenIds = this.commandIds.get(input.bridgeId);
    if (!seenIds) {
      seenIds = new Map();
      this.commandIds.set(input.bridgeId, seenIds);
    }
    if (seenIds.has(command.commandId) || this.pending.has(command.commandId)) {
      return Promise.resolve(failure(command, "duplicate_command", "This application command ID has already been used."));
    }
    if (seenIds.size >= MAX_COMMANDS_PER_BRIDGE) {
      return Promise.resolve(failure(command, "duplicate_command", "This browser bridge reached its command limit. Re-pair it before issuing more actions."));
    }
    if (command.action === "start_generation") {
      let keys = this.idempotencyKeys.get(input.bridgeId);
      if (!keys) {
        keys = new Set();
        this.idempotencyKeys.set(input.bridgeId, keys);
      }
      if (keys.has(command.idempotencyKey)) {
        return Promise.resolve(failure(command, "duplicate_idempotency_key", "This generation request was already issued. Inspect its existing run instead of submitting it again."));
      }
      keys.add(command.idempotencyKey);
    }
    seenIds.set(command.commandId, input.sessionId);

    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.settle(command.commandId, {
          ok: false,
          commandId: command.commandId,
          action: command.action,
          error: {
            code: "command_timeout",
            message: "The application action timed out. Its mutation outcome may be unknown; inspect its current state and do not replay it automatically.",
            retryable: false,
          },
        });
      }, COMMAND_TIMEOUT_MS);
      const pending: PendingCommand = {
        bridgeId: input.bridgeId,
        projectIdentity: command.projectIdentity,
        sessionId: input.sessionId,
        command,
        connectionId: stream.connectionId,
        resolve,
        timer,
      };
      this.pending.set(command.commandId, pending);
      if (input.signal) {
        const signal = input.signal;
        const abort = () => this.settle(command.commandId, failure(command, "command_cancelled", "The initiating tool cancelled this application read."));
        pending.cleanupAbort = () => signal.removeEventListener("abort", abort);
        signal.addEventListener("abort", abort, { once: true });
        if (signal.aborted) {
          abort();
          return;
        }
      }
      const browserCommand = this.workspace
        ? Object.fromEntries(Object.entries(command).filter(([key]) => key !== "projectIdentity"))
        : command;
      if (!writeEvent(stream.response, "application_command", { sessionId: input.sessionId, command: browserCommand })) {
        this.settle(command.commandId, failure(command, "bridge_disconnected", "The browser command stream could not accept the action."));
        this.disconnectBridge(input.bridgeId, "The browser command stream could not accept the action.");
      }
    });
  }

  result(
    bridgeId: string,
    projectIdentity: string,
    sessionId: string,
    value: unknown,
  ): ApplicationResult {
    if (!isRecord(value) || typeof value.commandId !== "string" || typeof value.action !== "string") {
      throw new ApplicationBridgeError("invalid_result", "The application result is invalid.");
    }
    const pending = this.pending.get(value.commandId);
    if (!pending || pending.bridgeId !== bridgeId || pending.projectIdentity !== projectIdentity || pending.sessionId !== sessionId) {
      throw new ApplicationBridgeError("result_scope_mismatch", "The application result does not match a pending command in this browser and project scope.");
    }
    if (pending.command.action !== value.action || value.ok !== true && value.ok !== false) {
      throw new ApplicationBridgeError("invalid_result", "The application result does not match its pending command.");
    }
    if (this.workspace && pending.command.expectedConsoleBindingId !== undefined
      && value.consoleBindingId !== pending.command.expectedConsoleBindingId) {
      throw new ApplicationBridgeError("result_scope_mismatch", "The result does not name the command's original Console activation.");
    }
    const encoded = JSON.stringify(value);
    if (Buffer.byteLength(encoded, "utf8") > MAX_RESULT_BYTES) {
      throw new ApplicationBridgeError("result_too_large", "The application result exceeds the gateway limit.");
    }
    const result = value as unknown as ApplicationResult;
    this.settle(value.commandId, result);
    return result;
  }

  private settle(commandId: string, result: ApplicationResult): void {
    const pending = this.pending.get(commandId);
    if (!pending) return;
    this.pending.delete(commandId);
    clearTimeout(pending.timer);
    pending.cleanupAbort?.();
    if (!result.ok) {
      const stream = this.streams.get(pending.bridgeId);
      if (stream?.connectionId === pending.connectionId) {
        if (!writeEvent(stream.response, "application_cancel", { sessionId: pending.sessionId, commandId })) stream.response.destroy();
      }
    }
    pending.resolve(result);
  }
}

export const applicationBridge = new ApplicationBridgeDispatcher();
export const workspaceBridge = new ApplicationBridgeDispatcher(true);
