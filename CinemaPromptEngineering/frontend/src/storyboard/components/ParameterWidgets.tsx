/**
 * Dynamic Parameter Components
 * 
 * Renders parameter widgets based on type (integer, float, seed, enum, boolean, prompt)
 */

import { useState, useCallback, useEffect } from 'react';
import { WorkflowParameter } from '../services/workflow-parser';
import { ImageDropZone } from './ImageDropZone';
import { CameraAngle, parseAngleFromPrompt, removeAnglePrefix } from '../data/cameraAngleData';
import CameraAngleSelector from './CameraAngleSelector';
import { useCinemaStore } from '@/store';
import './ParameterWidgets.css';

// ============================================================================
// Props Interface
// ============================================================================

interface ParameterWidgetProps {
  parameter: WorkflowParameter;
  value: any;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
  comfyUrl?: string;
}

interface PromptWidgetProps extends ParameterWidgetProps {
  onEnhance?: (prompt: string) => Promise<string>;
  cameraAngle?: CameraAngle | null;
  onCameraAngleChange?: (angle: CameraAngle | null) => void;
}

interface ParameterPanelProps {
  parameters: WorkflowParameter[];
  values: Record<string, any>;
  onChange: (name: string, value: any) => void;
  disabled?: boolean;
  onEnhancePrompt?: (prompt: string) => Promise<string>;
  cameraAngles?: Record<string, CameraAngle | null>;
  onCameraAngleChange?: (paramName: string, angle: CameraAngle | null) => void;
  comfyUrl?: string;
}

// ============================================================================
// Integer Widget
// ============================================================================

export function IntegerWidget({ parameter, value, onChange, disabled }: ParameterWidgetProps) {
  const [localValue, setLocalValue] = useState(value ?? parameter.default);
  
  // Sync local state when value prop changes (e.g., when loading from a panel)
  useEffect(() => {
    setLocalValue(value ?? parameter.default);
  }, [value, parameter.default]);
  
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value);
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value) || 0;
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  const constraints = parameter.constraints || {};
  
  return (
    <div className="parameter-widget integer-widget">
      <label className="parameter-label">{parameter.display_name}</label>
      <div className="parameter-control">
        <input
          type="range"
          className="parameter-slider"
          min={constraints.min ?? 0}
          max={constraints.max ?? 100}
          step={constraints.step ?? 1}
          value={localValue}
          onChange={handleSliderChange}
          disabled={disabled}
        />
        <input
          type="number"
          className="parameter-input"
          min={constraints.min ?? 0}
          max={constraints.max ?? 100}
          step={constraints.step ?? 1}
          value={localValue}
          onChange={handleInputChange}
          disabled={disabled}
        />
      </div>
      {parameter.description && (
        <span className="parameter-description">{parameter.description}</span>
      )}
    </div>
  );
}

// ============================================================================
// Float Widget
// ============================================================================

export function FloatWidget({ parameter, value, onChange, disabled }: ParameterWidgetProps) {
  const [localValue, setLocalValue] = useState(value ?? parameter.default);
  
  // Sync local state when value prop changes
  useEffect(() => {
    setLocalValue(value ?? parameter.default);
  }, [value, parameter.default]);
  
  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value);
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseFloat(e.target.value) || 0;
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  const constraints = parameter.constraints || {};
  
  return (
    <div className="parameter-widget float-widget">
      <label className="parameter-label">{parameter.display_name}</label>
      <div className="parameter-control">
        <input
          type="range"
          className="parameter-slider"
          min={constraints.min ?? 0}
          max={constraints.max ?? 1}
          step={constraints.step ?? 0.01}
          value={localValue}
          onChange={handleSliderChange}
          disabled={disabled}
        />
        <input
          type="number"
          className="parameter-input"
          min={constraints.min ?? 0}
          max={constraints.max ?? 1}
          step={constraints.step ?? 0.01}
          value={localValue}
          onChange={handleInputChange}
          disabled={disabled}
        />
      </div>
      {parameter.description && (
        <span className="parameter-description">{parameter.description}</span>
      )}
    </div>
  );
}

