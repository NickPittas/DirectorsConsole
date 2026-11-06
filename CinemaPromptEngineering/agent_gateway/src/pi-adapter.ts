import { createHash } from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  readStoredCredential,
  SessionManager,
  SettingsManager,
  type AgentSession,
  type AgentSessionEvent,
  type CreateModelRuntimeOptions,
} from "@earendil-works/pi-coding-agent";
import {
  CONSOLE_APPLICATION_TOOL_NAMES,
  createConsoleApplicationExtension,
  safeToolValueForActivity,
} from "./console-tools.js";
import { readApplicationGuidance as loadApplicationGuidance } from "./application-guidance.js";
import type {
  AgentSelection,
  AgentSessionRef,
  AgentSurface,
  AgentThinkingLevel,
  ApplicationCommandDispatcher,
  ApplicationSessionScope,
  CreatePiSessionInput,
  PiAvailability,
  PiGatewayErrorCode,
  PiImageInput,
  PiModelSummary,
  PiPromptOptions,
  PiStreamEvent,
  ReviewedPromptContext,
} from "./contracts.js";
import { PiGatewayError } from "./contracts.js";

type PiModel = Awaited<ReturnType<ModelRuntime["getAvailable"]>>[number];

function safeActivitySummary(value: unknown): string | undefined {
  try {
    const sanitized = safeToolValueForActivity(value);
    return (JSON.stringify(sanitized) ?? String(sanitized)).slice(0, 8000);
  } catch {
    return undefined;
  }
}

interface ManagedSession {
  ref: AgentSessionRef;
  session: AgentSession;
  manager: SessionManager;
  dataDirectory: string;
  busy: boolean;
  disposed: boolean;
  applicationMedia: Map<string, { kind: "image" | "video"; dataUrl: string }>;
  applicationToolsAvailable: boolean;
  unsubscribe?: () => void;
  abortPromise?: Promise<void>;
  disposePromise?: Promise<void>;
}

type PiThinkingLevel = Exclude<AgentThinkingLevel, "ultra">;

const THINKING_LEVELS: readonly PiThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

const ERROR_MESSAGES: Record<PiGatewayErrorCode, string> = {
  adapter_disposed: "The Pi adapter has been disposed.",
  unsupported_harness: "This adapter supports the Pi harness only.",
  invalid_selection: "The Pi model selection is invalid.",
  model_not_found: "The selected model is not present in Pi's model catalog.",
  model_unauthenticated:
    "The selected Pi model is not authenticated. Its saved credentials may have expired; complete login through Pi, then retry.",
  availability_failed:
    "Pi model availability could not be read. Saved credentials may have expired; sign in through Pi and retry. The gateway cannot change credentials.",
  unsupported_thinking_level:
    "The selected thinking level is not supported by this Pi model.",
  invalid_session_ref: "The Pi session reference is invalid.",
  session_not_found: "The requested Pi session does not exist for this surface and project.",
  session_not_open: "Resume this Pi session before sending it a prompt.",
  session_busy: "This Pi session already has an active turn.",
  unsupported_image_input:
    "The selected Pi model does not support image input.",
  invalid_image: "An image must contain base64 data and an image MIME type.",
  invalid_reviewed_context:
    "Reviewed context needs a short stable ID and non-empty text content.",
  session_operation_failed:
    "Pi could not create or resume the session. Check Pi session data and provider availability.",
  request_failed:
    "The Pi request failed. Check selected-model authentication and provider connectivity.",
  provider_request_failed:
    "The selected Pi provider returned an error. Check Pi authentication and provider availability; complete login through Pi if credentials expired.",
  stream_consumer_failed:
    "The application could not receive Pi's streamed response; the turn was stopped.",
};

function fail(code: PiGatewayErrorCode): PiGatewayError {
  return new PiGatewayError(code, ERROR_MESSAGES[code]);
}

function appDataDirectory(): string {
  const home = homedir();
  if (process.platform === "win32") {
    return join(home, "AppData", "Local", "DirectorsConsole", "agent-gateway");
  }
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "DirectorsConsole", "agent-gateway");
  }
  return join(home, ".local", "share", "directors-console", "agent-gateway");
}

