/**
 * Template Loader - TypeScript port from StoryboardUI's template_loader.py
 * 
 * Discovers and loads ComfyUI workflow templates from the filesystem.
 * Templates are JSON files containing ComfyUI workflows with metadata.
 */

import { ComfyUIWorkflow } from './comfyui-client';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface TemplateParameter {
  name: string;
  nodeId: string;
  inputName: string;
  type: 'integer' | 'float' | 'string' | 'boolean' | 'enum' | 'seed' | 'prompt';
  default: unknown;
  min?: number;
  max?: number;
  step?: number;
  options?: string[];
  description?: string;
}

export interface TemplateLoRASlot {
  nodeId: string;
  name: string;
  description?: string;
  defaultModel?: string;
  defaultStrength?: number;
}

export interface TemplateImageInput {
  nodeId: string;
  inputName: string;
  name: string;
  description?: string;
  optional?: boolean;
  acceptsMask?: boolean;
}

export interface TemplatePromptSlot {
  nodeId: string;
  name: string;
  isNegative: boolean;
  default?: string;
  description?: string;
}

export interface Template {
  name: string;
  filename: string;
  category: string;
  engine: 'flux' | 'sdxl' | 'sd15' | 'cascade' | 'unknown';
  description: string;
  author?: string;
  version?: string;
  
  // Auto-extracted from workflow
  parameters: TemplateParameter[];
  loraSlots: TemplateLoRASlot[];
  imageInputs: TemplateImageInput[];
  promptSlots: TemplatePromptSlot[];
  
  // The raw workflow
  workflow: ComfyUIWorkflow;
}

export interface TemplateMetadata {
  name?: string;
  category?: string;
  engine?: string;
  description?: string;
  author?: string;
  version?: string;
  parameters?: Partial<TemplateParameter>[];
  loras?: Partial<TemplateLoRASlot>[];
  image_inputs?: Partial<TemplateImageInput>[];
}

// ============================================================================
// Template Loader Class
// ============================================================================

export class TemplateLoader {
  private templates: Map<string, Template> = new Map();
  private apiBaseUrl: string;

  constructor(apiBaseUrl: string = '/api') {
    this.apiBaseUrl = apiBaseUrl;
  }

