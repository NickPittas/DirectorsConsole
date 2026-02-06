/**
 * Workflow Parser Service
 * 
 * Ports the Python template_loader.py logic to TypeScript
 * Analyzes ComfyUI workflows and extracts parameters, image inputs, LoRAs, and categories
 */

import { ANGLE_LORA_NAME } from '../data/cameraAngleData';

// ============================================================================
// Types
// ============================================================================

export interface WorkflowParameter {
  name: string;
  display_name: string;
  type: 'integer' | 'float' | 'seed' | 'enum' | 'boolean' | 'prompt' | 'image' | 'image_list' | 'video' | 'video_list' | 'media' | 'lora';
  node_id: string;
  input_name: string;
  default: any;
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    availableLoras?: string[];  // For lora type - list of available LoRAs from ComfyUI
    lora_name?: string;         // For lora type - current lora selection
    bypassed?: boolean;         // For lora type - bypass state
  };
  description: string;
}

export interface WorkflowImageInput {
  name: string;
  display_name: string;
  node_id: string;
  input_name: string;
  type: 'image' | 'mask';
  required: boolean;
  batch_min: number;
  batch_max: number;
  description: string;
}

export interface WorkflowLoRA {
  name: string;
  display_name: string;
  node_id: string;
  strength_inputs: {
    model: string;
    clip: string;
  };
  default_enabled: boolean;
  default_strength: number;
  required: boolean;
  lora_name: string;
}

export interface WorkflowOutput {
  node_id: string;
  name: string;
  type: 'image' | 'video';
  selected: boolean;
}

export interface ParsedWorkflow {
  parameters: WorkflowParameter[];
  image_inputs: WorkflowImageInput[];
  loras: WorkflowLoRA[];
  outputs: WorkflowOutput[];
  categories: string[];
  has_next_scene_support: boolean;
  hasMultiAngleLora: boolean;
}

export interface ComfyUINode {
  class_type?: string;
  type?: string;
  inputs?: Record<string, any>;
  widgets_values?: any[];
  mode?: number; // 0=normal, 4=bypassed
  _meta?: {
    title?: string;
  };
}

export interface ComfyUIWorkflow {
  [nodeId: string]: ComfyUINode | { meta?: any; version?: any };
}

// Qwen/ComfyUI export format with nodes array
export interface QwenWorkflowFormat {
  nodes?: Array<ComfyUINode & { id: number | string }>;
  links?: any[];
  groups?: any[];
  [key: string]: any;
}

// ============================================================================
// Parser Class
// ============================================================================

export class WorkflowParser {
  /**
   * Convert Qwen format (with nodes array) to standard ComfyUI API format
   * This handles the complex transformation needed for ComfyUI's /prompt API
   */
  normalizeWorkflowFormat(workflow: ComfyUIWorkflow | QwenWorkflowFormat): ComfyUIWorkflow {
    // Check if this is Qwen/graph format (has nodes array)
    if ('nodes' in workflow && Array.isArray(workflow.nodes) && workflow.nodes.length > 0) {
      const qwenWorkflow = workflow as QwenWorkflowFormat;
      const normalized: ComfyUIWorkflow = {};
      
      // Build a map of links: linkId -> [sourceNodeId, sourceOutputIndex]
      const linkMap = new Map<number, [number, number]>();
      if (qwenWorkflow.links) {
        for (const link of qwenWorkflow.links) {
          // link format: [linkId, sourceNodeId, sourceOutputIndex, targetNodeId, targetInputIndex, type]
          const linkId = link[0];
          const sourceNodeId = link[1];
          const sourceOutputIndex = link[2];
          linkMap.set(linkId, [sourceNodeId, sourceOutputIndex]);
        }
      }
      
      for (const node of qwenWorkflow.nodes!) {
        const nodeId = String(node.id);
        const nodeAny = node as any;
        const classType = nodeAny.type || node.class_type || '';
        
        // Build inputs from linked inputs only - widget values stay in widgets_values
        const inputs: Record<string, any> = {};
        
        // Process linked inputs - convert link IDs to node references
        if (nodeAny.inputs && Array.isArray(nodeAny.inputs)) {
          for (const input of nodeAny.inputs) {
            if (input.link !== null && input.link !== undefined) {
              const linkSource = linkMap.get(input.link);
              if (linkSource) {
                // ComfyUI API format: [sourceNodeId (STRING), outputIndex (NUMBER)]
                inputs[input.name] = [String(linkSource[0]), linkSource[1]];
              }
            }
          }
        }
        
        // Store the node with widgets_values preserved (don't try to map them to input names)
        // The buildWorkflow function will handle converting widgets_values to proper API format
        normalized[nodeId] = {
          class_type: classType,
          inputs,
          widgets_values: nodeAny.widgets_values,
          _meta: {
            title: nodeAny.title || nodeAny.properties?.['Node name for S&R'] || '',
          },
          // Preserve mode (4 = bypassed) for filtering bypassed nodes
          mode: nodeAny.mode,
        };
      }
      
      return normalized;
    }
    
    // Already in standard format
    return workflow as ComfyUIWorkflow;
  }
  
  /**
   * Parse a ComfyUI workflow and extract all parameters, inputs, and metadata
   */
  parseWorkflow(workflow: ComfyUIWorkflow | QwenWorkflowFormat): ParsedWorkflow {
    // Normalize to standard format first
    const normalizedWorkflow = this.normalizeWorkflowFormat(workflow);
    
    const parameters = this._extractParameters(normalizedWorkflow);
    const image_inputs = this._extractImageInputs(normalizedWorkflow);
    const loras = this._extractLoRAs(normalizedWorkflow);
    const outputs = this._extractOutputs(normalizedWorkflow);
    const categories = this._detectCategories(normalizedWorkflow);
    const has_next_scene_support = this._detectNextSceneSupport(normalizedWorkflow);

    // Check for multi-angle LoRA
    const hasMultiAngleLora = loras.some(
      l => l.lora_name === ANGLE_LORA_NAME
    );

    return {
      parameters,
      image_inputs,
      loras,
      outputs,
      categories,
      has_next_scene_support,
      hasMultiAngleLora,
    };
  }

