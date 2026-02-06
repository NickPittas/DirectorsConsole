/** Types matching the backend Pydantic models */

export type ProjectType = 'live_action' | 'animation';
export type ValidationStatus = 'valid' | 'warning' | 'invalid';
export type RuleSeverity = 'hard' | 'warning' | 'info';

// =============================================================================
// Common Types
// =============================================================================

export interface ValidationMessage {
  rule_id: string;
  severity: RuleSeverity;
  message: string;
  field_path?: string;
}

export interface ValidationResult {
  status: ValidationStatus;
  messages: ValidationMessage[];
  auto_corrections_applied: boolean;
}

export interface VisualGrammar {
  shot_size: string;
  composition: string;
  mood: string;
  color_tone: string;
}

// =============================================================================
// Live-Action Types
// =============================================================================

export type CameraType = 'Digital' | 'Film';

export interface CameraConfig {
  camera_type: CameraType;
  manufacturer: string;
  body: string;
  sensor: string;
  weight_class: string;
  film_stock: string;
  aspect_ratio: string;
}

export interface LensConfig {
  manufacturer: string;
  family: string;
  focal_length_mm: number;
  is_anamorphic: boolean;
  squeeze_ratio?: number;
}

export interface MovementConfig {
  equipment: string;
  movement_type: string;
  timing: string;
}

export interface LightingConfig {
  time_of_day: string;
  source: string;
  style: string;
}

export interface LiveActionConfig {
  camera: CameraConfig;
  lens: LensConfig;
  movement: MovementConfig;
  lighting: LightingConfig;
  visual_grammar: VisualGrammar;
  film_preset?: string;
  era?: string;
}

// =============================================================================
// Animation Types
// =============================================================================

export interface RenderingConfig {
  line_treatment: string;
  color_application: string;
  lighting_model: string;
  surface_detail: string;
}

export interface MotionConfig {
  motion_style: string;
  virtual_camera: string;
}

export interface AnimationConfig {
  medium: string;
  style_domain: string;
  rendering: RenderingConfig;
  motion: MotionConfig;
  visual_grammar: VisualGrammar;
  style_preset?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

export interface GeneratePromptResponse {
  prompt: string;
  negative_prompt?: string;
  validation: ValidationResult;
}

export interface EnumResponse {
  enum: string;
  values: string[];
}

export interface OptionsResponse {
  field_path: string;
  options: string[];
  disabled_options: string[];
  disabled_reasons: Record<string, string>;
}

// =============================================================================
// Preset Types
// =============================================================================

/** Live-action film preset summary (for list views) */
export interface FilmPresetSummary {
  id: string;
  name: string;
  year: number;
  era: string;
  mood?: string[];
  color_tone?: string[];
}

/** Animation preset summary (for list views) */
export interface AnimationPresetSummary {
  id: string;
  name: string;
  domain: string;
  medium: string;
  mood?: string[];
}

/** Full film preset with all constraints */
export interface FilmPreset {
  id: string;
  name: string;
  year: number;
  era: string;
  camera: string;
  lens: string;
  movement: string;
  lighting_style: string;
  lighting_source: string;
  mood: string[];
  color_tone: string[];
  disallowed_moods: string[];
  disallowed_sources: string[];
  shot_size: string;
  composition: string;
  // Technical specifications
  camera_type?: string;
  camera_body?: string[];
  film_stock?: string[];
  aspect_ratio?: string;
  lens_manufacturer?: string[];
  lens_family?: string[];
  primary_focal_lengths?: number[];
}

/** Full animation preset with all constraints */
export interface AnimationPreset {
  id: string;
  name: string;
  domain: string;
  medium: string;
  line_treatment: string;
  color_application: string;
  lighting_model: string;
  surface_detail: string;
  motion_style: string;
  virtual_camera: string;
  mood: string[];
  color_tone: string[];
  composition: string[];
  reference_works: string[];
  disallowed_cameras: string[];
  disallowed_motion: string[];
}

/** Response from GET /presets/live-action */
export interface LiveActionPresetsResponse {
  count: number;
  presets: FilmPresetSummary[];
}

/** Response from GET /presets/animation */
export interface AnimationPresetsResponse {
  count: number;
  presets: AnimationPresetSummary[];
}

/** Response from POST /apply-preset/live-action */
export interface ApplyLiveActionPresetResponse {
  config: LiveActionConfig;
  validation: ValidationResult;
  preset: FilmPreset;
}

/** Response from POST /apply-preset/animation */
export interface ApplyAnimationPresetResponse {
  config: AnimationConfig;
  validation: ValidationResult;
  preset: AnimationPreset;
}

/** Search result item */
export interface PresetSearchResult {
  type: 'live_action' | 'animation';
  score: number;
  preset: FilmPresetSummary | AnimationPresetSummary;
}

/** Response from GET /presets/search */
export interface PresetSearchResponse {
  query: string;
  count: number;
  results: PresetSearchResult[];
}

// =============================================================================
// Cinematography Style Types
// =============================================================================

/** Detailed cinematography information for a film preset */
export interface CinematographyStyle {
  preset_id: string;
  cinematographer: string;
  camera: string;
  film_stock: string;
  aspect_ratio: string;
  lighting_signature: string;
  color_palette: string;
  notable_techniques: string;
  lens_info: string;
  movement_style: string;
  legacy?: string;
}

// =============================================================================
// Re-export job group types
// =============================================================================

export * from './jobGroup';
