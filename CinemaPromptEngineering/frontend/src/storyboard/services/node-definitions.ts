/** Runtime ComfyUI /object_info schema access. */

export type SchemaScalar = string | number | boolean | null;
export type RawInputSpec =
  | string
  | string[]
  | [string | string[] | Record<string, unknown>, Record<string, any>?]
  | Record<string, any>;

export interface NodeInputDefinition {
  type: string | string[];
  name?: string;
  optional?: boolean;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  [key: string]: any;
}

export interface NodeOutputDefinition {
  type: string;
  name: string;
}

export interface NodeDefinition {
  name?: string;
  display_name?: string;
  description?: string;
  category?: string;
  input?: {
    required?: Record<string, RawInputSpec | NodeInputDefinition>;
    optional?: Record<string, RawInputSpec | NodeInputDefinition>;
    hidden?: Record<string, any>;
  };
  // A few custom servers use the plural spelling. Keep it readable without
  // pretending that it is a different schema.
  inputs?: NodeDefinition['input'];
  output?: string[];
  output_name?: string[];
  output_is_list?: boolean[];
  output_node?: boolean;
  [key: string]: any;
}

export interface ObjectInfo {
  [nodeType: string]: NodeDefinition;
}

export interface RemoteInputDescriptor {
  route: string;
  refresh_button?: boolean;
  control_after_refresh?: string;
  timeout?: number;
  max_retries?: number;
  refresh?: number;
  [key: string]: unknown;
}

export type SchemaAvailability = 'available' | 'remote' | 'unsupported';

export interface NormalizedInputDefinition {
  type: string;
  isEnum: boolean;
  options?: unknown[];
  default?: unknown;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  remote?: RemoteInputDescriptor;
  availability: SchemaAvailability;
  raw: unknown;
  config: Record<string, any>;
  dynamic?: Record<string, any>;
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : {};
}

function inputSpecParts(inputDef: unknown): { typeOrOptions: unknown; config: Record<string, any> } {
  if (Array.isArray(inputDef)) {
    return { typeOrOptions: inputDef[0], config: asRecord(inputDef[1]) };
  }
  if (typeof inputDef === 'string' || Array.isArray(inputDef)) {
    return { typeOrOptions: inputDef, config: {} };
  }
  const record = asRecord(inputDef);
  return {
    typeOrOptions: record.type ?? record.io_type ?? record.input_type ?? '*',
    config: record,
  };
}

const SUPPORTED_TYPES = new Set([
  'STRING', 'INT', 'FLOAT', 'BOOLEAN', 'COMBO', 'IMAGE', 'MASK', 'LATENT',
  'CONDITIONING', 'MODEL', 'CLIP', 'VAE', 'CONTROL_NET', 'SAMPLER', 'SIGMAS',
  'NOISE', 'SIGMA', 'ANY', '*', 'NUMBER', 'PRIMITIVE',
  'COMFY_DYNAMICCOMBO_V3', 'COMFY_AUTOGROW_V3', 'COMFY_DYNAMICSLOT_V3',
  'COMFY_MULTITYPED_V3', 'COMFY_MATCHTYPE_V3',
]);

/** Normalize both legacy combo arrays and the modern ['COMBO', {options}] form. */
export function normalizeInputDefinition(inputDef: unknown): NormalizedInputDefinition {
  const { typeOrOptions, config } = inputSpecParts(inputDef);
  const isLegacyEnum = Array.isArray(typeOrOptions) &&
    (typeOrOptions.length === 0 || typeOrOptions.every(value => ['string', 'number', 'boolean'].includes(typeof value) || value === null));
  const modernOptions = typeOrOptions === 'COMBO' && Array.isArray(config.options)
    ? config.options
    : undefined;
  const declaredType = String(typeOrOptions || '*').toUpperCase();
  const dynamicOptions = declaredType === 'COMFY_DYNAMICCOMBO_V3' && Array.isArray(config.options)
    ? config.options.map((option: any) => option && typeof option === 'object' ? option.key : option)
    : undefined;
  const options = isLegacyEnum ? [...typeOrOptions as unknown[]] : (modernOptions || dynamicOptions);
  const type = options ? 'COMBO' : declaredType;
  const remote = config.remote && typeof config.remote === 'object'
    ? config.remote as RemoteInputDescriptor
    : undefined;
  const availability: SchemaAvailability = remote
    ? 'remote'
    : SUPPORTED_TYPES.has(type)
      ? 'available'
      : 'unsupported';

  return {
    type,
    isEnum: Boolean(options) || type === 'COMBO',
    ...(options ? { options } : {}),
    default: config.default,
    min: typeof config.min === 'number' ? config.min : undefined,
    max: typeof config.max === 'number' ? config.max : undefined,
    step: typeof config.step === 'number' ? config.step : undefined,
    tooltip: typeof config.tooltip === 'string' ? config.tooltip : undefined,
    remote,
    availability,
    raw: inputDef,
    config,
    dynamic: config.options || config.template || config.names ? config : undefined,
  };
}