  /**
   * Normalize node to handle different workflow formats (ComfyUI vs Qwen)
   */
  private _normalizeNode(node: ComfyUINode): { class_type: string; inputs: Record<string, any> } {
    // Handle Qwen format (uses 'type' instead of 'class_type')
    const class_type = node.class_type || node.type || '';
    
    // Handle Qwen format (uses 'widgets_values' instead of 'inputs')
    let inputs = node.inputs || {};
    if (node.widgets_values && Array.isArray(node.widgets_values)) {
      // Convert widgets_values to inputs format
      const widgetNames = this._getWidgetNames(class_type);
      node.widgets_values.forEach((value, index) => {
        if (widgetNames[index]) {
          inputs[widgetNames[index]] = value;
        }
      });
    }
    
    return { class_type, inputs };
  }

  /**
   * Get typical widget names for a node type (for Qwen format conversion)
   */
  private _getWidgetNames(class_type: string): string[] {
    const widgetMap: Record<string, string[]> = {
      // Standard ComfyUI nodes
      // KSampler widget order: seed, control_after_generate, steps, cfg, sampler_name, scheduler, denoise
      'KSampler': ['seed', 'control_after_generate', 'steps', 'cfg', 'sampler_name', 'scheduler', 'denoise'],
      'KSamplerAdvanced': ['add_noise', 'noise_seed', 'steps', 'cfg', 'sampler_name', 'scheduler', 'start_at_step', 'end_at_step', 'return_with_leftover_noise'],
      'CLIPTextEncode': ['text'],
      'EmptyLatentImage': ['width', 'height', 'batch_size'],
      'EmptySD3LatentImage': ['width', 'height', 'batch_size'],
      'LoadImage': ['image', 'upload'],
      'LoraLoader': ['lora_name', 'strength_model', 'strength_clip'],
      'LoraLoaderModelOnly': ['lora_name', 'strength_model'],
      'VAELoader': ['vae_name'],
      'CLIPLoader': ['clip_name', 'type', 'device'],
      'UNETLoader': ['unet_name', 'weight_dtype'],
      'VAEEncode': [],
      'VAEDecode': [],
      'SaveImage': ['filename_prefix'],
      'PreviewImage': [],
      'ModelSamplingAuraFlow': ['shift'],
      'ConditioningZeroOut': [],
      
      // Qwen-specific nodes
      'QwenImageIntegratedKSampler': [
        'prompt', 'negative_prompt', 'mode', 'batch_size', 'image1_weight', 'image2_weight',
        'seed', 'control_after_generate', 'steps', 'denoise', 'sampler_name', 'scheduler',
        'scale_method', 'cfg', 'image_count', 'tile_vae', 'use_teacache', 'use_fp8_linear',
        'custom_prompt', 'save_prefix', 'system_prompt'
      ],
      
      // Resolution/resize nodes
      'FluxResolutionNode': ['megapixels', 'aspect_ratio', 'divisor', 'preview', 'last_ratio'],
      'ImageResizeKJv2': ['width', 'height', 'upscale_method', 'crop', 'pad_color', 'pad_position', 'divisor', 'device'],
      'ImageScaleToTotalPixels': ['upscale_method', 'megapixels'],
      
      // Video/image loading nodes
      'VHS_LoadVideo': ['video', 'force_rate', 'custom_width', 'custom_height', 'frame_load_cap', 'skip_first_frames', 'select_every_nth', 'format'],
      'OlmDragCrop': ['seed', 'crop_left', 'crop_right', 'crop_top', 'crop_bottom', 'crop_width', 'crop_height', 'img_width', 'img_height', 'snap', 'aspect_ratio', 'lock_aspect', 'action', 'refresh', 'mask', 'color', 'reset'],
      
      // Preprocessors
      'OpenposePreprocessor': ['detect_hand', 'detect_body', 'detect_face', 'resolution', 'bbox_detector'],
      'DepthAnything_V2': [],
      'DownloadAndLoadDepthAnythingV2Model': ['model'],
      
      // LoRA/Model nodes
      'UnetLoaderGGUF': ['unet_name'],
      'PathchSageAttentionKJ': ['attention_mode', 'force_fp16'],
      'Power Lora Loader (rgthree)': [],
      
      // Utility nodes
      'LayerUtility: SaveImagePlus': ['output_path', 'filename_prefix', 'timestamp', 'format', 'quality', 'save_metadata', 'custom_metadata', 'overwrite', 'preview'],
      'Image Comparer (rgthree)': [],
    };
    return widgetMap[class_type] || [];
  }

