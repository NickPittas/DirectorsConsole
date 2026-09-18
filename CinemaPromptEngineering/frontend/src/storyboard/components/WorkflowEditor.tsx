/**
 * Workflow Editor Component
 * 
 * Allows users to:
 * - View all workflow nodes and inputs
 * - Select which parameters to expose
 * - Customize parameter display names, types, and constraints
 * - Reorder parameters
 * - Auto-save parameter configurations
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import {
  ComfyUIWorkflow,
  ParsedWorkflow,
  QwenWorkflowFormat,
} from '../services/workflow-parser';
import { nodeDefinitions } from '../services/node-definitions';
import {
  findWorkflowNode,
  getWorkflowNodeClassType,
  getWorkflowNodeInput,
  listWorkflowNodes,
  resolveEnumConfig,
} from '../services/workflow-editor-options';
import './WorkflowEditor.css';

// ============================================================================
// Types
// ============================================================================

interface WorkflowEditorProps {
  workflow: ComfyUIWorkflow | QwenWorkflowFormat | null;
  parsedWorkflow: ParsedWorkflow | null;
  initialConfig?: ParameterConfig[];
  comfyUrl?: string; // URL to fetch node definitions
  onSave: (config: ParameterConfig[]) => void;
  onCancel: () => void;
}

export interface ParameterConfig {
  // Core identification
  name: string;
  display_name: string;
  node_id: string;
  input_name: string;
  
  // Type and UI
  type: 'integer' | 'float' | 'seed' | 'enum' | 'boolean' | 'prompt' | 'string' | 'image' | 'image_list' | 'video' | 'video_list' | 'media' | 'lora';
  default: any;
  description: string;
  
  // Constraints
  constraints?: {
    min?: number;
    max?: number;
    step?: number;
    options?: string[];
    availableLoras?: string[];  // For lora type
    lora_name?: string;         // Current lora selection
    bypassed?: boolean;         // For lora bypass state
  };
  
  // Metadata
  order: number;
  exposed: boolean;
  category: 'parameter' | 'image_input' | 'lora';
  
  // Source tracking
  auto_detected: boolean;
  user_modified: boolean;
}

interface NodeInfo {
  id: string;
  class_type: string;
  title: string;
  inputs: Array<{
    name: string;
    value: any;
    type: string;
    exposed: boolean;
  }>;
}

// Known input types for auto-detection
const KNOWN_INPUT_TYPES: Record<string, string> = {
  seed: 'seed',
  steps: 'integer',
  cfg: 'float',
  denoise: 'float',
  strength: 'float',
  noise_seed: 'seed',
  text: 'prompt',
  prompt: 'prompt',
  positive: 'prompt',
  negative: 'prompt',
  width: 'integer',
  height: 'integer',
  batch_size: 'integer',
  sampler_name: 'enum',
  scheduler: 'enum',
};

// Known enum options
const KNOWN_ENUM_OPTIONS: Record<string, string[]> = {
  sampler_name: [
    'euler', 'euler_cfg_pp', 'euler_ancestral', 'euler_ancestral_cfg_pp',
    'heun', 'heunpp2', 'dpm_2', 'dpm_2_ancestral', 'lms', 'dpm_fast',
    'dpm_adaptive', 'dpmpp_2s_ancestral', 'dpmpp_sde', 'dpmpp_2m',
    'ddpm', 'lcm', 'ipndm', 'ddim', 'uni_pc'
  ],
  scheduler: ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple'],
};

// ============================================================================
// Helper Functions
// ============================================================================

function inferParameterType(inputName: string, value: any): string {
  const lowerName = inputName.toLowerCase();
  
  // Check known types first
  if (KNOWN_INPUT_TYPES[lowerName]) {
    return KNOWN_INPUT_TYPES[lowerName];
  }
  
  // Infer from value type
  if (typeof value === 'boolean') return 'boolean';
  if (typeof value === 'number') {
    if (Number.isInteger(value)) return 'integer';
    return 'float';
  }
  if (typeof value === 'string') {
    if (lowerName.includes('prompt') || lowerName.includes('text')) {
      return 'prompt';
    }
    return 'string';
  }
  
  return 'string';
}

function getDefaultConstraints(type: string, _value: any): any {
  switch (type) {
    case 'integer':
      return {
        min: 0,
        max: 100,
        step: 1,
      };
    case 'float':
      return {
        min: 0,
        max: 1,
        step: 0.01,
      };
    case 'seed':
      return {
        min: -1,
        max: 2147483647,
        step: 1,
      };
    case 'enum':
      return {
        options: [],
      };
    default:
      return undefined;
  }
}

// ============================================================================
// Workflow Editor Component
// ============================================================================

export function WorkflowEditor({ 
  workflow, 
  parsedWorkflow, 
  initialConfig,
  comfyUrl,
  onSave, 
  onCancel 
}: WorkflowEditorProps) {
  const [configs, setConfigs] = useState<ParameterConfig[]>([]);
  const [selectedConfig, setSelectedConfig] = useState<ParameterConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'exposed' | 'all' | 'nodes'>('exposed');
  const [searchTerm, setSearchTerm] = useState('');
  const [hasChanges, setHasChanges] = useState(false);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const draggedIndexRef = useRef<number | null>(null);
  const [nodeDefsLoaded, setNodeDefsLoaded] = useState(false);
  const [availableLoras, setAvailableLoras] = useState<string[]>([]);
  const loadedDefinitionsUrlRef = useRef<string | null>(null);
  const workflowRef = useRef(workflow);
  workflowRef.current = workflow;
  
  // Fetch definitions for the currently selected ComfyUI URL only.
  useEffect(() => {
    let active = true;
    loadedDefinitionsUrlRef.current = null;
    setNodeDefsLoaded(false);
    setAvailableLoras([]);
    setConfigs(previous => previous.map(config => {
      if (config.input_name !== 'ckpt_name') return config;
      return resolveEnumConfig(workflowRef.current, config, []) as ParameterConfig;
    }));
    if (!comfyUrl) return () => { active = false; };

    nodeDefinitions.fetchDefinitions(comfyUrl)
      .then(() => {
        if (!active) return;
        loadedDefinitionsUrlRef.current = comfyUrl;
        setNodeDefsLoaded(true);
        console.log('[WorkflowEditor] Node definitions loaded');
      })
      .catch(err => {
        if (active) console.error('[WorkflowEditor] Failed to load node definitions:', err);
      });

    nodeDefinitions.getLoras(comfyUrl)
      .then(loras => {
        if (!active) return;
        setAvailableLoras(loras);
        console.log(`[WorkflowEditor] Loaded ${loras.length} available LoRAs`);
      })
      .catch(err => {
        if (active) console.error('[WorkflowEditor] Failed to load LoRAs:', err);
      });

    return () => { active = false; };
  }, [comfyUrl]);
  
  // Initialize configs from parsed workflow or initial config
  useEffect(() => {
    if (initialConfig && initialConfig.length > 0) {
      // Sort by order when loading initial config
      const sortedConfigs = [...initialConfig].sort((a, b) => a.order - b.order);
      setConfigs(sortedConfigs);
    } else if (parsedWorkflow) {
      // Convert parsed workflow to configs
      const newConfigs: ParameterConfig[] = [];
      
      // Add regular parameters
      parsedWorkflow.parameters.forEach((param, idx) => {
        newConfigs.push({
          name: param.name,
          display_name: param.display_name,
          node_id: param.node_id,
          input_name: param.input_name,
          type: param.type,
          default: param.default,
          description: param.description,
          constraints: param.constraints,
          order: idx,
          exposed: true,
          category: 'parameter',
          auto_detected: true,
          user_modified: false,
        });
      });
      
      // Add image/video inputs
      parsedWorkflow.image_inputs.forEach((input, idx) => {
        // Preserve the parsed type: 'video' for video loaders, 'image' for images/masks
        const configType = input.type === 'video' ? 'video' : 'image';
        newConfigs.push({
          name: input.name,
          display_name: input.display_name,
          node_id: input.node_id,
          input_name: input.input_name,
          type: configType,
          default: '',
          description: input.description,
          order: parsedWorkflow.parameters.length + idx,
          exposed: true,
          category: 'image_input',
          auto_detected: true,
          user_modified: false,
        });
      });
      
      // Add LoRAs
      parsedWorkflow.loras.forEach((lora, index) => {
        newConfigs.push({
          name: lora.name,
          display_name: lora.display_name,
          node_id: lora.node_id,
          input_name: 'strength_model',
          type: 'lora',
          default: lora.default_strength,
          description: `LoRA: ${lora.display_name}`,
          constraints: { 
            min: -10, 
            max: 10, 
            step: 0.01,
            availableLoras: [],  // Populated by the live options effect
            lora_name: lora.lora_name || '',  // Current lora selection from workflow
            bypassed: false
          },
          order: parsedWorkflow.parameters.length + parsedWorkflow.image_inputs.length + index,
          exposed: true,
          category: 'lora',
          auto_detected: true,
          user_modified: false,
        });
      });
      
      setConfigs(newConfigs);
    }
  }, [parsedWorkflow, initialConfig]);
  
  // Apply options from the selected node's ComfyUI URL without dropping offline/imported values.
  useEffect(() => {
    if (!nodeDefsLoaded || loadedDefinitionsUrlRef.current !== comfyUrl || !workflow || configs.length === 0) return;
    setConfigs(previous => {
      let changed = false;
      const nextConfigs = previous.map(config => {
        if (config.input_name !== 'ckpt_name') return config;
        const node = findWorkflowNode(workflow, config.node_id);
        if (getWorkflowNodeClassType(node) !== 'CheckpointLoaderSimple') return config;
        const liveOptions = nodeDefinitions.getEnumOptions('CheckpointLoaderSimple', 'ckpt_name') || [];
        const resolved = resolveEnumConfig(workflow, config, liveOptions);
        if (
          config.type === resolved.type &&
          config.default === resolved.default &&
          JSON.stringify(config.constraints?.options || []) === JSON.stringify(resolved.constraints?.options || [])
        ) return config;
        changed = true;
        return resolved as ParameterConfig;
      });
      return changed ? nextConfigs : previous;
    });
  }, [configs, nodeDefsLoaded, workflow, comfyUrl]);

  // Refresh live LoRA metadata without changing values or user-owned flags.
  // Context dependencies reapply unchanged URL metadata after workflow initialization.
  useEffect(() => {
    setConfigs(prevConfigs => {
      let changed = false;
      const nextConfigs = prevConfigs.map(config => {
        if (config.category !== 'lora') return config;
        const currentLoras = config.constraints?.availableLoras || [];
        if (
          currentLoras.length === availableLoras.length &&
          currentLoras.every((lora, index) => lora === availableLoras[index])
        ) return config;
        changed = true;
        return {
          ...config,
          constraints: {
            ...config.constraints,
            availableLoras,
          },
        };
      });
      return changed ? nextConfigs : prevConfigs;
    });
  }, [availableLoras, parsedWorkflow, initialConfig]);
  
  // Auto-save to localStorage
  useEffect(() => {
    if (hasChanges && configs.length > 0) {
      const timeout = setTimeout(() => {
        const workflowId = workflow ? JSON.stringify(workflow).slice(0, 50) : 'unknown';
        localStorage.setItem(`workflow_config_${workflowId}`, JSON.stringify(configs));
        console.log('Auto-saved workflow configuration');
      }, 1000);
      
      return () => clearTimeout(timeout);
    }
  }, [configs, hasChanges, workflow]);
  
  // Extract all nodes from workflow for the "all" tab
  const extractAllNodes = useCallback((): NodeInfo[] => {
    if (!workflow) return [];
    
    const nodes: NodeInfo[] = [];

    for (const [nodeId, node] of listWorkflowNodes(workflow)) {
      const classType = getWorkflowNodeClassType(node);
      const inputEntries = Object.entries(node.inputs || {});
      if (classType === 'CheckpointLoaderSimple' && !inputEntries.some(([name]) => name === 'ckpt_name')) {
        const value = getWorkflowNodeInput(node, 'ckpt_name');
        if (value !== undefined) inputEntries.push(['ckpt_name', value]);
      }
      const inputs: NodeInfo['inputs'] = inputEntries
        .filter(([, inputValue]) => !Array.isArray(inputValue))
        .map(([inputName, inputValue]) => ({
          name: inputName,
          value: inputValue,
          type: typeof inputValue,
          exposed: configs.some(c => c.node_id === nodeId && c.input_name === inputName && c.exposed),
        }));

      if (inputs.length > 0) {
        nodes.push({
          id: nodeId,
          class_type: classType || 'Unknown',
          title: node._meta?.title || classType || `Node ${nodeId}`,
          inputs,
        });
      }
    }

    return nodes;
  }, [workflow, configs]);
  
  // Add a new parameter from a node input
  const addParameter = useCallback((nodeId: string, inputName: string, value: any) => {
    let type = inferParameterType(inputName, value);
    let constraints = getDefaultConstraints(type, value) || {};
    
    // Check node definitions FIRST to see if this is actually an enum
    const node = findWorkflowNode(workflow, nodeId);
    const classType = getWorkflowNodeClassType(node);
    if (classType) {
      const inputDef = nodeDefinitions.getInputDefinition(classType, inputName);
      if (inputDef?.isEnum && inputDef.options) {
        // Override the inferred type - this is actually an enum!
        type = 'enum';
        constraints = { options: inputDef.options };
        console.log(`[WorkflowEditor] Detected enum from node definitions: ${classType}.${inputName}`, inputDef.options);
      }
    }
    
    // Fallback: Auto-populate enum options from known list
    if (type === 'enum' && !constraints.options && KNOWN_ENUM_OPTIONS[inputName.toLowerCase()]) {
      constraints.options = KNOWN_ENUM_OPTIONS[inputName.toLowerCase()];
    }
    
    const newConfig: ParameterConfig = {
      name: `${inputName}_${nodeId}`,
      display_name: inputName.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      node_id: nodeId,
      input_name: inputName,
      type: type as any,
      default: value,
      description: `Parameter ${inputName} from node ${nodeId}`,
      constraints,
      order: configs.length,
      exposed: true,
      category: 'parameter',
      auto_detected: false,
      user_modified: true,
    };
    
    setConfigs(prev => [...prev, newConfig]);
    setHasChanges(true);
  }, [configs.length, workflow]);
  
  // Update a parameter config
  const updateConfig = useCallback((index: number, updates: Partial<ParameterConfig>) => {
    setConfigs(prev => {
      const newConfigs = [...prev];
      newConfigs[index] = { ...newConfigs[index], ...updates, user_modified: true };
      return newConfigs;
    });
    setHasChanges(true);
  }, []);
  
  // Remove a parameter
  const removeParameter = useCallback((index: number) => {
    setConfigs(prev => prev.filter((_, i) => i !== index));
    setHasChanges(true);
    if (selectedConfig && configs[index] === selectedConfig) {
      setSelectedConfig(null);
    }
  }, [configs, selectedConfig]);
  
  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    draggedIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    // Required for Firefox
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragEnd = useCallback(() => {
    draggedIndexRef.current = null;
    setDraggedIndex(null);
  }, []);

  const handleDragEnter = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();

    const currentDraggedIndex = draggedIndexRef.current;
    if (currentDraggedIndex === null || currentDraggedIndex === index) return;

    // Reorder configs
    setConfigs(prev => {
      const newConfigs = [...prev];
      const draggedConfig = newConfigs[currentDraggedIndex];
      newConfigs.splice(currentDraggedIndex, 1);
      newConfigs.splice(index, 0, draggedConfig);

      // Update order values
      newConfigs.forEach((config, i) => {
        config.order = i;
      });

      return newConfigs;
    });

    draggedIndexRef.current = index;
    setDraggedIndex(index);
    setHasChanges(true);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, _index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    // Reordering is handled in handleDragEnter for better UX
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    draggedIndexRef.current = null;
    setDraggedIndex(null);
  }, []);
  
  // Filter configs based on search and tab
  const filteredConfigs = configs.filter(config => {
    const matchesSearch = 
      config.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      config.display_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      config.node_id.toLowerCase().includes(searchTerm.toLowerCase());
    
    if (activeTab === 'exposed') return config.exposed && matchesSearch;
    return matchesSearch;
  });
  
  // Handle save
  const handleSave = useCallback(() => {
    // Sort by order before saving
    const sortedConfigs = [...configs].sort((a, b) => a.order - b.order);
    onSave(sortedConfigs);
  }, [configs, onSave]);
  
  // Get all nodes for the "all" tab
  const allNodes = extractAllNodes();
  
  // ============================================================================
  // Render
  // ============================================================================
  
  if (!workflow) {
    return (
      <div className="workflow-editor">
        <div className="editor-empty">
          <p>No workflow loaded. Please import a workflow first.</p>
          <button className="editor-btn" onClick={onCancel}>Close</button>
        </div>
      </div>
    );
  }
  
  return (
    <div className="workflow-editor">
      {/* Header */}
      <div className="editor-header">
        <h2>Workflow Editor</h2>
        <div className="editor-actions">
          <button 
            className="editor-btn secondary"
            onClick={onCancel}
          >
            Cancel
          </button>
          <button 
            className="editor-btn primary"
            onClick={handleSave}
          >
            Save Configuration
          </button>
        </div>
      </div>
      
      {/* Tabs */}
      <div className="editor-tabs">
        <button 
          className={`editor-tab ${activeTab === 'exposed' ? 'active' : ''}`}
          onClick={() => setActiveTab('exposed')}
        >
          Exposed Parameters ({configs.filter(c => c.exposed).length})
        </button>
        <button 
          className={`editor-tab ${activeTab === 'all' ? 'active' : ''}`}
          onClick={() => setActiveTab('all')}
        >
          All Nodes
        </button>
      </div>
      
      {/* Search */}
      <div className="editor-search">
        <input
          type="text"
          placeholder="Search parameters..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
      
      {/* Content */}
      <div className="editor-content">
        {activeTab === 'exposed' && (
          <div className="parameters-list">
            {filteredConfigs.length === 0 ? (
              <p className="empty-message">No exposed parameters. Add parameters from the "All Nodes" tab.</p>
            ) : (
              filteredConfigs.map((config, index) => (
                <ParameterConfigCard
                  key={`${config.node_id}-${config.input_name}`}
                  config={config}
                  workflow={workflow}
                  isSelected={selectedConfig === config}
                  onSelect={() => setSelectedConfig(config)}
                  onUpdate={(updates) => updateConfig(index, updates)}
                  onRemove={() => removeParameter(index)}
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragOver={(e) => handleDragOver(e, index)}
                  onDragEnter={(e) => handleDragEnter(e, index)}
                  onDrop={handleDrop}
                  onDragEnd={handleDragEnd}
                  isDragging={draggedIndex === index}
                />
              ))
            )}
          </div>
        )}
        
        {activeTab === 'all' && (
          <div className="nodes-list">
            {allNodes.map((node) => (
              <NodeCard
                key={node.id}
                node={node}
                onAddParameter={(inputName, value) => addParameter(node.id, inputName, value)}
              />
            ))}
          </div>
        )}
      </div>
      
      {hasChanges && (
        <div className="editor-status">
          Unsaved changes will be auto-saved
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Parameter Config Card Component
// ============================================================================

interface ParameterConfigCardProps {
  config: ParameterConfig;
  workflow: ComfyUIWorkflow | QwenWorkflowFormat | null;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<ParameterConfig>) => void;
  onRemove: () => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnter: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  isDragging: boolean;
}

function ParameterConfigCard({
  config,
  workflow,
  isSelected,
  onSelect,
  onUpdate,
  onRemove,
  onDragStart,
  onDragOver,
  onDragEnter,
  onDrop,
  onDragEnd,
  isDragging,
}: ParameterConfigCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div
      className={`parameter-config-card ${isSelected ? 'selected' : ''} ${config.auto_detected ? 'auto' : 'manual'} ${isDragging ? 'dragging' : ''}`}
      onClick={onSelect}
      onDragOver={onDragOver}
      onDragEnter={onDragEnter}
      onDrop={onDrop}
    >
      <div className="config-header">
        <div className="config-order">
          <div
            className="drag-handle"
            title="Drag to reorder"
            draggable="true"
            onDragStart={(e) => {
              e.stopPropagation();
              onDragStart(e);
            }}
            onDragEnd={(e) => {
              e.stopPropagation();
              onDragEnd();
            }}
            onClick={(e) => e.stopPropagation()}
          >
            ☰
          </div>
        </div>
        
        <div className="config-info">
          <input
            type="text"
            className="config-name"
            value={config.display_name}
            onChange={(e) => onUpdate({ display_name: e.target.value })}
            onClick={(e) => e.stopPropagation()}
            placeholder="Display Name"
          />
          <span className="config-meta">
            {config.node_id} → {config.input_name} ({config.type})
          </span>
        </div>
        <div className="config-actions">
          <button 
            className="config-toggle"
            onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }}
          >
            {isExpanded ? '▼' : '▶'}
          </button>
          <button 
            className="config-remove"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            title="Remove parameter"
          >
            ✕
          </button>
        </div>
      </div>
      
      {isExpanded && (
        <div className="config-details" onClick={(e) => e.stopPropagation()}>
          <div className="config-row">
            <label>Name (internal):</label>
            <input
              type="text"
              value={config.name}
              onChange={(e) => onUpdate({ name: e.target.value })}
              placeholder="snake_case_name"
            />
          </div>
          
          <div className="config-row">
            <label>Type:</label>
            <select 
              value={config.type}
              onChange={(e) => onUpdate({ type: e.target.value as any })}
            >
              <option value="integer">Integer</option>
              <option value="float">Float</option>
              <option value="seed">Seed</option>
              <option value="boolean">Boolean</option>
              <option value="enum">Enum</option>
              <option value="prompt">Prompt</option>
              <option value="string">String</option>
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="media">Media (Image/Video)</option>
            </select>
          </div>
          
          <div className="config-row">
            <label>Default Value:</label>
            <input
              type="text"
              value={String(config.default)}
              onChange={(e) => {
                let value: any = e.target.value;
                if (config.type === 'integer' || config.type === 'seed') {
                  value = parseInt(value) || 0;
                } else if (config.type === 'float') {
                  value = parseFloat(value) || 0;
                } else if (config.type === 'boolean') {
                  value = value === 'true';
                }
                onUpdate({ default: value });
              }}
            />
          </div>
          
          <div className="config-row">
            <label>Description:</label>
            <input
              type="text"
              value={config.description}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder="Parameter description"
            />
          </div>
          
          {(config.type === 'integer' || config.type === 'float' || config.type === 'seed') && (
            <div className="config-constraints">
              <div className="config-row">
                <label>Min:</label>
                <input
                  type="number"
                  value={config.constraints?.min ?? 0}
                  onChange={(e) => onUpdate({ 
                    constraints: { ...config.constraints, min: parseFloat(e.target.value) }
                  })}
                />
              </div>
              <div className="config-row">
                <label>Max:</label>
                <input
                  type="number"
                  value={config.constraints?.max ?? 100}
                  onChange={(e) => onUpdate({ 
                    constraints: { ...config.constraints, max: parseFloat(e.target.value) }
                  })}
                />
              </div>
              <div className="config-row">
                <label>Step:</label>
                <input
                  type="number"
                  value={config.constraints?.step ?? 1}
                  onChange={(e) => onUpdate({ 
                    constraints: { ...config.constraints, step: parseFloat(e.target.value) }
                  })}
                />
              </div>
            </div>
          )}
          
          {config.type === 'enum' && (
            <div className="config-row">
              <label>Options (comma-separated):</label>
              <div className="enum-options-row">
                <input
                  type="text"
                  value={config.constraints?.options?.join(', ') || ''}
                  onChange={(e) => onUpdate({ 
                    constraints: { 
                      ...config.constraints, 
                      options: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                    }
                  })}
                  placeholder="option1, option2, option3"
                />
                <button
                  type="button"
                  className="fetch-options-btn"
                  onClick={() => {
                    if (!workflow) return;
                    const node = findWorkflowNode(workflow, config.node_id);
                    const classType = getWorkflowNodeClassType(node);
                    if (classType) {
                      const enumOptions = nodeDefinitions.getEnumOptions(classType, config.input_name);
                      if (enumOptions && enumOptions.length > 0) {
                        onUpdate({ 
                          constraints: { 
                            ...config.constraints, 
                            options: enumOptions
                          }
                        });
                      } else {
                        alert(`No enum options found for ${classType}.${config.input_name}.\nMake sure ComfyUI is connected.`);
                      }
                    }
                  }}
                  title="Fetch options from ComfyUI"
                >
                  🔄 Fetch
                </button>
              </div>
            </div>
          )}
          
          <div className="config-flags">
            <label className="flag">
              <input
                type="checkbox"
                checked={config.exposed}
                onChange={(e) => onUpdate({ exposed: e.target.checked })}
              />
              Exposed in UI
            </label>
            <span className="config-source">
              {config.auto_detected ? '🤖 Auto-detected' : '👤 User-defined'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Node Card Component
// ============================================================================

interface NodeCardProps {
  node: NodeInfo;
  onAddParameter: (inputName: string, value: any) => void;
}

function NodeCard({ node, onAddParameter }: NodeCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  
  return (
    <div className="node-card">
      <div className="node-header" onClick={() => setIsExpanded(!isExpanded)}>
        <span className="node-toggle">{isExpanded ? '▼' : '▶'}</span>
        <div className="node-info">
          <span className="node-title">{node.title}</span>
          <span className="node-type">{node.class_type}</span>
        </div>
        <span className="node-id">ID: {node.id}</span>
      </div>
      
      {isExpanded && (
        <div className="node-inputs">
          {node.inputs.map((input) => (
            <div key={input.name} className={`node-input ${input.exposed ? 'exposed' : ''}`}>
              <div className="input-info">
                <span className="input-name">{input.name}</span>
                <span className="input-type">{input.type}</span>
                <span className="input-value">{String(input.value).slice(0, 50)}</span>
              </div>              
              {!input.exposed ? (
                <button 
                  className="input-add-btn"
                  onClick={() => onAddParameter(input.name, input.value)}
                >
                  + Expose
                </button>
              ) : (
                <span className="input-added">✓ Exposed</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default WorkflowEditor;