// ============================================================================
// Seed Widget
// ============================================================================

export function SeedWidget({ parameter, value, onChange, disabled }: ParameterWidgetProps) {
  const [localValue, setLocalValue] = useState(value ?? parameter.default);
  
  // Sync local state when value prop changes (e.g., when loading from a panel)
  useEffect(() => {
    setLocalValue(value ?? parameter.default);
  }, [value, parameter.default]);
  
  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value) || -1;
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  const handleRandomize = useCallback(() => {
    const newSeed = Math.floor(Math.random() * 2147483647);
    setLocalValue(newSeed);
    onChange(parameter.name, newSeed);
  }, [parameter.name, onChange]);
  
  return (
    <div className="parameter-widget seed-widget">
      <label className="parameter-label">{parameter.display_name}</label>
      <div className="parameter-control seed-control">
        <input
          type="number"
          className="parameter-input seed-input"
          value={localValue}
          onChange={handleInputChange}
          disabled={disabled}
        />
        <button
          className="seed-randomize-btn"
          onClick={handleRandomize}
          disabled={disabled}
          title="Randomize seed"
        >
          🎲
        </button>
      </div>
      {parameter.description && (
        <span className="parameter-description">{parameter.description}</span>
      )}
    </div>
  );
}

// ============================================================================
// Enum Widget
// ============================================================================

export function EnumWidget({ parameter, value, onChange, disabled }: ParameterWidgetProps) {
  const [localValue, setLocalValue] = useState(value ?? parameter.default);
  
  // Sync local state when value prop changes (e.g., when loading from a panel)
  useEffect(() => {
    setLocalValue(value ?? parameter.default);
  }, [value, parameter.default]);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  const options = parameter.constraints?.options || [];
  
  return (
    <div className="parameter-widget enum-widget">
      <label className="parameter-label">{parameter.display_name}</label>
      <select
        className="parameter-select"
        value={localValue}
        onChange={handleChange}
        disabled={disabled}
      >
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      {parameter.description && (
        <span className="parameter-description">{parameter.description}</span>
      )}
    </div>
  );
}

// ============================================================================
// Boolean Widget
// ============================================================================

export function BooleanWidget({ parameter, value, onChange, disabled }: ParameterWidgetProps) {
  const [localValue, setLocalValue] = useState(value ?? parameter.default);
  
  // Sync local state when value prop changes (e.g., when loading from a panel)
  useEffect(() => {
    setLocalValue(value ?? parameter.default);
  }, [value, parameter.default]);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.checked;
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  return (
    <div className="parameter-widget boolean-widget">
      <label className="parameter-label boolean-label">
        <input
          type="checkbox"
          className="parameter-checkbox"
          checked={localValue}
          onChange={handleChange}
          disabled={disabled}
        />
        <span>{parameter.display_name}</span>
      </label>
      {parameter.description && (
        <span className="parameter-description">{parameter.description}</span>
      )}
    </div>
  );
}

// ============================================================================
// Prompt Widget
// ============================================================================