  /**
   * Extract parameters from workflow nodes
   */
  private _extractParameters(workflow: ComfyUIWorkflow): WorkflowParameter[] {
    let parameters: WorkflowParameter[] = [];

    for (const [node_id, node] of Object.entries(workflow)) {
      if (node_id === 'meta' || typeof node !== 'object' || node === null) {
        continue;
      }

      const typedNode = node as ComfyUINode;
      const { class_type, inputs } = this._normalizeNode(typedNode);

      // Detect KSampler - extract steps, cfg, seed, denoise
      if (class_type === 'KSampler') {
        if ('steps' in inputs) {
          parameters.push({
            name: 'steps',
            display_name: 'Sampling Steps',
            type: 'integer',
            node_id,
            input_name: 'steps',
            default: inputs.steps ?? 20,
            constraints: { min: 1, max: 150, step: 1 },
            description: 'Number of sampling steps',
          });
        }

        if ('cfg' in inputs) {
          parameters.push({
            name: 'cfg',
            display_name: 'CFG Scale',
            type: 'float',
            node_id,
            input_name: 'cfg',
            default: inputs.cfg ?? 7.0,
            constraints: { min: 0, max: 30, step: 0.1 },
            description: 'Classifier-free guidance scale',
          });
        }

        if ('seed' in inputs) {
          parameters.push({
            name: 'seed',
            display_name: 'Seed',
            type: 'seed',
            node_id,
            input_name: 'seed',
            default: inputs.seed ?? -1,
            description: 'Random seed for reproducibility',
          });
        }

        if ('denoise' in inputs) {
          parameters.push({
            name: 'denoise',
            display_name: 'Denoise Strength',
            type: 'float',
            node_id,
            input_name: 'denoise',
            default: inputs.denoise ?? 1.0,
            constraints: { min: 0.1, max: 1.0, step: 0.05 },
            description: 'Denoising strength (img2img)',
          });
        }
      }
      
      // Detect QwenImageIntegratedKSampler - Qwen image editing sampler
      if (class_type === 'QwenImageIntegratedKSampler') {
        // Get widget values if available
        const widgetValues = typedNode.widgets_values || [];
        
        // Prompt (index 0) - actual input name is 'positive_prompt'
        parameters.push({
          name: 'positive_prompt',
          display_name: 'Prompt',
          type: 'prompt',
          node_id,
          input_name: 'positive_prompt',
          default: widgetValues[0] || inputs.positive_prompt || '',
          description: 'Main prompt for image generation/editing',
        });
        
        // Negative prompt (index 1)
        parameters.push({
          name: 'negative_prompt',
          display_name: 'Negative Prompt',
          type: 'prompt',
          node_id,
          input_name: 'negative_prompt',
          default: widgetValues[1] || inputs.negative_prompt || '',
          description: 'What to avoid in generation',
        });
        
        // Mode (index 2) - actual input name is 'generation_mode'
        parameters.push({
          name: 'generation_mode',
          display_name: 'Mode',
          type: 'enum',
          node_id,
          input_name: 'generation_mode',
          default: widgetValues[2] || inputs.generation_mode || '图生图 image-to-image',
          constraints: {
            options: ['文生图 text-to-image', '图生图 image-to-image', '图像编辑 image-edit']
          },
          description: 'Generation mode',
        });
        
        // Seed (index 6)
        parameters.push({
          name: 'seed',
          display_name: 'Seed',
          type: 'seed',
          node_id,
          input_name: 'seed',
          default: widgetValues[6] || inputs.seed || -1,
          description: 'Random seed',
        });
        
        // Steps (index 8)
        parameters.push({
          name: 'steps',
          display_name: 'Steps',
          type: 'integer',
          node_id,
          input_name: 'steps',
          default: widgetValues[8] || inputs.steps || 4,
          constraints: { min: 1, max: 50, step: 1 },
          description: 'Sampling steps',
        });
        
        // Denoise (index 9)
        parameters.push({
          name: 'denoise',
          display_name: 'Denoise',
          type: 'float',
          node_id,
          input_name: 'denoise',
          default: widgetValues[9] || inputs.denoise || 1.0,
          constraints: { min: 0, max: 1, step: 0.05 },
          description: 'Denoising strength',
        });
        
        // CFG (index 13)
        parameters.push({
          name: 'cfg',
          display_name: 'CFG Scale',
          type: 'float',
          node_id,
          input_name: 'cfg',
          default: widgetValues[13] || inputs.cfg || 3.0,
          constraints: { min: 1, max: 20, step: 0.5 },
          description: 'Classifier-free guidance',
        });
      }

      // Detect EmptyLatentImage - extract width, height
      if (class_type === 'EmptyLatentImage') {
        if ('width' in inputs) {
          parameters.push({
            name: 'width',
            display_name: 'Width',
            type: 'integer',
            node_id,
            input_name: 'width',
            default: inputs.width ?? 512,
            constraints: { min: 256, max: 2048, step: 64 },
            description: 'Output image width',
          });
        }

        if ('height' in inputs) {
          parameters.push({
            name: 'height',
            display_name: 'Height',
            type: 'integer',
            node_id,
            input_name: 'height',
            default: inputs.height ?? 512,
            constraints: { min: 256, max: 2048, step: 64 },
            description: 'Output image height',
          });
        }
      }
    }

    // Handle prompt nodes separately for better detection
    parameters = this._extractPromptParameters(workflow, parameters);

    return parameters;
  }

