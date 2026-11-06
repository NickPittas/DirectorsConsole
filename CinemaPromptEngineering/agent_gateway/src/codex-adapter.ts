import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { join } from "node:path";
import { createCodexApplicationTools } from "./codex-application-tools.js";
import { openCodexThread } from "./codex-open-thread.js";
import { createCodexSession } from "./codex-session.js";
import { openCodexHost, CodexHostCleanupError } from "./codex-host.js";
import { readApplicationGuidance } from "./application-guidance.js";
import { buildCodexThreadResume, validateCodexResumedThread } from "./codex-thread-resume.js";
import {
  PiGatewayError,
  type AgentSelection,
  type AgentSessionRef,
  type AgentSurface,
  type AgentThinkingLevel,
  type ApplicationCommandDispatcher,
  type ApplicationSessionScope,
  type CreatePiSessionInput,
  type PiImageInput,
  type PiAvailability,
  type PiModelSummary,
  type PiPromptOptions,
  type ReviewedPromptContext,
} from "./contracts.js";

const THINKING_LEVELS: readonly string[] = ["off", "minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const UNAVAILABLE_MESSAGE = "Codex model discovery could not be completed.";
const SESSION_FAILED_MESSAGE = "Codex session could not be created.";
type OpenedCodexThread = Awaited<ReturnType<typeof openCodexThread>>;
type ManagedCodexSession = {
  ref: AgentSessionRef;
  selection: AgentSelection;
  reviewedContext: ReviewedPromptContext[];
  applicationScope?: ApplicationSessionScope;
  events: EventEmitter;
  opened: OpenedCodexThread;
  runtime: ReturnType<typeof createCodexSession>;
  applicationMedia: Map<string, { kind: "image" | "video"; dataUrl: string }>;
  tools?: ReturnType<typeof createCodexApplicationTools>;
  busy: boolean;
  closing: boolean;
  promptPromise?: Promise<void>;
};

function snapshotInput(input: CreatePiSessionInput): Omit<CreatePiSessionInput, "applicationScope"> & {
  applicationScope?: ApplicationSessionScope;
} {
  if (!input || typeof input !== "object") throw new PiGatewayError("invalid_selection", "Invalid Codex session input.");
  const source = input.selection;
  if (!source || source.schemaVersion !== 1 || source.harnessId !== "codex" ||
      typeof source.provider !== "string" || !source.provider || typeof source.modelId !== "string" || !source.modelId ||
      (source.thinkingLevel !== undefined && !isThinkingLevel(source.thinkingLevel)))
    throw new PiGatewayError(source?.harnessId && source.harnessId !== "codex" ? "unsupported_harness" : "invalid_selection", "Invalid Codex selection.");
  const selection: AgentSelection = {
    schemaVersion: 1,
    harnessId: "codex",
    provider: source.provider,
    modelId: source.modelId,
    ...(source.thinkingLevel === undefined ? {} : { thinkingLevel: source.thinkingLevel }),
  };
  const surface = input.surface;
  if (!["prompt-engineer", "console", "workspace", "prompt-enhancement"].includes(surface))
    throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
  const projectIdentity = input.projectIdentity;
  if (surface === "console") {
    if (typeof projectIdentity !== "string" || !projectIdentity.trim() || projectIdentity.length > 2048 || projectIdentity.includes("\0"))
      throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
  } else if (projectIdentity !== undefined) {
    throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
  }
  const scope = input.applicationScope;
  let applicationScope: ApplicationSessionScope | undefined;
  if (surface === "console" || surface === "workspace") {
    if (!scope || typeof scope.bridgeId !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(scope.bridgeId) ||
        typeof scope.projectIdentity !== "string" ||
        (surface === "workspace" ? scope.projectIdentity !== scope.bridgeId : scope.projectIdentity !== projectIdentity))
      throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
    applicationScope = { bridgeId: scope.bridgeId, projectIdentity: scope.projectIdentity };
  } else if (scope !== undefined) {
    throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
  }
  const reviewedContext: ReviewedPromptContext[] = [];
  let reviewedBytes = 0;
  if (input.reviewedContext !== undefined) {
    if (!Array.isArray(input.reviewedContext) || input.reviewedContext.length > 32)
      throw new PiGatewayError("invalid_reviewed_context", "Invalid reviewed Codex context.");
    for (const item of input.reviewedContext) {
      if (!item || typeof item.id !== "string" || typeof item.content !== "string")
        throw new PiGatewayError("invalid_reviewed_context", "Invalid reviewed Codex context.");
      reviewedBytes += Buffer.byteLength(item.id, "utf8") + Buffer.byteLength(item.content, "utf8");
      if (reviewedBytes > 65_536) throw new PiGatewayError("invalid_reviewed_context", "Invalid reviewed Codex context.");
      reviewedContext.push({ id: item.id, content: item.content });
    }
  }
  return { selection, surface: surface as AgentSurface, ...(projectIdentity === undefined ? {} : { projectIdentity }), reviewedContext, applicationScope };
}

function isThinkingLevel(value: string): value is AgentThinkingLevel {
  return THINKING_LEVELS.includes(value);
}

function snapshotPrompt(options: PiPromptOptions, managed: ManagedCodexSession): {
  images?: PiImageInput[];
  media: Array<[string, { kind: "image"; dataUrl: string }]>;
} {
  if (!options || typeof options !== "object" || Array.isArray(options) ||
      (options.onEvent !== undefined && typeof options.onEvent !== "function"))
    throw new PiGatewayError("invalid_image", "Invalid Codex prompt options.");
  if (options.images === undefined) return { media: [] };
  if (!Array.isArray(options.images)) throw new PiGatewayError("invalid_image", "Invalid Codex image input.");
  const ids = new Set<string>();
  const media: Array<[string, { kind: "image"; dataUrl: string }]> = [];
  const images = options.images.map(source => {
    if (!source || typeof source !== "object" || typeof source.data !== "string" || typeof source.mimeType !== "string")
      throw new PiGatewayError("invalid_image", "Invalid Codex image input.");
    const { data, mimeType, applicationMediaId, applicationMediaKind } = source;
    if (applicationMediaId !== undefined || applicationMediaKind !== undefined) {
      if ((managed.ref.surface !== "console" && managed.ref.surface !== "workspace") || !managed.tools || typeof applicationMediaId !== "string" ||
          !/^(?:media:[A-Za-z0-9-]{1,128}|handoff:[A-Za-z0-9._:-]{1,240}:\d{1,8})$/.test(applicationMediaId) ||
          applicationMediaKind !== "image" || ids.has(applicationMediaId))
        throw new PiGatewayError("invalid_image", "Invalid Codex application media reference.");
      ids.add(applicationMediaId);
      media.push([applicationMediaId, { kind: "image", dataUrl: `data:${mimeType};base64,${data}` }]);
    }
    return { data, mimeType, ...(applicationMediaId === undefined ? {} : { applicationMediaId }),
      ...(applicationMediaKind === undefined ? {} : { applicationMediaKind }) };
  });
  return { images, media };
}

function cloneModels(models: readonly PiModelSummary[]): PiModelSummary[] {
  return models.map((model) => ({ ...model, thinkingLevels: [...model.thinkingLevels] }));
}

export class CodexAdapter {
  private discoveryPromise?: Promise<PiModelSummary[]>;
  private discoveryController?: AbortController;
  private disposePromise?: Promise<void>;
  private disposed = false;
  private creationCleanupFailed = false;
  private readonly retainedCleanup = new Set<() => Promise<void>>();
  private readonly sessions = new Map<string, ManagedCodexSession>();
  private readonly closing = new Set<Promise<void>>();
  private readonly creationControllers = new Set<AbortController>();
  private readonly creations = new Set<Promise<AgentSessionRef>>();
  private availability: PiAvailability = {
    state: "unconfigured",
    authenticatedModelCount: 0,
    message: "Codex availability has not been checked.",
  };

  constructor(private readonly options: {
    executable: string;
    codexHome: string;
    metadataCwd: string;
    dispatchApplicationCommand?: ApplicationCommandDispatcher;
  }) {}

  getAvailability(): PiAvailability {
    return { ...this.availability };
  }

  listAvailableModels(): Promise<PiModelSummary[]> {
    if (this.disposed) return Promise.reject(new PiGatewayError("adapter_disposed", "Codex adapter is disposed."));
    if (!this.discoveryPromise) {
      const controller = new AbortController();
      this.discoveryController = controller;
      const discovery = this.discover(controller).finally(() => {
        if (this.discoveryController === controller) {
          this.discoveryController = undefined;
          this.discoveryPromise = undefined;
        }
      });
      this.discoveryPromise = discovery;
    }
    return this.discoveryPromise!.then(cloneModels);
  }

  createSession(input: CreatePiSessionInput): Promise<AgentSessionRef> {
    if (this.disposed) return Promise.reject(new PiGatewayError("adapter_disposed", "Codex adapter is disposed."));
    let snapshot: ReturnType<typeof snapshotInput>;
    try { snapshot = snapshotInput(input); }
    catch (error) {
      return Promise.reject(error instanceof PiGatewayError ? error : new PiGatewayError("invalid_selection", "Invalid Codex session input."));
    }
    const controller = new AbortController();
    const sessionId = randomUUID();
    this.creationControllers.add(controller);
    let creation: Promise<AgentSessionRef>;
    creation = this.startSession(snapshot, sessionId, controller).finally(() => {
      this.creationControllers.delete(controller);
      this.creations.delete(creation);
    });
    this.creations.add(creation);
    return creation;
  }

  // Restart resume and restored native tool inventory remain unverified; app registration is preserved, but native inventory is not proven.
  async resumeSession(
    selection: AgentSelection,
    ref: AgentSessionRef,
    reviewedContext?: readonly ReviewedPromptContext[],
    applicationScope?: ApplicationSessionScope,
  ): Promise<AgentSessionRef> {
    const managed = this.getManagedSession(ref);
    let snapshot: ReturnType<typeof snapshotInput>;
    try {
      snapshot = snapshotInput({ selection, surface: ref.surface, projectIdentity: ref.projectIdentity, reviewedContext, applicationScope });
    } catch (error) {
      if (error instanceof PiGatewayError && error.code === "unsupported_harness")
        throw new PiGatewayError("invalid_selection", "Codex session selection cannot be changed during resume.");
      throw error;
    }
    if (snapshot.selection.schemaVersion !== managed.selection.schemaVersion ||
        snapshot.selection.harnessId !== managed.selection.harnessId ||
        snapshot.selection.provider !== managed.selection.provider || snapshot.selection.modelId !== managed.selection.modelId ||
        snapshot.selection.thinkingLevel !== managed.selection.thinkingLevel)
      throw new PiGatewayError("invalid_selection", "Codex session selection cannot be changed during resume.");
    if (snapshot.applicationScope?.bridgeId !== managed.applicationScope?.bridgeId ||
        snapshot.applicationScope?.projectIdentity !== managed.applicationScope?.projectIdentity)
      throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
    const nextContext = [...(snapshot.reviewedContext ?? [])];
    if (managed.busy) throw new PiGatewayError("session_busy", "Codex session is busy.");
    if (managed.opened.rpc.stopSignal.aborted)
      throw new PiGatewayError("session_not_open", "Codex session is not open.");
    managed.busy = true;
    try {
      if (JSON.stringify(managed.reviewedContext) === JSON.stringify(nextContext)) return { ...managed.ref };
      const reviewed = [
        ...nextContext,
        ...(managed.tools ? readApplicationGuidance().map((content, index) => ({ id: `application-guide-${index}`, content })) : []),
      ];
      const request = buildCodexThreadResume({
        threadId: managed.opened.threadId,
        policy: managed.opened.policy,
        selection: managed.opened.selection,
        surface: managed.ref.surface,
        reviewedContext: reviewed,
        tools: managed.tools?.definitions ?? [],
      });
      try {
        const response = await managed.opened.rpc.request("thread/resume", request);
        validateCodexResumedThread(response, {
          threadId: managed.opened.threadId,
          provider: managed.opened.selection.model.provider,
          modelId: managed.opened.selection.model.modelId,
          reasoningEffort: managed.opened.selection.reasoningEffort,
          cwd: managed.opened.policy.cwd,
          permissions: managed.opened.policy.permissions,
          workspaceRoots: [],
        });
        if (this.disposed || managed.closing || this.sessions.get(ref.sessionId) !== managed || managed.opened.rpc.stopSignal.aborted)
          throw new Error("Codex session closed during resume.");
        managed.reviewedContext = nextContext;
        return { ...managed.ref };
      } catch {
        if (!managed.closing && this.sessions.get(ref.sessionId) === managed)
          await this.closeSession(managed).catch(() => undefined);
        throw new PiGatewayError("session_operation_failed", "Codex session could not be resumed.");
      }
    } finally {
      managed.busy = false;
    }
  }

  prompt(ref: AgentSessionRef, text: string, options: PiPromptOptions = {}): Promise<void> {
    let managed: ManagedCodexSession;
    try { managed = this.getManagedSession(ref); }
    catch (error) { return Promise.reject(error); }
    if (typeof text !== "string" || !text.trim())
      return Promise.reject(new PiGatewayError("invalid_selection", "Invalid Codex prompt."));
    if (managed.busy) return Promise.reject(new PiGatewayError("session_busy", "Codex session is busy."));
    let snapshot: ReturnType<typeof snapshotPrompt>;
    try { snapshot = snapshotPrompt(options, managed); }
    catch (error) { return Promise.reject(error); }
    managed.busy = true;
    managed.applicationMedia.clear();
    for (const [id, media] of snapshot.media) managed.applicationMedia.set(id, media);
    const operation = managed.runtime.prompt(text, { images: snapshot.images, onEvent: options.onEvent });
    let prompt: Promise<void>;
    prompt = operation.catch(() => {
      throw new PiGatewayError("session_operation_failed", "Codex session operation failed.");
    }).finally(() => {
      managed.applicationMedia.clear();
      managed.busy = false;
      if (managed.promptPromise === prompt) managed.promptPromise = undefined;
    });
    managed.promptPromise = prompt;
    return prompt;
  }

  abort(ref: AgentSessionRef): Promise<void> {
    let managed: ManagedCodexSession;
    try { managed = this.getManagedSession(ref); }
    catch (error) { return Promise.reject(error); }
    managed.runtime.abort();
    return managed.promptPromise?.then(() => undefined, () => undefined) ?? Promise.resolve();
  }

  disposeSession(ref: AgentSessionRef): Promise<void> {
    try { return this.closeSession(this.getManagedSession(ref)); }
    catch (error) { return Promise.reject(error); }
  }

  getApplicationToolsAvailable(ref: AgentSessionRef): boolean {
    return this.getManagedSession(ref).tools !== undefined;
  }

  dispose(): Promise<void> {
    if (this.disposePromise) return this.disposePromise;
    this.disposed = true;
    this.discoveryController?.abort();
    for (const controller of this.creationControllers) controller.abort();
    this.availability = {
      state: "disposed",
      authenticatedModelCount: 0,
      checkedAt: new Date().toISOString(),
      message: "The Codex adapter has been disposed.",
    };
    for (const session of this.sessions.values()) this.closeSession(session);
    const closing = [...this.closing];
    this.disposePromise = (async () => {
      await this.discoveryPromise?.catch(() => undefined);
      await Promise.allSettled([...this.creations]);
      for (const session of this.sessions.values()) this.closeSession(session);
      const cleanup = await Promise.allSettled([...closing, ...this.closing]);
      const retained = await Promise.allSettled([...this.retainedCleanup].map(async retry => {
        await retry();
        this.retainedCleanup.delete(retry);
      }));
      this.availability = {
        state: "disposed",
        authenticatedModelCount: 0,
        checkedAt: new Date().toISOString(),
        message: "The Codex adapter has been disposed.",
      };
      if (this.creationCleanupFailed || cleanup.some(result => result.status === "rejected") || retained.some(result => result.status === "rejected"))
        throw new PiGatewayError("session_operation_failed", "Codex adapter cleanup failed.");
    })();
    return this.disposePromise;
  }

  private getManagedSession(ref: AgentSessionRef): ManagedCodexSession {
    if (!ref || typeof ref !== "object" || Array.isArray(ref) || ref.harnessId !== "codex" ||
        !["prompt-engineer", "console", "workspace", "prompt-enhancement"].includes(ref.surface) ||
        typeof ref.sessionId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ref.sessionId) ||
        (ref.surface === "console" ? typeof ref.projectIdentity !== "string" || !ref.projectIdentity.trim() ||
          ref.projectIdentity.length > 2048 || ref.projectIdentity.includes("\0") : ref.projectIdentity !== undefined))
      throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
    if (this.disposed) throw new PiGatewayError("adapter_disposed", "Codex adapter is disposed.");
    const managed = this.sessions.get(ref.sessionId);
    if (!managed || managed.closing) throw new PiGatewayError("session_not_found", "Codex session was not found.");
    if (managed.ref.harnessId !== ref.harnessId || managed.ref.surface !== ref.surface ||
        managed.ref.sessionId !== ref.sessionId || managed.ref.projectIdentity !== ref.projectIdentity)
      throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
    return managed;
  }

  private closeSession(managed: ManagedCodexSession): Promise<void> {
    managed.closing = true;
    if (this.sessions.get(managed.ref.sessionId) === managed) this.sessions.delete(managed.ref.sessionId);
    let closing: Promise<void>;
    closing = (async () => {
      try { await managed.runtime.dispose(); }
      catch { throw new PiGatewayError("session_operation_failed", "Codex session cleanup failed."); }
      finally {
        managed.applicationMedia.clear();
        managed.events.removeAllListeners();
      }
    })().finally(() => this.closing.delete(closing));
    this.closing.add(closing);
    void closing.catch(() => undefined);
    return closing;
  }

  private async startSession(
    input: ReturnType<typeof snapshotInput>,
    sessionId: string,
    controller: AbortController,
  ): Promise<AgentSessionRef> {
    let opened: OpenedCodexThread | undefined;
    try {
      const models = await this.listAvailableModels();
      if (this.disposed || controller.signal.aborted) throw new Error();
      const matches = models.filter(model => model.provider === input.selection.provider && model.modelId === input.selection.modelId);
      if (matches.length !== 1) throw new PiGatewayError("model_not_found", "The selected Codex model is unavailable.");
      const model = matches[0]!;
      if (input.selection.thinkingLevel !== undefined && !model.thinkingLevels.includes(input.selection.thinkingLevel))
        throw new PiGatewayError("unsupported_thinking_level", "The selected Codex reasoning effort is unavailable.");
      const toolSurface = input.surface === "console" || input.surface === "workspace";
      if (toolSurface && !this.options.dispatchApplicationCommand)
        throw new PiGatewayError("invalid_session_ref", "Invalid Codex session scope.");
      const applicationMedia = new Map<string, { kind: "image" | "video"; dataUrl: string }>();
      const tools = toolSurface ? createCodexApplicationTools({
        ...input.applicationScope!,
        sessionId,
        dispatch: this.options.dispatchApplicationCommand!,
        media: applicationMedia,
        workspace: input.surface === "workspace",
      }, model.acceptsImages) : undefined;
      const events = new EventEmitter();
      opened = await openCodexThread({
        executable: this.options.executable,
        codexHome: this.options.codexHome,
        cwd: join(this.options.codexHome, "workspaces", sessionId),
        selection: input.selection,
        surface: input.surface,
        reviewedContext: [
          ...(input.reviewedContext ?? []),
          ...(toolSurface ? readApplicationGuidance().map((content, index) => ({ id: `application-guide-${index}`, content })) : []),
        ],
        tools,
        signal: controller.signal,
        onNotification: (method, params) => { events.emit("notification", method, params); },
        onToolRequest: (id, params) => {
          if (!events.listenerCount("toolRequest")) {
            if (!opened) throw new Error();
            opened.rpc.respond(id, { contentItems: [{ type: "inputText", text: "No active Codex turn." }], success: false });
            return;
          }
          events.emit("toolRequest", id, params);
        },
      });
      if (this.disposed || controller.signal.aborted) throw new Error();
      const runtime = createCodexSession({ opened, events, surface: input.surface, tools });
      const ref: AgentSessionRef = {
        harnessId: "codex",
        surface: input.surface,
        sessionId,
        ...(input.surface === "console" ? { projectIdentity: input.projectIdentity } : {}),
      };
      this.sessions.set(sessionId, {
        ref, selection: input.selection, reviewedContext: [...(input.reviewedContext ?? [])],
        applicationScope: input.applicationScope, events, opened, runtime, applicationMedia, tools,
        busy: false, closing: false,
      });
      return { ...ref };
    } catch (error) {
      if (error instanceof CodexHostCleanupError) {
        this.creationCleanupFailed = true;
        this.retainedCleanup.add(error.retryCleanup);
      }
      if (opened) {
        const rpc = opened.rpc;
        try { await rpc.dispose(); } catch {
          this.creationCleanupFailed = true;
          this.retainedCleanup.add(() => rpc.dispose());
        }
      }
      if (error instanceof PiGatewayError && ["model_not_found", "unsupported_thinking_level"].includes(error.code)) throw error;
      throw new PiGatewayError("session_operation_failed", SESSION_FAILED_MESSAGE);
    }
  }

  private async discover(controller: AbortController): Promise<PiModelSummary[]> {
    let host: Awaited<ReturnType<typeof openCodexHost>> | undefined;
    let models: PiModelSummary[] = [];
    let nextAvailability: PiAvailability = {
      state: "unavailable",
      authenticatedModelCount: 0,
      message: UNAVAILABLE_MESSAGE,
    };
    let cleanupFailed = false;
    try {
      host = await openCodexHost({
        executable: this.options.executable,
        codexHome: this.options.codexHome,
        cwd: this.options.metadataCwd,
        signal: controller.signal,
        onNotification: () => undefined,
        onToolRequest: (id) => {
          if (!host) throw new Error("Codex server requests are not supported.");
          host.rpc.respond(id, { contentItems: [{ type: "inputText", text: "No application tools are available during model discovery." }], success: false });
        },
      });
      const initialization = host.initialization;
      const checkedAt = new Date().toISOString();
      if (initialization.state !== "ready") {
        nextAvailability = {
          state: initialization.state,
          authenticatedModelCount: 0,
          checkedAt,
          message: initialization.message,
        };
      } else {
        models = initialization.models.map((model): PiModelSummary => {
          if (!model.reasoningEfforts.every(isThinkingLevel)) throw new Error("Unsupported Codex reasoning effort.");
          return {
            provider: model.provider,
            modelId: model.modelId,
            name: model.name,
            acceptsImages: model.inputModalities.includes("image"),
            reasoning: model.reasoningEfforts.length > 0,
            thinkingLevels: [...model.reasoningEfforts],
          };
        });
        nextAvailability = {
          state: "ready",
          authenticatedModelCount: models.length,
          checkedAt,
          message: "Authenticated Codex catalog discovered; model entitlement has not been verified.",
        };
      }
    } catch (error) {
      if (error instanceof CodexHostCleanupError) this.retainedCleanup.add(error.retryCleanup);
      models = [];
      nextAvailability = {
        state: "unavailable",
        authenticatedModelCount: 0,
        checkedAt: new Date().toISOString(),
        message: UNAVAILABLE_MESSAGE,
      };
    } finally {
      if (host) {
        try { await host.rpc.dispose(); } catch { cleanupFailed = true; }
      }
    }
    if (this.disposed) return [];
    if (cleanupFailed) {
      models = [];
      nextAvailability = {
        state: "unavailable",
        authenticatedModelCount: 0,
        checkedAt: new Date().toISOString(),
        message: UNAVAILABLE_MESSAGE,
      };
    }
    this.availability = nextAvailability;
    return models;
  }
}
