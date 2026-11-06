export type AgentHarnessId = "pi" | "codex" | "claude-code";

export type AgentThinkingLevel =
  | "off"
  | "minimal"
  | "low"
  | "medium"
  | "high"
  | "xhigh"
  | "max"
  | "ultra";

export type AgentSurface = "prompt-engineer" | "console" | "workspace" | "prompt-enhancement";

export interface AgentSelection {
  schemaVersion: 1;
  harnessId: AgentHarnessId;
  provider: string;
  modelId: string;
  thinkingLevel?: AgentThinkingLevel;
}

export interface AgentSessionRef {
  surface: AgentSurface;
  harnessId: AgentHarnessId;
  sessionId: string;
  projectIdentity?: string;
}

export interface PiModelSummary {
  provider: string;
  modelId: string;
  name: string;
  reasoning: boolean;
  acceptsImages: boolean;
  thinkingLevels: AgentThinkingLevel[];
}

export interface PiAvailability {
  state: "unconfigured" | "ready" | "unavailable" | "disposed";
  authenticatedModelCount: number;
  checkedAt?: string;
  message: string;
}

export interface PiImageInput {
  /** Base64-encoded image bytes, without a data URL prefix. */
  data: string;
  mimeType: string;
  /** Registered media references available to tool-enabled application sessions. */
  applicationMediaId?: string;
  applicationMediaKind?: "image" | "video";
}

export interface ReviewedPromptContext {
  /** Stable label for reviewed prompt or skill text; this is not a file path. */
  id: string;
  content: string;
}

export interface PiAgentActivity {
  activityType: "thinking_delta" | "tool_start" | "tool_end";
  delta?: string;
  toolCallId?: string;
  toolName?: string;
  summary?: string;
  isError?: boolean;
}

export type PiStreamEvent =
  | { type: "text_delta"; delta: string }
  | ({ type: "agent_activity" } & PiAgentActivity)
  | { type: "turn_settled"; aborted: boolean; stopReason?: string; truncated?: boolean };

export interface CreatePiSessionInput {
  selection: AgentSelection;
  surface: AgentSurface;
  projectIdentity?: string;
  reviewedContext?: readonly ReviewedPromptContext[];
  /** Injected by the authenticated gateway route; never accepted from model tool arguments. */
  applicationScope?: ApplicationSessionScope;
}

export interface PiPromptOptions {
  images?: readonly PiImageInput[];
  onEvent?: (event: PiStreamEvent) => void;
}

export type PiGatewayErrorCode =
  | "adapter_disposed"
  | "unsupported_harness"
  | "invalid_selection"
  | "model_not_found"
  | "model_unauthenticated"
  | "availability_failed"
  | "unsupported_thinking_level"
  | "invalid_session_ref"
  | "session_not_found"
  | "session_not_open"
  | "session_busy"
  | "provider_request_failed"
  | "unsupported_image_input"
  | "invalid_image"
  | "invalid_reviewed_context"
  | "session_operation_failed"
  | "request_failed"
  | "stream_consumer_failed";

export class PiGatewayError extends Error {
  constructor(
    readonly code: PiGatewayErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "PiGatewayError";
  }
}

export type ApplicationActionName =
  | "save_project"
  | "new_project"
  | "open_project"
  | "add_panels"
  | "remove_panels"
  | "show_panel_controls"
  | "select_backends"
  | "inspect_media"
  | "get_prompt_guidance"
  | "prompt_engineer_action"
  | "gallery_action"
  | "get_application_snapshot"
  | "inspect_backend"
  | "search_workflow_sources"
  | "get_source_recipe"
  | "plan_dependencies"
  | "prepare_workflow_revision"
  | "get_backend_node_definitions"
  | "prepare_workflow_proposal"
  | "save_and_attach_workflow"
  | "bind_media"
  | "set_panel_parameters"
  | "enhance_generation_prompt"
  | "start_generation"
  | "get_run"
  | "cancel_run";

export interface ApplicationCommandBase {
  expectedConsoleBindingId?: string;
  commandId: string;
  projectIdentity: string;
  expectedProjectRevision?: number;
  expectedPanelRevision?: number;
  expectedWorkflowRevision?: number;
}