function normalizeUrl(url: string): string {
  return url.replace(/\/ws$/, '').replace(/\/+$/, '');
}

/** Return a schema input from either V1 input or a custom server's plural alias. */
export function getNodeInputSpec(node: NodeDefinition | null | undefined, name: string): unknown {
  const groups = node?.input || node?.inputs;
  return groups?.required?.[name] ?? groups?.optional?.[name];
}

export function getNodeInputSpecs(node: NodeDefinition | null | undefined): Array<[string, unknown, boolean]> {
  const groups = node?.input || node?.inputs;
  if (!groups) return [];
  return [
    ...Object.entries(groups.required || {}).map(([name, spec]) => [name, spec, true] as [string, unknown, boolean]),
    ...Object.entries(groups.optional || {}).map(([name, spec]) => [name, spec, false] as [string, unknown, boolean]),
  ];
}

class ComfyUINodeDefinitions {
  private cache = new Map<string, { definitions: ObjectInfo; timestamp: number }>();
  private requests = new Map<string, Promise<ObjectInfo>>();
  private cacheTTL = 5 * 60 * 1000;

  async fetchDefinitions(comfyUrl: string): Promise<ObjectInfo> {
    const url = normalizeUrl(comfyUrl);
    const cached = this.cache.get(url);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) return cached.definitions;
    const existing = this.requests.get(url);
    if (existing) return existing;
    const request = this._doFetch(url);
    this.requests.set(url, request);
    try {
      const definitions = await request;
      this.cache.set(url, { definitions, timestamp: Date.now() });
      return definitions;
    } finally {
      if (this.requests.get(url) === request) this.requests.delete(url);
    }
  }

  private async _doFetch(baseUrl: string): Promise<ObjectInfo> {
    const response = await fetch(`${baseUrl}/object_info`);
    if (!response.ok) throw new Error(`Failed to fetch object_info: ${response.statusText || response.status}`);
    const data = await response.json() as ObjectInfo;
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('ComfyUI object_info was not an object');
    return data;
  }

  getDefinitions(comfyUrl: string): ObjectInfo | null {
    return this.cache.get(normalizeUrl(comfyUrl))?.definitions || null;
  }

  getNodeDefinition(nodeType: string, comfyUrl: string): NodeDefinition | null {
    return this.getDefinitions(comfyUrl)?.[nodeType] || null;
  }

  getEnumOptions(nodeType: string, inputName: string, comfyUrl: string): unknown[] | null {
    const definition = this.getInputDefinition(nodeType, inputName, comfyUrl);
    return definition?.isEnum && definition.options ? definition.options : null;
  }

  getInputDefinition(nodeType: string, inputName: string, comfyUrl: string): NormalizedInputDefinition | null {
    const node = this.getNodeDefinition(nodeType, comfyUrl);
    const raw = getNodeInputSpec(node, inputName);
    return raw === undefined ? null : normalizeInputDefinition(raw);
  }

  isLoaded(comfyUrl?: string): boolean {
    return comfyUrl ? this.cache.has(normalizeUrl(comfyUrl)) : this.cache.size > 0;
  }

  async getLoras(comfyUrl: string): Promise<string[]> {
    await this.fetchDefinitions(comfyUrl);
    const options = this.getEnumOptions('LoraLoader', 'lora_name', comfyUrl) || [];
    return options.filter((option): option is string => typeof option === 'string');
  }

  /** Fetch a declared remote COMBO source from the selected managed node only. */
  async fetchRemoteOptions(
    comfyUrl: string,
    nodeType: string,
    inputName: string,
  ): Promise<unknown[]> {
    await this.fetchDefinitions(comfyUrl);
    const schema = this.getInputDefinition(nodeType, inputName, comfyUrl);
    const route = schema?.remote?.route;
    if (!route) throw new Error(`${nodeType}.${inputName} has no remote option route`);
    const base = normalizeUrl(comfyUrl);
    const target = new URL(route, `${base}/`);
    if (target.origin !== new URL(`${base}/`).origin) {
      throw new Error('Remote schema route must stay on the selected managed node');
    }
    const response = await fetch(target.toString());
    if (!response.ok) throw new Error(`Remote options unavailable: HTTP ${response.status}`);
    const payload = await response.json() as unknown;
    const options = Array.isArray(payload)
      ? payload
      : payload && typeof payload === 'object' && Array.isArray((payload as any).options)
        ? (payload as any).options
        : null;
    if (!options) throw new Error('Remote schema response did not contain an options array');
    return options;
  }

  clearCache(comfyUrl?: string): void {
    if (comfyUrl) {
      const url = normalizeUrl(comfyUrl);
      this.cache.delete(url);
      this.requests.delete(url);
      return;
    }
    this.cache.clear();
    this.requests.clear();
  }
}

export { ComfyUINodeDefinitions };
export const nodeDefinitions = new ComfyUINodeDefinitions();
