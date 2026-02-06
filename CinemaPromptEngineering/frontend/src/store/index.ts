/** Zustand store for Cinema Prompt Engineering state */

import { create } from 'zustand';
import type {
  ProjectType,
  LiveActionConfig,
  AnimationConfig,
  ValidationResult,
  FilmPreset,
  AnimationPreset,
  FilmPresetSummary,
  AnimationPresetSummary,
} from '@/types';

// =============================================================================
// Default Configurations
// =============================================================================

const defaultLiveActionConfig: LiveActionConfig = {
  camera: {
    camera_type: 'Digital',
    manufacturer: 'ARRI',
    body: 'Alexa_35',
    sensor: 'Super35',
    weight_class: 'Medium',
    film_stock: 'None',
    aspect_ratio: '1.85:1',
  },
  lens: {
    manufacturer: 'ARRI',
    family: 'ARRI_Signature_Prime',
    focal_length_mm: 35,
    is_anamorphic: false,
  },
  movement: {
    equipment: 'Static',
    movement_type: 'Static',
    timing: 'Static',
  },
  lighting: {
    time_of_day: 'Afternoon',
    source: 'Sun',
    style: 'Naturalistic',
  },
  visual_grammar: {
    shot_size: 'MS',
    composition: 'Rule_of_Thirds',
    mood: 'Contemplative',
    color_tone: 'Neutral_Saturated',
  },
};

const defaultAnimationConfig: AnimationConfig = {
  medium: '2D',
  style_domain: 'Anime',
  rendering: {
    line_treatment: 'Clean',
    color_application: 'Cel',
    lighting_model: 'Naturalistic_Simulated',
    surface_detail: 'Smooth',
  },
  motion: {
    motion_style: 'Full',
    virtual_camera: 'Digital_Pan',
  },
  visual_grammar: {
    shot_size: 'MS',
    composition: 'Rule_of_Thirds',
    mood: 'Contemplative',
    color_tone: 'Neutral_Saturated',
  },
};

// =============================================================================
// Store Types
// =============================================================================

interface CinemaStore {
  // Mode
  projectType: ProjectType;
  setProjectType: (type: ProjectType) => void;

  // Configurations
  liveActionConfig: LiveActionConfig;
  animationConfig: AnimationConfig;
  setLiveActionConfig: (config: LiveActionConfig) => void;
  setAnimationConfig: (config: AnimationConfig) => void;

  // Update functions
  updateLiveAction: <K extends keyof LiveActionConfig>(
    section: K,
    updates: Partial<LiveActionConfig[K]>
  ) => void;
  updateAnimation: <K extends keyof AnimationConfig>(
    section: K,
    updates: Partial<AnimationConfig[K]>
  ) => void;

  // Validation
  validationResult: ValidationResult | null;
  setValidationResult: (result: ValidationResult | null) => void;

  // Generated prompt
  generatedPrompt: string;
  negativePrompt: string | null;
  setGeneratedPrompt: (prompt: string, negative?: string | null) => void;

  // Target model
  targetModel: string;
  setTargetModel: (model: string) => void;

  // Presets
  selectedLiveActionPreset: FilmPreset | null;
  selectedAnimationPreset: AnimationPreset | null;
  liveActionPresetList: FilmPresetSummary[];
  animationPresetList: AnimationPresetSummary[];
  setSelectedLiveActionPreset: (preset: FilmPreset | null) => void;
  setSelectedAnimationPreset: (preset: AnimationPreset | null) => void;
  setLiveActionPresetList: (presets: FilmPresetSummary[]) => void;
  setAnimationPresetList: (presets: AnimationPresetSummary[]) => void;
  applyLiveActionPresetConfig: (config: LiveActionConfig, preset: FilmPreset) => void;
  applyAnimationPresetConfig: (config: AnimationConfig, preset: AnimationPreset) => void;
  clearPreset: () => void;

  // Reset
  resetConfig: () => void;

  // CPE prompt for Storyboard sharing
  cpePromptForStoryboard: string | null;
  setCpePromptForStoryboard: (prompt: string | null) => void;
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useCinemaStore = create<CinemaStore>((set) => ({
  // Mode
  projectType: 'live_action',
  setProjectType: (type) => set({ projectType: type }),

  // Configurations
  liveActionConfig: defaultLiveActionConfig,
  animationConfig: defaultAnimationConfig,
  setLiveActionConfig: (config) => set({ liveActionConfig: config }),
  setAnimationConfig: (config) => set({ animationConfig: config }),

  // Update live-action config
  updateLiveAction: (section, updates) =>
    set((state) => ({
      liveActionConfig: {
        ...state.liveActionConfig,
        [section]:
          typeof state.liveActionConfig[section] === 'object'
            ? { ...state.liveActionConfig[section], ...updates }
            : updates,
      },
    })),

  // Update animation config
  updateAnimation: (section, updates) =>
    set((state) => ({
      animationConfig: {
        ...state.animationConfig,
        [section]:
          typeof state.animationConfig[section] === 'object'
            ? { ...state.animationConfig[section], ...updates }
            : updates,
      },
    })),

  // Validation
  validationResult: null,
  setValidationResult: (result) => set({ validationResult: result }),

  // Generated prompt
  generatedPrompt: '',
  negativePrompt: null,
  setGeneratedPrompt: (prompt, negative = null) =>
    set({ generatedPrompt: prompt, negativePrompt: negative }),

  // Target model
  targetModel: 'generic',
  setTargetModel: (model) => set({ targetModel: model }),

  // Presets
  selectedLiveActionPreset: null,
  selectedAnimationPreset: null,
  liveActionPresetList: [],
  animationPresetList: [],
  setSelectedLiveActionPreset: (preset) => set({ selectedLiveActionPreset: preset }),
  setSelectedAnimationPreset: (preset) => set({ selectedAnimationPreset: preset }),
  setLiveActionPresetList: (presets) => set({ liveActionPresetList: presets }),
  setAnimationPresetList: (presets) => set({ animationPresetList: presets }),
  applyLiveActionPresetConfig: (config, preset) =>
    set({
      liveActionConfig: config,
      selectedLiveActionPreset: preset,
      validationResult: null,
      generatedPrompt: '',
      negativePrompt: null,
    }),
  applyAnimationPresetConfig: (config, preset) =>
    set({
      animationConfig: config,
      selectedAnimationPreset: preset,
      validationResult: null,
      generatedPrompt: '',
      negativePrompt: null,
    }),
  clearPreset: () =>
    set({
      selectedLiveActionPreset: null,
      selectedAnimationPreset: null,
    }),

  // Reset
  resetConfig: () =>
    set({
      liveActionConfig: defaultLiveActionConfig,
      animationConfig: defaultAnimationConfig,
      validationResult: null,
      generatedPrompt: '',
      negativePrompt: null,
      selectedLiveActionPreset: null,
      selectedAnimationPreset: null,
    }),

  // CPE prompt for Storyboard sharing
  cpePromptForStoryboard: null,
  setCpePromptForStoryboard: (prompt) => set({ cpePromptForStoryboard: prompt }),
}));