export type ApplicationCommand =
  | (ApplicationCommandBase & { action: "save_project"; input: { folderPath?: string; name?: string } })
  | (ApplicationCommandBase & { action: "new_project"; input: { unsavedWorkChoice?: "save" | "discard" | "cancel" } })
  | (ApplicationCommandBase & { action: "open_project"; input: { projectPath: string; unsavedWorkChoice?: "save" | "discard" | "cancel" }; expectedPanelRevision?: never; expectedWorkflowRevision?: never })
  | (ApplicationCommandBase & { action: "add_panels"; input: { count: number } })
  | (ApplicationCommandBase & { action: "remove_panels"; input: { panelIds: number[]; expectedPanelRevisions: Record<string, number> } })
  | (ApplicationCommandBase & { action: "show_panel_controls"; target: { panelId: number; workflowId: string } })
  | (ApplicationCommandBase & { action: "select_backends"; input: { backendIds: string[] } })
  | (ApplicationCommandBase & { action: "inspect_media"; input: { assetId: string } })
  | (ApplicationCommandBase & { action: "get_prompt_guidance"; input: { targetModel?: string; modelVersion?: string; task?: string; dialectId?: string; conditioningAdapter?: string } })
  | (ApplicationCommandBase & { action: "prompt_engineer_action"; input: { operation: "snapshot" | "constraints" } | { operation: "prepare"; userPrompt: string; targetModel?: string } | { operation: "validate_apply"; preparationId: string; prompt: string; apply: boolean } })
  | (ApplicationCommandBase & { action: "gallery_action"; input: { operation: "snapshot" } | { operation: "open_folder"; rootPath: string } | { operation: "list"; folderPath?: string } | { operation: "file_info"; filePath: string } | { operation: "import_media"; filePath: string } | { operation: "search"; query: string; folderPath?: string } | { operation: "rename"; filePath: string; newName: string } | { operation: "move"; filePaths: string[]; destination: string } | { operation: "trash" | "restore"; filePaths: string[] } | { operation: "create_folder"; parentPath: string; name: string } | { operation: "rate"; ratings: Record<string, number> } })
  | (ApplicationCommandBase & { action: "get_backend_node_definitions"; target: { backendId: string }; input: { nodeClasses: string[] } })
  | (ApplicationCommandBase & {
      action: "prepare_workflow_proposal";
      target: { panelId: number; backendId: string; workflowId?: string };
      input: { name: string; description?: string; category?: string; subCategory?: string; workflow: Record<string, unknown>; config: Record<string, unknown>[]; provenance?: Record<string, unknown>[] };
    })
  | (ApplicationCommandBase & { action: "get_application_snapshot" })
  | (ApplicationCommandBase & {
      action: "inspect_backend";
      target: { backendId: string };
      input: { refresh?: boolean };
    })
  | (ApplicationCommandBase & { action: "search_workflow_sources"; input: { query?: string } })
  | (ApplicationCommandBase & { action: "get_source_recipe"; input: { recipeId: string } })
  | (ApplicationCommandBase & {
      action: "plan_dependencies";
      target: { backendId: string };
      input: { recipeId: string; sourceGraphFingerprint: string };
    })
  | (ApplicationCommandBase & {
      action: "prepare_workflow_revision";
      target: { panelId: number; backendId: string };
      source: {
        recipeId: string;
        sourceGraphFingerprint: string;
        exportedRecipe?: {
          recipeFingerprint: string;
          backendId: string;
          selectedHandoffId: string | null;
          capturedAt: string;
          objectInfoFingerprint: string;
          exportFingerprint: string;
          workflow: Record<string, unknown>;
          readiness: "not_verified";
          identityVerification: "not_verified";
        };
      };
    })
  | (ApplicationCommandBase & {
      action: "save_and_attach_workflow";
      target: { panelId: number; workflowId?: string };
      input: { preparedRevisionId?: string; workflowId?: string; workflowRevision?: number };
    })
  | (ApplicationCommandBase & {
      action: "bind_media";
      target: { panelId: number; workflowId: string; backendIds: string[] };
      input: { bindingId: string; media?: { kind: "image" | "video"; dataUrl: string }; assetId?: string };
    })
  | (ApplicationCommandBase & {
      action: "set_panel_parameters";
      target: { panelId: number; workflowId: string; backendId: string };
      input: { values: Record<string, unknown> };
    })
  | (ApplicationCommandBase & {
      action: "enhance_generation_prompt";
      input:
        | { phase: "prepare" }
        | { phase: "validate"; preparationId: string; enhancedPrompt: string };
    })
  | (ApplicationCommandBase & {
      action: "start_generation";
      idempotencyKey: string;
      target: { panelId: number; workflowId: string; backendIds: string[]; mode: "single" | "parallel" };
    })
  | (ApplicationCommandBase & { action: "get_run"; target: { runId: string }; input?: { waitSeconds?: number } })
  | (ApplicationCommandBase & { action: "cancel_run"; target: { runId: string } });

export interface ApplicationResult {
  ok: boolean;
  commandId: string;
  action: ApplicationActionName;
  runId?: string;
  data?: unknown;
  error?: { code: string; message: string; retryable: boolean };
}

export interface ApplicationDispatchInput {
  bridgeId: string;
  sessionId: string;
  command: ApplicationCommand;
  signal?: AbortSignal;
}

export interface ApplicationSessionScope {
  bridgeId: string;
  /** Legacy Console project scope; workspace adapters use the owning bridge ID internally. */
  projectIdentity: string;
}

export type ApplicationCommandDispatcher = (
  input: ApplicationDispatchInput,
) => Promise<ApplicationResult>;