function privateSessionDirectory(
  surface: AgentSurface,
  projectIdentity?: string,
): string {
  const appDirectory = appDataDirectory();
  const projectKey = createHash("sha256")
    .update(projectIdentity ?? "no-project")
    .digest("hex");
  const directories = [
    appDirectory,
    join(appDirectory, "sessions"),
    join(appDirectory, "sessions", surface),
    join(appDirectory, "sessions", surface, projectKey),
  ];
  for (const directory of directories) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    if (process.platform !== "win32") chmodSync(directory, 0o700);
  }
  return directories[directories.length - 1];
}

function projectCwd(): string {
  return appDataDirectory();
}

function validateIdentity(surface: unknown, projectIdentity: unknown): void {
  if (
    surface !== "prompt-engineer" &&
    surface !== "console" &&
    surface !== "workspace" &&
    surface !== "prompt-enhancement"
  ) {
    throw fail("invalid_session_ref");
  }
  if ((surface === "workspace" || surface === "prompt-enhancement") && projectIdentity !== undefined) {
    throw fail("invalid_session_ref");
  }
  if (
    projectIdentity !== undefined &&
    (typeof projectIdentity !== "string" ||
      projectIdentity.length === 0 ||
      projectIdentity.length > 1024 ||
      projectIdentity.includes("\0"))
  ) {
    throw fail("invalid_session_ref");
  }
}

function validateSelection(selection: AgentSelection): void {
  if (!selection || selection.schemaVersion !== 1) {
    throw fail("invalid_selection");
  }
  if (selection.harnessId !== "pi") throw fail("unsupported_harness");
  if (
    typeof selection.provider !== "string" ||
    selection.provider.length === 0 ||
    selection.provider.length > 128 ||
    selection.provider.trim() !== selection.provider ||
    typeof selection.modelId !== "string" ||
    selection.modelId.length === 0 ||
    selection.modelId.length > 256 ||
    selection.modelId.trim() !== selection.modelId ||
    (selection.thinkingLevel !== undefined &&
      !THINKING_LEVELS.some((level) => level === selection.thinkingLevel))
  ) {
    throw fail("invalid_selection");
  }
}

function validateSessionRef(ref: AgentSessionRef): void {
  if (
    !ref ||
    ref.harnessId !== "pi" ||
    typeof ref.sessionId !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/.test(ref.sessionId)
  ) {
    throw fail("invalid_session_ref");
  }
  validateIdentity(ref.surface, ref.projectIdentity);
}

function sameRef(left: AgentSessionRef, right: AgentSessionRef): boolean {
  return (
    left.harnessId === right.harnessId &&
    left.surface === right.surface &&
    left.sessionId === right.sessionId &&
    left.projectIdentity === right.projectIdentity
  );
}

function summarizeModel(model: PiModel): PiModelSummary {
  return {
    provider: model.provider,
    modelId: model.id,
    name: model.name,
    reasoning: model.reasoning,
    acceptsImages: model.input.includes("image"),
    thinkingLevels: THINKING_LEVELS.filter(
      (level) =>
        (level === "off" || model.reasoning) &&
        model.thinkingLevelMap?.[level] !== null,
    ),
  };
}

function validateThinkingLevel(
  model: PiModel,
  level: AgentThinkingLevel | undefined,
): asserts level is PiThinkingLevel | undefined {
  if (level === "ultra") throw fail("unsupported_thinking_level");
  if (
    level !== undefined &&
    ((level !== "off" && !model.reasoning) ||
      model.thinkingLevelMap?.[level] === null)
  ) {
    throw fail("unsupported_thinking_level");
  }
}

function validateReviewedContext(
  resources: readonly ReviewedPromptContext[] | undefined,
): string[] {
  if (!resources) return [];
  if (!Array.isArray(resources)) throw fail("invalid_reviewed_context");
  return resources.map((resource) => {
    if (
      !resource ||
      typeof resource.id !== "string" ||
      !/^[a-z0-9][a-z0-9._-]{0,63}$/i.test(resource.id) ||
      typeof resource.content !== "string" ||
      resource.content.trim().length === 0
    ) {
      throw fail("invalid_reviewed_context");
    }
    return `Reviewed prompt/skill context (${resource.id}):\n${resource.content}`;
  });
}

function normalizeImages(images: readonly PiImageInput[] | undefined) {
  if (!images) return [];
  if (!Array.isArray(images)) throw fail("invalid_image");
  return images.map((image) => {
    if (
      !image ||
      typeof image.data !== "string" ||
      image.data.length === 0 ||
      typeof image.mimeType !== "string" ||
      !/^image\/[a-z0-9.+-]+$/i.test(image.mimeType)
    ) {
      throw fail("invalid_image");
    }
    return { type: "image" as const, data: image.data, mimeType: image.mimeType };
  });
}

