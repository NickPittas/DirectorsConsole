/**
 * ComfyUI Node Definitions Service
 * 
 * Fetches and caches node definitions from ComfyUI's /object_info endpoint
 * This provides information about valid input types, enum options, etc.
 */

// ============================================================================
// Types
// ============================================================================

export interface NodeInputDefinition {
  type: string | string[]; // Can be a type name or array of enum options
  name: string;
  optional?: boolean;
  default?: any;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
}

export interface NodeOutputDefinition {
  type: string;
  name: string;
}

export interface NodeDefinition {
  name: string;
  display_name: string;
  description: string;
  category: string;
  input: {
    required?: Record<string, NodeInputDefinition | [string | string[], Record<string, any>?]>;
    optional?: Record<string, NodeInputDefinition | [string | string[], Record<string, any>?]>;
    hidden?: Record<string, any>;
  };
  output: string[];
  output_name: string[];
  output_is_list: boolean[];
  output_node?: boolean;
}

export interface ObjectInfo {
  [nodeType: string]: NodeDefinition;
}

// ============================================================================
// Service Class
// ============================================================================

class ComfyUINodeDefinitions {
  private cache: ObjectInfo | null = null;
  private cacheTimestamp: number = 0;
  private cacheTTL: number = 5 * 60 * 1000; // 5 minutes
  private fetchPromise: Promise<ObjectInfo> | null = null;
  
  /**
   * Fetch object_info from ComfyUI
   */
  async fetchDefinitions(comfyUrl: string): Promise<ObjectInfo> {
    const now = Date.now();
    
    // Return cached if still valid
    if (this.cache && (now - this.cacheTimestamp) < this.cacheTTL) {
      return this.cache;
    }
    
    // If already fetching, wait for that promise
    if (this.fetchPromise) {
      return this.fetchPromise;
    }
    
    // Start new fetch
    this.fetchPromise = this._doFetch(comfyUrl);
    
    try {
      this.cache = await this.fetchPromise;
      this.cacheTimestamp = now;
      return this.cache;
    } finally {
      this.fetchPromise = null;
    }
  }
  
  private async _doFetch(comfyUrl: string): Promise<ObjectInfo> {
    // Normalize URL
    const baseUrl = comfyUrl
      .replace(/\/ws$/, '')
      .replace(/\/$/, '');
    
    const response = await fetch(`${baseUrl}/object_info`);
    if (!response.ok) {
      throw new Error(`Failed to fetch object_info: ${response.statusText}`);
    }
    
    const data = await response.json();
    console.log(`[NodeDefinitions] Loaded ${Object.keys(data).length} node definitions`);
    return data;
  }
  
  /**
   * Get definition for a specific node type
   */
  getNodeDefinition(nodeType: string): NodeDefinition | null {
    if (!this.cache) return null;
    return this.cache[nodeType] || null;
  }
  
  /**
   * Get enum options for a specific input on a node type
   * Returns null if the input is not an enum, or array of valid options
   */
  getEnumOptions(nodeType: string, inputName: string): string[] | null {
    const nodeDef = this.getNodeDefinition(nodeType);
    if (!nodeDef) return null;
    
    // Check required inputs
    if (nodeDef.input.required?.[inputName]) {
      const inputDef = nodeDef.input.required[inputName];
      return this._extractEnumOptions(inputDef);
    }
    
    // Check optional inputs
    if (nodeDef.input.optional?.[inputName]) {
      const inputDef = nodeDef.input.optional[inputName];
      return this._extractEnumOptions(inputDef);
    }
    
    return null;
  }
  
  private _extractEnumOptions(inputDef: NodeInputDefinition | [string | string[], Record<string, any>?]): string[] | null {
    // ComfyUI format: [["option1", "option2", ...], { default: "option1" }]
    // Or: [type_string, { ... }]
    if (Array.isArray(inputDef)) {
      const [typeOrOptions] = inputDef;
      if (Array.isArray(typeOrOptions)) {
        // It's an enum - array of string options
        return typeOrOptions;
      }
    }
    return null;
  }
  
  /**
   * Get input definition with metadata (min, max, step, etc.)
   */
  getInputDefinition(nodeType: string, inputName: string): { 
    type: string; 
    isEnum: boolean;
    options?: string[];
    min?: number;
    max?: number;
    step?: number;
    default?: any;
  } | null {
    const nodeDef = this.getNodeDefinition(nodeType);
    if (!nodeDef) return null;
    
    const findInput = (inputs: Record<string, any> | undefined) => {
      if (!inputs?.[inputName]) return null;
      const inputDef = inputs[inputName];
      
      if (Array.isArray(inputDef)) {
        const [typeOrOptions, config] = inputDef;
        
        if (Array.isArray(typeOrOptions)) {
          // Enum type
          return {
            type: 'enum',
            isEnum: true,
            options: typeOrOptions,
            default: config?.default ?? typeOrOptions[0],
          };
        } else {
          // Standard type with config
          return {
            type: typeOrOptions,
            isEnum: false,
            min: config?.min,
            max: config?.max,
            step: config?.step,
            default: config?.default,
          };
        }
      }
      
      return { type: String(inputDef), isEnum: false };
    };
    
    return findInput(nodeDef.input.required) || findInput(nodeDef.input.optional);
  }
  
  /**
   * Check if cache is loaded
   */
  isLoaded(): boolean {
    return this.cache !== null;
  }
  
  /**
   * Get available LoRAs from ComfyUI
   * Fetches the lora_name enum options from LoraLoader node definition
   */
  async getLoras(comfyUrl: string): Promise<string[]> {
    await this.fetchDefinitions(comfyUrl);
    return this.getEnumOptions('LoraLoader', 'lora_name') || [];
  }
  
  /**
   * Clear the cache
   */
  clearCache(): void {
    this.cache = null;
    this.cacheTimestamp = 0;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const nodeDefinitions = new ComfyUINodeDefinitions();