export function PromptWidget({ parameter, value, onChange, disabled, onEnhance, cameraAngle, onCameraAngleChange }: PromptWidgetProps) {
  // Get CPE prompt from store for paste functionality
  const { cpePromptForStoryboard, setCpePromptForStoryboard } = useCinemaStore();
  
  // Ensure value is always a string (handle non-string values from localStorage)
  const stringValue = typeof value === 'string' ? value : (value ? String(value) : '');
  const [localValue, setLocalValue] = useState(stringValue ?? parameter.default ?? '');
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isAngleSelectorOpen, setIsAngleSelectorOpen] = useState(false);
  
  // Sync local state when value prop changes (e.g., when loading from a panel)
  useEffect(() => {
    const safeValue = typeof value === 'string' ? value : (value ? String(value) : '');
    setLocalValue(safeValue ?? parameter.default ?? '');
  }, [value, parameter.default]);
  
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setLocalValue(newValue);
    onChange(parameter.name, newValue);
  }, [parameter.name, onChange]);
  
  // Handle paste from CPE
  const handlePasteFromCPE = useCallback(() => {
    if (!cpePromptForStoryboard) return;
    setLocalValue(cpePromptForStoryboard);
    onChange(parameter.name, cpePromptForStoryboard);
    // Clear the stored prompt after pasting
    setCpePromptForStoryboard(null);
  }, [cpePromptForStoryboard, parameter.name, onChange, setCpePromptForStoryboard]);
  
  const handleEnhance = useCallback(async () => {
    if (!onEnhance || !localValue.trim() || isEnhancing) return;
    
    setIsEnhancing(true);
    try {
      const enhanced = await onEnhance(localValue);
      setLocalValue(enhanced);
      onChange(parameter.name, enhanced);
    } catch (error) {
      console.error('Failed to enhance prompt:', error);
    } finally {
      setIsEnhancing(false);
    }
  }, [localValue, onEnhance, isEnhancing, parameter.name, onChange]);
  
  // Handle angle selection
  const handleAngleSelect = useCallback((angle: CameraAngle) => {
    // Remove any existing angle prefix from prompt
    const cleanPrompt = removeAnglePrefix(localValue);
    // Prepend new angle
    const newPrompt = `${angle.prompt} ${cleanPrompt}`.trim();
    setLocalValue(newPrompt);
    onChange(parameter.name, newPrompt);
    onCameraAngleChange?.(angle);
  }, [localValue, parameter.name, onChange, onCameraAngleChange]);
  
  // Clear angle
  const handleClearAngle = useCallback(() => {
    const cleanPrompt = removeAnglePrefix(localValue);
    setLocalValue(cleanPrompt);
    onChange(parameter.name, cleanPrompt);
    onCameraAngleChange?.(null);
  }, [localValue, parameter.name, onChange, onCameraAngleChange]);
  
  // Sync badge with prompt text - parse prompt on change
  useEffect(() => {
    const parsedAngle = parseAngleFromPrompt(localValue);
    if (parsedAngle?.id !== cameraAngle?.id) {
      onCameraAngleChange?.(parsedAngle);
    }
  }, [localValue, cameraAngle?.id, onCameraAngleChange]);
  
  // Determine if this is positive or negative prompt based on name
  const isNegative = parameter.name.includes('negative');
  const textareaClass = isNegative ? 'prompt-textarea negative' : 'prompt-textarea positive';
  const canEnhance = onEnhance && !isNegative; // Only enhance positive prompts
  
  return (
    <div className="parameter-widget prompt-widget">
      {/* Camera angle badge (above prompt) */}
      {cameraAngle && !isNegative && (
        <div className="camera-angle-badge">
          <span className="badge-icon">📐</span>
          <span className="badge-text">{cameraAngle.displayName}</span>
          <button 
            className="badge-clear" 
            onClick={handleClearAngle}
            title="Clear angle"
            disabled={disabled}
          >
            ×
          </button>
        </div>
      )}
      
      <div className="prompt-header">
        <label className="parameter-label">{parameter.display_name}</label>
        <div className="prompt-toolbar">
          {/* Paste from CPE button */}
          {!isNegative && cpePromptForStoryboard && (
            <button
              className="cpe-paste-btn"
              onClick={handlePasteFromCPE}
              disabled={disabled}
              title="Paste prompt from Cinema Prompt Engineering"
            >
              🎬
            </button>
          )}
          
          {/* Camera angle button */}
          {!isNegative && (
            <button
              className={`angle-selector-btn ${cameraAngle ? 'has-angle' : ''}`}
              onClick={() => setIsAngleSelectorOpen(true)}
              disabled={disabled}
              title="Select camera angle"
            >
              📐
            </button>
          )}
          
          {/* AI enhance button */}
          {canEnhance && (
            <button
              className={`ai-enhance-btn ${isEnhancing ? 'enhancing' : ''}`}
              onClick={handleEnhance}
              disabled={disabled || isEnhancing || !localValue.trim()}
              title={isEnhancing ? 'Enhancing prompt...' : 'Enhance with AI'}
            >
              {isEnhancing ? '✨...' : '✨'}
            </button>
          )}
        </div>
      </div>
      <textarea
        className={textareaClass}
        value={localValue}
        onChange={handleChange}
        disabled={disabled}
        rows={4}
        placeholder={`Enter ${isNegative ? 'negative' : 'positive'} prompt...`}
      />
      {parameter.description && (
        <span className="parameter-description">{parameter.description}</span>
      )}
      
        {/* Camera Angle Selector Modal */}
        {!isNegative && (
          <CameraAngleSelector
            isOpen={isAngleSelectorOpen}
            onClose={() => setIsAngleSelectorOpen(false)}
            onSelect={handleAngleSelect}
            currentAngle={cameraAngle ?? null}
          />
        )}
    </div>
  );
}