  /**
   * Extract prompt parameters with intelligent detection
   */
  private _extractPromptParameters(
    workflow: ComfyUIWorkflow,
    existingParameters: WorkflowParameter[]
  ): WorkflowParameter[] {
    const parameters = [...existingParameters];

    // Collect all prompt nodes with their metadata
    const promptNodes: Array<{
      node_id: string;
      class_type: string;
      input_name: string;
      text: string;
      title: string;
      title_lower: string;
    }> = [];

    // Known prompt node class types and their text input names
    const promptClassTypes: Record<string, string> = {
      CLIPTextEncode: 'text',
      TextEncodeQwenImageEditPlus: 'prompt',
      TextEncodeQwenImageEdit: 'prompt',
      TextEncodeQwen: 'prompt',
      CLIPTextEncodeSDXL: 'text_g',
      PromptStyler: 'text_positive',
      ShowText: 'text',
      StringFunction: 'text',
    };

    for (const [node_id, node] of Object.entries(workflow)) {
      if (node_id === 'meta' || typeof node !== 'object' || node === null) {
        continue;
      }

      const typedNode = node as ComfyUINode;
      const class_type = typedNode.class_type || '';
      const inputs = typedNode.inputs || {};

      if (class_type in promptClassTypes) {
        const input_name = promptClassTypes[class_type];
        if (input_name in inputs) {
          const text = String(inputs[input_name] ?? '');
          const meta_title = typedNode._meta?.title || '';

          promptNodes.push({
            node_id,
            class_type,
            input_name,
            text,
            title: meta_title,
            title_lower: meta_title.toLowerCase(),
          });
        }
      }
    }

    if (promptNodes.length === 0) {
      return parameters;
    }

    // Categorize prompt nodes
    const positiveNodes: typeof promptNodes = [];
    const negativeNodes: typeof promptNodes = [];
    const unknownNodes: typeof promptNodes = [];

    // Keywords for detection
    const positiveKeywords = ['positive', 'pos ', '(pos)', 'prompt', 'main prompt', 'subject'];
    const negativeKeywords = ['negative', 'neg ', '(neg)', 'bad', 'ugly', 'worst', 'low quality', 'avoid'];
    const contentNegativeWords = [
      'ugly', 'blurry', 'bad anatomy', 'worst quality', 'low quality',
      'normal quality', 'lowres', 'watermark', 'deformed', 'disfigured',
      'mutation', 'extra limbs'
    ];

    for (const nodeInfo of promptNodes) {
      const title_lower = nodeInfo.title_lower;
      const text_lower = nodeInfo.text.toLowerCase().slice(0, 200);

      // Check title first (most reliable)
      const isPositive = positiveKeywords.some(kw => title_lower.includes(kw));
      const isNegative = negativeKeywords.some(kw => title_lower.includes(kw));

      // If title is ambiguous, check content
      let finalIsNegative = isNegative;
      if (!isPositive && !isNegative) {
        finalIsNegative = contentNegativeWords.some(word => text_lower.includes(word));
      }

      if (finalIsNegative && !isPositive) {
        negativeNodes.push(nodeInfo);
      } else if (isPositive && !finalIsNegative) {
        positiveNodes.push(nodeInfo);
      } else {
        unknownNodes.push(nodeInfo);
      }
    }

    // Handle unknown nodes
    for (const nodeInfo of unknownNodes) {
      if (positiveNodes.length === 0) {
        positiveNodes.push(nodeInfo);
      } else if (negativeNodes.length === 0) {
        negativeNodes.push(nodeInfo);
      } else {
        // Additional unknowns - create unique parameter names
        const param_name = `prompt_${nodeInfo.node_id}`;
        const display_name = nodeInfo.title || `Prompt (Node ${nodeInfo.node_id})`;
        parameters.push({
          name: param_name,
          display_name,
          type: 'prompt',
          node_id: nodeInfo.node_id,
          input_name: nodeInfo.input_name,
          default: nodeInfo.text,
          description: `Text prompt for ${nodeInfo.class_type} node ${nodeInfo.node_id}`,
        });
      }
    }

    // Add positive prompt parameter(s)
    for (let i = 0; i < positiveNodes.length; i++) {
      const nodeInfo = positiveNodes[i];
      const existing = parameters.find(p => p.name === 'positive_prompt');

      if (i === 0 && !existing) {
        parameters.push({
          name: 'positive_prompt',
          display_name: 'Positive Prompt',
          type: 'prompt',
          node_id: nodeInfo.node_id,
          input_name: nodeInfo.input_name,
          default: nodeInfo.text,
          description: 'Positive prompt (what to generate)',
        });
      } else {
        const param_name = i > 0 ? `positive_prompt_${i + 1}` : `positive_prompt_${nodeInfo.node_id}`;
        const display_name = nodeInfo.title || `Positive Prompt ${i + 2}`;
        parameters.push({
          name: param_name,
          display_name,
          type: 'prompt',
          node_id: nodeInfo.node_id,
          input_name: nodeInfo.input_name,
          default: nodeInfo.text,
          description: 'Additional positive prompt',
        });
      }
    }

    // Add negative prompt parameter(s)
    for (let i = 0; i < negativeNodes.length; i++) {
      const nodeInfo = negativeNodes[i];
      const existing = parameters.find(p => p.name === 'negative_prompt');

      if (i === 0 && !existing) {
        parameters.push({
          name: 'negative_prompt',
          display_name: 'Negative Prompt',
          type: 'prompt',
          node_id: nodeInfo.node_id,
          input_name: nodeInfo.input_name,
          default: nodeInfo.text,
          description: 'Negative prompt (things to avoid)',
        });
      } else {
        const param_name = i > 0 ? `negative_prompt_${i + 1}` : `negative_prompt_${nodeInfo.node_id}`;
        const display_name = nodeInfo.title || `Negative Prompt ${i + 2}`;
        parameters.push({
          name: param_name,
          display_name,
          type: 'prompt',
          node_id: nodeInfo.node_id,
          input_name: nodeInfo.input_name,
          default: nodeInfo.text,
          description: 'Additional negative prompt',
        });
      }
    }

    return parameters;
  }

  /**
   * Extract LoRA slots from workflow
   */
  private _extractLoRAs(workflow: ComfyUIWorkflow): WorkflowLoRA[] {
    const loras: WorkflowLoRA[] = [];
    let loraCount = 0;

    for (const [node_id, node] of Object.entries(workflow)) {
      if (node_id === 'meta' || typeof node !== 'object' || node === null) {
        continue;
      }

      const typedNode = node as ComfyUINode;
      const class_type = typedNode.class_type || '';

      // Detect LoraLoader nodes
      if (class_type.includes('LoraLoader') || class_type === 'LoraLoaderModelOnly') {
        loraCount++;
        const inputs = typedNode.inputs || {};
        const actualLoraName = inputs.lora_name || '';

        // Extract just the filename without path
        let displayName: string;
        if (actualLoraName) {
          const parts = actualLoraName.split(/[\\/]/);
          const filename = parts[parts.length - 1];
          displayName = filename.replace(/\.[^/.]+$/, '');
        } else {
          displayName = `LoRA ${loraCount}`;
        }

        loras.push({
          name: `lora_${loraCount}`,
          display_name: displayName,
          node_id,
          strength_inputs: {
            model: 'strength_model',
            clip: 'strength_clip',
          },
          default_enabled: true,
          default_strength: inputs.strength_model ?? 0.75,
          required: true,
          lora_name: actualLoraName,
        });
      }
    }

    return loras;
  }

  /**
   * Extract image input requirements from workflow and add as parameters
   */
  private _extractImageInputs(workflow: ComfyUIWorkflow): WorkflowImageInput[] {
    const inputs: WorkflowImageInput[] = [];
    let inputCount = 0;

    for (const [node_id, node] of Object.entries(workflow)) {
      if (node_id === 'meta' || typeof node !== 'object' || node === null) {
        continue;
      }

      const typedNode = node as ComfyUINode;
      const class_type = typedNode.class_type || '';

      // Detect LoadImage nodes
      if (class_type === 'LoadImage') {
        inputCount++;
        inputs.push({
          name: `reference_image_${inputCount}`,
          display_name: `Reference Image ${inputCount}`,
          node_id,
          input_name: 'image',
          type: 'image',
          required: false,
          batch_min: 1,
          batch_max: 1,
          description: `Reference image for node ${node_id}`,
        });
      }

      // Detect LoadImageMask nodes
      if (class_type === 'LoadImageMask') {
        inputCount++;
        inputs.push({
          name: `mask_image_${inputCount}`,
          display_name: `Mask Image ${inputCount}`,
          node_id,
          input_name: 'image',
          type: 'mask',
          required: false,
          batch_min: 1,
          batch_max: 1,
          description: `Mask image for node ${node_id}`,
        });
      }
      
      // Detect VHS_LoadVideo and similar video loading nodes
      if (class_type === 'VHS_LoadVideo' || class_type === 'LoadVideo' || class_type.includes('LoadVideo')) {
        inputCount++;
        inputs.push({
          name: `video_input_${inputCount}`,
          display_name: `Video Input ${inputCount}`,
          node_id,
          input_name: 'video',
          type: 'image', // Use image type but will be displayed as video widget
          required: false,
          batch_min: 1,
          batch_max: 1,
          description: `Video input for node ${node_id}`,
        });
      }
    }

    return inputs;
  }

