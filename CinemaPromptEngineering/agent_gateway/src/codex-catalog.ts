export interface CodexCatalogModel {
  provider: string;
  catalogId: string;
  modelId: string;
  name: string;
  reasoningEfforts: string[];
  defaultReasoningEffort: string;
  inputModalities: string[];
  hidden: boolean;
  isDefault: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function field(record: Record<string, unknown>, key: string): unknown {
  if (!Object.hasOwn(record, key)) throw new Error();
  return record[key];
}

function validLabel(value: unknown): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= 256 &&
    value.trim().length > 0 && value.trim() === value && !value.includes("\0");
}

function validEffort(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(value);
}

export function decodeCodexModelPage(
  value: unknown,
  provider: string,
): { models: CodexCatalogModel[]; nextCursor: string | null } {
  try {
    if (!validLabel(provider) || !isRecord(value)) throw new Error();
    const data = field(value, "data");
    const cursor = field(value, "nextCursor");
    if (!Array.isArray(data) || data.length > 200 ||
        !(cursor === null || (typeof cursor === "string" && cursor.length >= 1 && cursor.length <= 2048 && !cursor.includes("\0")))) throw new Error();

    const seen = new Set<string>();
    const models = data.map((item): CodexCatalogModel => {
      if (!isRecord(item)) throw new Error();
      const id = field(item, "id");
      const model = field(item, "model");
      const name = field(item, "displayName");
      const efforts = field(item, "supportedReasoningEfforts");
      const defaultEffort = field(item, "defaultReasoningEffort");
      const modalities = field(item, "inputModalities");
      const hidden = field(item, "hidden");
      const isDefault = field(item, "isDefault");
      if (!validLabel(id) || !validLabel(model) || !validLabel(name) ||
          !Array.isArray(efforts) || efforts.length > 32 || !validEffort(defaultEffort) ||
          !Array.isArray(modalities) || modalities.length > 16 ||
          typeof hidden !== "boolean" || typeof isDefault !== "boolean") throw new Error();

      const reasoningEfforts = efforts.map((option) => {
        if (!isRecord(option)) throw new Error();
        const effort = field(option, "reasoningEffort");
        if (!validEffort(effort)) throw new Error();
        return effort;
      });
      if (new Set(reasoningEfforts).size !== reasoningEfforts.length) throw new Error();
      const inputModalities = modalities.map((modality) => {
        if (typeof modality !== "string" || modality.trim().length === 0 || modality !== modality.trim()
          || modality.length > 32 || modality.includes("\0")) throw new Error();
        return modality;
      });
      if (new Set(inputModalities).size !== inputModalities.length) throw new Error();

      const duplicateKey = `${provider}\0${model}`;
      if (seen.has(duplicateKey)) throw new Error();
      seen.add(duplicateKey);
      return {
        provider, catalogId: id, modelId: model, name,
        reasoningEfforts, defaultReasoningEffort: defaultEffort,
        inputModalities, hidden, isDefault,
      };
    });
    return { models, nextCursor: cursor };
  } catch {
    throw new Error("Codex returned an invalid catalog.");
  }
}

export function decodeCodexAccountState(value: unknown): {
  accountType: "apiKey" | "chatgpt" | "amazonBedrock" | "gcp" | null;
  requiresOpenaiAuth: boolean;
} {
  try {
    if (!isRecord(value)) throw new Error();
    const account = field(value, "account");
    const requiresOpenaiAuth = field(value, "requiresOpenaiAuth");
    if (typeof requiresOpenaiAuth !== "boolean") throw new Error();
    if (account === null) return { accountType: null, requiresOpenaiAuth };
    if (!isRecord(account)) throw new Error();
    const type = field(account, "type");
    if (type !== "apiKey" && type !== "chatgpt" && type !== "amazonBedrock" && type !== "gcp") throw new Error();
    return { accountType: type, requiresOpenaiAuth };
  } catch {
    throw new Error("Codex returned an invalid account state.");
  }
}
