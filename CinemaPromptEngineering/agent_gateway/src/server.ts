import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { readFileSync, statSync, unlinkSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { isIP } from "node:net";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  PiGatewayError,
  type AgentSelection,
  type AgentSessionRef,
  type AgentSurface,
  type PiImageInput,
  type ReviewedPromptContext,
} from "./index.js";
import { createHarnessAdapter } from "./harness-adapter.js";
import { createCodexLoginManager } from "./codex-login-manager.js";
import {
  applicationBridge,
  workspaceBridge,
  ApplicationBridgeError,
} from "./application-bridge.js";
import type {
  ApplicationCommand,
  ApplicationDispatchInput,
  ApplicationResult,
} from "./contracts.js";

const PAIR_TOKEN_TTL_MS = 5 * 60_000;
const CREDENTIAL_TTL_MS = 8 * 60 * 60_000;
const BINDING_TTL_MS = 24 * 60 * 60_000;
const MAX_BODY_BYTES = 12 * 1024 * 1024;
const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_IMAGES = 4;
const MAX_TEXT_LENGTH = 64 * 1024;
const MAX_REVIEWED_CONTEXT_LENGTH = 64 * 1024;
const MAX_SESSIONS_PER_BRIDGE = 32;
const MUTATING_APPLICATION_ACTIONS = new Set([
  "add_panels",
  "save_project",
  "new_project",
  "open_project",
  "remove_panels",
  "show_panel_controls",
  "select_backends",
  "prompt_engineer_action",
  "gallery_action",
  "prepare_workflow_proposal",
  "prepare_workflow_revision",
  "save_and_attach_workflow",
  "bind_media",
  "set_panel_parameters",
  "enhance_generation_prompt",
  "start_generation",
  "cancel_run",
]);

let activeApplicationDispatch: ((input: ApplicationDispatchInput) => Promise<ApplicationResult>) | undefined;

/** Dispatch a bounded named action to the exact paired Console session and project tab. */
export function dispatchApplicationCommand(input: ApplicationDispatchInput): Promise<ApplicationResult> {
  if (!activeApplicationDispatch) {
    return Promise.resolve({
      ok: false,
      commandId: input.command?.commandId || "invalid",
      action: input.command?.action || "get_application_snapshot",
      error: { code: "gateway_unavailable", message: "The application bridge is not running.", retryable: false },
    });
  }
  return activeApplicationDispatch(input);
}

type GatewaySurface = AgentSurface;

interface GatewayOptions {
  host: "127.0.0.1" | "::1";
  port: number;
  allowedOrigins: readonly string[];
  bootstrapFile: string;
  codex?: { executable: string; codexHome: string; metadataCwd: string };
}

interface BridgeBinding {
  bridgeId: string;
  surface: GatewaySurface;
  projectIdentity?: string;
  sessions: Map<string, AgentSessionRef>;
  expiresAt: number;
  rebinding?: boolean;
  scopeRevision: number;
}

interface ConnectionCredential {
  bridgeId: string;
  surface: GatewaySurface;
  projectIdentity?: string;
  expiresAt: number;
}

class GatewayHttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

function httpError(status: number, code: string, message: string): GatewayHttpError {
  return new GatewayHttpError(status, code, message);
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

function isLoopbackAddress(address: string | undefined): boolean {
  if (!address) return false;
  const normalized = address.startsWith("::ffff:") ? address.slice(7) : address;
  return (
    (isIP(normalized) === 4 && normalized.startsWith("127.")) ||
    normalized === "::1"
  );
}

function expectedHost(host: string, port: number): string {
  return `${host.includes(":") ? `[${host}]` : host}:${port}`;
}

function readBootstrapToken(path: string): string {
  const file = resolve(path);
  const info = statSync(file);
  if (!info.isFile() || (process.platform !== "win32" && (info.mode & 0o077) !== 0)) {
    throw new Error("The launcher pairing file is not a private regular file.");
  }
  const contents = readFileSync(file, "utf8");
  unlinkSync(file);
  const parsed: unknown = JSON.parse(contents);
  if (
    !parsed ||
    typeof parsed !== "object" ||
    typeof (parsed as { pairingToken?: unknown }).pairingToken !== "string" ||
    !/^[A-Za-z0-9_-]{43}$/.test((parsed as { pairingToken: string }).pairingToken)
  ) {
    throw new Error("The launcher pairing file is invalid.");
  }
  return (parsed as { pairingToken: string }).pairingToken;
}

function validateAllowedOrigins(origins: readonly string[]): Set<string> {
  if (origins.length === 0) throw new Error("At least one exact local application origin is required.");
  const validated = new Set<string>();
  for (const value of origins) {
    let origin: URL;
    try {
      origin = new URL(value);
    } catch {
      throw new Error("A configured application origin is invalid.");
    }
    const host = origin.hostname.replace(/^\[|\]$/g, "");
    if (
      origin.origin !== value ||
      !["http:", "https:"].includes(origin.protocol) ||
      !["localhost", "127.0.0.1", "::1"].includes(host) ||
      origin.username !== "" ||
      origin.password !== ""
    ) {
      throw new Error("Application origins must be exact local HTTP(S) origins.");
    }
    validated.add(value);
  }
  return validated;
}

function setCors(req: IncomingMessage, res: ServerResponse, origins: Set<string>): void {
  const origin = req.headers.origin;
  if (typeof origin === "string" && origins.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
    res.setHeader("Access-Control-Max-Age", "300");
    res.setHeader("Vary", "Origin");
  }
}

function requireOrigin(req: IncomingMessage, origins: Set<string>): string {
  const origin = req.headers.origin;
  if (typeof origin !== "string" || origin === "null") {
    throw httpError(403, "origin_required", "A trusted Director's Console origin is required.");
  }
  if (!origins.has(origin)) {
    throw httpError(
      403,
      "remote_browser_unsupported",
      "Remote browser access is unsupported; run Director's Console and its gateway on the same machine.",
    );
  }
  return origin;
}

function sendJson(
  req: IncomingMessage,
  res: ServerResponse,
  origins: Set<string>,
  status: number,
  payload: unknown,
): void {
  if (res.destroyed || res.writableEnded) return;
  setCors(req, res, origins);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
  });
  res.end(JSON.stringify(payload));
}

