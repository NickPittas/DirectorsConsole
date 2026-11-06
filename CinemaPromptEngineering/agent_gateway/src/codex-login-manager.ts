import { EventEmitter } from "node:events";
import { openCodexHost, CodexHostCleanupError } from "./codex-host.js";
import { beginCodexLogin } from "./codex-login.js";

export type LoginSnapshot = {
  state: "starting" | "awaiting_login" | "success" | "failed" | "cancelled";
  authUrl?: string;
};

type Host = Awaited<ReturnType<typeof openCodexHost>>;
type Login = Awaited<ReturnType<typeof beginCodexLogin>>;
type RecordState = {
  owner: string;
  snapshot: LoginSnapshot;
  controller: AbortController;
  events: EventEmitter;
  host?: Host;
  login?: Login;
  startup?: Promise<LoginSnapshot>;
  settlement?: Promise<LoginSnapshot>;
  cleanupFailed?: boolean;
  retryCleanup?: () => Promise<void>;
  tearingDown?: boolean;
};

const INVALID_OWNER = "Invalid sign-in owner.";
const BUSY = "Codex sign-in is busy.";

function validateOwner(owner: string): void {
  if (typeof owner !== "string" || !/^[A-Za-z0-9_-]{43}$/.test(owner)) throw new Error(INVALID_OWNER);
}

function detached(snapshot: LoginSnapshot): LoginSnapshot {
  return snapshot.authUrl === undefined ? { state: snapshot.state } : { state: snapshot.state, authUrl: snapshot.authUrl };
}

function terminal(state: LoginSnapshot["state"]): boolean {
  return state === "success" || state === "failed" || state === "cancelled";
}

export function createCodexLoginManager(options: {
  executable: string;
  codexHome: string;
  metadataCwd: string;
}): {
  start(ownerBridgeId: string): Promise<LoginSnapshot>;
  get(ownerBridgeId: string): LoginSnapshot | null;
  cancel(ownerBridgeId: string): Promise<LoginSnapshot | null>;
  dispose(): Promise<void>;
} {
  let current: RecordState | undefined;
  let disposed = false;
  let disposal: Promise<void> | undefined;

  function publish(record: RecordState, state: LoginSnapshot["state"], authUrl?: string): LoginSnapshot {
    if (current !== record) return detached(record.snapshot);
    record.snapshot = state === "awaiting_login" && authUrl !== undefined ? { state, authUrl } : { state };
    if (terminal(state)) record.events.removeAllListeners();
    return detached(record.snapshot);
  }

  async function disposeHost(record: RecordState): Promise<boolean> {
    try {
      if (record.retryCleanup) await record.retryCleanup();
      if (record.host) await record.host.rpc.dispose();
      record.retryCleanup = undefined;
      record.cleanupFailed = false;
      return true;
    } catch { record.cleanupFailed = true; return false; }
  }

  function settleLogin(record: RecordState, login: Login): Promise<LoginSnapshot> {
    record.settlement = (async () => {
      let result: "success" | "failed" | "cancelled";
      try { result = await login.completed; } catch { result = "failed"; }
      record.tearingDown = true;
      publish(record, result);
      const cleaned = await disposeHost(record);
      if (!cleaned) result = "failed";
      else if (record.controller.signal.aborted || disposed) result = "cancelled";
      record.tearingDown = false;
      return publish(record, result);
    })();
    return record.settlement;
  }

  async function runStart(record: RecordState): Promise<LoginSnapshot> {
    try {
      record.host = await openCodexHost({
        executable: options.executable,
        codexHome: options.codexHome,
        cwd: options.metadataCwd,
        signal: record.controller.signal,
        onNotification: (method, params) => record.events.emit("notification", method, params),
        onToolRequest: (id) => {
          if (!record.host) throw new Error("Codex host unavailable.");
          record.host.rpc.respond(id, { contentItems: [], success: false });
        },
      });
      if (record.controller.signal.aborted || disposed) {
        return publish(record, await disposeHost(record) ? "cancelled" : "failed");
      }
      if (record.host.initialization.state === "ready") {
        const cleaned = await disposeHost(record);
        return publish(record, !cleaned ? "failed" : record.controller.signal.aborted || disposed ? "cancelled" : "success");
      }

      const login = await beginCodexLogin({ rpc: record.host.rpc, events: record.events, signal: record.controller.signal });
      record.login = login;
      const settlement = settleLogin(record, login);
      if (login.status() !== undefined) return await settlement;
      if (record.controller.signal.aborted || disposed) {
        try { await login.cancel(); } catch { /* Completion reports cancellation failure. */ }
        return await settlement;
      }
      record.snapshot = { state: "awaiting_login", authUrl: login.authUrl };
      return detached(record.snapshot);
    } catch (error) {
      if (error instanceof CodexHostCleanupError) record.retryCleanup = error.retryCleanup;
      const cleaned = await disposeHost(record);
      return publish(record, cleaned && !record.host && (record.controller.signal.aborted || disposed) ? "cancelled" : "failed");
    }
  }

  return {
    start(ownerBridgeId) {
      validateOwner(ownerBridgeId);
      if (disposed) return Promise.reject(new Error(BUSY));
      if (current?.tearingDown || current?.cleanupFailed) return Promise.reject(new Error(BUSY));
      if (current && !terminal(current.snapshot.state)) {
        if (current.owner !== ownerBridgeId) return Promise.reject(new Error(BUSY));
        return current.snapshot.state === "starting" ? current.startup! : Promise.resolve(detached(current.snapshot));
      }
      const record: RecordState = {
        owner: ownerBridgeId,
        snapshot: { state: "starting" },
        controller: new AbortController(),
        events: new EventEmitter(),
      };
      current = record;
      record.startup = runStart(record);
      return record.startup;
    },
    get(ownerBridgeId) {
      validateOwner(ownerBridgeId);
      return current?.owner === ownerBridgeId ? detached(current.snapshot) : null;
    },
    async cancel(ownerBridgeId) {
      validateOwner(ownerBridgeId);
      const record = current;
      if (!record || record.owner !== ownerBridgeId) return null;
      if (record.cleanupFailed) {
        await disposeHost(record);
        return publish(record, "failed");
      }
      if (!terminal(record.snapshot.state) || record.tearingDown) {
        record.tearingDown = true;
        publish(record, "cancelled");
        record.controller.abort();
        if (record.login) {
          try { await record.login.cancel(); } catch { /* Settlement reports failure. */ }
        }
        await record.startup;
        await record.settlement;
        record.tearingDown = false;
      }
      return current === record ? detached(record.snapshot) : null;
    },
    dispose() {
      if (disposal) return disposal;
      disposed = true;
      const record = current;
      if (record && (!terminal(record.snapshot.state) || record.tearingDown)) {
        record.tearingDown = true;
        publish(record, "cancelled");
        record.controller.abort();
      }
      disposal = (async () => {
        if (!record) return;
        if (record.login) {
          try { await record.login.cancel(); } catch { /* Settlement reports failure. */ }
        }
        await record.startup;
        await record.settlement;
        await disposeHost(record);
        record.tearingDown = false;
        if (record.cleanupFailed) throw new Error("Codex sign-in cleanup failed.");
      })();
      return disposal;
    },
  };
}
