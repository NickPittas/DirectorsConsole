/**
 * Workflow Builder - TypeScript port from StoryboardUI's workflow_builder.py
 * 
 * Takes a ComfyUI workflow template and applies user-configured parameters,
 * LoRA models, prompts, and image inputs to create the final workflow.
 */

import { ComfyUIWorkflow, ComfyUINode } from './comfyui-client';

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ParameterValue {
  nodeId: string;
  inputName: string;
  value: unknown;
}

export interface LoRASetting {
  nodeId: string;
  loraName: string;
  strengthModel: number;
  strengthClip: number;
  enabled: boolean;
}

export interface PromptValue {
  nodeId: string;
  text: string;
  isNegative?: boolean;
}

export interface ImageInput {
  nodeId: string;
  inputName: string;
  filename: string;
}

export interface WorkflowBuildOptions {
  parameters?: ParameterValue[];
  loras?: LoRASetting[];
  prompts?: PromptValue[];
  images?: ImageInput[];
  filenamePrefix?: string;
  seed?: number;
  randomizeSeed?: boolean;
}

// ============================================================================
// Workflow Builder Class
// ============================================================================

export class WorkflowBuilder {
  private workflow: ComfyUIWorkflow;

  constructor(baseWorkflow: ComfyUIWorkflow) {
    // Deep clone the workflow to avoid modifying the original
    this.workflow = JSON.parse(JSON.stringify(baseWorkflow));
  }

  /**
   * Build the final workflow with all applied modifications
   */
  build(options: WorkflowBuildOptions = {}): ComfyUIWorkflow {
    const {
      parameters = [],
      loras = [],
      prompts = [],
      images = [],
      filenamePrefix,
      seed,
      randomizeSeed = false,
    } = options;

    // Apply in order: parameters, seed, loras, prompts, images, filename
    this.applyParameters(parameters);
    
    if (seed !== undefined || randomizeSeed) {
      this.applySeed(seed, randomizeSeed);
    }
    
    this.applyLoRAs(loras);
    this.applyPrompts(prompts);
    this.applyImages(images);
    
    if (filenamePrefix) {
      this.applyFilenamePrefix(filenamePrefix);
    }

    return this.workflow;
  }

  /**
   * Apply parameter values to their respective nodes
   */
  private applyParameters(parameters: ParameterValue[]): void {
    for (const param of parameters) {
      const node = this.workflow[param.nodeId];
      if (node && node.inputs) {
        node.inputs[param.inputName] = param.value;
      }
    }
  }