function sendError(
  req: IncomingMessage,
  res: ServerResponse,
  origins: Set<string>,
  error: unknown,
): void {
  if (error instanceof GatewayHttpError) {
    sendJson(req, res, origins, error.status, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  if (error instanceof PiGatewayError) {
    const status =
      error.code === "session_busy"
        ? 409
        : error.code === "session_not_open" || error.code === "session_not_found"
          ? 404
          : error.code === "availability_failed"
            ? 503
            : error.code === "request_failed" || error.code === "provider_request_failed"
              ? 502
              : 422;
    sendJson(req, res, origins, status, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  sendJson(req, res, origins, 500, {
    error: { code: "gateway_internal_error", message: "The agent gateway could not complete the request." },
  });
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const contentType = req.headers["content-type"];
  if (typeof contentType !== "string" || !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    throw httpError(415, "json_required", "Requests must use application/json.");
  }
  const contentLength = Number(req.headers["content-length"]);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    req.resume();
    throw httpError(413, "payload_too_large", "The request exceeds the gateway payload limit.");
  }
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += bytes.length;
    if (total > MAX_BODY_BYTES) {
      req.resume();
      throw httpError(413, "payload_too_large", "The request exceeds the gateway payload limit.");
    }
    chunks.push(bytes);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw httpError(400, "invalid_json", "The request body must be valid JSON.");
  }
}

function requireEmptyBody(req: IncomingMessage): void {
  if (req.headers["content-length"] !== undefined && req.headers["content-length"] !== "0") {
    req.resume();
    throw httpError(400, "body_not_allowed", "This route does not accept a request body.");
  }
  if (req.headers["transfer-encoding"] !== undefined) {
    req.resume();
    throw httpError(400, "body_not_allowed", "This route does not accept a request body.");
  }
}

function objectValue(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw httpError(400, "invalid_request", "The request body must be a JSON object.");
  }
  return value as Record<string, unknown>;
}

function validateSurface(value: unknown): GatewaySurface {
  if (value !== "prompt-engineer" && value !== "console" && value !== "workspace" && value !== "prompt-enhancement") {
    throw httpError(400, "invalid_surface", "The requested agent surface is invalid.");
  }
  return value;
}

function validateProjectIdentity(value: unknown): string | undefined {
  if (value === undefined) return undefined;
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 1024 ||
    value.includes("\0")
  ) {
    throw httpError(400, "invalid_project_identity", "The project identity is invalid.");
  }
  return value;
}

function validateBridgeId(value: unknown): string {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(value)) {
    throw httpError(400, "invalid_bridge_id", "The bridge identity must be a random 256-bit base64url value.");
  }
  return value;
}

function sameProject(left: string | undefined, right: string | undefined): boolean {
  return left === right;
}

function sameSessionRef(left: AgentSessionRef, right: AgentSessionRef): boolean {
  return (
    left.harnessId === right.harnessId &&
    left.sessionId === right.sessionId &&
    left.surface === right.surface &&
    sameProject(left.projectIdentity, right.projectIdentity)
  );
}

function validateSessionRef(value: unknown): AgentSessionRef {
  const ref = objectValue(value);
  if (
    (ref.harnessId !== "pi" && ref.harnessId !== "codex") ||
    typeof ref.sessionId !== "string" ||
    !/^[A-Za-z0-9](?:[A-Za-z0-9._-]{0,126}[A-Za-z0-9])?$/.test(ref.sessionId)
  ) {
    throw httpError(400, "invalid_session_ref", "The agent session reference is invalid.");
  }
  return {
    harnessId: ref.harnessId,
    sessionId: ref.sessionId,
    surface: validateSurface(ref.surface),
    ...(validateProjectIdentity(ref.projectIdentity) === undefined
      ? {}
      : { projectIdentity: ref.projectIdentity as string }),
  };
}

function validateReviewedContext(value: unknown): readonly ReviewedPromptContext[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 16) {
    throw httpError(400, "invalid_reviewed_context", "Reviewed context must be an array of at most 16 entries.");
  }
  let total = 0;
  return value.map((entry) => {
    const resource = objectValue(entry);
    if (typeof resource.id !== "string" || typeof resource.content !== "string") {
      throw httpError(400, "invalid_reviewed_context", "Each reviewed context entry needs an ID and text content.");
    }
    total += Buffer.byteLength(resource.content, "utf8");
    if (total > MAX_REVIEWED_CONTEXT_LENGTH) {
      throw httpError(413, "reviewed_context_too_large", "Reviewed context exceeds the gateway limit.");
    }
    return { id: resource.id, content: resource.content };
  });
}

function isImageBytes(mimeType: string, bytes: Buffer): boolean {
  // shortcut: checks signatures only, add a decoder if malformed image bytes must be rejected before Pi.
  if (mimeType === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/gif") {
    const header = bytes.subarray(0, 6).toString("ascii");
    return header === "GIF87a" || header === "GIF89a";
  }
  if (mimeType === "image/webp") {
    return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  }
  return false;
}

