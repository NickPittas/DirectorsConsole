type Binding = {
  nodeId: string;
  inputName: string;
  sourceFilename: string;
  advertisedFilename: string;
};

const TARGETS = [
  { classType: "UNETLoader", inputName: "unet_name", sourceFilename: "flux-2-klein-4b.safetensors" },
  { classType: "CLIPLoader", inputName: "clip_name", sourceFilename: "qwen_3_4b.safetensors" },
  { classType: "VAELoader", inputName: "vae_name", sourceFilename: "flux2-vae.safetensors" },
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function getBasename(path: string): string | null {
  if (path.includes("\0")) return null;
  const segments = path.replace(/\\/g, "/").split("/");
  if (segments.some((segment) => segment === "." || segment === "..")) return null;
  const basename = segments[segments.length - 1];
  return basename ? basename : null;
}

function getAdvertisedFilename(
  objectInfo: Record<string, unknown>,
  classType: string,
  inputName: string,
  sourceFilename: string,
): string | null {
  const classInfo = objectInfo[classType];
  if (!isRecord(classInfo) || !isRecord(classInfo.input) || !isRecord(classInfo.input.required)) return null;

  const schema = classInfo.input.required[inputName];
  if (!Array.isArray(schema)) return null;

  let options: unknown;
  if (schema[0] === "COMBO") {
    if (!isRecord(schema[1])) return null;
    options = schema[1].options;
  } else {
    options = schema[0];
  }
  if (!Array.isArray(options) || options.length === 0) return null;

  const matches: string[] = [];
  for (let index = 0; index < options.length; index += 1) {
    const option = options[index];
    if (typeof option !== "string") return null;
    const basename = getBasename(option);
    if (basename === null) return null;
    if (basename === sourceFilename) matches.push(option);
  }
  return matches.length === 1 ? matches[0] : null;
}

function failed(): { ok: false; reason: string } {
  return { ok: false, reason: "Unable to bind recipe loader paths." };
}

type LoaderPathBindingResult =
  | {
      ok: true;
      workflow: Record<string, unknown>;
      bindings: Binding[];
      identityVerification: "not_verified";
    }
  | { ok: false; reason: string };

export function bindExactLoaderPaths(
  workflow: Record<string, unknown>,
  objectInfo: Record<string, unknown>,
  targets: readonly { classType: string; inputName: string; sourceFilename: string }[],
): LoaderPathBindingResult {
  try {
    if (!isRecord(workflow) || !isRecord(objectInfo) || targets.length === 0) return failed();

    const targetSources = new Set<string>();
    for (const target of targets) {
      const key = JSON.stringify([target.classType, target.inputName, target.sourceFilename]);
      if (targetSources.has(key)) return failed();
      targetSources.add(key);
    }

    const entries = Object.entries(workflow);
    const bindings: Binding[] = [];
    const boundNodeIds = new Set<string>();
    for (const target of targets) {
      const expectedCount = targets.filter((candidate) => candidate.classType === target.classType).length;
      const occurrences = entries.filter(([, node]) => isRecord(node) && node.class_type === target.classType);
      if (occurrences.length !== expectedCount) return failed();

      const matches = occurrences.filter(([, node]) =>
        isRecord(node) && isRecord(node.inputs) && node.inputs[target.inputName] === target.sourceFilename,
      );
      if (matches.length !== 1) return failed();
      const [nodeId] = matches[0];
      if (boundNodeIds.has(nodeId)) return failed();
      boundNodeIds.add(nodeId);

      const advertisedFilename = getAdvertisedFilename(
        objectInfo,
        target.classType,
        target.inputName,
        target.sourceFilename,
      );
      if (advertisedFilename === null) return failed();
      bindings.push({ nodeId, inputName: target.inputName, sourceFilename: target.sourceFilename, advertisedFilename });
    }

    const boundWorkflow = structuredClone(workflow);
    for (const binding of bindings) {
      const node = boundWorkflow[binding.nodeId];
      if (!isRecord(node) || !isRecord(node.inputs)) return failed();
      node.inputs[binding.inputName] = binding.advertisedFilename;
    }
    return { ok: true, workflow: boundWorkflow, bindings, identityVerification: "not_verified" };
  } catch {
    return failed();
  }
}

export function bindKleinLoaderPaths(
  workflow: Record<string, unknown>,
  objectInfo: Record<string, unknown>,
): LoaderPathBindingResult {
  return bindExactLoaderPaths(workflow, objectInfo, TARGETS);
}