function validateApplicationScope(
  surface: AgentSurface,
  projectIdentity: string | undefined,
  scope: ApplicationSessionScope | undefined,
): ApplicationSessionScope | undefined {
  if (surface === "prompt-engineer" || surface === "prompt-enhancement") {
    if (scope !== undefined) throw fail("invalid_session_ref");
    return undefined;
  }
  if (surface === "workspace") {
    if (
      projectIdentity !== undefined ||
      !scope ||
      typeof scope.bridgeId !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(scope.bridgeId) ||
      scope.projectIdentity !== scope.bridgeId
    ) {
      throw fail("invalid_session_ref");
    }
    return scope;
  }
  if (
    !scope ||
    !projectIdentity ||
    scope.projectIdentity !== projectIdentity ||
    typeof scope.bridgeId !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test(scope.bridgeId)
  ) {
    throw fail("invalid_session_ref");
  }
  return scope;
}

export class PiAdapter {
  constructor(private readonly dispatchApplicationCommand?: ApplicationCommandDispatcher) {}

  private runtimePromise?: Promise<ModelRuntime>;
  private readonly sessions = new Map<string, ManagedSession>();
  private readonly resumingSessions = new Set<string>();
  private readonly pendingOperations = new Set<Promise<void>>();
  private readonly availabilityControllers = new Set<AbortController>();
  private disposed = false;
  private disposePromise?: Promise<void>;
  private availability: PiAvailability = {
    state: "unconfigured",
    authenticatedModelCount: 0,
    message: "Pi availability has not been checked.",
  };

  getAvailability(): PiAvailability {
    return { ...this.availability };
  }

  listAvailableModels(): Promise<PiModelSummary[]> {
    return this.runOperation(
      async () => (await this.getAvailableModels()).map(summarizeModel),
      "availability_failed",
    );
  }

  createSession(input: CreatePiSessionInput): Promise<AgentSessionRef> {
    return this.runOperation(async () => {
      if (!input || typeof input !== "object") throw fail("invalid_selection");
      validateIdentity(input.surface, input.projectIdentity);
      validateSelection(input.selection);
      const applicationScope = validateApplicationScope(input.surface, input.projectIdentity, input.applicationScope);
      if (applicationScope && !this.dispatchApplicationCommand) throw fail("session_operation_failed");
      const reviewedContext = validateReviewedContext(input.reviewedContext);
      const model = await this.resolveModel(input.selection);
      validateThinkingLevel(model, input.selection.thinkingLevel);
      this.ensureOpen();

      const dataDirectory = appDataDirectory();
      const sessionDirectory = privateSessionDirectory(
        input.surface,
        input.projectIdentity,
      );
      const manager = SessionManager.create(projectCwd(), sessionDirectory);
      return this.openManagedSession(
        input.selection,
        {
          harnessId: "pi",
          surface: input.surface,
          sessionId: manager.getSessionId(),
          ...(input.projectIdentity === undefined
            ? {}
            : { projectIdentity: input.projectIdentity }),
        },
        manager,
        model,
        reviewedContext,
        dataDirectory,
        applicationScope,
      );
    }, "session_operation_failed");
  }