  /**
   * Convert image inputs to parameters for UI display
   */
  imageInputsToParameters(imageInputs: WorkflowImageInput[]): WorkflowParameter[] {
    return imageInputs.map((input) => {
      // Determine parameter type based on input name/type
      let paramType: WorkflowParameter['type'] = 'image';
      if (input.name.includes('video')) {
        paramType = 'video';
      } else if (input.type === 'mask') {
        paramType = 'image';
      }
      
      return {
        name: input.name,
        display_name: input.display_name,
        type: paramType,
        node_id: input.node_id,
        input_name: input.input_name,
        default: '',
        description: input.description,
        constraints: {
          min: input.batch_min,
          max: input.batch_max,
        },
      };
    });
  }

  /**
   * Extract output nodes (SaveImage, SaveVideo, etc.) from workflow
   */
  private _extractOutputs(workflow: ComfyUIWorkflow): WorkflowOutput[] {
    const outputs: WorkflowOutput[] = [];
    let outputCount = 0;

    for (const [node_id, node] of Object.entries(workflow)) {
      if (node_id === 'meta' || typeof node !== 'object' || node === null) {
        continue;
      }

      const typedNode = node as ComfyUINode;
      const class_type = typedNode.class_type || '';

      // Detect SaveImage nodes
      if (class_type === 'SaveImage' || class_type === 'PreviewImage') {
        outputCount++;
        outputs.push({
          node_id,
          name: `Output ${outputCount} (${class_type})`,
          type: 'image',
          selected: outputCount === 1, // Select first output by default
        });
      }

      // Detect video save nodes
      if (class_type.includes('SaveVideo') || class_type.includes('VideoSave')) {
        outputCount++;
        outputs.push({
          node_id,
          name: `Output ${outputCount} (Video)`,
          type: 'video',
          selected: outputCount === 1,
        });
      }
    }

    return outputs;
  }

  /**
   * Detect workflow categories based on node types
   */
  private _detectCategories(workflow: ComfyUIWorkflow): string[] {
    let hasLoadImage = false;
    let hasEmptyLatent = false;
    let hasSampler = false;
    let hasInpaintNodes = false;

    for (const [node_id, node] of Object.entries(workflow)) {
      if (node_id === 'meta' || typeof node !== 'object' || node === null) {
        continue;
      }

      const typedNode = node as ComfyUINode;
      const class_type = typedNode.class_type || '';

      if (class_type === 'LoadImage') {
        hasLoadImage = true;
      }

      if (class_type.includes('EmptyLatent')) {
        hasEmptyLatent = true;
      }

      if (class_type === 'KSampler') {
        hasSampler = true;
      }

      // Check for inpainting-specific nodes
      if (['VAEEncodeForInpaint', 'InpaintModelConditioning', 'Inpaint'].includes(class_type)) {
        hasInpaintNodes = true;
      }
    }

    // Decision tree for category detection
    const categories: string[] = [];

    if (hasLoadImage && !hasEmptyLatent) {
      categories.push('editing');
    }

    if (hasLoadImage && hasEmptyLatent) {
      categories.push('img2img');
    }

    if (hasEmptyLatent && hasSampler) {
      categories.push('generation');
    }

    if (hasInpaintNodes) {
      if (!categories.includes('img2img')) {
        categories.push('img2img');
      }
    }

    // Default to generation if no specific category detected
    if (categories.length === 0) {
      categories.push('generation');
    }

    return categories;
  }

  /**
   * Detect if workflow supports "Next Scene" functionality
   */
  private _detectNextSceneSupport(workflow: ComfyUIWorkflow): boolean {
    // Check for nodes that indicate img2img or editing workflows
    // These typically support "Next Scene" continuation
    for (const [node_id, node] of Object.entries(workflow)) {
      if (node_id === 'meta' || typeof node !== 'object' || node === null) {
        continue;
      }

      const typedNode = node as ComfyUINode;
      const class_type = typedNode.class_type || '';

      // Workflows with VAEEncode typically support next scene
      if (class_type.includes('VAEEncode') || class_type === 'LoadImage') {
        return true;
      }
    }

    return false;
  }