  /**
   * Apply seed to all KSampler nodes
   */
  private applySeed(seed?: number, randomize: boolean = false): void {
    const seedValue = randomize 
      ? Math.floor(Math.random() * Number.MAX_SAFE_INTEGER)
      : (seed ?? -1);

    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      
      // KSampler, KSamplerAdvanced, SamplerCustom, etc.
      if (node.class_type?.includes('Sampler') || node.class_type?.includes('KSampler')) {
        if ('seed' in (node.inputs || {})) {
          node.inputs.seed = seedValue;
        }
        if ('noise_seed' in (node.inputs || {})) {
          node.inputs.noise_seed = seedValue;
        }
      }
      
      // RandomNoise nodes
      if (node.class_type === 'RandomNoise') {
        if ('noise_seed' in (node.inputs || {})) {
          node.inputs.noise_seed = seedValue;
        }
      }
    }
  }

  /**
   * Apply LoRA settings to LoraLoader nodes
   */
  private applyLoRAs(loras: LoRASetting[]): void {
    for (const lora of loras) {
      if (!lora.enabled) continue;

      const node = this.workflow[lora.nodeId];
      if (node && node.class_type === 'LoraLoader') {
        node.inputs.lora_name = lora.loraName;
        node.inputs.strength_model = lora.strengthModel;
        node.inputs.strength_clip = lora.strengthClip;
      }
    }

    // Handle LoRA stacker patterns (multiple LoRAs in sequence)
    // Find nodes like LoraLoaderStack or similar
    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      
      if (node.class_type === 'LoraLoaderStack' || node.class_type === 'CR LoRA Stack') {
        // These nodes typically have lora_name_1, strength_model_1, etc.
        let loraIndex = 0;
        for (const lora of loras) {
          if (!lora.enabled) continue;
          
          const idx = loraIndex + 1;
          if (`lora_name_${idx}` in (node.inputs || {})) {
            node.inputs[`lora_name_${idx}`] = lora.loraName;
            node.inputs[`strength_model_${idx}`] = lora.strengthModel;
            node.inputs[`strength_clip_${idx}`] = lora.strengthClip;
          }
          loraIndex++;
        }
      }
    }
  }

  /**
   * Apply prompt text to CLIPTextEncode and similar nodes
   */
  private applyPrompts(prompts: PromptValue[]): void {
    for (const prompt of prompts) {
      const node = this.workflow[prompt.nodeId];
      if (node) {
        // Standard CLIPTextEncode
        if (node.class_type === 'CLIPTextEncode') {
          node.inputs.text = prompt.text;
        }
        // CLIP Text Encode (Prompt) - ComfyUI's built-in
        if (node.class_type === 'CLIPTextEncodeSDXL') {
          // SDXL has separate text_g and text_l
          node.inputs.text_g = prompt.text;
          node.inputs.text_l = prompt.text;
        }
        // Florence2 and other advanced prompt nodes
        if ('text' in (node.inputs || {})) {
          node.inputs.text = prompt.text;
        }
        if ('prompt' in (node.inputs || {})) {
          node.inputs.prompt = prompt.text;
        }
      }
    }
  }

  /**
   * Apply image inputs to LoadImage and similar nodes
   */
  private applyImages(images: ImageInput[]): void {
    for (const image of images) {
      const node = this.workflow[image.nodeId];
      if (node) {
        // LoadImage node
        if (node.class_type === 'LoadImage') {
          node.inputs.image = image.filename;
        }
        // LoadImageMask
        if (node.class_type === 'LoadImageMask') {
          node.inputs.image = image.filename;
        }
        // Generic input name
        if (image.inputName in (node.inputs || {})) {
          node.inputs[image.inputName] = image.filename;
        }
      }
    }
  }

  /**
   * Apply filename prefix to SaveImage nodes
   */
  private applyFilenamePrefix(prefix: string): void {
    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      
      if (node.class_type === 'SaveImage' || node.class_type === 'SaveImageWebsocket') {
        if ('filename_prefix' in (node.inputs || {})) {
          node.inputs.filename_prefix = prefix;
        }
      }
      
      // Preview image nodes
      if (node.class_type === 'PreviewImage') {
        // Preview nodes don't have filename_prefix but we might want to track them
      }
    }
  }

  // --------------------------------------------------------------------------
  // Utility Methods
  // --------------------------------------------------------------------------

  /**
   * Find all nodes of a specific class type
   */
  findNodesByType(classType: string): Array<{ id: string; node: ComfyUINode }> {
    const results: Array<{ id: string; node: ComfyUINode }> = [];
    
    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      if (node.class_type === classType) {
        results.push({ id: nodeId, node });
      }
    }
    
    return results;
  }

  /**
   * Find all KSampler nodes (for parameter extraction)
   */
  findSamplerNodes(): Array<{ id: string; node: ComfyUINode }> {
    const results: Array<{ id: string; node: ComfyUINode }> = [];
    
    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      if (node.class_type?.includes('Sampler') || node.class_type?.includes('KSampler')) {
        results.push({ id: nodeId, node });
      }
    }
    
    return results;
  }

  /**
   * Find all prompt nodes (CLIPTextEncode, etc.)
   */
  findPromptNodes(): Array<{ id: string; node: ComfyUINode; isNegative: boolean }> {
    const results: Array<{ id: string; node: ComfyUINode; isNegative: boolean }> = [];
    
    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      
      if (node.class_type === 'CLIPTextEncode' || node.class_type === 'CLIPTextEncodeSDXL') {
        // Try to determine if negative from node title or connections
        const title = node._meta?.title?.toLowerCase() || '';
        const isNegative = title.includes('negative') || title.includes('neg');
        
        results.push({ id: nodeId, node, isNegative });
      }
    }
    
    return results;
  }

  /**
   * Find all LoRA loader nodes
   */
  findLoRANodes(): Array<{ id: string; node: ComfyUINode }> {
    const results: Array<{ id: string; node: ComfyUINode }> = [];
    
    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      if (node.class_type === 'LoraLoader' || node.class_type?.includes('Lora')) {
        results.push({ id: nodeId, node });
      }
    }
    
    return results;
  }

  /**
   * Find all image input nodes
   */
  findImageInputNodes(): Array<{ id: string; node: ComfyUINode }> {
    const results: Array<{ id: string; node: ComfyUINode }> = [];
    
    for (const nodeId of Object.keys(this.workflow)) {
      const node = this.workflow[nodeId];
      if (node.class_type === 'LoadImage' || node.class_type === 'LoadImageMask') {
        results.push({ id: nodeId, node });
      }
    }
    
    return results;
  }

  /**
   * Get a copy of the current workflow state
   */
  getWorkflow(): ComfyUIWorkflow {
    return JSON.parse(JSON.stringify(this.workflow));
  }
}

// ============================================================================
// Factory Function
// ============================================================================

export function createWorkflowBuilder(baseWorkflow: ComfyUIWorkflow): WorkflowBuilder {
  return new WorkflowBuilder(baseWorkflow);
}

export default WorkflowBuilder;