function validateImages(value: unknown): readonly PiImageInput[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > MAX_IMAGES) {
    throw httpError(400, "invalid_images", `Images must be an array of at most ${MAX_IMAGES} entries.`);
  }
  let total = 0;
  const referenceIds = new Set<string>();
  return value.map((entry) => {
    const image = objectValue(entry);
    if (
      typeof image.data !== "string" ||
      image.data.length === 0 ||
      image.data.length > Math.ceil(MAX_IMAGE_BYTES / 3) * 4 + 4 ||
      typeof image.mimeType !== "string" ||
      !["image/png", "image/jpeg", "image/gif", "image/webp"].includes(image.mimeType) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(image.data)
    ) {
      throw httpError(400, "invalid_image", "Each image must contain canonical base64 bytes and a supported image MIME type.");
    }
    const hasApplicationMediaId = image.applicationMediaId !== undefined;
    const hasApplicationMediaKind = image.applicationMediaKind !== undefined;
    if (hasApplicationMediaId !== hasApplicationMediaKind || hasApplicationMediaId && (
      typeof image.applicationMediaId !== "string" ||
      !/^(?:media:[A-Za-z0-9-]{1,128}|handoff:[A-Za-z0-9._:-]{1,240}:\d{1,8})$/.test(image.applicationMediaId) ||
      image.applicationMediaKind !== "image" ||
      referenceIds.has(image.applicationMediaId)
    )) {
      throw httpError(400, "invalid_image", "An application media reference must identify one unique attached image.");
    }
    if (hasApplicationMediaId) referenceIds.add(image.applicationMediaId as string);
    const bytes = Buffer.from(image.data, "base64");
    if (
      bytes.length === 0 ||
      bytes.length > MAX_IMAGE_BYTES ||
      bytes.toString("base64") !== image.data ||
      !isImageBytes(image.mimeType, bytes)
    ) {
      throw httpError(400, "invalid_image", "Image bytes do not match the declared image MIME type or size limit.");
    }
    total += bytes.length;
    if (total > MAX_TOTAL_IMAGE_BYTES) {
      throw httpError(413, "images_too_large", "Combined image bytes exceed the gateway limit.");
    }
    return {
      data: image.data,
      mimeType: image.mimeType,
      ...(hasApplicationMediaId ? {
        applicationMediaId: image.applicationMediaId as string,
        applicationMediaKind: "image" as const,
      } : {}),
    };
  });
}

function parseCredentialHeader(req: IncomingMessage): string {
  const header = req.headers.authorization;
  if (typeof header !== "string" || !/^Bearer [A-Za-z0-9_-]{43}$/.test(header)) {
    throw httpError(401, "credential_required", "A gateway bearer credential is required.");
  }
  return header.slice(7);
}

function sessionMismatch(binding: BridgeBinding, ref: AgentSessionRef): boolean {
  return ref.surface !== "console"
    ? ref.projectIdentity !== undefined
    : !sameProject(ref.projectIdentity, binding.projectIdentity);
}

function piErrorEvent(error: unknown): { code: string; message: string } {
  if (error instanceof PiGatewayError) return { code: error.code, message: error.message };
  return { code: "request_failed", message: "The Pi request failed. Check authentication and provider availability." };
}