  /**
   * Build a workflow with parameter values applied
   * Returns workflow in ComfyUI API format (object with node IDs as keys)
   * @param customParamConfigs - Optional parameter configs from WorkflowEditor (for custom exposed params)
   */
  buildWorkflow(
    baseWorkflow: ComfyUIWorkflow | QwenWorkflowFormat,
    parameterValues: Record<string, any>,
    imageInputs: Record<string, string>,
    loraValues: Record<string, { enabled?: boolean; strength: number; bypassed?: boolean; lora_name?: string }>,
    customParamConfigs?: Array<{ name: string; node_id: string; input_name: string; exposed?: boolean }>
  ): ComfyUIWorkflow {
    // First, normalize to API format
    const normalizedBase = this.normalizeWorkflowFormat(baseWorkflow);
    const workflow = JSON.parse(JSON.stringify(normalizedBase)) as ComfyUIWorkflow;

    // Get parameter definitions from auto-detection
    const parsed = this.parseWorkflow(baseWorkflow);
    
    // Combine auto-detected parameters with custom configs
    // Custom configs take precedence for matching
    const allParams = [...parsed.parameters];
    
    // Add custom param configs that aren't already in allParams
    if (customParamConfigs) {
      for (const config of customParamConfigs) {
        if (!config.exposed) continue; // Only include exposed params
        
        const exists = allParams.some(p => 
          p.node_id === config.node_id && p.input_name === config.input_name
        );
        if (!exists) {
          allParams.push({
            name: config.name,
            display_name: config.name,
            description: '',
            type: 'enum' as const,
            node_id: config.node_id,
            input_name: config.input_name,
            default: null,
          });
        }
      }
    }

    // Apply parameter values
    // Support both naming conventions:
    // - Direct: "positive_prompt" (matches p.name)
    // - With node ID suffix: "positive_prompt_113" (matches p.name + "_" + p.node_id)
    console.log('[buildWorkflow] Applying parameters:', parameterValues);
    console.log('[buildWorkflow] Available params:', allParams.map(p => ({ name: p.name, node_id: p.node_id, input_name: p.input_name })));
    
    for (const [paramName, value] of Object.entries(parameterValues)) {
      // Try direct match first
      let param = allParams.find(p => p.name === paramName);
      
      // If not found, try matching with node ID suffix (e.g., "positive_prompt_113")
      if (!param) {
        param = allParams.find(p => paramName === `${p.name}_${p.node_id}`);
      }
      
      // Also try matching input_name with suffix (for image inputs stored as params)
      if (!param) {
        param = allParams.find(p => paramName === `${p.input_name}_${p.node_id}`);
      }

      if (param) {
        console.log(`[buildWorkflow] Matched param "${paramName}" to node ${param.node_id}.${param.input_name}`);
        const node = workflow[param.node_id] as ComfyUINode;
        if (node) {
          // For widgets_values array (Qwen format), we need to update by index
          if (node.widgets_values && Array.isArray(node.widgets_values)) {
            const widgetIndex = this._getWidgetIndex(node.class_type || '', param.input_name);
            if (widgetIndex >= 0) {
              node.widgets_values[widgetIndex] = value;
            }
          }
          // Also set in inputs for standard format
          if (!node.inputs) {
            node.inputs = {};
          }
          node.inputs[param.input_name] = value;
        }
      } else {
        console.log(`[buildWorkflow] No match for param "${paramName}"`);
      }
    }

    // Apply image inputs
    console.log('[buildWorkflow] === APPLYING IMAGE INPUTS ===');
    console.log('[buildWorkflow] imageInputs received:', Object.entries(imageInputs).map(([k, v]) => `${k}=${v}`));
    console.log('[buildWorkflow] parsed.image_inputs:', parsed.image_inputs.map(i => ({ name: i.name, node_id: i.node_id, input_name: i.input_name })));
    
    for (const [inputName, imagePath] of Object.entries(imageInputs)) {
      const input = parsed.image_inputs.find(i => i.name === inputName);

      if (input) {
        const node = workflow[input.node_id] as ComfyUINode;
        console.log(`[buildWorkflow] Processing image input "${inputName}" -> node ${input.node_id}.${input.input_name}, path=${imagePath}, node exists=${!!node}`);
        if (node) {
          // Check if this input is bypassed
          if (imagePath === '__BYPASSED__') {
            // Set node to bypass mode (mode: 4)
            console.log(`[buildWorkflow] !!! BYPASSING image input node ${input.node_id} (${inputName}, class_type=${node.class_type}) !!!`);
            node.mode = 4;
            continue;
          }
          
          if (!node.inputs) {
            node.inputs = {};
          }
          node.inputs[input.input_name] = imagePath;
          // Also update widgets_values if present
          if (node.widgets_values && Array.isArray(node.widgets_values)) {
            node.widgets_values[0] = imagePath;
          }
        }
      }
    }

    // Apply LoRA values to ALL LoRAs in the workflow
    // Use loraValues when provided, otherwise use defaults from the original workflow
    console.log(`[buildWorkflow] Processing ${parsed.loras.length} LoRAs, loraValues has ${Object.keys(loraValues).length} entries`);
    
    for (const lora of parsed.loras) {
      const node = workflow[lora.node_id] as ComfyUINode;
      if (!node) {
        console.warn(`[buildWorkflow] LoRA node ${lora.node_id} not found in workflow`);
        continue;
      }
      
      // Check if we have values for this LoRA from the UI
      const loraValue = loraValues[lora.name];
      
      if (loraValue) {
        // Use values from UI parameters
        const isBypassed = loraValue.bypassed === true || loraValue.enabled === false;
        
        if (isBypassed) {
          console.log(`[buildWorkflow] Bypassing LoRA node ${lora.node_id} (${lora.name})`);
          node.mode = 4;
        } else if (node.inputs) {
          // Apply strength values from UI
          node.inputs[lora.strength_inputs.model] = loraValue.strength;
          node.inputs[lora.strength_inputs.clip] = loraValue.strength;
          
          // Update lora_name if provided (for dropdown selection)
          if (loraValue.lora_name) {
            node.inputs['lora_name'] = loraValue.lora_name;
          }
          console.log(`[buildWorkflow] Applied LoRA ${lora.name} (node ${lora.node_id}): strength=${loraValue.strength}`);
        }
      } else {
        // No UI value provided - use defaults from original workflow
        // Ensure the LoRA node is NOT bypassed and uses original values
        console.log(`[buildWorkflow] Using defaults for LoRA ${lora.name} (node ${lora.node_id}) - not in UI params`);
        
        if (node.mode === 4) {
          // Remove bypass mode if it was set
          delete node.mode;
        }
        
        // Use original strength if node.inputs exists and has the strength input
        if (node.inputs && lora.strength_inputs.model in node.inputs) {
          // Keep original value - don't override
          console.log(`[buildWorkflow] Keeping original strength: ${node.inputs[lora.strength_inputs.model]}`);
        }
      }
    }

    // Clean up the workflow for API submission - remove non-essential fields
    // and filter out UI-only nodes that don't execute
    const apiWorkflow: ComfyUIWorkflow = {};
    
    // First pass: collect all bypassed node IDs
    const bypassedNodeIds = new Set<string>();
    console.log('[buildWorkflow] === BYPASS ANALYSIS START ===');
    console.log('[buildWorkflow] All nodes in workflow:', Object.keys(workflow).filter(k => k !== 'meta' && k !== 'version'));
    for (const [nodeId, node] of Object.entries(workflow)) {
      if (nodeId === 'meta' || nodeId === 'version') continue;
      const typedNode = node as ComfyUINode;
      if (typedNode.mode === 4) {
        bypassedNodeIds.add(nodeId);
        console.log(`[buildWorkflow] Node ${nodeId} (${typedNode.class_type}) is BYPASSED (mode=4)`);
      }
    }
    console.log(`[buildWorkflow] Total bypassed nodes: ${bypassedNodeIds.size}`, Array.from(bypassedNodeIds));
    
    // Second pass: build workflow, skipping bypassed/UI-only nodes
    for (const [nodeId, node] of Object.entries(workflow)) {
      if (nodeId === 'meta' || nodeId === 'version') continue;
      const typedNode = node as ComfyUINode;
      if (typedNode.class_type) {
        // Skip UI-only/display-only nodes that shouldn't be sent to the API
        if (this._isUiOnlyNode(typedNode.class_type)) {
          console.log(`[buildWorkflow] Skipping UI-only node ${nodeId} (${typedNode.class_type})`);
          continue;
        }
        
        // Skip bypassed nodes (mode=4 means bypassed in ComfyUI)
        if (typedNode.mode === 4) {
          console.log(`[buildWorkflow] Skipping bypassed node ${nodeId} (${typedNode.class_type})`);
          continue;
        }
        
        // Build the inputs for API format
        // Start with existing inputs (which contains linked node references)
        const apiInputs: Record<string, any> = { ...(typedNode.inputs || {}) };
        
        // If we have widgets_values, we need to map them to input names
        // This is necessary for graph-format workflows
        if (typedNode.widgets_values && Array.isArray(typedNode.widgets_values)) {
          const widgetNames = this._getWidgetNames(typedNode.class_type);
          typedNode.widgets_values.forEach((value, index) => {
            if (widgetNames[index] && value !== undefined) {
              // Don't overwrite linked inputs (those are already in apiInputs)
              if (!(widgetNames[index] in apiInputs)) {
                apiInputs[widgetNames[index]] = value;
              }
            }
          });
        }
        
        apiWorkflow[nodeId] = {
          class_type: typedNode.class_type,
          inputs: apiInputs,
        };
        // Include _meta if present
        if (typedNode._meta) {
          apiWorkflow[nodeId]._meta = typedNode._meta;
        }
      }
    }
    
    // Third pass: rewire or remove references to bypassed nodes from all inputs
    // In ComfyUI, node references are arrays like ["nodeId", outputIndex]
    // For LoRA nodes specifically, we need to rewire through the bypass chain
    if (bypassedNodeIds.size > 0) {
      // Build a map of what each bypassed node's inputs were (to enable rewiring)
      const bypassedNodeInputs = new Map<string, Record<string, any>>();
      for (const [nodeId, node] of Object.entries(workflow)) {
        if (bypassedNodeIds.has(nodeId)) {
          const typedNode = node as ComfyUINode;
          if (typedNode.inputs) {
            bypassedNodeInputs.set(nodeId, { ...typedNode.inputs });
          }
        }
      }
      
      console.log('[buildWorkflow] Bypassed node inputs map:', Object.fromEntries(bypassedNodeInputs));
      
      // Helper function to find the upstream source, following through bypassed nodes
      const findUpstreamSource = (nodeId: string, outputIndex: number): [string, number] | null => {
        console.log(`[findUpstreamSource] Checking node ${nodeId} (output ${outputIndex}), bypassed=${bypassedNodeIds.has(nodeId)}`);
        if (!bypassedNodeIds.has(nodeId)) {
          console.log(`[findUpstreamSource] Node ${nodeId} is NOT bypassed, returning as source`);
          return [nodeId, outputIndex];
        }
        
        // This node is bypassed, find what it was connected to
        const inputs = bypassedNodeInputs.get(nodeId);
        console.log(`[findUpstreamSource] Node ${nodeId} is bypassed, inputs:`, inputs);
        if (!inputs) return null;
        
        // For LoRA nodes, model is output 0, clip is output 1
        // Match output index to input name
        const inputName = outputIndex === 0 ? 'model' : 'clip';
        const upstreamRef = inputs[inputName];
        console.log(`[findUpstreamSource] Looking for upstream via input "${inputName}":`, upstreamRef);
        
        if (Array.isArray(upstreamRef) && upstreamRef.length >= 2) {
          const upstreamNodeId = String(upstreamRef[0]);
          const upstreamOutputIndex = Number(upstreamRef[1]);
          console.log(`[findUpstreamSource] Following to upstream ${upstreamNodeId}:${upstreamOutputIndex}`);
          // Recursively check if upstream is also bypassed
          return findUpstreamSource(upstreamNodeId, upstreamOutputIndex);
        }
        
        console.log(`[findUpstreamSource] No upstream found for node ${nodeId}`);
        return null;
      };
      
      console.log('[buildWorkflow] === PROCESSING INPUT REFERENCES ===');
      console.log('[buildWorkflow] API Workflow nodes:', Object.keys(apiWorkflow));
      
      // Track nodes that need to be removed because they lost required inputs
      const nodesToRemove = new Set<string>();
      
      // Helper to check if a node type requires certain inputs
      const isRequiredInput = (classType: string | undefined, inputName: string): boolean => {
        if (!classType) return false;
        // Image processing nodes that require an image input
        const imageRequiredNodes = [
          'LoadImage', 'ImageScale', 'ImageScaleToTotalPixels', 'ImageResize',
          'ImageResizeKJv2', 'ImageCrop', 'VAEEncode', 'DWPose', 'OpenposePreprocessor',
          'CannyEdgePreprocessor', 'LineartPreprocessor', 'DepthAnything',
          'InstantIDFaceAnalysis', 'ReActorFaceSwap', 'IPAdapter', 'ControlNetLoader'
        ];
        
        // For these node types, "image" input is required
        if (inputName === 'image' && imageRequiredNodes.some(t => classType?.includes(t))) {
          return true;
        }
        
        // For VAEEncode, "pixels" input is required
        if (inputName === 'pixels' && classType?.includes('VAEEncode')) {
          return true;
        }
        
        return false;
      };
      
      // Process inputs and identify nodes to remove
      for (const [nodeId, node] of Object.entries(apiWorkflow)) {
        const typedNode = node as ComfyUINode;
        if (typedNode.inputs) {
          const inputsToUpdate: Array<{name: string, value: [string, number]}> = [];
          const inputsToRemove: string[] = [];
          
          for (const [inputName, inputValue] of Object.entries(typedNode.inputs)) {
            // Check if this input is a reference to a bypassed node
            // Node references are arrays: ["nodeId", outputIndex]
            if (Array.isArray(inputValue) && inputValue.length >= 2) {
              const referencedNodeId = String(inputValue[0]);
              const outputIndex = Number(inputValue[1]);
              
              console.log(`[buildWorkflow] Node ${nodeId} input "${inputName}" references [${referencedNodeId}, ${outputIndex}], bypassed=${bypassedNodeIds.has(referencedNodeId)}`);
              
              if (bypassedNodeIds.has(referencedNodeId)) {
                // Try to rewire through the bypassed node
                console.log(`[buildWorkflow] Attempting to rewire through bypassed node ${referencedNodeId}`);
                const upstream = findUpstreamSource(referencedNodeId, outputIndex);
                if (upstream) {
                  console.log(`[buildWorkflow] ✓ Rewiring input "${inputName}" from bypassed node ${referencedNodeId} to upstream ${upstream[0]}:${upstream[1]}`);
                  inputsToUpdate.push({ name: inputName, value: upstream });
                } else {
                  // Check if this is a required input
                  if (isRequiredInput(typedNode.class_type, inputName)) {
                    console.log(`[buildWorkflow] ✗ Node ${nodeId} (${typedNode.class_type}) loses required input "${inputName}" - will remove entire node`);
                    nodesToRemove.add(nodeId);
                  } else {
                    // For optional inputs, just remove the input
                    console.log(`[buildWorkflow] ✗ Removing optional input "${inputName}" from node ${nodeId}`);
                    inputsToRemove.push(inputName);
                  }
                }
              }
            }
          }
          
          // Apply updates (only if node wasn't marked for removal)
          if (!nodesToRemove.has(nodeId)) {
            for (const update of inputsToUpdate) {
              typedNode.inputs![update.name] = update.value;
            }
            for (const inputName of inputsToRemove) {
              delete typedNode.inputs![inputName];
            }
          }
        }
      }
      
      // Remove nodes that lost required inputs (with cascading/recursive removal)
      let iteration = 0;
      const maxIterations = 10; // Safety limit
      
      while (nodesToRemove.size > 0 && iteration < maxIterations) {
        iteration++;
        console.log(`[buildWorkflow] Removal iteration ${iteration}: removing ${Array.from(nodesToRemove)}`);
        
        // Remove the identified nodes
        for (const nodeId of nodesToRemove) {
          if (apiWorkflow[nodeId]) {
            delete apiWorkflow[nodeId];
            console.log(`[buildWorkflow] Removed node ${nodeId}`);
          }
        }
        
        // Clean up references and check for new nodes that lost required inputs
        const newNodesToRemove = new Set<string>();
        
        for (const [nodeId, node] of Object.entries(apiWorkflow)) {
          const typedNode = node as ComfyUINode;
          if (typedNode.inputs) {
            for (const [inputName, inputValue] of Object.entries(typedNode.inputs)) {
              if (Array.isArray(inputValue) && inputValue.length >= 2) {
                const referencedNodeId = String(inputValue[0]);
                
                // If reference points to removed node, remove this input
                if (nodesToRemove.has(referencedNodeId) || !apiWorkflow[referencedNodeId]) {
                  console.log(`[buildWorkflow] Node ${nodeId} loses input "${inputName}" (referenced ${referencedNodeId} was removed)`);
                  delete typedNode.inputs[inputName];
                  
                  // Check if this was a required input
                  if (isRequiredInput(typedNode.class_type, inputName)) {
                    console.log(`[buildWorkflow] Node ${nodeId} (${typedNode.class_type}) lost required input "${inputName}" - will remove`);
                    newNodesToRemove.add(nodeId);
                  }
                }
              }
            }
          }
        }
        
        // Update for next iteration
        nodesToRemove.clear();
        for (const nodeId of newNodesToRemove) {
          nodesToRemove.add(nodeId);
        }
      }
      
      if (iteration >= maxIterations) {
        console.warn('[buildWorkflow] Warning: Hit max iterations for cascading removal');
      }
      
      console.log(`[buildWorkflow] Cascading removal completed after ${iteration} iterations`);
      
      console.log('[buildWorkflow] === BYPASS ANALYSIS END ===');
    }
    
    // Log final state of critical nodes if they exist
    if (apiWorkflow['76']) {
      console.log('[buildWorkflow] FINAL STATE: Node 76:', (apiWorkflow['76'] as ComfyUINode).inputs);
    }
    if (apiWorkflow['81']) {
      console.log('[buildWorkflow] FINAL STATE: Node 81:', (apiWorkflow['81'] as ComfyUINode).inputs);
    }
    if (apiWorkflow['120']) {
      console.log('[buildWorkflow] FINAL STATE: Node 120:', (apiWorkflow['120'] as ComfyUINode).inputs);
    }
    if (apiWorkflow['122']) {
      console.log('[buildWorkflow] FINAL STATE: Node 122:', (apiWorkflow['122'] as ComfyUINode).inputs);
    }

    return apiWorkflow;
  }
  