  resumeSession(
    selection: AgentSelection,
    ref: AgentSessionRef,
    reviewedContext?: readonly ReviewedPromptContext[],
    applicationScope?: ApplicationSessionScope,
  ): Promise<AgentSessionRef> {
    return this.runOperation(async () => {
      validateSelection(selection);
      validateSessionRef(ref);
      const scopedApplication = validateApplicationScope(ref.surface, ref.projectIdentity, applicationScope);
      if (scopedApplication && !this.dispatchApplicationCommand) throw fail("session_operation_failed");
      const promptContext = validateReviewedContext(reviewedContext);
      const current = this.sessions.get(ref.sessionId);
      if (current) {
        if (!sameRef(current.ref, ref)) throw fail("invalid_session_ref");
        if (current.busy) throw fail("session_busy");
      }
      if (this.resumingSessions.has(ref.sessionId)) throw fail("session_busy");
      this.resumingSessions.add(ref.sessionId);
      try {
        const model = await this.resolveModel(selection);
        validateThinkingLevel(model, selection.thinkingLevel);
        this.ensureOpen();

        if (current) {
          if (current.disposed || this.sessions.get(ref.sessionId) !== current) {
            throw fail("session_not_open");
          }
          current.disposed = true;
          this.sessions.delete(ref.sessionId);
          current.unsubscribe?.();
          current.session.dispose();
          return await this.openManagedSession(
            selection,
            ref,
            current.manager,
            model,
            promptContext,
            current.dataDirectory,
            scopedApplication,
          );
        }

        const dataDirectory = appDataDirectory();
        const sessionDirectory = privateSessionDirectory(
          ref.surface,
          ref.projectIdentity,
        );
        const sessionPath = SessionManager.findById(
          projectCwd(),
          ref.sessionId,
          sessionDirectory,
        );
        if (!sessionPath) throw fail("session_not_found");
        const manager = SessionManager.open(
          sessionPath,
          sessionDirectory,
          projectCwd(),
        );
        if (manager.getSessionId() !== ref.sessionId) {
          throw fail("invalid_session_ref");
        }
        return await this.openManagedSession(
          selection,
          ref,
          manager,
          model,
          promptContext,
          dataDirectory,
          scopedApplication,
        );
      } catch (error) {
        if (error instanceof PiGatewayError) throw error;
        throw fail("session_operation_failed");
      } finally {
        this.resumingSessions.delete(ref.sessionId);
      }
    }, "session_operation_failed");
  }