// ============================================================================
// Image Widget
// ============================================================================

export function ImageWidget({ parameter, value, onChange, disabled, comfyUrl }: ParameterWidgetProps) {
  const handleImageChange = useCallback((_name: string, imageValue: string | null) => {
    onChange(parameter.name, imageValue);
  }, [parameter.name, onChange]);
  
  // Check if this input is bypassed
  const isBypassed = value === '__BYPASSED__';
  
  const handleBypassChange = useCallback((bypassed: boolean) => {
    if (bypassed) {
      onChange(parameter.name, '__BYPASSED__');
    } else {
      // When un-bypassing, set to null (user will need to re-add image)
      onChange(parameter.name, null);
    }
  }, [parameter.name, onChange]);

  return (
    <ImageDropZone
      name={parameter.name}
      displayName={parameter.display_name}
      value={isBypassed ? null : value}
      onChange={handleImageChange}
      disabled={disabled}
      acceptType="image"
      isBypassed={isBypassed}
      onBypassChange={handleBypassChange}
      comfyUrl={comfyUrl}
    />
  );
}

// ============================================================================
// Video Widget
// ============================================================================

export function VideoWidget({ parameter, value, onChange, disabled, comfyUrl }: ParameterWidgetProps) {
  const handleVideoChange = useCallback((_name: string, videoValue: string | null) => {
    onChange(parameter.name, videoValue);
  }, [parameter.name, onChange]);
  
  // Check if this input is bypassed
  const isBypassed = value === '__BYPASSED__';
  
  const handleBypassChange = useCallback((bypassed: boolean) => {
    if (bypassed) {
      onChange(parameter.name, '__BYPASSED__');
    } else {
      onChange(parameter.name, null);
    }
  }, [parameter.name, onChange]);

  return (
    <ImageDropZone
      name={parameter.name}
      displayName={parameter.display_name}
      value={isBypassed ? null : value}
      onChange={handleVideoChange}
      disabled={disabled}
      acceptType="video"
      isBypassed={isBypassed}
      onBypassChange={handleBypassChange}
      comfyUrl={comfyUrl}
    />
  );
}

// ============================================================================

export function MediaWidget({ parameter, value, onChange, disabled, comfyUrl }: ParameterWidgetProps) {
  const handleMediaChange = useCallback((_name: string, mediaValue: string | null) => {
    onChange(parameter.name, mediaValue);
  }, [parameter.name, onChange]);
  
  // Check if this input is bypassed
  const isBypassed = value === '__BYPASSED__';
  
  const handleBypassChange = useCallback((bypassed: boolean) => {
    if (bypassed) {
      onChange(parameter.name, '__BYPASSED__');
    } else {
      onChange(parameter.name, null);
    }
  }, [parameter.name, onChange]);

  return (
    <ImageDropZone
      name={parameter.name}
      displayName={parameter.display_name}
      value={isBypassed ? null : value}
      onChange={handleMediaChange}
      disabled={disabled}
      acceptType="any"
      isBypassed={isBypassed}
      onBypassChange={handleBypassChange}
      comfyUrl={comfyUrl}
    />
  );
}

// ============================================================================
// LoRA Widget - with bypass toggle, dropdown, and strength slider
// ============================================================================

interface LoRAWidgetProps extends ParameterWidgetProps {
  availableLoras?: string[];
  onBypassChange?: (name: string, bypassed: boolean) => void;
  isBypassed?: boolean;
}