function writeSse(res: ServerResponse, name: string, value: unknown): void {
  if (res.destroyed || res.writableEnded) return;
  res.write(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`);
  if (res.writableLength > 1024 * 1024) {
    throw httpError(502, "stream_backpressure", "The response consumer could not keep up with the Pi stream.");
  }
}

export async function startAgentGateway(options: GatewayOptions): Promise<() => Promise<void>> {
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) {
    throw new Error("The gateway port is invalid.");
  }
  if (options.host !== "127.0.0.1" && options.host !== "::1") {
    throw new Error("The agent gateway must bind to IPv4 or IPv6 loopback.");
  }
  const allowedOrigins = validateAllowedOrigins(options.allowedOrigins);
  const pairingToken = readBootstrapToken(options.bootstrapFile);
  const pairingHash = digest(pairingToken);
  const pairingExpiresAt = Date.now() + PAIR_TOKEN_TTL_MS;
  let pairingUsed = false;
  const credentials = new Map<string, ConnectionCredential>();
  const bindings = new Map<string, BridgeBinding>();
  const applicationMutationQueues = new Map<string, Promise<void>>();
  const adapter = createHarnessAdapter({ dispatchApplicationCommand, codex: options.codex });
  const codexLogin = options.codex ? createCodexLoginManager(options.codex) : undefined;
  const host = expectedHost(options.host, options.port);
  const reapExpiredBindings = async () => {
    const now = Date.now();
    for (const [bridgeId, binding] of bindings) {
      if (binding.expiresAt > now) continue;
      bindings.delete(bridgeId);
      applicationBridge.forgetBridge(bridgeId);
      workspaceBridge.forgetBridge(bridgeId);
      await codexLogin?.cancel(bridgeId);
      for (const [key, credential] of credentials) {
        if (credential.bridgeId === bridgeId) credentials.delete(key);
      }
      await Promise.allSettled(
        [...binding.sessions.values()].map((ref) => adapter.disposeSession(ref)),
      );
    }
  };
  const getCredential = (req: IncomingMessage): { token: string; value: ConnectionCredential } => {
    const token = parseCredentialHeader(req);
    const key = digest(token);
    const value = credentials.get(key);
    if (!value) throw httpError(401, "invalid_credential", "The gateway credential is invalid or has been replaced.");
    if (value.expiresAt <= Date.now()) {
      credentials.delete(key);
      throw httpError(401, "credential_expired", "The gateway credential expired; restart the launcher and open its new pairing file.");
    }
    const binding = bindings.get(value.bridgeId);
    if (!binding || binding.expiresAt <= Date.now()) {
      throw httpError(401, "bridge_disconnected", "The browser bridge is no longer active; restart the launcher and use its new pairing file.");
    }
    binding.expiresAt = Date.now() + BINDING_TTL_MS;
    return { token, value };
  };

  const getBinding = (credential: ConnectionCredential, independent = false): BridgeBinding => {
    const binding = bindings.get(credential.bridgeId);
    if (!binding) throw httpError(401, "bridge_disconnected", "The browser bridge is no longer active; restart the launcher and use its new pairing file.");
    if (binding.rebinding && !independent) throw httpError(409, "bridge_rebinding", "The browser bridge is changing projects.");
    if (!independent && !sameProject(binding.projectIdentity, credential.projectIdentity)) throw httpError(409, "bridge_scope_changed", "The gateway credential belongs to a previous project scope.");
    return binding;
  };

  const requireOwnedSession = (
    credential: ConnectionCredential,
    sessionId: string,
    value?: unknown,
  ): { binding: BridgeBinding; ref: AgentSessionRef } => {
    const candidate = value === undefined ? bindings.get(credential.bridgeId)?.sessions.get(sessionId) : validateSessionRef(value);
    const binding = getBinding(credential, candidate?.surface !== "console");
    const ref = candidate;
    if (!ref || ref.sessionId !== sessionId || sessionMismatch(binding, ref)) {
      throw httpError(403, "session_binding_mismatch", "The session is outside this browser bridge's surface or project scope.");
    }
    const owned = binding.sessions.get(sessionId);
    if (!owned || !sameSessionRef(owned, ref)) {
      throw httpError(403, "session_not_owned", "This browser bridge does not own the requested Pi session.");
    }
    return { binding, ref };
  };

  const ownedApplicationDispatch = async (input: ApplicationDispatchInput): Promise<ApplicationResult> => {
    const command = input?.command as ApplicationCommand | undefined;
    const invalidResult = (code: string, message: string): ApplicationResult => ({
      ok: false,
      commandId: command?.commandId || "invalid",
      action: command?.action || "get_application_snapshot",
      error: { code, message, retryable: false },
    });
    if (!input || typeof input.bridgeId !== "string" || typeof input.sessionId !== "string" || !command) {
      return invalidResult("invalid_dispatch", "An application command needs a paired bridge, Console session and typed action.");
    }
    let binding: BridgeBinding | undefined;
    try {
      binding = bindings.get(validateBridgeId(input.bridgeId));
      const ref = binding?.sessions.get(input.sessionId);
      const workspace = ref?.surface === "workspace";
      if (!binding || binding.expiresAt <= Date.now() || !workspace && binding.rebinding) {
        return invalidResult("bridge_disconnected", "The paired browser bridge is expired or changing projects.");
      }
      if (!ref || (workspace ? ref.projectIdentity !== undefined : ref.surface !== "console" || !sameProject(ref.projectIdentity, binding.projectIdentity))) {
        return invalidResult("session_binding_mismatch", "Application actions require the Console session owned by this browser bridge and project.");
      }
      if (!sameProject(command.projectIdentity, workspace ? binding.bridgeId : binding.projectIdentity)) {
        return invalidResult("project_scope_mismatch", "The application command targets a different project than its paired browser bridge.");
      }
      const dispatchCurrentScope = (): Promise<ApplicationResult> => {
        const current = bindings.get(binding!.bridgeId);
        const ownedSession = current?.sessions.get(input.sessionId);
        if (!current || current.expiresAt <= Date.now() || !workspace && current.rebinding) {
          return Promise.resolve(invalidResult("bridge_disconnected", "The paired browser bridge is expired or changing projects."));
        }
        if (!ownedSession || (workspace
          ? ownedSession.surface !== "workspace" || ownedSession.projectIdentity !== undefined
          : ownedSession.surface !== "console" || !sameProject(ownedSession.projectIdentity, current.projectIdentity))) {
          return Promise.resolve(invalidResult("session_binding_mismatch", "The Console session no longer owns this application scope."));
        }
        if (!sameProject(command.projectIdentity, workspace ? current.bridgeId : current.projectIdentity)) {
          return Promise.resolve(invalidResult("project_scope_mismatch", "The application command targets a different project than its paired browser bridge."));
        }
        return (workspace ? workspaceBridge : applicationBridge).dispatch(input);
      };
      if (!MUTATING_APPLICATION_ACTIONS.has(command.action)) return await dispatchCurrentScope();
      const queueKey = JSON.stringify([binding.bridgeId, workspace ? "workspace" : binding.projectIdentity]);
      const previous = applicationMutationQueues.get(queueKey) ?? Promise.resolve();
      const operation = previous.then(dispatchCurrentScope, dispatchCurrentScope);
      const tail = operation.then(() => undefined, () => undefined);
      applicationMutationQueues.set(queueKey, tail);
      void tail.then(() => {
        if (applicationMutationQueues.get(queueKey) === tail) applicationMutationQueues.delete(queueKey);
      });
      return await operation;
    } catch (error) {
      return invalidResult(
        error instanceof ApplicationBridgeError ? error.code : "application_dispatch_failed",
        error instanceof Error ? error.message : "The application command could not be dispatched.",
      );
    }
  };

  const server = createServer((req, res) => {
    setCors(req, res, allowedOrigins);
    void (async () => {
      if (
        !isLoopbackAddress(req.socket.remoteAddress) ||
        req.headers.host !== host
      ) {
        throw httpError(403, "local_host_required", "The agent gateway accepts only its literal loopback host.");
      }
      const url = new URL(req.url ?? "/", `http://${host}`);
      if (url.search !== "" && !((req.method === "GET" || req.method === "OPTIONS") && url.pathname === "/models" &&
          [...url.searchParams.keys()].every(key => key === "harnessId"))) {
        throw httpError(400, "query_not_supported", "Only model catalog harness selection is accepted in query parameters.");
      }

      if (req.method === "OPTIONS") {
        requireOrigin(req, allowedOrigins);
        requireEmptyBody(req);
        res.writeHead(204, { "Cache-Control": "no-store" });
        res.end();
        return;
      }
      if (req.method === "GET" && url.pathname === "/health") {
        requireEmptyBody(req);
        const availability = adapter.getAvailability();
        sendJson(req, res, allowedOrigins, 200, {
          status: "ok",
          configured: availability.state === "ready",
          adapter: availability,
        });
        return;
      }

      requireOrigin(req, allowedOrigins);

      if (req.method === "POST" && url.pathname === "/pair") {
        const body = objectValue(await readJson(req));
        const suppliedToken = body.token;
        if (typeof suppliedToken !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(suppliedToken)) {
          throw httpError(401, "pair_token_invalid", "The one-use launcher pairing token is invalid or expired.");
        }
        const suppliedHash = Buffer.from(digest(suppliedToken), "hex");
        const expectedHash = Buffer.from(pairingHash, "hex");
        if (
          pairingUsed ||
          Date.now() >= pairingExpiresAt ||
          !timingSafeEqual(suppliedHash, expectedHash)
        ) {
          throw httpError(401, "pair_token_invalid", "The one-use launcher pairing token is invalid or expired.");
        }
        const bridgeId = validateBridgeId(body.bridgeId);
        const surface = validateSurface(body.surface);
        const projectIdentity = validateProjectIdentity(body.projectIdentity);
        let binding = bindings.get(bridgeId);
        if (binding && binding.expiresAt <= Date.now()) {
          bindings.delete(bridgeId);
          applicationBridge.forgetBridge(bridgeId);
          workspaceBridge.forgetBridge(bridgeId);
          for (const [key, credential] of credentials) {
            if (credential.bridgeId === bridgeId) credentials.delete(key);
          }
          await Promise.allSettled(
            [...binding.sessions.values()].map((ref) => adapter.disposeSession(ref)),
          );
          binding = undefined;
        }
        if (binding && (binding.surface !== surface || !sameProject(binding.projectIdentity, projectIdentity))) {
          throw httpError(409, "bridge_scope_conflict", "This browser bridge is already bound to a different surface or project.");
        }
        if (!binding) {
          binding = { bridgeId, surface, projectIdentity, sessions: new Map(), expiresAt: Date.now() + BINDING_TTL_MS, scopeRevision: 0 };
          bindings.set(bridgeId, binding);
        }
        pairingUsed = true;
        const bearer = randomToken();
        const expiresAt = Date.now() + CREDENTIAL_TTL_MS;
        credentials.set(digest(bearer), {
          bridgeId,
          surface,
          ...(projectIdentity === undefined ? {} : { projectIdentity }),
          expiresAt,
        });
        sendJson(req, res, allowedOrigins, 200, {
          credential: bearer,
          expiresAt: new Date(expiresAt).toISOString(),
          bridgeId,
          surface,
          ...(projectIdentity === undefined ? {} : { projectIdentity }),
          sessions: [...binding.sessions.values()],
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/pair/renew") {
        const { token, value } = getCredential(req);
        objectValue(await readJson(req));
        const binding = getBinding(value, true);
        credentials.delete(digest(token));
        const bearer = randomToken();
        const expiresAt = Date.now() + CREDENTIAL_TTL_MS;
        credentials.set(digest(bearer), { ...value, expiresAt });
        applicationBridge.refreshCredential(binding.bridgeId, expiresAt);
        workspaceBridge.refreshCredential(binding.bridgeId, expiresAt);
        binding.expiresAt = Date.now() + BINDING_TTL_MS;
        sendJson(req, res, allowedOrigins, 200, {
          credential: bearer,
          expiresAt: new Date(expiresAt).toISOString(),
          bridgeId: binding.bridgeId,
          surface: binding.surface,
          ...(binding.projectIdentity === undefined ? {} : { projectIdentity: binding.projectIdentity }),
          sessions: [...binding.sessions.values()],
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/pair/rebind") {
        const { token, value } = getCredential(req);
        const body = objectValue(await readJson(req));
        const projectIdentity = validateProjectIdentity(body.projectIdentity);
        const binding = getBinding(value);
        // Project switches invalidate Console sessions while independent Prompt Engineer sessions continue.
        applicationBridge.disconnectBridge(binding.bridgeId, "The browser bridge is changing projects; pending actions were not replayed.");
        binding.rebinding = true;
        binding.scopeRevision += 1;
        try {
          await Promise.all([...binding.sessions.values()].filter(ref => ref.surface === "console").map((ref) => adapter.disposeSession(ref)));
        } catch (error) {
          binding.rebinding = false;
          throw error;
        }
        for (const [id, ref] of binding.sessions) if (ref.surface === "console") binding.sessions.delete(id);
        binding.projectIdentity = projectIdentity;
        binding.expiresAt = Date.now() + BINDING_TTL_MS;
        const expiresAt = Date.now() + CREDENTIAL_TTL_MS;
        value.projectIdentity = projectIdentity;
        value.expiresAt = expiresAt;
        binding.rebinding = false;
        sendJson(req, res, allowedOrigins, 200, {
          credential: token,
          expiresAt: new Date(expiresAt).toISOString(),
          bridgeId: binding.bridgeId,
          surface: binding.surface,
          ...(projectIdentity === undefined ? {} : { projectIdentity }),
          sessions: [...binding.sessions.values()],
        });
        return;
      }

      const { token, value: credential } = getCredential(req);

      if (req.method === "POST" && url.pathname === "/workspace-bridge/commands") {
        const body = objectValue(await readJson(req));
        if (Object.keys(body).length) throw httpError(400, "invalid_command", "Workspace streams do not accept a Console project scope.");
        const binding = getBinding(credential, true);
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
        });
        res.flushHeaders();
        const connectionId = workspaceBridge.attach(binding.bridgeId, binding.bridgeId, credential.expiresAt, res);
        res.once("close", () => workspaceBridge.detach(binding.bridgeId, connectionId));
        return;
      }

      if (req.method === "POST" && url.pathname === "/workspace-bridge/results") {
        const body = objectValue(await readJson(req));
        const binding = getBinding(credential, true);
        if (typeof body.sessionId !== "string" || !body.result || body.projectIdentity !== undefined) {
          throw httpError(400, "invalid_result", "A workspace result requires its original session and result, without a Console project identity.");
        }
        const { ref } = requireOwnedSession(credential, body.sessionId);
        if (ref.surface !== "workspace") throw httpError(403, "session_binding_mismatch", "Only an owned workspace session can settle this command.");
        try {
          workspaceBridge.result(binding.bridgeId, binding.bridgeId, ref.sessionId, body.result);
        } catch (error) {
          if (error instanceof ApplicationBridgeError) throw httpError(409, error.code, error.message);
          throw error;
        }
        sendJson(req, res, allowedOrigins, 200, { received: true });
        return;
      }

      if (req.method === "POST" && url.pathname === "/application-bridge/commands") {
        const body = objectValue(await readJson(req));
        const binding = getBinding(credential);
        const projectIdentity = validateProjectIdentity(body.projectIdentity);
        if (!projectIdentity || !sameProject(projectIdentity, binding.projectIdentity)) {
          throw httpError(403, "bridge_scope_changed", "The application command stream must name this paired project's identity.");
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
        });
        res.flushHeaders();
        const connectionId = applicationBridge.attach(binding.bridgeId, projectIdentity, credential.expiresAt, res);
        const onClose = () => applicationBridge.detach(binding.bridgeId, connectionId);
        res.once("close", onClose);
        return;
      }

      if (req.method === "POST" && url.pathname === "/application-bridge/results") {
        const body = objectValue(await readJson(req));
        const binding = getBinding(credential);
        const projectIdentity = validateProjectIdentity(body.projectIdentity);
        if (!projectIdentity || !sameProject(projectIdentity, binding.projectIdentity)) {
          throw httpError(403, "bridge_scope_changed", "The application result is outside this paired project's scope.");
        }
        if (typeof body.sessionId !== "string" || !body.result) {
          throw httpError(400, "invalid_result", "An application result needs its original Console session and command result.");
        }
        const { ref } = requireOwnedSession(credential, body.sessionId);
        if (ref.surface !== "console") {
          throw httpError(403, "session_binding_mismatch", "Only a Console session can settle an application command.");
        }
        try {
          applicationBridge.result(binding.bridgeId, projectIdentity, ref.sessionId, body.result);
        } catch (error) {
          if (error instanceof ApplicationBridgeError) {
            throw httpError(409, error.code, error.message);
          }
          throw error;
        }
        sendJson(req, res, allowedOrigins, 200, { received: true });
        return;
      }

      if (url.pathname === "/harnesses/codex/login" && ["GET", "POST", "DELETE"].includes(req.method ?? "")) {
        const binding = getBinding(credential, true);
        if (!codexLogin) throw httpError(503, "harness_unavailable", "Codex harness is not configured.");
        if (req.method === "POST") {
          const body = objectValue(await readJson(req));
          if (Object.keys(body).length) throw httpError(400, "invalid_login_request", "Codex sign-in accepts no account or credential fields.");
          let disconnected = false;
          const onClose = () => { disconnected = true; };
          res.once("close", onClose);
          try {
            const login = await codexLogin.start(binding.bridgeId);
            if (disconnected || res.destroyed || credentials.get(digest(token)) !== credential ||
                credential.expiresAt <= Date.now() || bindings.get(binding.bridgeId) !== binding) {
              await codexLogin.cancel(binding.bridgeId);
              return;
            }
            sendJson(req, res, allowedOrigins, 200, login);
          } finally { res.off("close", onClose); }
        } else {
          requireEmptyBody(req);
          const login = req.method === "DELETE" ? await codexLogin.cancel(binding.bridgeId) : codexLogin.get(binding.bridgeId);
          sendJson(req, res, allowedOrigins, 200, login ?? { state: "idle" });
        }
        return;
      }

      if (req.method === "GET" && url.pathname === "/models") {
        requireEmptyBody(req);
        const harnessId = url.searchParams.get("harnessId") ?? "pi";
        if ((harnessId !== "pi" && harnessId !== "codex") || url.searchParams.getAll("harnessId").length > 1) {
          throw httpError(400, "unsupported_harness", "Select an available agent harness.");
        }
        sendJson(req, res, allowedOrigins, 200, {
          models: await adapter.listAvailableModels(harnessId),
          availability: adapter.getAvailability(harnessId),
        });
        return;
      }

      if (req.method === "POST" && url.pathname === "/sessions") {
        const body = objectValue(await readJson(req));
        const surface = validateSurface(body.surface);
        const binding = getBinding(credential, surface !== "console");
        const projectIdentity = validateProjectIdentity(body.projectIdentity);
        if (surface !== "console" ? projectIdentity !== undefined : !sameProject(projectIdentity, binding.projectIdentity)) {
          throw httpError(403, "session_binding_mismatch", "The session request is outside this browser bridge's surface or project scope.");
        }
        if (surface === "console" && (!projectIdentity || projectIdentity !== binding.projectIdentity)) {
          throw httpError(403, "console_project_required", "Console application tools require an explicitly paired Storyboard project.");
        }
        if (binding.sessions.size >= MAX_SESSIONS_PER_BRIDGE) {
          throw httpError(429, "session_limit", "This browser bridge has reached its active session limit.");
        }
        const selection = body.selection as AgentSelection;
        const scopeRevision = binding.scopeRevision;
        let clientDisconnected = false;
        const onClose = () => { clientDisconnected = true; };
        res.once("close", onClose);
        try {
          const session = await adapter.createSession({
            selection,
            surface,
            ...(projectIdentity === undefined ? {} : { projectIdentity }),
            reviewedContext: validateReviewedContext(body.reviewedContext),
            ...(surface === "console" ? { applicationScope: { bridgeId: binding.bridgeId, projectIdentity: binding.projectIdentity! } } : {}),
            ...(surface === "workspace" ? { applicationScope: { bridgeId: binding.bridgeId, projectIdentity: binding.bridgeId } } : {}),
          });
          if (clientDisconnected || res.destroyed) {
            await adapter.disposeSession(session);
            return;
          }
          if ((surface === "console" && (binding.rebinding || binding.scopeRevision !== scopeRevision)) || bindings.get(binding.bridgeId) !== binding) {
            await adapter.disposeSession(session);
            throw httpError(409, "bridge_scope_changed", "The project changed while the session was opening.");
          }
          binding.sessions.set(session.sessionId, session);
          sendJson(req, res, allowedOrigins, 201, {
            session,
            applicationToolsAvailable: adapter.getApplicationToolsAvailable(session),
          });
        } finally {
          res.off("close", onClose);
        }
        return;
      }

      if (req.method === "POST" && url.pathname === "/sessions/resume") {
        const body = objectValue(await readJson(req));
        const surface = validateSurface(body.surface);
        const binding = getBinding(credential, surface !== "console");
        const ref = validateSessionRef(body.session);
        const existing = binding.sessions.get(ref.sessionId);
        if ((surface === "workspace" || surface === "prompt-enhancement") && !existing) throw httpError(403, "session_not_owned", "This browser bridge does not own the session being resumed.");
        if (existing && !sameSessionRef(existing, ref)) {
          throw httpError(403, "session_binding_mismatch", "The stored session reference does not match this browser bridge.");
        }
        for (const other of bindings.values()) {
          if (other !== binding && other.sessions.has(ref.sessionId)) {
            throw httpError(409, "session_already_owned", "The session is already open in another browser bridge.");
          }
        }
        const projectIdentity = validateProjectIdentity(body.projectIdentity);
        if (
          (surface !== "console" ? projectIdentity !== undefined : !sameProject(projectIdentity, binding.projectIdentity)) ||
          surface !== ref.surface ||
          !sameProject(projectIdentity, ref.projectIdentity)
        ) {
          throw httpError(403, "session_binding_mismatch", "The resume request is outside this browser bridge's surface or project scope.");
        }
        if (surface === "console" && (!projectIdentity || projectIdentity !== binding.projectIdentity)) {
          throw httpError(403, "console_project_required", "Console application tools require an explicitly paired Storyboard project.");
        }
        if (!existing && binding.sessions.size >= MAX_SESSIONS_PER_BRIDGE) {
          throw httpError(429, "session_limit", "This browser bridge has reached its active session limit.");
        }
        const scopeRevision = binding.scopeRevision;
        let clientDisconnected = false;
        const onClose = () => { clientDisconnected = true; };
        res.once("close", onClose);
        try {
          const session = await adapter.resumeSession(
            body.selection as AgentSelection,
            ref,
            validateReviewedContext(body.reviewedContext),
            surface === "workspace" ? { bridgeId: binding.bridgeId, projectIdentity: binding.bridgeId }
              : surface === "console" ? { bridgeId: binding.bridgeId, projectIdentity: binding.projectIdentity! } : undefined,
          );
          if (clientDisconnected || res.destroyed) {
            await adapter.disposeSession(session);
            return;
          }
          if ((surface === "console" && (binding.rebinding || binding.scopeRevision !== scopeRevision)) || bindings.get(binding.bridgeId) !== binding) {
            await adapter.disposeSession(session);
            throw httpError(409, "bridge_scope_changed", "The project changed while the session was opening.");
          }
          binding.sessions.set(session.sessionId, session);
          sendJson(req, res, allowedOrigins, 200, {
            session,
            applicationToolsAvailable: adapter.getApplicationToolsAvailable(session),
          });
        } finally {
          res.off("close", onClose);
        }
        return;
      }

      const match = /^\/sessions\/([A-Za-z0-9._-]{1,128})\/(turn|abort)$/.exec(url.pathname);
      if (match && match[2] === "turn" && req.method === "POST") {
        const sessionId = match[1];
        const body = objectValue(await readJson(req));
        const { binding, ref } = requireOwnedSession(credential, sessionId, body.session);
        if (typeof body.text !== "string" || body.text.trim().length === 0 || Buffer.byteLength(body.text, "utf8") > MAX_TEXT_LENGTH) {
          throw httpError(400, "invalid_text", "Turn text must contain 1 to 65536 characters.");
        }
        const images = validateImages(body.images);
        if ((ref.surface === "prompt-engineer" || ref.surface === "prompt-enhancement") && images?.some(image => image.applicationMediaId !== undefined)) {
          throw httpError(403, "application_media_unavailable", "Application media references require an application-tool session.");
        }
        res.writeHead(200, {
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-store, no-transform",
          Connection: "keep-alive",
          "X-Content-Type-Options": "nosniff",
        });
        res.flushHeaders();
        let settled: { aborted: boolean; stopReason?: string; truncated?: boolean } | undefined;
        let turnDone = false;
        const onClose = () => {
          if (!turnDone && !res.writableEnded) {
            applicationBridge.cancelSession(binding.bridgeId, ref.sessionId);
            workspaceBridge.cancelSession(binding.bridgeId, ref.sessionId);
            void adapter.abort(ref).catch(() => undefined);
          }
        };
        res.once("close", onClose);
        try {
          await adapter.prompt(ref, body.text, {
            images,
            onEvent: (event) => {
              if (event.type === "text_delta") writeSse(res, "text_delta", { delta: event.delta });
              else if (event.type === "agent_activity") {
                writeSse(res, "agent_activity", {
                  activityType: event.activityType,
                  ...(event.delta === undefined ? {} : { delta: event.delta }),
                  ...(event.toolCallId === undefined ? {} : { toolCallId: event.toolCallId }),
                  ...(event.toolName === undefined ? {} : { toolName: event.toolName }),
                  ...(event.summary === undefined ? {} : { summary: event.summary }),
                  ...(event.isError === undefined ? {} : { isError: event.isError }),
                });
              } else {
                settled = {
                  aborted: event.aborted,
                  ...(event.stopReason ? { stopReason: event.stopReason } : {}),
                  ...(event.truncated === undefined ? {} : { truncated: event.truncated }),
                };
              }
            },
          });
          if (!settled) throw httpError(502, "turn_not_settled", "Pi completed without a final settlement event.");
          writeSse(res, "turn_settled", settled);
        } catch (error) {
          writeSse(res, "failure", { error: piErrorEvent(error) });
        } finally {
          turnDone = true;
          res.off("close", onClose);
          if (!res.writableEnded) res.end();
        }
        return;
      }

      if (match && match[2] === "abort" && req.method === "POST") {
        requireEmptyBody(req);
        const { binding, ref } = requireOwnedSession(credential, match[1]);
        applicationBridge.cancelSession(binding.bridgeId, ref.sessionId);
        workspaceBridge.cancelSession(binding.bridgeId, ref.sessionId);
        await adapter.abort(ref);
        sendJson(req, res, allowedOrigins, 200, { aborted: true });
        return;
      }

      const deleteMatch = /^\/sessions\/([A-Za-z0-9._-]{1,128})$/.exec(url.pathname);
      if (deleteMatch && req.method === "DELETE") {
        requireEmptyBody(req);
        const { binding, ref } = requireOwnedSession(credential, deleteMatch[1]);
        binding.sessions.delete(ref.sessionId);
        applicationBridge.cancelSession(binding.bridgeId, ref.sessionId);
        workspaceBridge.cancelSession(binding.bridgeId, ref.sessionId);
        await adapter.disposeSession(ref);
        sendJson(req, res, allowedOrigins, 200, { deleted: true });
        return;
      }

      throw httpError(404, "route_not_found", "The agent gateway route was not found.");
    })().catch((error: unknown) => {
      req.resume();
      if (res.headersSent) {
        if (!res.writableEnded) res.end();
        return;
      }
      sendError(req, res, allowedOrigins, error);
    });
  });

  server.on("upgrade", (_req, socket) => {
    socket.end("HTTP/1.1 426 Upgrade Required\r\nConnection: close\r\nContent-Length: 0\r\n\r\n");
  });
  server.requestTimeout = 30_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;

  await new Promise<void>((resolveListen, rejectListen) => {
    const onError = (error: Error) => rejectListen(error);
    server.once("error", onError);
    server.listen(options.port, options.host, () => {
      server.off("error", onError);
      resolveListen();
    });
  });
  activeApplicationDispatch = ownedApplicationDispatch;
  const bindingCleanupTimer = setInterval(() => void reapExpiredBindings(), 60_000);
  bindingCleanupTimer.unref();

  let closing: Promise<void> | undefined;
  return () => {
    if (closing) return closing;
    closing = (async () => {
      clearInterval(bindingCleanupTimer);
      if (activeApplicationDispatch === ownedApplicationDispatch) activeApplicationDispatch = undefined;
      for (const bridgeId of bindings.keys()) {
        applicationBridge.disconnectBridge(bridgeId, "The agent gateway is shutting down.");
        workspaceBridge.disconnectBridge(bridgeId, "The agent gateway is shutting down.");
      }
      const closed = new Promise<void>((resolveClose) => server.close(() => resolveClose()));
      server.closeAllConnections();
      await Promise.allSettled([closed, adapter.dispose(), codexLogin?.dispose()]);
    })();
    return closing;
  };
}