  /**
   * Load templates from the API
   */
  async loadTemplates(): Promise<Template[]> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/templates/list`);
      if (!response.ok) {
        throw new Error(`Failed to load templates: ${response.statusText}`);
      }

      const data = await response.json();
      const templates: Template[] = [];

      for (const item of data.templates || []) {
        const template = this.parseTemplate(item);
        if (template) {
          this.templates.set(template.name, template);
          templates.push(template);
        }
      }

      return templates;
    } catch (error) {
      console.error('Failed to load templates:', error);
      return [];
    }
  }

  /**
   * Load a single template by name
   */
  async loadTemplate(name: string): Promise<Template | null> {
    // Check cache first
    if (this.templates.has(name)) {
      return this.templates.get(name)!;
    }

    try {
      const response = await fetch(`${this.apiBaseUrl}/templates/detail/${encodeURIComponent(name)}`);
      if (!response.ok) {
        return null;
      }

      const data = await response.json();
      const template = this.parseTemplate(data);
      
      if (template) {
        this.templates.set(template.name, template);
      }
      
      return template;
    } catch (error) {
      console.error(`Failed to load template ${name}:`, error);
      return null;
    }
  }

  /**
   * Parse a template from raw JSON data
   */
  private parseTemplate(data: Record<string, unknown>): Template | null {
    try {
      const workflow = (data.workflow || data) as ComfyUIWorkflow;
      const metadata = (data.metadata || data) as TemplateMetadata;
      
      // Validate that this looks like a ComfyUI workflow
      if (!this.isValidWorkflow(workflow)) {
        return null;
      }

      const name = metadata.name || data.name as string || 'Untitled';
      const category = metadata.category || data.category as string || 'general';
      const engine = this.detectEngine(workflow, metadata.engine);

      // Auto-extract parameters, LoRAs, image inputs, prompts from workflow
      const parameters = this.extractParameters(workflow, metadata.parameters);
      const loraSlots = this.extractLoRASlots(workflow, metadata.loras);
      const imageInputs = this.extractImageInputs(workflow, metadata.image_inputs);
      const promptSlots = this.extractPromptSlots(workflow);

      return {
        name,
        filename: data.filename as string || `${name}.json`,
        category,
        engine,
        description: metadata.description || data.description as string || '',
        author: metadata.author || data.author as string,
        version: metadata.version || data.version as string,
        parameters,
        loraSlots,
        imageInputs,
        promptSlots,
        workflow,
      };
    } catch (error) {
      console.error('Failed to parse template:', error);
      return null;
    }
  }

  /**
   * Validate that an object looks like a ComfyUI workflow
   */
  private isValidWorkflow(workflow: unknown): workflow is ComfyUIWorkflow {
    if (!workflow || typeof workflow !== 'object') return false;
    
    const nodes = Object.values(workflow as Record<string, unknown>);
    if (nodes.length === 0) return false;
    
    // Check if at least one node has class_type (ComfyUI format)
    return nodes.some(node => 
      node && typeof node === 'object' && 'class_type' in (node as object)
    );
  }

  /**
   * Detect the engine type from the workflow
   */
  private detectEngine(workflow: ComfyUIWorkflow, hint?: string): Template['engine'] {
    if (hint) {
      const h = hint.toLowerCase();
      if (h.includes('flux')) return 'flux';
      if (h.includes('sdxl')) return 'sdxl';
      if (h.includes('sd15') || h.includes('sd1.5')) return 'sd15';
      if (h.includes('cascade')) return 'cascade';
    }

    // Detect from node types
    for (const node of Object.values(workflow)) {
      const classType = node.class_type?.toLowerCase() || '';
      
      if (classType.includes('flux')) return 'flux';
      if (classType.includes('sdxl')) return 'sdxl';
      if (classType.includes('cascade')) return 'cascade';
    }

    // Check checkpoint name if available
    for (const node of Object.values(workflow)) {
      if (node.class_type === 'CheckpointLoaderSimple' || node.class_type === 'UNETLoader') {
        const ckptName = (node.inputs?.ckpt_name || node.inputs?.unet_name || '') as string;
        const lower = ckptName.toLowerCase();
        
        if (lower.includes('flux')) return 'flux';
        if (lower.includes('sdxl')) return 'sdxl';
        if (lower.includes('sd15') || lower.includes('v1-5')) return 'sd15';
      }
    }

    return 'unknown';
  }

  /**
   * Extract configurable parameters from workflow nodes
   */
  private extractParameters(
    workflow: ComfyUIWorkflow, 
    overrides?: Partial<TemplateParameter>[]
  ): TemplateParameter[] {
    const params: TemplateParameter[] = [];
    const overrideMap = new Map(overrides?.map(o => [o.nodeId + ':' + o.inputName, o]) || []);

    for (const [nodeId, node] of Object.entries(workflow)) {
      const classType = node.class_type;

      // KSampler parameters
      if (classType?.includes('Sampler') || classType?.includes('KSampler')) {
        const inputs = node.inputs || {};
        
        if ('seed' in inputs) {
          params.push(this.createParameter(nodeId, 'seed', 'seed', inputs.seed, overrideMap));
        }
        if ('steps' in inputs) {
          params.push(this.createParameter(nodeId, 'steps', 'integer', inputs.steps, overrideMap, { min: 1, max: 150 }));
        }
        if ('cfg' in inputs) {
          params.push(this.createParameter(nodeId, 'cfg', 'float', inputs.cfg, overrideMap, { min: 1, max: 30, step: 0.5 }));
        }
        if ('sampler_name' in inputs) {
          params.push(this.createParameter(nodeId, 'sampler_name', 'enum', inputs.sampler_name, overrideMap, {
            options: ['euler', 'euler_ancestral', 'heun', 'dpm_2', 'dpm_2_ancestral', 'lms', 'dpmpp_2m', 'dpmpp_sde', 'dpmpp_2m_sde', 'uni_pc'],
          }));
        }
        if ('scheduler' in inputs) {
          params.push(this.createParameter(nodeId, 'scheduler', 'enum', inputs.scheduler, overrideMap, {
            options: ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta'],
          }));
        }
        if ('denoise' in inputs) {
          params.push(this.createParameter(nodeId, 'denoise', 'float', inputs.denoise, overrideMap, { min: 0, max: 1, step: 0.05 }));
        }
      }

      // EmptyLatentImage (dimensions)
      if (classType === 'EmptyLatentImage' || classType === 'EmptySD3LatentImage') {
        const inputs = node.inputs || {};
        
        if ('width' in inputs) {
          params.push(this.createParameter(nodeId, 'width', 'integer', inputs.width, overrideMap, { min: 64, max: 4096, step: 64 }));
        }
        if ('height' in inputs) {
          params.push(this.createParameter(nodeId, 'height', 'integer', inputs.height, overrideMap, { min: 64, max: 4096, step: 64 }));
        }
        if ('batch_size' in inputs) {
          params.push(this.createParameter(nodeId, 'batch_size', 'integer', inputs.batch_size, overrideMap, { min: 1, max: 16 }));
        }
      }
    }

    return params;
  }

  private createParameter(
    nodeId: string,
    inputName: string,
    type: TemplateParameter['type'],
    defaultValue: unknown,
    overrideMap: Map<string, Partial<TemplateParameter>>,
    extras: Partial<TemplateParameter> = {}
  ): TemplateParameter {
    const key = `${nodeId}:${inputName}`;
    const override = overrideMap.get(key) || {};

    return {
      name: override.name || inputName,
      nodeId,
      inputName,
      type: override.type || type,
      default: override.default ?? defaultValue,
      ...extras,
      ...override,
    };
  }

  /**
   * Extract LoRA slots from workflow
   */
  private extractLoRASlots(
    workflow: ComfyUIWorkflow,
    overrides?: Partial<TemplateLoRASlot>[]
  ): TemplateLoRASlot[] {
    const slots: TemplateLoRASlot[] = [];
    const overrideMap = new Map(overrides?.map(o => [o.nodeId, o]) || []);

    for (const [nodeId, node] of Object.entries(workflow)) {
      if (node.class_type === 'LoraLoader') {
        const override = overrideMap.get(nodeId) || {};
        const inputs = node.inputs || {};
        
        slots.push({
          nodeId,
          name: override.name || node._meta?.title || `LoRA ${slots.length + 1}`,
          description: override.description,
          defaultModel: (inputs.lora_name as string) || '',
          defaultStrength: (inputs.strength_model as number) ?? 1.0,
          ...override,
        });
      }
    }

    return slots;
  }

  /**
   * Extract image input nodes from workflow
   */
  private extractImageInputs(
    workflow: ComfyUIWorkflow,
    overrides?: Partial<TemplateImageInput>[]
  ): TemplateImageInput[] {
    const inputs: TemplateImageInput[] = [];
    const overrideMap = new Map(overrides?.map(o => [o.nodeId, o]) || []);

    for (const [nodeId, node] of Object.entries(workflow)) {
      if (node.class_type === 'LoadImage' || node.class_type === 'LoadImageOutput') {
        const override = overrideMap.get(nodeId) || {};
        
        inputs.push({
          nodeId,
          inputName: 'image',
          name: override.name || node._meta?.title || `Image ${inputs.length + 1}`,
          description: override.description,
          optional: override.optional ?? false,
          acceptsMask: false,
          ...override,
        });
      }
      
      if (node.class_type === 'LoadImageMask') {
        const override = overrideMap.get(nodeId) || {};
        
        inputs.push({
          nodeId,
          inputName: 'image',
          name: override.name || node._meta?.title || `Mask ${inputs.length + 1}`,
          description: override.description,
          optional: override.optional ?? false,
          acceptsMask: true,
          ...override,
        });
      }
    }

    return inputs;
  }

  /**
   * Extract prompt slots from CLIPTextEncode nodes
   */
  private extractPromptSlots(workflow: ComfyUIWorkflow): TemplatePromptSlot[] {
    const slots: TemplatePromptSlot[] = [];

    for (const [nodeId, node] of Object.entries(workflow)) {
      if (node.class_type === 'CLIPTextEncode' || node.class_type === 'CLIPTextEncodeSDXL') {
        const title = (node._meta?.title || '').toLowerCase();
        const text = (node.inputs?.text as string) || '';
        
        // Detect if this is a negative prompt node
        const isNegative = title.includes('negative') || 
                          title.includes('neg') ||
                          text.toLowerCase().includes('ugly') ||
                          text.toLowerCase().includes('bad quality');

        slots.push({
          nodeId,
          name: node._meta?.title || (isNegative ? 'Negative Prompt' : 'Positive Prompt'),
          isNegative,
          default: text,
        });
      }
    }

    // Sort so positive prompts come first
    slots.sort((a, b) => (a.isNegative ? 1 : 0) - (b.isNegative ? 1 : 0));

    return slots;
  }

  // --------------------------------------------------------------------------
  // Public API
  // --------------------------------------------------------------------------

  getTemplate(name: string): Template | undefined {
    return this.templates.get(name);
  }

  getAllTemplates(): Template[] {
    return Array.from(this.templates.values());
  }

  getTemplatesByCategory(category: string): Template[] {
    return this.getAllTemplates().filter(t => t.category === category);
  }

  getTemplatesByEngine(engine: Template['engine']): Template[] {
    return this.getAllTemplates().filter(t => t.engine === engine);
  }

  getCategories(): string[] {
    const categories = new Set<string>();
    for (const template of this.templates.values()) {
      categories.add(template.category);
    }
    return Array.from(categories).sort();
  }

  clearCache(): void {
    this.templates.clear();
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createTemplateLoader(apiBaseUrl?: string): TemplateLoader {
  return new TemplateLoader(apiBaseUrl);
}

export default TemplateLoader;