  /**
   * Check if a node type is UI-only (doesn't execute on the backend)
   * These nodes are used for documentation, notes, and visual organization
   */
  private _isUiOnlyNode(classType: string): boolean {
    const uiOnlyNodes = [
      // Note/documentation nodes
      'Note',
      'MarkdownNote', 
      'PrimitiveNode',
      'Reroute',
      
      // Group/organization nodes (these are typically stripped anyway)
      'GroupNode',
      
      // Preview nodes that don't produce output files
      // Note: PreviewImage DOES execute, so we don't include it
      
      // Other common UI-only custom nodes
      'ttN pipeLoader', // Sometimes used as passthrough
      'ShowText|pysssss', // Display-only
      'ShowAnything', // Display-only
    ];
    
    // Check exact match
    if (uiOnlyNodes.includes(classType)) {
      return true;
    }
    
    // Check patterns - nodes that are purely for display/organization
    const uiOnlyPatterns = [
      /^Note$/i,
      /Note$/,  // Ends with "Note" (e.g., MarkdownNote, TextNote)
      /^Comment/i,
      /^Sticky/i,
    ];
    
    return uiOnlyPatterns.some(pattern => pattern.test(classType));
  }
  
  /**
   * Get widget index for a parameter in QwenImageIntegratedKSampler
   */
  private _getWidgetIndex(class_type: string, inputName: string): number {
    if (class_type === 'QwenImageIntegratedKSampler') {
      const indices: Record<string, number> = {
        'prompt': 0,
        'negative_prompt': 1,
        'mode': 2,
        'batch_size': 3,
        'image1_weight': 4,
        'image2_weight': 5,
        'seed': 6,
        'control_after_generate': 7,
        'steps': 8,
        'denoise': 9,
        'sampler_name': 10,
        'scheduler': 11,
        'scale_method': 12,
        'cfg': 13,
      };
      return indices[inputName] ?? -1;
    }
    return -1;
  }
}

// Singleton instance
let parserInstance: WorkflowParser | null = null;

export function getWorkflowParser(): WorkflowParser {
  if (!parserInstance) {
    parserInstance = new WorkflowParser();
  }
  return parserInstance;
}

export default WorkflowParser;