function parseArgs(args: readonly string[]): GatewayOptions {
  const values = new Map<string, string[]>();
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!name.startsWith("--") || index + 1 >= args.length) {
      throw new Error("The agent gateway command line is invalid.");
    }
    const value = args[++index];
    const list = values.get(name) ?? [];
    list.push(value);
    values.set(name, list);
  }
  const one = (name: string): string => {
    const list = values.get(name);
    if (!list || list.length !== 1) throw new Error(`The agent gateway needs one ${name} value.`);
    return list[0];
  };
  const host = one("--host");
  if (host !== "127.0.0.1" && host !== "::1") throw new Error("The agent gateway host must be loopback.");
  const port = Number(one("--port"));
  const origins = values.get("--origin") ?? [];
  if (values.size !== 4 || !Number.isInteger(port)) throw new Error("The agent gateway command line is invalid.");
  return {
    host,
    port,
    allowedOrigins: origins,
    bootstrapFile: one("--bootstrap-file"),
    ...(process.env.DC_CODEX_EXECUTABLE && process.env.DC_CODEX_HOME ? {
      codex: {
        executable: process.env.DC_CODEX_EXECUTABLE,
        codexHome: process.env.DC_CODEX_HOME,
        metadataCwd: join(process.env.DC_CODEX_HOME, "workspaces", "catalog"),
      },
    } : {}),
  };
}

async function main(): Promise<void> {
  try {
    const stop = await startAgentGateway(parseArgs(process.argv.slice(2)));
    console.log("Agent gateway is listening on loopback.");
    let stopping = false;
    const shutdown = () => {
      if (stopping) return;
      stopping = true;
      void stop().finally(() => process.exit(0));
    };
    process.once("SIGINT", shutdown);
    process.once("SIGTERM", shutdown);
  } catch {
    console.error("Agent gateway could not start. Check its Node version, private launcher bootstrap, dependencies, and configured port.");
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  void main();
}
