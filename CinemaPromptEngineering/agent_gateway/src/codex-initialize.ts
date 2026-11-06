import type { CodexRpc } from "./codex-rpc.js";
import type { buildCodexStartupPolicy } from "./codex-policy.js";
import { decodeCodexAccountState, decodeCodexModelPage, type CodexCatalogModel } from "./codex-catalog.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

type InitializeResult = {
  state: "ready" | "unconfigured" | "unavailable";
  models: CodexCatalogModel[];
  message: string;
};

function unavailable(): InitializeResult {
  return { state: "unavailable", models: [], message: "Codex startup could not be verified." };
}

export async function initializeCodexHost(
  rpc: CodexRpc,
  policy: ReturnType<typeof buildCodexStartupPolicy>,
  signal?: AbortSignal,
): Promise<InitializeResult> {
  try {
    await rpc.request("initialize", {
      clientInfo: { name: "directors_console", title: "Director Console", version: "0.1.0" },
      capabilities: { experimentalApi: true },
    }, signal);
    rpc.notify("initialized");

    const rawConfig = await rpc.request("config/read", { includeLayers: false }, signal);
    if (!isRecord(rawConfig) || !isRecord(rawConfig.config)) return unavailable();
    const config = rawConfig.config;
    if (config.model_provider !== "openai" || config.default_permissions !== policy.permissions ||
        config.web_search !== "disabled" || config.project_doc_max_bytes !== 0) return unavailable();

    for (const entry of policy.config) {
      const feature = /^features\.([A-Za-z0-9_]+)=false$/.exec(entry);
      if (feature && (!isRecord(config.features) || config.features[feature[1]] !== false)) return unavailable();
    }

    const apps = config.apps;
    const plugins = config.plugins;
    if (!isRecord(apps) || !isRecord(apps._default) || apps._default.enabled !== false ||
        !isRecord(plugins) || !isRecord(plugins._default) || plugins._default.enabled !== false) return unavailable();

    const servers = config.mcp_servers;
    if (servers !== undefined && servers !== null &&
        (!isRecord(servers) || !Object.values(servers).every((server) => isRecord(server) && server.enabled === false)))
      return unavailable();

    const scopes = config.permissions;
    const permissions = isRecord(scopes) ? scopes[policy.permissions] : undefined;
    const filesystem = isRecord(permissions) ? permissions.filesystem : undefined;
    const network = isRecord(permissions) ? permissions.network : undefined;
    if (!isRecord(filesystem) || Object.keys(filesystem).some(key => !["/", ":minimal", policy.cwd, "glob_scan_max_depth"].includes(key)) ||
        (filesystem.glob_scan_max_depth !== undefined && filesystem.glob_scan_max_depth !== null) || filesystem["/"] !== "deny" ||
        filesystem[":minimal"] !== "read" || filesystem[policy.cwd] !== "read" ||
        !isRecord(network) || network.enabled !== false ||
        (isRecord(permissions) && permissions.extends !== undefined && permissions.extends !== null)) return unavailable();

    const account = decodeCodexAccountState(await rpc.request("account/read", { refreshToken: false }, signal));
    if (account.accountType === null) {
      return account.requiresOpenaiAuth
        ? { state: "unconfigured", models: [], message: "Sign in to the Codex app harness." }
        : unavailable();
    }
    if (account.accountType !== "apiKey" && account.accountType !== "chatgpt") return unavailable();

    const models: CodexCatalogModel[] = [];
    const seenModels = new Set<string>();
    const seenCursors = new Set<string>();
    let cursor: string | undefined;
    for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
      const params = { limit: 100, includeHidden: false, ...(cursor === undefined ? {} : { cursor }) };
      const page = decodeCodexModelPage(await rpc.request("model/list", params, signal), "openai");
      if (models.length + page.models.length > 500) return unavailable();
      for (const model of page.models) {
        const key = `${model.provider}\0${model.modelId}`;
        if (seenModels.has(key)) return unavailable();
        seenModels.add(key);
      }
      models.push(...page.models);
      if (page.nextCursor === null) {
        return {
          state: "ready",
          models: models.filter((model) => !model.hidden),
          message: "Signed in to Codex; catalog loaded. Model access is not verified.",
        };
      }
      if (seenCursors.has(page.nextCursor) || pageNumber === 9) return unavailable();
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
    return unavailable();
  } catch {
    return signal?.aborted
      ? { state: "unavailable", models: [], message: "Codex initialization cancelled." }
      : unavailable();
  }
}