  prompt(
    ref: AgentSessionRef,
    text: string,
    options: PiPromptOptions = {},
  ): Promise<void> {
    return this.runOperation(async () => {
      validateSessionRef(ref);
      if (!options || typeof options !== "object") throw fail("invalid_image");
      if (typeof text !== "string" || text.trim().length === 0) {
        throw fail("invalid_selection");
      }
      const managed = this.getManagedSession(ref);
      if (managed.busy || this.resumingSessions.has(ref.sessionId)) {
        throw fail("session_busy");
      }
      const images = normalizeImages(options.images);
      if (images.length > 0 && !managed.session.model?.input.includes("image")) {
        throw fail("unsupported_image_input");
      }
      const applicationMedia: Array<[string, { kind: "image"; dataUrl: string }]> = [];
      const mediaIds = new Set<string>();
      for (const image of options.images ?? []) {
        if (image.applicationMediaId === undefined && image.applicationMediaKind === undefined) continue;
        if (
          (managed.ref.surface !== "console" && managed.ref.surface !== "workspace") ||
          typeof image.applicationMediaId !== "string" ||
          !/^(?:media:[A-Za-z0-9-]{1,128}|handoff:[A-Za-z0-9._:-]{1,240}:\d{1,8})$/.test(image.applicationMediaId) ||
          image.applicationMediaKind !== "image" ||
          mediaIds.has(image.applicationMediaId)
        ) {
          throw fail("invalid_image");
        }
        mediaIds.add(image.applicationMediaId);
        applicationMedia.push([image.applicationMediaId, {
          kind: "image",
          dataUrl: `data:${image.mimeType};base64,${image.data}`,
        }]);
      }
      managed.applicationMedia.clear();
      for (const [id, media] of applicationMedia) managed.applicationMedia.set(id, media);

      managed.busy = true;
      let streamConsumerFailed = false;
      let providerRequestFailed = false;
      let settledAborted: boolean | undefined;
      let finalStopReason: string | undefined;
      let unsubscribe: (() => void) | undefined;
      const emit = (event: PiStreamEvent) => {
        if (!options.onEvent || managed.disposed) return;
        try {
          options.onEvent(event);
        } catch {
          streamConsumerFailed = true;
          void this.abortManagedSession(managed).catch(() => undefined);
        }
      };
      try {
        unsubscribe = managed.session.subscribe((event: AgentSessionEvent) => {
          if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "text_delta"
          ) {
            emit({
              type: "text_delta",
              delta: event.assistantMessageEvent.delta,
            });
          } else if (
            event.type === "message_update" &&
            event.assistantMessageEvent.type === "thinking_delta"
          ) {
            emit({
              type: "agent_activity",
              activityType: "thinking_delta",
              delta: event.assistantMessageEvent.delta.slice(0, 8000),
            });
          } else if (event.type === "tool_execution_start") {
            const summary = safeActivitySummary(event.args);
            emit({
              type: "agent_activity",
              activityType: "tool_start",
              toolCallId: event.toolCallId.slice(0, 256),
              toolName: event.toolName.slice(0, 128),
              ...(summary === undefined ? {} : { summary }),
            });
          } else if (event.type === "tool_execution_end") {
            const summary = safeActivitySummary(event.result);
            emit({
              type: "agent_activity",
              activityType: "tool_end",
              toolCallId: event.toolCallId.slice(0, 256),
              toolName: event.toolName.slice(0, 128),
              ...(summary === undefined ? {} : { summary }),
              isError: event.isError,
            });
          } else if (event.type === "agent_settled") {
            settledAborted = event.aborted;
          } else if (
            event.type === "agent_end" &&
            !event.willRetry
          ) {
            const finalAssistant = [...event.messages].reverse().find(
              (message) => message.role === "assistant",
            );
            finalStopReason = finalAssistant?.stopReason;
            providerRequestFailed = event.messages.some(
              (message) => message.role === "assistant" && message.stopReason === "error",
            );
          }
        });
        managed.unsubscribe = unsubscribe;

        await managed.session.prompt(
          text,
          images.length > 0 ? { images } : undefined,
        );
        if (streamConsumerFailed) throw fail("stream_consumer_failed");
        if (managed.disposed) throw fail("session_not_open");
        if (providerRequestFailed) throw fail("provider_request_failed");
        if (settledAborted !== undefined) {
          emit({
            type: "turn_settled",
            aborted: settledAborted,
            ...(finalStopReason ? { stopReason: finalStopReason } : {}),
            ...(finalStopReason === "length" ? { truncated: true } : {}),
          });
        }
      } catch (error) {
        if (error instanceof PiGatewayError) throw error;
        if (streamConsumerFailed) throw fail("stream_consumer_failed");
        throw fail("request_failed");
      } finally {
        try {
          unsubscribe?.();
        } catch {
          // The session is still marked idle so a failed listener cleanup cannot wedge it.
        }
        managed.unsubscribe = undefined;
        managed.applicationMedia.clear();
        managed.busy = false;
      }
    }, "request_failed");
  }

  abort(ref: AgentSessionRef): Promise<void> {
    return this.runOperation(async () => {
      validateSessionRef(ref);
      const managed = this.getManagedSession(ref);
      if (!managed.busy && !managed.abortPromise) return;
      try {
        await this.abortManagedSession(managed);
      } catch {
        throw fail("request_failed");
      }
    }, "request_failed");
  }

  disposeSession(ref: AgentSessionRef): Promise<void> {
    return this.runOperation(async () => {
      validateSessionRef(ref);
      const managed = this.sessions.get(ref.sessionId);
      if (!managed) return;
      if (!sameRef(managed.ref, ref)) throw fail("invalid_session_ref");
      await this.disposeManagedSession(managed);
    }, "session_operation_failed");
  }

  getApplicationToolsAvailable(ref: AgentSessionRef): boolean {
    return this.getManagedSession(ref).applicationToolsAvailable;
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.availability = {
      state: "disposed",
      authenticatedModelCount: 0,
      checkedAt: new Date().toISOString(),
      message: "The Pi adapter has been disposed.",
    };
    for (const controller of this.availabilityControllers) controller.abort();
    this.disposePromise = (async () => {
      let cleanupFailed = false;
      await Promise.all(
        [...this.sessions.values()].map(async (session) => {
          try {
            await this.disposeManagedSession(session);
          } catch {
            cleanupFailed = true;
          }
        }),
      );
      await Promise.all([...this.pendingOperations]);
      if (cleanupFailed) {
        this.availability = {
          state: "disposed",
          authenticatedModelCount: 0,
          checkedAt: new Date().toISOString(),
          message: "Pi session cleanup did not complete cleanly.",
        };
      }
    })();
    return this.disposePromise;
  }

  private runOperation<T>(
    operation: () => Promise<T>,
    errorCode: PiGatewayErrorCode = "session_operation_failed",
  ): Promise<T> {
    this.ensureOpen();
    const result = Promise.resolve()
      .then(operation)
      .catch((error: unknown) => {
        if (error instanceof PiGatewayError) throw error;
        throw fail(errorCode);
      });
    const settled = result.then(
      () => undefined,
      () => undefined,
    );
    this.pendingOperations.add(settled);
    void settled.then(() => this.pendingOperations.delete(settled));
    return result;
  }

  private ensureOpen(): void {
    if (this.disposed) throw fail("adapter_disposed");
  }

  private async getRuntime(): Promise<ModelRuntime> {
    this.ensureOpen();
    if (!this.runtimePromise) this.runtimePromise = this.createRuntime();
    try {
      const runtime = await this.runtimePromise;
      this.ensureOpen();
      return runtime;
    } catch {
      this.runtimePromise = undefined;
      if (this.disposed) throw fail("adapter_disposed");
      this.availability = {
        state: "unavailable",
        authenticatedModelCount: 0,
        checkedAt: new Date().toISOString(),
        message: ERROR_MESSAGES.availability_failed,
      };
      throw fail("availability_failed");
    }
  }

  private async createRuntime(): Promise<ModelRuntime> {
    let runtime: ModelRuntime | undefined;
    const credentials: NonNullable<CreateModelRuntimeOptions["credentials"]> = {
      read: async (providerId, options) => {
        options?.signal?.throwIfAborted();
        return readStoredCredential(providerId);
      },
      list: async (options) => {
        options?.signal?.throwIfAborted();
        return (runtime?.getProviders() ?? []).flatMap((provider) => {
          const credential = readStoredCredential(provider.id);
          return credential
            ? [{ providerId: provider.id, type: credential.type }]
            : [];
        });
      },
      modify: async () => {
        throw new Error("Pi gateway credential storage is read-only.");
      },
      delete: async () => {
        throw new Error("Pi gateway credential storage is read-only.");
      },
    };
    runtime = await ModelRuntime.create({
      credentials,
      // Ignore unreviewed global custom-provider configuration.
      modelsPath: null,
      allowModelNetwork: false,
      refreshOnCreate: false,
    });
    return runtime;
  }

  private async getAvailableModels(): Promise<PiModel[]> {
    const runtime = await this.getRuntime();
    const controller = new AbortController();
    this.availabilityControllers.add(controller);
    try {
      const models = [
        ...(await runtime.getAvailable(undefined, { signal: controller.signal })),
      ];
      this.ensureOpen();
      this.availability = {
        state: models.length > 0 ? "ready" : "unconfigured",
        authenticatedModelCount: models.length,
        checkedAt: new Date().toISOString(),
        message:
          models.length > 0
            ? "Pi has authenticated models available."
            : "No authenticated Pi models are available. Saved Pi credentials may have expired; sign in through Pi, then refresh availability.",
      };
      return models;
    } catch {
      if (this.disposed) throw fail("adapter_disposed");
      this.availability = {
        state: "unavailable",
        authenticatedModelCount: 0,
        checkedAt: new Date().toISOString(),
        message: ERROR_MESSAGES.availability_failed,
      };
      throw fail("availability_failed");
    } finally {
      this.availabilityControllers.delete(controller);
    }
  }

  private async resolveModel(selection: AgentSelection): Promise<PiModel> {
    validateSelection(selection);
    const runtime = await this.getRuntime();
    const catalogModel = runtime.getModel(selection.provider, selection.modelId);
    if (!catalogModel) throw fail("model_not_found");
    const availableModels = await this.getAvailableModels();
    const model = availableModels.find(
      (candidate) =>
        candidate.provider === selection.provider &&
        candidate.id === selection.modelId,
    );
    if (!model) throw fail("model_unauthenticated");
    return model;
  }

  private readApplicationGuidance(): string[] {
    return loadApplicationGuidance();
  }

  private async openManagedSession(
    selection: AgentSelection,
    ref: AgentSessionRef,
    manager: SessionManager,
    model: PiModel,
    reviewedContext: readonly string[],
    dataDirectory: string,
    applicationScope?: ApplicationSessionScope,
  ): Promise<AgentSessionRef> {
    this.ensureOpen();
    const settingsManager = SettingsManager.inMemory();
    const applicationMedia = new Map<string, { kind: "image" | "video"; dataUrl: string }>();
    const extensionFactories = applicationScope
      ? [createConsoleApplicationExtension({
        ...applicationScope,
        sessionId: ref.sessionId,
        dispatch: this.dispatchApplicationCommand!,
        media: applicationMedia,
        workspace: ref.surface === "workspace",
      })]
      : [];
    const resourceLoader = new DefaultResourceLoader({
      cwd: dataDirectory,
      agentDir: join(dataDirectory, "pi-policy"),
      settingsManager,
      noExtensions: true,
      noSkills: true,
      noPromptTemplates: true,
      noThemes: true,
      noContextFiles: true,
      appendSystemPrompt: [...reviewedContext, ...(applicationScope ? this.readApplicationGuidance() : [])],
      extensionFactories,
    });
    await resourceLoader.reload();
    const thinkingLevel = selection.thinkingLevel;
    validateThinkingLevel(model, thinkingLevel);
    const { session } = await createAgentSession({
      cwd: projectCwd(),
      agentDir: join(dataDirectory, "pi-policy"),
      modelRuntime: await this.getRuntime(),
      model,
      ...(thinkingLevel === undefined
        ? {}
        : { thinkingLevel }),
      settingsManager,
      resourceLoader,
      sessionManager: manager,
      noTools: "all",
      ...(applicationScope ? { tools: [...CONSOLE_APPLICATION_TOOL_NAMES] } : {}),
    });
    try {
      await this.configureSession(session, selection, model);
      this.ensureOpen();
      const activeTools = [...session.getActiveToolNames()].sort();
      const expectedTools = applicationScope ? [...CONSOLE_APPLICATION_TOOL_NAMES].sort() : [];
      if (activeTools.length !== expectedTools.length || activeTools.some((name, index) => name !== expectedTools[index])) {
        throw fail("session_operation_failed");
      }
      if (this.sessions.has(ref.sessionId)) throw fail("invalid_session_ref");
      this.sessions.set(ref.sessionId, {
        ref,
        session,
        manager,
        dataDirectory,
        busy: false,
        disposed: false,
        applicationMedia,
        applicationToolsAvailable: expectedTools.length > 0,
      });
      return ref;
    } catch (error) {
      session.dispose();
      if (error instanceof PiGatewayError) throw error;
      throw fail("session_operation_failed");
    }
  }

  private async configureSession(
    session: AgentSession,
    selection: AgentSelection,
    model: PiModel,
  ): Promise<void> {
    validateThinkingLevel(model, selection.thinkingLevel);
    if (
      session.model?.provider !== model.provider ||
      session.model?.id !== model.id
    ) {
      await session.setModel(model, { persist: false });
    }
    if (
      session.model?.provider !== selection.provider ||
      session.model?.id !== selection.modelId
    ) {
      throw fail("model_unauthenticated");
    }
    if (selection.thinkingLevel !== undefined) {
      if (!session.getAvailableThinkingLevels().includes(selection.thinkingLevel)) {
        throw fail("unsupported_thinking_level");
      }
      session.setThinkingLevel(selection.thinkingLevel, { persist: false });
      if (session.thinkingLevel !== selection.thinkingLevel) {
        throw fail("unsupported_thinking_level");
      }
    }
  }

  private getManagedSession(ref: AgentSessionRef): ManagedSession {
    const managed = this.sessions.get(ref.sessionId);
    if (!managed || managed.disposed) throw fail("session_not_open");
    if (!sameRef(managed.ref, ref)) throw fail("invalid_session_ref");
    return managed;
  }

  private disposeManagedSession(managed: ManagedSession): Promise<void> {
    if (managed.disposePromise) return managed.disposePromise;
    managed.disposed = true;
    this.sessions.delete(managed.ref.sessionId);
    managed.disposePromise = (async () => {
      try {
        if (managed.busy || managed.abortPromise) {
          await this.abortManagedSession(managed);
        }
      } catch {
        // Disposal continues even when an in-flight provider request cannot abort cleanly.
      } finally {
        managed.unsubscribe?.();
        try {
          managed.session.dispose();
        } catch {
          throw fail("session_operation_failed");
        }
      }
    })();
    return managed.disposePromise;
  }

  private abortManagedSession(managed: ManagedSession): Promise<void> {
    if (!managed.abortPromise) {
      const abortPromise = managed.session.abort().finally(() => {
        if (managed.abortPromise === abortPromise) {
          managed.abortPromise = undefined;
        }
      });
      managed.abortPromise = abortPromise;
    }
    return managed.abortPromise;
  }
}

export function createPiAdapter(options: { dispatchApplicationCommand?: ApplicationCommandDispatcher } = {}): PiAdapter {
  return new PiAdapter(options.dispatchApplicationCommand);
}