export function LoRAWidget({ 
  parameter, 
  value, 
  onChange, 
  disabled,
  availableLoras = [],
  onBypassChange,
  isBypassed = false
}: LoRAWidgetProps) {
  // Value format: { lora_name: string, strength: number, bypassed?: boolean }
  // or just number for strength-only parameters
  const isComplex = typeof value === 'object' && value !== null;
  
  const [localLoraName, setLocalLoraName] = useState(
    isComplex ? value.lora_name : parameter.constraints?.lora_name || ''
  );
  const [localStrength, setLocalStrength] = useState(
    isComplex ? value.strength : (typeof value === 'number' ? value : parameter.default ?? 1.0)
  );
  const [localBypassed, setLocalBypassed] = useState(
    isComplex ? value.bypassed ?? isBypassed : isBypassed
  );
  
  // Sync local state when value prop changes
  useEffect(() => {
    if (typeof value === 'object' && value !== null) {
      setLocalLoraName(value.lora_name || '');
      setLocalStrength(value.strength ?? 1.0);
      setLocalBypassed(value.bypassed ?? false);
    } else if (typeof value === 'number') {
      setLocalStrength(value);
    }
  }, [value]);
  
  // Sync bypassed state from props
  useEffect(() => {
    setLocalBypassed(isBypassed);
  }, [isBypassed]);
  
  const handleLoraNameChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newLoraName = e.target.value;
    setLocalLoraName(newLoraName);
    
    if (isComplex) {
      onChange(parameter.name, { 
        ...value, 
        lora_name: newLoraName 
      });
    } else {
      // For simple parameters, also propagate lora name change
      onChange(parameter.name + '_lora_name', newLoraName);
    }
  }, [parameter.name, onChange, value, isComplex]);
  
  const handleStrengthChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newStrength = parseFloat(e.target.value);
    setLocalStrength(newStrength);
    
    if (isComplex) {
      onChange(parameter.name, { 
        ...value, 
        strength: newStrength 
      });
    } else {
      onChange(parameter.name, newStrength);
    }
  }, [parameter.name, onChange, value, isComplex]);
  
  const handleBypassToggle = useCallback(() => {
    const newBypassed = !localBypassed;
    setLocalBypassed(newBypassed);
    
    if (onBypassChange) {
      onBypassChange(parameter.name, newBypassed);
    }
    
    if (isComplex) {
      onChange(parameter.name, { 
        ...value, 
        bypassed: newBypassed 
      });
    }
  }, [localBypassed, parameter.name, onChange, onBypassChange, value, isComplex]);
  
  const constraints = parameter.constraints || {};
  
  // Extract display name from full lora path (e.g., "Flux/some_lora.safetensors" -> "some_lora")
  const formatLoraDisplayName = (loraPath: string) => {
    if (!loraPath) return '';
    const filename = loraPath.split(/[/\\]/).pop() || loraPath;
    return filename.replace(/\.safetensors$|\.ckpt$/i, '');
  };
  
  return (
    <div className={`parameter-widget lora-widget ${localBypassed ? 'bypassed' : ''}`}>
      <div className="lora-header">
        <label className="parameter-label">{parameter.display_name}</label>
        <button
          className={`bypass-toggle ${localBypassed ? 'bypassed' : 'active'}`}
          onClick={handleBypassToggle}
          disabled={disabled}
          title={localBypassed ? 'Enable this LoRA' : 'Bypass this LoRA'}
        >
          {localBypassed ? '⏸ Bypassed' : '▶ Active'}
        </button>
      </div>
      
      {!localBypassed && (
        <div className="lora-controls">
          {/* LoRA Dropdown */}
          {availableLoras.length > 0 && (
            <div className="lora-dropdown-container">
              <select
                className="parameter-select lora-select"
                value={localLoraName}
                onChange={handleLoraNameChange}
                disabled={disabled}
              >
                <option value="">-- Select LoRA --</option>
                {availableLoras.map((lora) => (
                  <option key={lora} value={lora}>
                    {formatLoraDisplayName(lora)}
                  </option>
                ))}
              </select>
            </div>
          )}
          
          {/* Strength Slider */}
          <div className="lora-strength-container">
            <label className="strength-label">Strength</label>
            <div className="parameter-control">
              <input
                type="range"
                className="parameter-slider"
                min={constraints.min ?? -2}
                max={constraints.max ?? 2}
                step={constraints.step ?? 0.01}
                value={localStrength}
                onChange={handleStrengthChange}
                disabled={disabled}
              />
              <input
                type="number"
                className="parameter-input"
                min={constraints.min ?? -2}
                max={constraints.max ?? 2}
                step={constraints.step ?? 0.01}
                value={localStrength}
                onChange={handleStrengthChange}
                disabled={disabled}
              />
            </div>
          </div>
        </div>
      )}
      
      {localBypassed && (
        <div className="lora-bypassed-placeholder">
          <span className="bypassed-icon">⏸</span>
          <span className="bypassed-text">LoRA bypassed - will not be applied</span>
        </div>
      )}
      
      {parameter.description && (
        <span className="parameter-description">{parameter.description}</span>
      )}
    </div>
  );
}

// ============================================================================
// Parameter Widget Router
// ============================================================================

interface ParameterWidgetRouterProps extends ParameterWidgetProps {
  onEnhancePrompt?: (prompt: string) => Promise<string>;
  cameraAngle?: CameraAngle | null;
  onCameraAngleChange?: (paramName: string, angle: CameraAngle | null) => void;
}

export function ParameterWidget({ parameter, value, onChange, disabled, onEnhancePrompt, cameraAngle, onCameraAngleChange, comfyUrl }: ParameterWidgetRouterProps) {
  switch (parameter.type) {
    case 'integer':
      return <IntegerWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} />;
    case 'float':
      return <FloatWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} />;
    case 'seed':
      return <SeedWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} />;
    case 'enum':
      return <EnumWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} />;
    case 'boolean':
      return <BooleanWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} />;
    case 'prompt':
      return <PromptWidget 
        parameter={parameter} 
        value={value} 
        onChange={onChange} 
        disabled={disabled} 
        onEnhance={onEnhancePrompt} 
        cameraAngle={cameraAngle}
        onCameraAngleChange={(angle) => onCameraAngleChange?.(parameter.name, angle)}
      />;
    case 'image':
    case 'image_list':
      return <ImageWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} comfyUrl={comfyUrl} />;
    case 'video':
    case 'video_list':
      return <VideoWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} comfyUrl={comfyUrl} />;
    case 'media':
      return <MediaWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} comfyUrl={comfyUrl} />;
    case 'lora':
      // LoRA widget with available loras from constraints
      return (
        <LoRAWidget 
          parameter={parameter} 
          value={value} 
          onChange={onChange} 
          disabled={disabled}
          availableLoras={parameter.constraints?.availableLoras || []}
          isBypassed={parameter.constraints?.bypassed || false}
        />
      );
    default:
      return <PromptWidget parameter={parameter} value={value} onChange={onChange} disabled={disabled} onEnhance={onEnhancePrompt} />;
  }
}

// ============================================================================
// Parameter Panel
// ============================================================================

export function ParameterPanel({ parameters, values, onChange, disabled, onEnhancePrompt, cameraAngles, onCameraAngleChange, comfyUrl }: ParameterPanelProps) {
  if (parameters.length === 0) {
    return (
      <div className="parameter-panel empty">
        <p>No parameters available for this template.</p>
      </div>
    );
  }
  
  return (
    <div className="parameter-panel">
      <div className="parameter-panel-title">Parameters</div>
      <div className="parameter-list">
        {parameters.map((parameter) => (
          <ParameterWidget
            key={parameter.name}
            parameter={parameter}
            value={values[parameter.name]}
            onChange={onChange}
            disabled={disabled}
            onEnhancePrompt={onEnhancePrompt}
            cameraAngle={cameraAngles?.[parameter.name] ?? null}
            onCameraAngleChange={onCameraAngleChange}
            comfyUrl={comfyUrl}
          />
        ))}
      </div>
    </div>
  );
}

export default ParameterPanel;
