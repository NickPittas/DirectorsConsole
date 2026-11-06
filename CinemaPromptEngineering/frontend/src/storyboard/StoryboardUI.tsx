/**
 * StoryboardUI - Complete Implementation
 *
 * Features:
 * - Multiple tabs: Image Generation, Image Editing, Upscaling, Video Generation
 * - Dynamic workflow loading with import/edit capabilities
 * - Canvas with pan, zoom, and unlimited panels
 * - ComfyUI connection with preview support
 * - Dynamic parameters based on selected workflow
 * - Image viewer with metadata panel, keyboard shortcuts, and zoom controls
 */

import { useState, useEffect, useCallback, useRef } from 'react';

import { ParameterPanel } from './components/ParameterWidgets';
import { PromptEnhancementSettingsPopup } from './components/PromptEnhancementSettingsPopup';
import type { TargetModelOption } from './components/PromptEnhancementControls';
import { WorkflowEditor, ParameterConfig } from './components/WorkflowEditor';
import { getWorkflowParser, ComfyUIWorkflow, ParsedWorkflow, normalizeWorkflowPaths, detectNodeOS, TargetOS } from './services/workflow-parser';
import { nodeDefinitions } from './services/node-definitions';
import { prepareAgentWorkflowProposal } from './actions/agent-workflow-proposal';
import { collectRecipeNodeClasses } from './actions/recipe-node-classes';
import { selectCachedWorkflowSchema } from './actions/selected-schema-snapshot';
import { fingerprintRecipeExport } from './actions/recipe-export-fingerprint';
import {
  findWorkflowNode,
  getWorkflowNodeClassType,
  getWorkflowNodeInput,
  listWorkflowNodes,
  reconcileParameterValues,
} from './services/workflow-editor-options';
import { CameraAngle } from './data/cameraAngleData';
import { useErrorNotifications, ErrorNotificationContainer } from './components/ErrorNotification';
import { NodeManager } from './components/NodeManager';
import { MainMenu } from './components/MainMenu';
import { MultiSelectDropdown } from './components/MultiSelectDropdown';
import { MultiNodeSelector } from '../components/MultiNodeSelector';
import { WorkflowCategoriesModal } from './components/WorkflowCategoriesModal';
import { 
  Trash2, Upload, Download, Tags, X, ChevronDown, 
  Plus, Pencil, ChevronRight,
  Edit3, ZoomIn, ZoomOut, RotateCcw, Maximize, Crosshair,
  PanelRightClose, ChevronLeft, Eye, PanelRight, Info, OctagonX, FolderOpen,
  Printer, RefreshCw
} from 'lucide-react';
import {
  inspectManagedBackendCapabilities,
  orchestratorManager,
  planManagedBackendDependencies,
  useRenderNodes,
  type ManagedDependencyPlanRequest,
} from './services/orchestrator';
import { getComfyUIWebSocket, disconnectWebSocket, disconnectAllWebSockets, ComfyUIWebSocket, type WorkflowProgressInfo } from './services/comfyui-websocket';
import { extractMediaOutputs, isVideoUrl, type ComfyUIProbeResult } from './comfyui-client';
import {
  getGenerationDisabledReason,
  resolveGenerationTarget,
  type BrowserNodeStatus,
} from './services/generation-target';
import { getManagedComfyUIProbeUrls, startComfyUIProbeLifecycle } from './services/comfyui-probe-lifecycle';
import { projectManager, ImageHistoryEntry, ImageMetadata, useProjectSettings, type ProjectSettings, getDefaultOrchestratorUrl } from './services/project-manager';
import { saveProjectAndRecordRecent, loadProjectAndRecordRecent } from './services/project-actions';
import { projectStateFingerprint } from './services/project-state-fingerprint';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { FolderBrowserModal } from './components/FolderBrowserModal';
import { FileBrowserDialog } from './components/FileBrowser';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { PanelNotes } from './components/PanelNotes';
import { PanelHeader } from './components/PanelHeader';
import { StarRating } from './components/StarRating';
import { PrintDialog } from './components/PrintDialog';
import { PathMappingsModal } from './components/PathMappingsModal';
import GenerationProgress from './components/GenerationProgress';
import { workflowStorage } from './services/workflow-storage';
import { captureRunOutputMedia } from '../services/agent-run-media';
import { getAgentMediaAsset } from '../services/agent-media-library';
import {
  filterWorkflowsByRoute,
  getDefaultSubCategory,
  getWorkflowRoutes,
  isSubTabType,
  isTabType,
  isValidWorkflowRoute,
  isVideoWorkflow,
  type SubTabType,
  type TabType,
  type WorkflowCategory,
} from './workflow-categories';
export { WORKFLOW_CATEGORIES, SUBCATEGORY_TO_CATEGORY_MAP } from './workflow-categories';
import {
  activateSessionIdentity,
  recoverInterruptedPanels,
  sessionDraftController,
  type StoryboardDraftState,
} from './services/session-recovery';
import {
  dispatchStoryboardApplicationAction,
  type ApplicationActionHandlers,
  type ApplicationCommand,
  validatePanelParameterValues,
  validateWorkflowControls,
} from './actions/application-actions';
import { isApplicationCommandCurrent } from '../services/application-command-control';
import {
  createGenerationRun,
  failGenerationBeforeSubmission,
  GenerationSubmissionError,
  getGenerationRun,
  getGenerationRunByIdempotencyKey,
  listGenerationRuns,
  prepareGenerationJob,
  submitPromptWithJournal,
  updateGenerationJob,
  updateGenerationJobByPrompt,
} from './actions/generation-journal';
import {
  getActiveConsoleUserRequest,
  notifyAgentSurfaceContextChanged,
  registerAgentSurfaceContext,
} from '../services/agent-conversations';
import { registerWorkspaceConsoleAdapter } from '../services/workspace-agent-actions';
import { getSelectedLlmSettings, getConfiguredProviders, updateSavedOAuthToken } from '../components/Settings';
import {
  getAgentExecutionFingerprint,
  getAgentSettingsState,
  loadAgentSettings,
  subscribeAgentGateway,
  subscribeAgentSettings,
} from '../services/agent-gateway-client';
import { enhanceConsolePromptWithPi } from '../services/prompt-enhancement-agent';
import {
  api,
  type StandalonePromptInput,
} from '../api/client';
import {
  buildEnhancementContext,
  discoverEnhancementAssets,
  enhancementMappingFingerprint,
  getEffectiveDuration,
  type EnhancementPreferences,
  type EnhancementProfile,
} from './services/prompt-enhancement';
import {
  loadImageDimensions as _loadImageDimensions,
  formatFileSize,
  getFileSize as _getFileSize,
  extractModelName,
  extractResolution,
  extractPromptText as _extractPromptText,
  truncateText,
  calculateFitZoom,
  clampZoom,
  isNarrowViewport,
  formatTimestamp,
  VIEWER_SHORTCUTS as _VIEWER_SHORTCUTS,
  matchesShortcut as _matchesShortcut,
  type ImageDimensions,
} from './viewer-utils';
import './StoryboardUI.css';

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract filename from a file path or URL (Phase 5-6)
 */
function extractFilename(pathOrUrl: string): string {
  // Handle file path
  if (pathOrUrl.includes('\\') || pathOrUrl.includes('/')) {
    return pathOrUrl.split(/[\\\/]/).pop() || '';
  }
  // Handle URL with path query param
  const match = pathOrUrl.match(/path=([^&]+)/);
  if (match) {
    return decodeURIComponent(match[1]).split(/[\\\/]/).pop() || '';
  }
  return pathOrUrl;
}

/**
 * Calculate X position for a new panel in the grid
 */
const PANEL_WIDTH = 300;
const PANEL_GAP = 20;
const PANELS_PER_ROW = 3;

type GenerationRun = {
  id: string;
  panelId: number;
  submissionFinished: boolean;
  jobs: Set<string>;
  settledJobs: Set<string>;
};

type ActiveGeneration = {
  runId: string;
  panelId: number;
  nodeId?: string;
  promptId: string;
  ws: ComfyUIWebSocket;
  finishing?: boolean;
};

type GenerationSnapshot = {
  workflowId: string;
  workflowName: string;
  workflow: Record<string, unknown>;
  selectedOutputNodeIds: string[];
  parameters: Record<string, unknown>;
};

type GenerationRequestOptions = {
  runId: string;
  commandId: string;
  idempotencyKey: string;
  projectIdentity: string;
  projectRevision: number;
  panelInputRevision: number;
  workflowId: string;
  backendIds: string[];
  backendBindings?: Record<string, string>;
  mode: 'single' | 'parallel';
  usePanelSnapshot: boolean;
};

function calculateNewPanelX(panelId: number, _existingCount: number): number {
  const col = (panelId - 1) % PANELS_PER_ROW;
  return col * (PANEL_WIDTH + PANEL_GAP);
}

function calculateNewPanelY(panelId: number, _existingCount: number): number {
  const PANEL_HEIGHT = 300;
  const row = Math.floor((panelId - 1) / PANELS_PER_ROW);
  return row * (PANEL_HEIGHT + PANEL_GAP);
}

// ============================================================================
// Workflow Progress Helpers
// ============================================================================

/**
 * Known ComfyUI node class_types that report step-by-step progress.
 * These are KSampler variants and any custom sampler nodes.
 */
const SAMPLER_NODE_TYPES = new Set([
  'KSampler', 'KSamplerAdvanced', 'KSampler (Efficient)',
  'SamplerCustom', 'SamplerCustomAdvanced',
  // AnimateDiff / video-specific samplers
  'ADE_AnimateDiffSampler', 'ADE_AnimateDiffSamplerAdvanced',
  // WanVideo / Hunyuan samplers
  'WanSampler', 'HunyuanSampler',
  // Common custom node samplers
  'ImpactKSamplerBasicPipe', 'ImpactKSamplerAdvancedBasicPipe',
]);

/**
 * Build WorkflowProgressInfo from a ComfyUI workflow dict.
 * Identifies sampler nodes to enable multi-phase progress tracking.
 */
function buildWorkflowProgressInfo(workflow: Record<string, any>): WorkflowProgressInfo {
  const nodeTypes: Record<string, string> = {};
  const samplerNodeIds: string[] = [];

  for (const [nodeId, node] of Object.entries(workflow)) {
    if (typeof node !== 'object' || node === null) continue;
    const classType = node.class_type || '';
    nodeTypes[nodeId] = classType;

    // Check if this is a sampler/progress-reporting node
    if (!['KSamplerSelect', 'LTXVLatentUpsampler', 'SamplerDPMPP_2M_SDE', 'SamplerDPMPP_3M_SDE', 'FreeU_V2', 'Efficient Loader'].includes(classType) &&
        (SAMPLER_NODE_TYPES.has(classType) ||
         classType.toLowerCase().includes('ksampler') ||
         classType.toLowerCase().includes('sampler'))) {
      samplerNodeIds.push(nodeId);
    }
  }

  return {
    totalNodes: Object.keys(workflow).length,
    samplerNodeIds,
    nodeTypes,
  };
}

// ============================================================================
// Types
// ============================================================================

// Workflow categories live outside this component so import, filtering, editing,
// and enhancement classification cannot drift apart.
export type { TabType, SubTabType, WorkflowCategory };
export interface Panel {
  id: number;
  image: string | null;
  images: string[]; // For batch results (current generation)
  imageHistory: ImageHistoryEntry[]; // Full history with metadata
  historyIndex: number; // Current position in history
  currentImageIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  status: 'empty' | 'generating' | 'complete' | 'error';
  progress: number;
  progressPhase?: string; // e.g., "Phase 1/2" or "VAE Decode" for multi-sampler workflows
  progressNodeName?: string; // Currently executing node type (e.g., "KSampler")
  progressNodesExecuted?: number; // How many workflow nodes have completed
  progressTotalNodes?: number; // Total number of workflow nodes
  notes: string;
  nodeId?: string; // Selected render node for this panel
  workflowId?: string; // Per-panel workflow selection
  parameterValues?: Record<string, unknown>; // Per-panel parameter values
  enhancementPreferences?: EnhancementPreferences;
  // Phase 2: Canvas Architecture - Panel metadata
  name?: string; // User-editable panel name (default: "Panel_XX")
  locked?: boolean; // true once panel has generated images (prevents rename)
  zIndex?: number; // For drag layering
  selected?: boolean; // Multi-select state
  folderPath?: string; // Resolved output folder for this panel
  // Parallel generation tracking
  parallelJobs?: Array<{
    nodeId: string;
    nodeName: string;
    promptId: string;
    seed: number;
    progress: number;
    status: 'pending' | 'running' | 'complete' | 'error' | 'cancelled';
    resultUrl?: string;
    stuckSince?: number; // Timestamp when job was detected as stuck
    // Per-node stage tracking
    currentNodeName?: string; // ComfyUI class_type being executed (e.g., "KSampler")
    progressPhase?: string; // e.g., "Phase 1/2"
    nodesExecuted?: number; // How many workflow nodes have executed so far
    totalNodes?: number; // Total workflow node count
  }>;
  batchSaveTriggered?: boolean; // Prevents duplicate batch saves
  errorMessage?: string;
}

const EMPTY_ENHANCEMENT_PREFERENCES: EnhancementPreferences = {
  targetModel: '',
  referenceDialect: '',
  taskMode: 'auto',
  referenceOrderConfirmed: false,
};

export interface Workflow {
  id: string;
  name: string;
  description: string;
  category: TabType;
  subCategory: SubTabType;
  workflow: ComfyUIWorkflow;
  parsed: ParsedWorkflow;
  config: ParameterConfig[];
  createdAt?: number;
  revision?: number;
  categories?: WorkflowCategory[]; // Multiple functional categories
  recipeId?: string;
  sourceGraphFingerprint?: string;
  recipeFingerprint?: string;
  sourceProvenance?: Array<Record<string, unknown>>;
}

function workflowParameterDefaults(workflow: Workflow, currentValues: Record<string, unknown>): Record<string, unknown> {
  const values: Record<string, unknown> = {};
  workflow.config.forEach(param => {
    if (!param.exposed) return;
    const preserve = param.category === 'image_input' || param.name === 'prompt' || param.input_name === 'prompt';
    values[param.name] = preserve && currentValues[param.name] !== undefined
      ? currentValues[param.name]
      : param.default;
  });
  return values;
}

function workflowContentFingerprint(workflow: Workflow): string {
  return JSON.stringify(Object.fromEntries(Object.entries(workflow).filter(([key]) =>
    !['revision', 'parentRevision', 'updatedAt', 'expectedCollectionRevision', 'expectedRevision'].includes(key),
  )));
}

const SNAPSHOT_SENSITIVE_TEXT = /(?:bearer\s+[a-z0-9._~+/=-]{8,}|(?:api|access|private)?[_ -]?(?:key|token|secret|password)\s*[:=]\s*\S+|(?:sk-[a-z0-9]{16,}|gh[pousr]_[a-z0-9_]{16,}|github_pat_[a-z0-9_]{16,}))/i;

function redactAgentGraphValue(value: unknown, depth = 0, unavailable: { reason?: string } = {}): unknown {
  if (typeof value === 'string') {
    if (/^data:/i.test(value) || value.length > 512 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
      unavailable.reason ||= 'The workflow contains embedded media data.';
      return '[media data omitted]';
    }
    if (SNAPSHOT_SENSITIVE_TEXT.test(value)) {
      unavailable.reason ||= 'The workflow contains a sensitive value.';
      return '[sensitive text omitted]';
    }
    return value;
  }
  if (depth > 32) {
    unavailable.reason ||= 'The workflow graph nesting is too deep to return safely.';
    return null;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(item => redactAgentGraphValue(item, depth + 1, unavailable));
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([key, item]) => {
    if (/(?:api|access|private)[_-]?key|token|secret|password|credential|authorization/i.test(key)) {
      unavailable.reason ||= 'The workflow contains a credential field.';
      return [key, '[redacted]'];
    }
    return [key, redactAgentGraphValue(item, depth + 1, unavailable)];
  }));
}

// SystemStats interface removed - using any for now

interface LogEntry {
  id: string;
  timestamp: Date;
  tag: 'comfyui' | 'error' | 'warning' | 'info';
  message: string;
}

// ============================================================================
// StoryboardUI Component
// ============================================================================

interface StoryboardUIProps {
  onProjectLoadingChange?: (isLoading: boolean) => void;
  initialSession?: StoryboardDraftState;
}

export function StoryboardUI({ onProjectLoadingChange, initialSession }: StoryboardUIProps = {}) {
  // ---------------------------------------------------------------------------
  // Error Notifications
  // ---------------------------------------------------------------------------
  const { showError, showWarning, showInfo, notifications, removeNotification } = useErrorNotifications();
  
  // ---------------------------------------------------------------------------
  // State - Tabs (with localStorage persistence)
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    if (isTabType(initialSession?.activeTab)) return initialSession.activeTab;
    const saved = localStorage.getItem('storyboard-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return isTabType(parsed.activeTab) ? parsed.activeTab : 'image-generation';
      } catch { /* ignore parse errors */ }
    }
    return 'image-generation';
  });
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>(() => {
    const saved = localStorage.getItem('storyboard-ui-state');
    const savedState = saved ? (() => {
      try { return JSON.parse(saved) as { activeTab?: unknown; activeSubTab?: unknown }; }
      catch { return {}; }
    })() : {};
    const tab = isTabType(initialSession?.activeTab) ? initialSession.activeTab
      : isTabType(savedState.activeTab) ? savedState.activeTab : 'image-generation';
    const subTab = initialSession?.activeSubTab ?? savedState.activeSubTab;
    return isSubTabType(subTab) && isValidWorkflowRoute(tab, subTab)
      ? subTab
      : getDefaultSubCategory(tab);
  });
  const [openDropdown, setOpenDropdown] = useState<TabType | null>(null);
  
  // ---------------------------------------------------------------------------
  // State - Canvas
  // ---------------------------------------------------------------------------
  const [panels, setPanelsState] = useState<Panel[]>(() => initialSession
    ? recoverInterruptedPanels(initialSession.panels) as Panel[]
    : [
      { id: 1, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 0, y: 0, width: 300, height: 300 },
      { id: 2, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 320, y: 0, width: 300, height: 300 },
      { id: 3, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 640, y: 0, width: 300, height: 300 },
      { id: 4, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 0, y: 320, width: 300, height: 300 },
      { id: 5, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 320, y: 320, width: 300, height: 300 },
      { id: 6, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', seed: -1, x: 640, y: 320, width: 300, height: 300 },
    ]);
  const panelsRef = useRef(panels);
  const panelIdHighWaterRef = useRef(Math.max(0, ...panels.map(panel => panel.id)));
  const panelRevisionRef = useRef(new Map<number, number>());
  const panelInputRevisionRef = useRef(new Map<number, number>());
  panelsRef.current = panels;
  panels.forEach(panel => {
    if (!panelRevisionRef.current.has(panel.id)) panelRevisionRef.current.set(panel.id, 1);
    if (!panelInputRevisionRef.current.has(panel.id)) panelInputRevisionRef.current.set(panel.id, 1);
  });
  const setPanels = useCallback((update: React.SetStateAction<Panel[]>) => {
    const current = panelsRef.current;
    const next = typeof update === 'function' ? update(current) : update;
    panelIdHighWaterRef.current = Math.max(panelIdHighWaterRef.current, 0, ...current.map(panel => panel.id), ...next.map(panel => panel.id));
    const previousById = new Map(current.map(panel => [panel.id, panel]));
    const nextIds = new Set(next.map(panel => panel.id));
    for (const panel of next) {
      const previous = previousById.get(panel.id);
      if (previousById.get(panel.id) !== panel) {
        panelRevisionRef.current.set(panel.id, (panelRevisionRef.current.get(panel.id) || 0) + 1);
      } else if (!panelRevisionRef.current.has(panel.id)) {
        panelRevisionRef.current.set(panel.id, 1);
      }
      if (previous && (previous.workflowId !== panel.workflowId || previous.nodeId !== panel.nodeId
        || previous.parameterValues !== panel.parameterValues)) {
        panelInputRevisionRef.current.set(panel.id, (panelInputRevisionRef.current.get(panel.id) || 0) + 1);
      } else if (!panelInputRevisionRef.current.has(panel.id)) {
        panelInputRevisionRef.current.set(panel.id, 1);
      }
    }
    for (const panelId of panelRevisionRef.current.keys()) {
      if (!nextIds.has(panelId)) {
        panelRevisionRef.current.delete(panelId);
        panelInputRevisionRef.current.delete(panelId);
      }
    }
    panelsRef.current = next;
    setPanelsState(next);
  }, []);
  const [selectedPanelId, setSelectedPanelId] = useState<number | null>(initialSession?.selectedPanelId ?? null);
  const [canvasZoom, setCanvasZoom] = useState<number>(() => {
    if (initialSession?.canvasZoom !== undefined) return initialSession.canvasZoom;
    const saved = localStorage.getItem('storyboard-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.canvasZoom ?? 1;
      } catch { /* ignore parse errors */ }
    }
    return 1;
  });
  const [canvasPan, setCanvasPan] = useState(initialSession?.canvasPan ?? { x: 0, y: 0 });
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState({ x: 0, y: 0 });

  // ---------------------------------------------------------------------------
  // State - Resize
  // ---------------------------------------------------------------------------
  const [resizingPanelId, setResizingPanelId] = useState<number | null>(null);
  const [resizeStart, setResizeStart] = useState({ x: 0, y: 0, width: 0, height: 0 });

  // ---------------------------------------------------------------------------
  // State - Phase 2: Panel Dragging
  // ---------------------------------------------------------------------------
  const [draggingPanelId, setDraggingPanelId] = useState<number | null>(null);
  const [dragStart, setDragStart] = useState<{
    x: number;
    y: number;
    panelX: number;
    panelY: number;
    selectedPanelPositions: Map<number, { x: number; y: number }>;
  }>({ x: 0, y: 0, panelX: 0, panelY: 0, selectedPanelPositions: new Map() });

  // ---------------------------------------------------------------------------
  // State - Phase 3: Marquee Selection
  // ---------------------------------------------------------------------------
  const [isMarqueeSelecting, setIsMarqueeSelecting] = useState(false);
  const [marqueeStart, setMarqueeStart] = useState({ x: 0, y: 0 });
  const [marqueeEnd, setMarqueeEnd] = useState({ x: 0, y: 0 });
  const [snapGuides, setSnapGuides] = useState<Array<{ type: 'vertical' | 'horizontal'; position: number }>>([]);
  const [, setConfirmDelete] = useState<{ open: boolean; title: string; message: string; onConfirm: () => void; onCancel: () => void } | null>(null);
  const [_isShiftPressed, setIsShiftPressed] = useState(false);
  const [showFolderBrowser, setShowFolderBrowser] = useState(false);
  const [pendingFolderName, setPendingFolderName] = useState('');

  const canvasRef = useRef<HTMLDivElement>(null);
  const skipParameterReset = useRef(false);
  const restoredParametersPendingRef = useRef(Boolean(initialSession));
  const skipInitialSessionDraftWrite = useRef(Boolean(initialSession));
  const generationStartTimes = useRef<Map<number, number>>(new Map());
  
  // ---------------------------------------------------------------------------
  // State - Workflows
  // ---------------------------------------------------------------------------
  const [workflows, setWorkflowsState] = useState<Workflow[]>([]);
  const workflowsRef = useRef(workflows);
  workflowsRef.current = workflows;
  const setWorkflows = useCallback((update: React.SetStateAction<Workflow[]>) => {
    const next = typeof update === 'function' ? update(workflowsRef.current) : update;
    workflowsRef.current = next;
    setWorkflowsState(next);
  }, []);
  const workflowCollectionRevisionRef = useRef<number | null>(null);
  const workflowStorageReadyRef = useRef(false);
  const workflowSaveTimerRef = useRef<number | null>(null);
  const workflowSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const workflowPersistedFingerprintRef = useRef(new Map<string, string>());
  const workflowConflictIdsRef = useRef(new Set<string>());
  const workflowDeleteIdsRef = useRef(new Set<string>());
  const preparedWorkflowRevisionsRef = useRef(new Map<string, {
    workflow: Workflow;
    projectIdentity: string;
    consoleBindingId: string;
    panelId: number;
    panelRevision: number;
    workflowRevision: number | null;
    backendId: string;
    backendUrl: string;
  }>());
  const workflowsLoadedRef = useRef(false); // Tracks whether initial load from localStorage is done
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(initialSession?.selectedWorkflowId ?? null);
  const selectedWorkflowIdRef = useRef(selectedWorkflowId);
  selectedWorkflowIdRef.current = selectedWorkflowId;
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [renamingWorkflow, setRenamingWorkflow] = useState<Workflow | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [parameterValues, setParameterValues] = useState<Record<string, any>>(initialSession?.parameterValues || {});
  const [cameraAngles, setCameraAngles] = useState<Record<string, CameraAngle | null>>((initialSession?.cameraAngles || {}) as Record<string, CameraAngle | null>);
  const [globalPromptOverride, setGlobalPromptOverride] = useState<string>(initialSession?.globalPromptOverride || '');
  const [useGlobalPrompt, setUseGlobalPrompt] = useState(initialSession?.useGlobalPrompt ?? false);
  const [enhancementProfiles, setEnhancementProfiles] = useState<EnhancementProfile[]>([]);
  const [enhancementProfilesLoading, setEnhancementProfilesLoading] = useState(true);
  const [enhancementProfilesError, setEnhancementProfilesError] = useState<string | null>(null);
  const [enhancementTargetModels, setEnhancementTargetModels] = useState<TargetModelOption[]>([]);
  const [enhancementTargetModelsLoading, setEnhancementTargetModelsLoading] = useState(true);
  const [enhancementTargetModelsError, setEnhancementTargetModelsError] = useState<string | null>(null);
  const [enhancementPreferences, setEnhancementPreferences] = useState<EnhancementPreferences>(EMPTY_ENHANCEMENT_PREFERENCES);
  const [showEnhancementSettings, setShowEnhancementSettings] = useState(false);
  const enhancementSettingsTriggerRef = useRef<HTMLElement | null>(null);
  
  // ---------------------------------------------------------------------------
  // State - Image Viewer
  // ---------------------------------------------------------------------------
  const [showImageViewer, setShowImageViewer] = useState(false);
  const [viewerImage, setViewerImage] = useState<string | null>(null);
  const [viewerPanelId, setViewerPanelId] = useState<number | null>(null);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerPan, setViewerPan] = useState({ x: 0, y: 0 });
  const [viewerCompareMode, setViewerCompareMode] = useState(false);
  const [viewerCompareImage, setViewerCompareImage] = useState<string | null>(null);
  const [viewerComparePosition, setViewerComparePosition] = useState(50); // Percentage for wipe slider
  const imageViewerRef = useRef<HTMLDivElement>(null);
  
  // ---------------------------------------------------------------------------
  // State - Context Menu
  // ---------------------------------------------------------------------------
  const [contextMenu, setContextMenu] = useState<{
    visible: boolean;
    x: number;
    y: number;
    panelId: number | null;
  }>({ visible: false, x: 0, y: 0, panelId: null });
  
  // ---------------------------------------------------------------------------
  // State - Image Viewer Metadata & Zoom
  // ---------------------------------------------------------------------------
  const [isMetadataPanelOpen, setIsMetadataPanelOpen] = useState(() => {
    // Default to collapsed on narrow viewports
    return !isNarrowViewport(768);
  });
  const [isPromptExpanded, setIsPromptExpanded] = useState(false);
  const [viewerImageDimensions, setViewerImageDimensions] = useState<ImageDimensions | undefined>();
  const [viewerFileSize, setViewerFileSize] = useState<number | undefined>();
  const [pngMetadata, setPngMetadata] = useState<{
    prompt?: Record<string, unknown>;
    workflow?: Record<string, unknown>;
    parameters?: string;
  } | null>(null);
  const [isLoadingPngMetadata, setIsLoadingPngMetadata] = useState(false);
  const [zoomMode, setZoomMode] = useState<'fit' | 'actual' | 'custom'>('actual');
  const viewerContainerRef = useRef<HTMLDivElement>(null);
  
  // ---------------------------------------------------------------------------
  // State - Connection
  // ---------------------------------------------------------------------------
  // Legacy project field retained for save/load compatibility; managed nodes are authoritative for network access.
  const [comfyUrl, setComfyUrl] = useState(initialSession?.comfyUrl || '');
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('connecting');
  const [systemStats, setSystemStats] = useState<Record<string, any> | null>(null);
  const [browserNodeStatus, setBrowserNodeStatus] = useState<Record<string, BrowserNodeStatus>>({});
  const [connectionHint, setConnectionHint] = useState('');
  
  // ---------------------------------------------------------------------------
  // State - Logs
  // ---------------------------------------------------------------------------
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logFilter, setLogFilter] = useState('ALL');
  const [autoScroll, setAutoScroll] = useState(true);
  const [showLogPanel, setShowLogPanel] = useState(false); // Closed by default
  const logEndRef = useRef<HTMLDivElement>(null);
  
  // ---------------------------------------------------------------------------
  // State - Orchestrator
  // ---------------------------------------------------------------------------
  const [showNodeManager, setShowNodeManager] = useState(false);
  const [isRestartingNodes, setIsRestartingNodes] = useState(false);
  const renderNodes = useRenderNodes();
  const managedComfyUrls = getManagedComfyUIProbeUrls(renderNodes);
  const managedComfyUrlsKey = [...managedComfyUrls].sort().join('|');
  // One entry per submitted prompt, independent of the currently selected panel/node.
  const activeGenerationsRef = useRef(new Map<string, ActiveGeneration>());
  const generationRunsRef = useRef(new Map<number, GenerationRun>());
  const generationRunCounterRef = useRef(0);

  const claimGenerationRun = useCallback((panelId: number, runId = `${panelId}-${Date.now()}-${generationRunCounterRef.current++}`): GenerationRun | null => {
    if (generationRunsRef.current.has(panelId)) {
      showWarning(`Panel ${panelId} is already generating. Wait for it to finish before generating again.`);
      return null;
    }
    const run: GenerationRun = {
      id: runId,
      panelId,
      submissionFinished: false,
      jobs: new Set(),
      settledJobs: new Set(),
    };
    generationRunsRef.current.set(panelId, run);
    return run;
  }, [showWarning]);

  const isCurrentGenerationRun = useCallback((panelId: number, runId: string): boolean => {
    return generationRunsRef.current.get(panelId)?.id === runId;
  }, []);

  const maybeReleaseGenerationRun = useCallback((run: GenerationRun) => {
    if (!run.submissionFinished || run.jobs.size !== run.settledJobs.size) return;
    if (generationRunsRef.current.get(run.panelId)?.id === run.id) {
      generationRunsRef.current.delete(run.panelId);
    }
  }, []);

  const finishGenerationSubmission = useCallback((runId: string) => {
    for (const run of generationRunsRef.current.values()) {
      if (run.id === runId) {
        run.submissionFinished = true;
        maybeReleaseGenerationRun(run);
        return;
      }
    }
  }, [maybeReleaseGenerationRun]);

  const registerGenerationJob = useCallback((
    runId: string,
    jobKey: string,
    job: Omit<ActiveGeneration, 'runId'>,
  ): boolean => {
    const run = generationRunsRef.current.get(job.panelId);
    if (!run || run.id !== runId) return false;
    run.jobs.add(jobKey);
    activeGenerationsRef.current.set(jobKey, { ...job, runId });
    return true;
  }, []);

  const settleGenerationJob = useCallback((runId: string, jobKey: string) => {
    const activeJob = activeGenerationsRef.current.get(jobKey);
    if (activeJob?.runId === runId) activeGenerationsRef.current.delete(jobKey);
    for (const run of generationRunsRef.current.values()) {
      if (run.id === runId) {
        run.settledJobs.add(jobKey);
        maybeReleaseGenerationRun(run);
        return;
      }
    }
  }, [maybeReleaseGenerationRun]);

  const markGenerationJobFinishing = useCallback((runId: string, jobKey: string) => {
    const activeJob = activeGenerationsRef.current.get(jobKey);
    if (activeJob?.runId === runId) activeJob.finishing = true;
  }, []);
  const batchSaveTriggeredRef = useRef<Set<string>>(new Set()); // Track which panels have triggered batch save
  const savedJobsRef = useRef<Set<string>>(new Set()); // Track which parallel jobs have been saved to prevent duplicates
  const nextVersionRef = useRef<Map<number, number>>(new Map()); // Atomic version counter per panel to prevent race conditions
  const logIdCounter = useRef(0);
  
  // Refs to always have access to latest state values in callbacks (avoids stale closures)
  const parameterValuesRef = useRef<Record<string, any>>(parameterValues);
  const selectedPanelIdRef = useRef<number | null>(selectedPanelId);
  const enhancementPreferencesRef = useRef<EnhancementPreferences>(enhancementPreferences);
  const enhancementRequestRevisionRef = useRef(0);
  const enhancementAbortControllerRef = useRef<AbortController | null>(null);
  const enhancementUsesAgentRef = useRef(false);
  const [isPromptEnhancementRunning, setIsPromptEnhancementRunning] = useState(false);
  
  // Keep refs in sync with state
  parameterValuesRef.current = parameterValues;
  selectedPanelIdRef.current = selectedPanelId;
  enhancementPreferencesRef.current = enhancementPreferences;

  const hasUnsavedWorkflowChanges = useCallback(() => workflowsRef.current.some(workflow =>
    !workflowConflictIdsRef.current.has(workflow.id)
    && !workflowDeleteIdsRef.current.has(workflow.id)
    && workflowPersistedFingerprintRef.current.get(workflow.id) !== workflowContentFingerprint(workflow),
  ), []);

  const reconcileWorkflowStorage = useCallback(async () => {
    const result = await workflowStorage.loadAll();
    workflowStorageReadyRef.current = true;
    workflowCollectionRevisionRef.current = result.collectionRevision;
    const canonical = new Map(result.workflows.map(value => [String((value as Workflow).id), value as Workflow]));
    const current = workflowsRef.current;
    let conflicts = 0;
    const next = current.map(local => {
      const server = canonical.get(local.id);
      const localFingerprint = workflowContentFingerprint(local);
      const baseline = workflowPersistedFingerprintRef.current.get(local.id);
      if (!server) {
        if (baseline !== undefined) {
          workflowConflictIdsRef.current.add(local.id);
          conflicts += 1;
        }
        return local;
      }
      const serverFingerprint = workflowContentFingerprint(server);
      if (localFingerprint === baseline || localFingerprint === serverFingerprint) {
        workflowConflictIdsRef.current.delete(local.id);
        workflowPersistedFingerprintRef.current.set(local.id, serverFingerprint);
        return server;
      }
      workflowConflictIdsRef.current.add(local.id);
      conflicts += 1;
      return local;
    });
    setWorkflows(next);
    return conflicts;
  }, [setWorkflows]);

  const persistDirtyWorkflows = useCallback((explicitSnapshot?: Workflow[]): Promise<void> => {
    const operation = async () => {
      if (!workflowStorageReadyRef.current) throw new Error('Workflow storage is not ready; local edits were kept in the browser.');
      const source = explicitSnapshot || workflowsRef.current;
      const dirty = source.filter(workflow =>
        !workflowConflictIdsRef.current.has(workflow.id)
        && workflowPersistedFingerprintRef.current.get(workflow.id) !== workflowContentFingerprint(workflow),
      );
      if (dirty.length === 0) return;
      const result = await workflowStorage.saveAll(dirty as unknown as Record<string, unknown>[]);
      workflowCollectionRevisionRef.current = result.collectionRevision;
      const saved = new Map(result.workflows.map(workflow => [workflow.id, workflow]));
      for (const canonical of result.workflows) {
        workflowPersistedFingerprintRef.current.set(canonical.id, workflowContentFingerprint(canonical as unknown as Workflow));
        workflowConflictIdsRef.current.delete(canonical.id);
      }
      const latest = workflowsRef.current;
      setWorkflows(latest.map(workflow => {
        const record = saved.get(workflow.id);
        return record ? { ...workflow, revision: record.revision } : workflow;
      }));
    };
    const request = workflowSaveQueueRef.current.catch(() => undefined).then(operation);
    workflowSaveQueueRef.current = request.then(() => undefined, () => undefined);
    return request.catch(async error => {
      let conflicts = 0;
      try {
        conflicts = await reconcileWorkflowStorage();
      } catch {
        workflowStorageReadyRef.current = false;
      }
      const detail = error instanceof Error ? error.message : String(error);
      showError(conflicts > 0
        ? `Workflow save conflict: ${conflicts} local workflow(s) changed elsewhere. Your edits were kept; review the latest snapshot before saving again.`
        : `Workflow changes were not saved: ${detail}`);
      throw error;
    });
  }, [reconcileWorkflowStorage, setWorkflows, showError]);

  const flushPendingWorkflowSave = useCallback(async () => {
    if (workflowSaveTimerRef.current !== null) {
      window.clearTimeout(workflowSaveTimerRef.current);
      workflowSaveTimerRef.current = null;
    }
    await workflowSaveQueueRef.current.catch(() => undefined);
    if (hasUnsavedWorkflowChanges()) await persistDirtyWorkflows();
  }, [hasUnsavedWorkflowChanges, persistDirtyWorkflows]);

  useEffect(() => () => {
    enhancementRequestRevisionRef.current += 1;
    enhancementAbortControllerRef.current?.abort();
  }, []);

  // Ref for handleParameterChange — allows early effects to call it before it's declared
  const handleParameterChangeRef = useRef<(name: string, value: any) => void>(() => {});

  // Phase 2: Resize handlers
  const handleResizeStart = useCallback((panelId: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;

    setResizingPanelId(panelId);
    setResizeStart({
      x: e.clientX,
      y: e.clientY,
      width: panel.width,
      height: panel.height,
    });
  }, [panels]);

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (resizingPanelId === null) return;

    const deltaX = e.clientX - resizeStart.x;
    const deltaY = e.clientY - resizeStart.y;
    
    const newWidth = Math.max(200, resizeStart.width + deltaX);
    const newHeight = Math.max(200, resizeStart.height + deltaY);

    setPanels(prevPanels =>
      prevPanels.map(panel => {
        if (panel.id === resizingPanelId) {
          return {
            ...panel,
            width: newWidth,
            height: newHeight,
          };
        }
        return panel;
      })
    );
  }, [resizingPanelId, resizeStart]);

  const handleResizeEnd = useCallback(() => {
    setResizingPanelId(null);
    setResizeStart({ x: 0, y: 0, width: 0, height: 0 });
  }, []);

  // Add global resize event listeners
  useEffect(() => {
    if (resizingPanelId !== null) {
      window.addEventListener('mousemove', handleResizeMove);
      window.addEventListener('mouseup', handleResizeEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleResizeMove);
        window.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [resizingPanelId, handleResizeMove, handleResizeEnd]);

  // Toggle panel selection (for multi-select)
  const togglePanelSelection = useCallback((panelId: number) => {
    setPanels(prevPanels =>
      prevPanels.map(panel =>
        panel.id === panelId
          ? { ...panel, selected: !panel.selected }
          : panel
      )
    );
  }, []);

  // Phase 2: Panel drag handlers
  const handleDragStart = useCallback((panelId: number, e: React.MouseEvent) => {
    // Don't drag if generating or clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.tagName === 'BUTTON' || target.tagName === 'INPUT' || target.closest('button')) {
      return;
    }
    
    // Ctrl+Click or Shift+Click = multi-select (don't start drag)
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      e.preventDefault();
      e.stopPropagation();
      togglePanelSelection(panelId);
      return;
    }
    
    e.preventDefault();
    e.stopPropagation();
    
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;

    setDraggingPanelId(panelId);
    
    // Store initial positions of all selected panels for multi-select drag
    const selectedPanelPositions = new Map<number, { x: number; y: number }>();
    if (panel.selected) {
      panels.filter(p => p.selected).forEach(p => {
        selectedPanelPositions.set(p.id, { x: p.x, y: p.y });
      });
    }
    
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      panelX: panel.x,
      panelY: panel.y,
      selectedPanelPositions,
    });

    // Bring panel to front
    setPanels(prevPanels =>
      prevPanels.map(p =>
        p.id === panelId ? { ...p, zIndex: 100 } : p
      )
    );
  }, [panels, togglePanelSelection]);

  const handleDragMove = useCallback((e: MouseEvent) => {
    if (draggingPanelId === null) return;

    const deltaX = (e.clientX - dragStart.x) / canvasZoom;
    const deltaY = (e.clientY - dragStart.y) / canvasZoom;
    
    const newX = dragStart.panelX + deltaX;
    const newY = dragStart.panelY + deltaY;

    const isMultiSelect = dragStart.selectedPanelPositions.size > 1;

    setPanels(prevPanels =>
      prevPanels.map(panel => {
        // Move the dragged panel
        if (panel.id === draggingPanelId) {
          return {
            ...panel,
            x: newX,
            y: newY,
          };
        }
        
        // If multi-selecting, move all selected panels by the same delta
        // Use stored initial positions to avoid accumulating deltas
        if (isMultiSelect && panel.selected && panel.id !== draggingPanelId) {
          const initialPos = dragStart.selectedPanelPositions.get(panel.id);
          if (initialPos) {
            return {
              ...panel,
              x: initialPos.x + deltaX,
              y: initialPos.y + deltaY,
            };
          }
        }
        
        return panel;
      })
    );
  }, [draggingPanelId, dragStart, canvasZoom]);

  const handleDragEnd = useCallback(() => {
    if (draggingPanelId !== null) {
      // Reset z-index
      setPanels(prevPanels =>
        prevPanels.map(p =>
          p.id === draggingPanelId ? { ...p, zIndex: undefined } : p
        )
      );
    }
    setDraggingPanelId(null);
    setDragStart({ x: 0, y: 0, panelX: 0, panelY: 0, selectedPanelPositions: new Map() });
  }, [draggingPanelId]);

  // Add global drag event listeners
  useEffect(() => {
    if (draggingPanelId !== null) {
      window.addEventListener('mousemove', handleDragMove);
      window.addEventListener('mouseup', handleDragEnd);
      
      return () => {
        window.removeEventListener('mousemove', handleDragMove);
        window.removeEventListener('mouseup', handleDragEnd);
      };
    }
  }, [draggingPanelId, handleDragMove, handleDragEnd]);

  // Handle panel removal
  const handleRemovePanel = useCallback((panelId: number) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;

    // Check if panel has generated images
    const hasImages = panel.imageHistory.length > 0;
    
    if (hasImages) {
      // Show confirmation dialog
      setConfirmDelete({
        open: true,
        title: 'Remove Panel',
        message: `Remove "${panel.name || `Panel_${String(panelId).padStart(2, '0')}`}"?\n\nThis panel has ${panel.imageHistory.length} generated image(s). This action cannot be undone.`,
        onConfirm: () => {
          setPanels(prev => prev.filter(p => p.id !== panelId));
          if (selectedPanelId === panelId) {
            const remaining = panels.filter(p => p.id !== panelId);
            setSelectedPanelId(remaining.length > 0 ? remaining[0].id : null);
          }
          setConfirmDelete(null);
        },
        onCancel: () => setConfirmDelete(null),
      });
    } else {
      // Remove immediately if no images
      setPanels(prev => prev.filter(p => p.id !== panelId));
      if (selectedPanelId === panelId) {
        const remaining = panels.filter(p => p.id !== panelId);
        setSelectedPanelId(remaining.length > 0 ? remaining[0].id : null);
      }
    }
  }, [panels, selectedPanelId]);


  // Phase 3: Alignment handlers
  const alignPanels = useCallback((alignment: 'left' | 'right' | 'top' | 'bottom') => {
    const selectedPanels = panels.filter(p => p.selected);
    if (selectedPanels.length < 2) return;

    let targetValue: number;
    switch (alignment) {
      case 'left':
        targetValue = Math.min(...selectedPanels.map(p => p.x));
        break;
      case 'right':
        targetValue = Math.max(...selectedPanels.map(p => p.x + p.width));
        break;
      case 'top':
        targetValue = Math.min(...selectedPanels.map(p => p.y));
        break;
      case 'bottom':
        targetValue = Math.max(...selectedPanels.map(p => p.y + p.height));
        break;
    }

    setPanels(prevPanels =>
      prevPanels.map(panel => {
        if (!panel.selected) return panel;

        switch (alignment) {
          case 'left':
            return { ...panel, x: targetValue };
          case 'right':
            return { ...panel, x: targetValue - panel.width };
          case 'top':
            return { ...panel, y: targetValue };
          case 'bottom':
            return { ...panel, y: targetValue - panel.height };
          default:
            return panel;
        }
      })
    );
  }, [panels]);

  // Phase 3: Distribute panels evenly
  const distributePanels = useCallback((direction: 'horizontal' | 'vertical') => {
    const selectedPanels = panels.filter(p => p.selected);
    if (selectedPanels.length < 3) return;

    const sortedPanels = [...selectedPanels].sort((a, b) =>
      direction === 'horizontal' ? a.x - b.x : a.y - b.y
    );

    const first = sortedPanels[0];
    const last = sortedPanels[sortedPanels.length - 1];

    let totalSpace: number;
    let totalSize: number;

    if (direction === 'horizontal') {
      totalSpace = last.x + last.width - first.x;
      totalSize = sortedPanels.reduce((sum, p) => sum + p.width, 0);
    } else {
      totalSpace = last.y + last.height - first.y;
      totalSize = sortedPanels.reduce((sum, p) => sum + p.height, 0);
    }

    const gap = (totalSpace - totalSize) / (sortedPanels.length - 1);

    setPanels(prevPanels => {
      let currentPos = direction === 'horizontal' ? first.x : first.y;
      const panelUpdates = new Map<number, { x: number; y: number }>();

      sortedPanels.forEach((panel, index) => {
        if (index === 0) {
          currentPos += direction === 'horizontal' ? panel.width : panel.height;
        } else if (index === sortedPanels.length - 1) {
          // Last panel stays in place
        } else {
          const newPos = currentPos + gap;
          panelUpdates.set(panel.id, {
            x: direction === 'horizontal' ? newPos : panel.x,
            y: direction === 'vertical' ? newPos : panel.y,
          });
          currentPos = newPos + (direction === 'horizontal' ? panel.width : panel.height);
        }
      });

      return prevPanels.map(panel => {
        if (!panel.selected) return panel;
        const update = panelUpdates.get(panel.id);
        return update ? { ...panel, ...update } : panel;
      });
    });
  }, [panels]);

  // Phase 3: Handle folder drop for import
  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const items = e.dataTransfer.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.kind === 'file') {
        const entry = item.webkitGetAsEntry?.();
        if (entry?.isDirectory) {
          const folderName = entry.name;
          // Open folder browser dialog pre-filled with the folder name
          setPendingFolderName(folderName);
          setShowFolderBrowser(true);
          break;
        }
      }
    }
  }, []);

  // Add log entry
  const addLog = useCallback((tag: 'comfyui' | 'error' | 'warning' | 'info', message: string) => {
    const entry: LogEntry = {
      id: String(++logIdCounter.current),
      timestamp: new Date(),
      tag,
      message,
    };
    setLogs(prev => [...prev.slice(-499), entry]); // Keep last 500 logs
  }, []);
  
  // ---------------------------------------------------------------------------
  // State - Multi-Node Parallel Generation
  // ---------------------------------------------------------------------------
  const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>(initialSession?.selectedBackendIds || []);
  const selectedBackendIdsRef = useRef(selectedBackendIds);
  selectedBackendIdsRef.current = selectedBackendIds;
  const hasWorkflowForPanel = (panel?: Panel): boolean => Boolean(workflows.find(workflow =>
    workflow.id === selectedWorkflowId || workflow.id === panel?.workflowId
  ));
  const getPanelGenerationDisabledReason = (panel?: Panel): string | null => getGenerationDisabledReason(
    hasWorkflowForPanel(panel),
    {
      managedNodes: renderNodes,
      browserStatuses: browserNodeStatus,
      selectedBackendIds,
      panelNodeId: panel?.nodeId,
      connectionStatus,
    },
  );
  const actionPanel = panels.find(panel => panel.id === selectedPanelId) || panels[0];
  const generationDisabledReason = getPanelGenerationDisabledReason(actionPanel);
  
  // ---------------------------------------------------------------------------
  // State - Project Settings
  // ---------------------------------------------------------------------------
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [showPathMappings, setShowPathMappings] = useState(false);
  const [projectSettings, setProjectSettings] = useProjectSettings();
  const previousProjectIdentityRef = useRef(projectManager.getSessionIdentity());
  const projectScopeRef = useRef({ identity: projectManager.getSessionIdentity(), revision: 1, bindingId: crypto.randomUUID() });
  useEffect(() => () => {
    projectScopeRef.current.bindingId = crypto.randomUUID();
  }, []);
  const projectStateSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const [deletedImages, setDeletedImages] = useState<Set<string>>(new Set());
  const projectComparisonStateRef = useRef({ cameraAngles, renderNodes, comfyUrl, enhancementPreferences, deletedImages, globalPromptOverride, useGlobalPrompt });
  projectComparisonStateRef.current = { cameraAngles, renderNodes, comfyUrl, enhancementPreferences, deletedImages, globalPromptOverride, useGlobalPrompt };
  const readCurrentProjectState = useCallback(() => ({
    ...projectComparisonStateRef.current,
    panels: panelsRef.current,
    parameters: parameterValuesRef.current,
    selectedWorkflowId: selectedWorkflowIdRef.current,
    settings: projectManager.getProject(),
    deletedImages: [...projectComparisonStateRef.current.deletedImages].sort(),
  }), []);
  const projectSavedFingerprintRef = useRef<string | null | undefined>(undefined);
  if (projectSavedFingerprintRef.current === undefined) {
    projectSavedFingerprintRef.current = initialSession ? null : projectStateFingerprint(readCurrentProjectState());
  }
  const hasUnsavedProjectWork = (): boolean => projectSavedFingerprintRef.current !== projectStateFingerprint(readCurrentProjectState())
    || hasUnsavedWorkflowChanges();

  const persistProjectStateSnapshot = useCallback((
    panelSnapshot: Panel[],
    parameterSnapshot: Record<string, unknown>,
    workflowId: string | undefined,
    settingsOverride: ProjectSettings = projectManager.getProject(),
    assertCurrent?: () => void,
  ) => {
    const sourceIdentity = projectManager.getSessionIdentity();
    const snapshot = JSON.parse(JSON.stringify({
      ...readCurrentProjectState(), panels: panelSnapshot, parameters: parameterSnapshot,
      selectedWorkflowId: workflowId || null, settings: settingsOverride,
    })) as ReturnType<typeof readCurrentProjectState>;
    const fingerprint = projectStateFingerprint(snapshot);
    const request = projectStateSaveQueueRef.current.catch(() => undefined).then(async () => {
      assertCurrent?.();
      const result = await projectManager.saveProjectState(snapshot.panels, undefined, snapshot.parameters, {
        selectedWorkflowId: workflowId,
        renderNodes: snapshot.renderNodes,
        comfyUrl: snapshot.comfyUrl,
        cameraAngles: snapshot.cameraAngles,
        enhancementPreferences: snapshot.enhancementPreferences,
        deletedImages: snapshot.deletedImages,
        globalPromptOverride: snapshot.globalPromptOverride,
        useGlobalPrompt: snapshot.useGlobalPrompt,
      }, snapshot.settings);
      if (result.success && result.savedPath && projectManager.getSessionIdentity() === sourceIdentity) {
        projectSavedFingerprintRef.current = fingerprint;
      }
      return result;
    });
    projectStateSaveQueueRef.current = request.then(() => undefined, () => undefined);
    return request;
  }, [readCurrentProjectState]);

  useEffect(() => {
    const syncProjectBinding = (settings: ProjectSettings) => {
      const identity = projectManager.getSessionIdentity(settings);
      const identityChanged = previousProjectIdentityRef.current !== identity;
      previousProjectIdentityRef.current = identity;
      if (identityChanged) {
        projectScopeRef.current = { identity, revision: projectScopeRef.current.revision + 1, bindingId: crypto.randomUUID() };
        notifyAgentSurfaceContextChanged('console');
        enhancementRequestRevisionRef.current += 1;
        if (enhancementUsesAgentRef.current) enhancementAbortControllerRef.current?.abort();
      }
    };
    const unsubscribeProject = projectManager.subscribe(syncProjectBinding);
    syncProjectBinding(projectManager.getProject());
    return unsubscribeProject;
  }, []);

  useEffect(() => {
    let previous = getAgentExecutionFingerprint();
    const invalidate = () => {
      const next = getAgentExecutionFingerprint();
      if (next === previous) return;
      previous = next;
      if (enhancementUsesAgentRef.current) {
        enhancementRequestRevisionRef.current += 1;
        enhancementAbortControllerRef.current?.abort();
      }
    };
    const unsubscribeSettings = subscribeAgentSettings(invalidate);
    const unsubscribeGateway = subscribeAgentGateway(invalidate);
    return () => {
      unsubscribeSettings();
      unsubscribeGateway();
    };
  }, []);
  
  // Phase 6: Track deleted images to filter on reload
  
  // Phase 4: Loading progress state for project scanning
  const [isLoadingProject, setIsLoadingProject] = useState(false);
  useEffect(() => {
    onProjectLoadingChange?.(isLoadingProject);
  }, [isLoadingProject, onProjectLoadingChange]);
  const [loadingProgress, setLoadingProgress] = useState({
    progress: 0,
    currentFile: '',
  });
  
  // Phase 6: Delete confirmation dialog state
  // CRITICAL FIX: Use entryId instead of historyIndex to handle stale indices
  const [deleteConfirm, setDeleteConfirm] = useState<{
    isOpen: boolean;
    panelId: number;
    entryId: string;
    filename: string;
  } | null>(null);
  const [suppressDeleteConfirm, setSuppressDeleteConfirm] = useState(false);
  
  // Endpoint availability checking (used for warnings, not blocking)
  const [_availableEndpoints, setAvailableEndpoints] = useState<Set<string>>(new Set());
  const [_endpointsChecked, setEndpointsChecked] = useState(false);
   
  // ---------------------------------------------------------------------------
  // Effect - Phase 3: Keyboard listeners for Shift key (snap guides)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
        setSnapGuides([]);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Effect - Cleanup all WebSockets and polling on unmount / page unload
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const activeGenerations = activeGenerationsRef.current;
    const generationRuns = generationRunsRef.current;
    const handleBeforeUnload = () => {
      activeGenerations.clear();
      generationRuns.clear();
      disconnectAllWebSockets();
      orchestratorManager.stopPolling();
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Also cleanup on React component unmount (HMR, navigation)
      activeGenerations.clear();
      generationRuns.clear();
      disconnectAllWebSockets();
      orchestratorManager.stopPolling();
    };
  }, []);

  // ---------------------------------------------------------------------------
  // Effect - Fetch backends from Orchestrator API and start health monitoring
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (projectSettings.orchestratorUrl) {
      orchestratorManager.fetchBackendsFromAPI(projectSettings.orchestratorUrl);
      
      // Start health monitoring immediately after fetching backends
      // This polls nodes every 5 seconds to update their status and connect WebSockets
      orchestratorManager.startPolling(5000);
      
      // Poll all nodes immediately to show status without waiting 5 seconds
      setTimeout(() => {
        const nodes = orchestratorManager.getNodes();
        nodes.forEach(node => orchestratorManager.pollNode(node));
      }, 100);
    }
    
    return () => {
      orchestratorManager.stopPolling();
    };
  }, [projectSettings.orchestratorUrl]);

  // ---------------------------------------------------------------------------
  // Effect - Probe only configured managed ComfyUI paths.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const urls = managedComfyUrlsKey ? managedComfyUrlsKey.split('|') : [];
    setSystemStats(null);
    setConnectionHint(urls.length > 0 ? '' : 'No managed ComfyUI nodes configured. Add one in Manage Nodes.');
    setConnectionStatus(urls.length > 0 ? 'connecting' : 'disconnected');

    return startComfyUIProbeLifecycle({
      urls,
      setStatuses: statuses => setBrowserNodeStatus(statuses),
      onResult: (url, result: ComfyUIProbeResult) => {
        setBrowserNodeStatus(previous => ({
          ...previous,
          [url]: result.ok ? 'connected' : 'disconnected',
        }));
        if (result.ok) setSystemStats(result.stats || null);
      },
    });
  }, [managedComfyUrlsKey]);

  useEffect(() => {
    const urls = managedComfyUrlsKey ? managedComfyUrlsKey.split('|') : [];
    if (urls.length === 0) {
      setConnectionStatus('disconnected');
      setConnectionHint('No managed ComfyUI nodes configured. Add one in Manage Nodes.');
      return;
    }

    const hasConnectedNode = urls.some(url => browserNodeStatus[url] === 'connected');
    const hasPendingProbe = urls.some(url => browserNodeStatus[url] === 'connecting');
    if (hasConnectedNode) {
      setConnectionStatus('connected');
      setConnectionHint('');
    } else if (hasPendingProbe) {
      setConnectionStatus('connecting');
      setConnectionHint('');
    } else {
      setConnectionStatus('disconnected');
      setConnectionHint(`Browser cannot reach managed ComfyUI node(s): ${urls.join(', ')}. Check Manage Nodes, network, CORS, or mixed-content policy.`);
    }
  }, [browserNodeStatus, managedComfyUrlsKey]);
  
  // ---------------------------------------------------------------------------
  // Effect - Check endpoint availability when orchestrator URL changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const checkEndpoints = async () => {
      if (!projectSettings.orchestratorUrl) {
        setAvailableEndpoints(new Set());
        setEndpointsChecked(false);
        return;
      }
      
      // Check endpoints using appropriate methods
      // POST/DELETE endpoints: send minimal valid request to get non-404 response
      // GET endpoints: use HEAD or GET
      const endpointsToCheck = [
        { path: '/api/health', method: 'GET' },
        { path: '/api/scan-project-images', method: 'POST', body: JSON.stringify({ folder_path: '', naming_pattern: '', project_name: '' }) },
        { path: '/api/serve-image', method: 'GET' },  // Will get 422 (missing params) which is fine - means endpoint exists
        { path: '/api/delete-image', method: 'DELETE', body: JSON.stringify({ file_path: '' }) },
      ];
      
      const available = new Set<string>();
      
      for (const endpoint of endpointsToCheck) {
        try {
          const response = await fetch(`${projectSettings.orchestratorUrl}${endpoint.path}`, {
            method: endpoint.method,
            headers: endpoint.body ? { 'Content-Type': 'application/json' } : undefined,
            body: endpoint.body,
            signal: AbortSignal.timeout(5000),
          });
          // Any response except 404 means the endpoint exists
          // 405 = method not allowed (endpoint doesn't exist for this method)
          // 422 = validation error (endpoint exists but bad params - this is OK)
          // 400 = bad request (endpoint exists)
          // 200/201 = success
          if (response.status !== 404 && response.status !== 405) {
            available.add(endpoint.path);
          }
        } catch {
          // Endpoint not available (network error, timeout, etc.)
        }
      }
      
      setAvailableEndpoints(available);
      setEndpointsChecked(true);
      
      // Show warning if new endpoints aren't available
      if (!available.has('/api/scan-project-images')) {
        showWarning('Orchestrator server is running but project scanning endpoints are not available. Please update the Orchestrator server to the latest version for full functionality.');
      }
    };
    
    checkEndpoints();
  }, [projectSettings.orchestratorUrl, showWarning]);
  
  // State - File Browser Dialog (Load/Save)
  const [fileBrowserMode, setFileBrowserMode] = useState<'open' | 'save' | null>(null);
  
  // State - Legacy Load Project Dialog (to be removed)
  const [showLoadProjectBrowser, setShowLoadProjectBrowser] = useState(false);
  const [availableProjects, setAvailableProjects] = useState<Array<{ path: string; name: string; saved_at: string; panel_count: number }>>([]);
  const [selectedLoadPath, setSelectedLoadPath] = useState('');
  const [isLoadingProjects, setIsLoadingProjects] = useState(false);
  
  // ---------------------------------------------------------------------------
  // State - Resizable Panels (with localStorage persistence)
  // ---------------------------------------------------------------------------
  const [leftPanelWidth, setLeftPanelWidth] = useState(() => {
    if (initialSession?.leftPanelWidth !== undefined) return initialSession.leftPanelWidth;
    const saved = localStorage.getItem('storyboard-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.leftPanelWidth ?? 250;
      } catch { /* ignore parse errors */ }
    }
    return 250;
  });
  const [rightPanelWidth, setRightPanelWidth] = useState(() => {
    if (initialSession?.rightPanelWidth !== undefined) return initialSession.rightPanelWidth;
    const saved = localStorage.getItem('storyboard-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.rightPanelWidth ?? 200;
      } catch { /* ignore parse errors */ }
    }
    return 200;
  });
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Prompt target/dialect metadata is backend-owned; do not duplicate a profile table here.
  const loadEnhancementProfiles = useCallback(async () => {
    setEnhancementProfilesLoading(true);
    setEnhancementProfilesError(null);
    try {
      const result = await api.getPromptEnhancementProfiles();
      setEnhancementProfiles(result.profiles || []);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Prompt profiles are unavailable.';
      setEnhancementProfilesError(message);
      console.warn('[PromptEnhancement] profiles unavailable:', error);
    } finally {
      setEnhancementProfilesLoading(false);
    }
  }, []);

  const loadEnhancementTargetModels = useCallback(async () => {
    setEnhancementTargetModelsLoading(true);
    setEnhancementTargetModelsError(null);
    try {
      setEnhancementTargetModels(await api.getTargetModels());
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Target catalog is unavailable.';
      setEnhancementTargetModelsError(message);
      console.warn('[PromptEnhancement] target catalog unavailable:', error);
    } finally {
      setEnhancementTargetModelsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEnhancementProfiles().catch(() => undefined);
    loadEnhancementTargetModels().catch(() => undefined);
    return () => { enhancementRequestRevisionRef.current += 1; };
  }, [loadEnhancementProfiles, loadEnhancementTargetModels]);

  useEffect(() => {
    enhancementRequestRevisionRef.current += 1;
  }, [selectedPanelId, selectedWorkflowId, enhancementProfiles]);

  // Keep the selected panel's enhancement preferences alongside its effective
  // values. Non-selected panels never borrow the live sidebar state.
  useEffect(() => {
    const panel = panels.find(item => item.id === selectedPanelId);
    const preferences = panel?.enhancementPreferences || EMPTY_ENHANCEMENT_PREFERENCES;
    if (JSON.stringify(preferences) !== JSON.stringify(enhancementPreferencesRef.current)) {
      setEnhancementPreferences(preferences);
      enhancementPreferencesRef.current = preferences;
    }
  }, [panels, selectedPanelId]);

  // Session recovery stores work state only; catalogs, logs, active jobs, and provider credentials stay out.
  useEffect(() => {
    if (skipInitialSessionDraftWrite.current) {
      skipInitialSessionDraftWrite.current = false;
      return;
    }
    sessionDraftController.update({
      storyboard: {
        activeTab,
        activeSubTab,
        panels,
        selectedPanelId,
        canvasZoom,
        canvasPan,
        leftPanelWidth,
        rightPanelWidth,
        selectedWorkflowId,
        selectedBackendIds,
        comfyUrl,
        parameterValues,
        cameraAngles,
        globalPromptOverride,
        useGlobalPrompt,
      },
      project: { settings: { ...projectManager.getProject() } },
    });
  }, [
    activeTab,
    activeSubTab,
    panels,
    selectedPanelId,
    canvasZoom,
    canvasPan,
    leftPanelWidth,
    rightPanelWidth,
    selectedWorkflowId,
    selectedBackendIds,
    comfyUrl,
    parameterValues,
    cameraAngles,
    globalPromptOverride,
    useGlobalPrompt,
    projectSettings,
  ]);
  
  // ---------------------------------------------------------------------------
  // Resize Handlers
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isResizingLeft) {
        const newWidth = Math.max(150, Math.min(500, e.clientX));
        setLeftPanelWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(150, Math.min(400, window.innerWidth - e.clientX));
        setRightPanelWidth(newWidth);
      }
    };
    
    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    
    if (isResizingLeft || isResizingRight) {
      document.body.style.cursor = 'col-resize';
      document.body.style.userSelect = 'none';
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isResizingLeft, isResizingRight]);
  
  // ---------------------------------------------------------------------------
  // Effects - Close dropdown on click outside
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleClickOutside = () => {
      if (openDropdown) {
        setOpenDropdown(null);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [openDropdown]);
  
  // ---------------------------------------------------------------------------
  // Effects - Auto-scroll logs
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (autoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, autoScroll]);
  
  // ---------------------------------------------------------------------------
  // Effects - Load workflows from persistent backend storage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const loadWorkflows = async () => {
      // Migration helper: fix video inputs that were incorrectly stored as type 'image'
      const migrateVideoInputTypes = (wfs: typeof workflows): { migrated: typeof workflows; changed: boolean } => {
        let changed = false;
        const migrated = wfs.map(wf => {
          let wfChanged = false;
          // Fix config entries and discard bindings that no longer exist in
          // the current graph. Explicit [] remains [] and is authoritative.
          const newConfig = (wf.config || []).filter(cfg => {
            const node = findWorkflowNode(wf.workflow, cfg.node_id);
            const valid = Boolean(node) && (
              getWorkflowNodeInput(node, cfg.input_name) !== undefined || cfg.category === 'image_input'
            );
            if (!valid) wfChanged = true;
            return valid;
          }).map(cfg => {
            if (cfg.category === 'image_input' && cfg.name?.includes('video') && cfg.type === 'image') {
              wfChanged = true;
              return { ...cfg, type: 'video' as const };
            }
            return cfg;
          });
          // Fix parsed.image_inputs entries
          const newParsed = wf.parsed ? {
            ...wf.parsed,
            image_inputs: wf.parsed.image_inputs?.map(inp => {
              if (inp.name?.includes('video') && inp.type !== 'video') {
                wfChanged = true;
                return { ...inp, type: 'video' as const };
              }
              return inp;
            }) || []
          } : wf.parsed;
          if (wfChanged) {
            changed = true;
            return { ...wf, config: newConfig, parsed: newParsed };
          }
          return wf;
        });
        return { migrated, changed };
      };

      try {
        // Load from persistent backend storage
        const result = await workflowStorage.loadAll();
        workflowStorageReadyRef.current = true;
        workflowCollectionRevisionRef.current = result.collectionRevision;
        workflowPersistedFingerprintRef.current = new Map((result.workflows as Workflow[]).map(workflow => [workflow.id, workflowContentFingerprint(workflow)]));
        if (result.workflows && result.workflows.length > 0) {
          const { migrated, changed } = migrateVideoInputTypes(result.workflows as typeof workflows);
          setWorkflows(migrated);
          if (changed) {
            console.log('[Workflows] Migrated video input types from "image" to "video" in stored workflows');
            // Persist the corrected data back to storage
            await persistDirtyWorkflows(migrated).catch(e => console.warn('[Workflows] Failed to persist video type migration:', e));
          }
          if (!selectedWorkflowIdRef.current) {
            setSelectedWorkflowId((result.workflows[0] as { id: string }).id);
          }
          console.log(`[Workflows] Loaded ${result.count} workflows from ${result.storage_path}`);
        } else {
          // Migration: check localStorage for legacy data
          const legacyData = localStorage.getItem('storyboard_workflows');
          if (legacyData) {
            try {
              const parsed = JSON.parse(legacyData);
              if (Array.isArray(parsed) && parsed.length > 0) {
                console.log(`[Workflows] Migrating ${parsed.length} workflows from localStorage to backend...`);
                setWorkflows(parsed);
                if (!selectedWorkflowIdRef.current) {
                  setSelectedWorkflowId(parsed[0].id);
                }
                // Migrate to backend
                await persistDirtyWorkflows(parsed);
                // Clear legacy storage after successful migration
                localStorage.removeItem('storyboard_workflows');
                console.log('[Workflows] Migration complete — localStorage cleared');
              }
            } catch (e) {
              console.error('[Workflows] Failed to migrate from localStorage:', e);
            }
          }
        }
      } catch (error) {
        if (workflowCollectionRevisionRef.current === null) workflowStorageReadyRef.current = false;
        console.error('[Workflows] Failed to load from backend, falling back to localStorage:', error);
        // Fallback to localStorage if backend is not available
        const savedWorkflows = localStorage.getItem('storyboard_workflows');
        if (savedWorkflows) {
          try {
            const parsed = JSON.parse(savedWorkflows);
            setWorkflows(parsed);
            if (parsed.length > 0 && !selectedWorkflowIdRef.current) {
              setSelectedWorkflowId(parsed[0].id);
            }
          } catch (e) {
            console.error('[Workflows] localStorage fallback also failed:', e);
          }
        }
      }
      workflowsLoadedRef.current = true;
    };
    
    loadWorkflows();
    
    // Load render nodes
    orchestratorManager.loadFromStorage();
  }, [persistDirtyWorkflows, setWorkflows]);
  
  // ---------------------------------------------------------------------------
  // Effects - Save workflows to persistent backend storage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!workflowsLoadedRef.current) return;
    if (selectedWorkflowId === null) return;
    const visibleWorkflows = filterWorkflowsByRoute(workflows, activeTab, activeSubTab);
    if (!visibleWorkflows.some(workflow => workflow.id === selectedWorkflowId)) {
      const nextWorkflowId = visibleWorkflows[0]?.id || null;
      if (nextWorkflowId !== selectedWorkflowId) setSelectedWorkflowId(nextWorkflowId);
    }
  }, [activeTab, activeSubTab, workflows, selectedWorkflowId]);

  useEffect(() => {
    // Skip save on initial mount — the load hasn't completed yet
    if (!workflowsLoadedRef.current || !workflowStorageReadyRef.current || !hasUnsavedWorkflowChanges()) return;
    
    // Debounce save to avoid hammering the backend on rapid changes
    const timer = window.setTimeout(() => {
      if (workflowSaveTimerRef.current === timer) workflowSaveTimerRef.current = null;
      void persistDirtyWorkflows().catch(() => undefined);
    }, 500);
    workflowSaveTimerRef.current = timer;
    
    return () => {
      window.clearTimeout(timer);
      if (workflowSaveTimerRef.current === timer) workflowSaveTimerRef.current = null;
    };
  }, [workflows, hasUnsavedWorkflowChanges, persistDirtyWorkflows]);
  
  // ---------------------------------------------------------------------------
  // Effects - Image Viewer Focus Management
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (showImageViewer && imageViewerRef.current) {
      // Focus the image viewer overlay when it opens so keyboard events work immediately
      imageViewerRef.current.focus();
    }
  }, [showImageViewer]);
  
  // ---------------------------------------------------------------------------
  // Effects - Persist UI state to localStorage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const state = {
      leftPanelWidth,
      rightPanelWidth,
      canvasZoom,
      activeTab,
      activeSubTab,
    };
    localStorage.setItem('storyboard-ui-state', JSON.stringify(state));
  }, [leftPanelWidth, rightPanelWidth, canvasZoom, activeTab, activeSubTab]);
  
  // ---------------------------------------------------------------------------
  // Effects - Update parameter values when workflow changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (skipParameterReset.current) {
      skipParameterReset.current = false;
      console.log('[Effect] Skipping parameter reset (skipParameterReset was true)');
      return;
    }
    const workflow = workflowsRef.current.find(w => w.id === selectedWorkflowId);
    if (workflow) {
      if (restoredParametersPendingRef.current) {
        // The first catalog selection is initialization, not a user workflow change.
        restoredParametersPendingRef.current = false;
        return;
      }
      console.log('[Effect] Workflow change detected, resetting parameters to defaults for workflow:', selectedWorkflowId);
      
      // Compute new values, preserving prompts and images from previous workflow
      const newValues: Record<string, any> = {};
      const currentValues = parameterValuesRef.current;
      workflow.config.forEach(param => {
        if (param.exposed) {
          // Only preserve prompt and image values from previous workflow
          // All other parameters (steps, cfg, sampler, etc.) should use the new workflow's defaults
          const shouldPreserve = param.category === 'image_input' || 
                                 param.name === 'prompt' || 
                                 param.input_name === 'prompt';
          if (shouldPreserve && currentValues[param.name] !== undefined) {
            newValues[param.name] = currentValues[param.name];
          } else {
            newValues[param.name] = param.default;
          }
        }
      });
      
      // Update ref BEFORE calling setParameterValues for consistency
      parameterValuesRef.current = newValues;
      setParameterValues(newValues);
      const invalidated = { ...enhancementPreferencesRef.current, referenceOrderConfirmed: false };
      enhancementPreferencesRef.current = invalidated;
      setEnhancementPreferences(invalidated);
      if (selectedPanelIdRef.current !== null) {
        setPanels(prev => prev.map(panel => panel.id === selectedPanelIdRef.current
          ? { ...panel, enhancementPreferences: invalidated }
          : panel));
      }
    }
  }, [selectedWorkflowId]); // Only re-run when workflow selection changes, not workflows array

  // ---------------------------------------------------------------------------
  // Effects - Listen for Gallery cross-tab events
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Handler: Gallery sent an image to use as reference
    function handleGallerySendReference(e: Event) {
      const detail = (e as CustomEvent).detail as { filePath: string; targetParam?: string };
      if (!detail?.filePath) return;

      // Find image-type parameters in the current workflow
      const workflow = workflows.find(w => w.id === selectedWorkflowId);
      if (!workflow) {
        showWarning('No workflow selected. Select a workflow first, then send the image.');
        return;
      }

      const imageParams = workflow.config.filter(
        p => p.exposed && (p.type === 'image' || p.type === 'image_list' || p.type === 'media')
      );

      if (imageParams.length === 0) {
        showWarning('Current workflow has no image inputs.');
        return;
      }

      // If caller specified a target parameter, use it. Otherwise fall back to first empty.
      let targetParam: typeof imageParams[0] | undefined;
      if (detail.targetParam) {
        // Also check video params when targetParam specified
        const allMediaParams = workflow.config.filter(
          p => p.exposed && (p.type === 'image' || p.type === 'image_list' || p.type === 'media' || p.type === 'video' || p.type === 'video_list')
        );
        targetParam = allMediaParams.find(p => p.name === detail.targetParam);
      }
      if (!targetParam) {
        const emptyParam = imageParams.find(p => !parameterValuesRef.current[p.name]);
        targetParam = emptyParam || imageParams[0];
      }

      // ImageDropZone needs a base64 data URL to display the image.
      // Fetch via the CPE backend's /api/read-image endpoint (same origin, port 9800).
      // Fallback: store as __fileref:: which won't display but will resolve on generate.
      const fileRef = `__fileref::${detail.filePath}`;

      fetch(`/api/read-image?path=${encodeURIComponent(detail.filePath)}`)
        .then(res => res.json())
        .then(data => {
          if (data.success && data.dataUrl) {
            handleParameterChangeRef.current(targetParam!.name, data.dataUrl);
            showInfo(`Set "${targetParam!.display_name || targetParam!.name}" from Gallery image`);
          } else {
            // Fallback: store as file ref
            handleParameterChangeRef.current(targetParam!.name, fileRef);
            showWarning(`Set "${targetParam!.display_name || targetParam!.name}" but could not load preview`);
          }
        })
        .catch((err) => {
          console.error('[handleGallerySendReference] Failed to fetch image:', err);
          // Fallback: store as file ref
          handleParameterChangeRef.current(targetParam!.name, fileRef);
          showWarning(`Set "${targetParam!.display_name || targetParam!.name}" but could not load preview`);
        });
    }

    // Handler: Gallery requested workflow restore from PNG metadata
    function handleGalleryRestoreWorkflow(e: Event) {
      const detail = (e as CustomEvent).detail as { filePath: string };
      if (!detail?.filePath) return;

      const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();

      (async () => {
        try {
          const response = await fetch(
            `${orchestratorUrl}/api/png-metadata?path=${encodeURIComponent(detail.filePath)}`
          );
          const pngMeta = await response.json();

          if (!pngMeta.success || !pngMeta.prompt) {
            showError('Could not read workflow metadata from this image.');
            return;
          }

          const promptData = pngMeta.prompt as Record<string, { inputs?: Record<string, unknown>; class_type?: string }>;

          // Step 1: Match workflow by structural comparison (same logic as restore button)
          let matchedWorkflow: typeof workflows[number] | undefined;
          const promptNodeIds = Object.keys(promptData).filter(k => k !== 'meta' && k !== 'version');
          let bestScore = 0;

          for (const wf of workflows) {
            const templateNodeIds = Object.keys(wf.workflow).filter(k => k !== 'meta' && k !== 'version');
            let matches = 0;
            for (const nodeId of promptNodeIds) {
              if (wf.workflow[nodeId]) {
                const promptClassType = promptData[nodeId]?.class_type;
                const templateClassType = (wf.workflow[nodeId] as { class_type?: string })?.class_type;
                if (promptClassType && promptClassType === templateClassType) {
                  matches++;
                }
              }
            }
            const score = promptNodeIds.length > 0
              ? matches / Math.max(promptNodeIds.length, templateNodeIds.length)
              : 0;
            if (score > bestScore && score > 0.5) {
              bestScore = score;
              matchedWorkflow = wf;
            }
          }

          // Fallback: filename_prefix matching
          if (!matchedWorkflow) {
            let workflowName: string | null = null;
            for (const node of Object.values(promptData)) {
              if (node.class_type === 'SaveImage' && node.inputs?.filename_prefix) {
                workflowName = node.inputs.filename_prefix as string;
                break;
              }
            }
            if (workflowName) {
              matchedWorkflow = workflows.find(w => w.id === workflowName);
              if (!matchedWorkflow) {
                const normalize = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '');
                const normalizedTarget = normalize(workflowName);
                matchedWorkflow = workflows.find(w =>
                  normalize(w.id).includes(normalizedTarget) ||
                  normalizedTarget.includes(normalize(w.id)) ||
                  normalize(w.name || '').includes(normalizedTarget) ||
                  normalizedTarget.includes(normalize(w.name || ''))
                );
              }
            }
          }

          if (!matchedWorkflow) {
            showWarning('Could not find a matching workflow for this image.');
            return;
          }

          // Step 2: Extract parameters
          const extractedParams: Record<string, unknown> = {};
          const extractedImages: Record<string, string> = {};

          for (const param of matchedWorkflow.parsed.parameters) {
            const node = promptData[param.node_id];
            if (node?.inputs && param.input_name in node.inputs) {
              const value = node.inputs[param.input_name];
              if (!Array.isArray(value)) {
                extractedParams[param.name] = value;
              }
            }
          }

          for (const imgInput of matchedWorkflow.parsed.image_inputs) {
            const node = promptData[imgInput.node_id];
            if (node?.inputs && imgInput.input_name in node.inputs) {
              const imageName = node.inputs[imgInput.input_name] as string;
              if (imageName && typeof imageName === 'string') {
                extractedImages[imgInput.name] = imageName;
              }
            }
          }

          // Fallback: extract common params if no structured extraction worked
          if (Object.keys(extractedParams).length === 0) {
            for (const node of Object.values(promptData)) {
              if (!node.inputs) continue;
              const classType = node.class_type || '';
              if (classType.includes('KSampler') || classType.includes('Sampler')) {
                if (node.inputs.seed !== undefined) extractedParams.seed = node.inputs.seed;
                if (node.inputs.steps !== undefined) extractedParams.steps = node.inputs.steps;
                if (node.inputs.cfg !== undefined) extractedParams.cfg = node.inputs.cfg;
                if (node.inputs.sampler_name) extractedParams.sampler_name = node.inputs.sampler_name;
                if (node.inputs.scheduler) extractedParams.scheduler = node.inputs.scheduler;
                if (node.inputs.denoise !== undefined) extractedParams.denoise = node.inputs.denoise;
              }
              if (classType === 'CLIPTextEncode' && node.inputs.text) {
                const text = node.inputs.text as string;
                if (typeof text === 'string' && text.length > 20 && !extractedParams.positive_prompt) {
                  extractedParams.positive_prompt = text;
                }
              }
            }
          }

          // Step 3: Apply
          if (matchedWorkflow.id !== selectedWorkflowId) {
            skipParameterReset.current = true;
            setSelectedWorkflowId(matchedWorkflow.id);
          }

          if (Object.keys(extractedParams).length > 0) {
            setParameterValues(prev => {
              const newValues = { ...prev, ...extractedParams };
              parameterValuesRef.current = newValues;
              return newValues;
            });
          }

          // Fetch reference images from ComfyUI
          const imageCount = Object.keys(extractedImages).length;
          if (imageCount > 0) {
            const comfyNodes = renderNodes.filter(n => n.status === 'online');
            if (comfyNodes.length > 0) {
              const comfyUrl = comfyNodes[0].url.replace(/\/$/, '');
              for (const [inputName, imageName] of Object.entries(extractedImages)) {
                try {
                  const imageUrl = `${comfyUrl}/view?filename=${encodeURIComponent(imageName)}&type=input`;
                  const imgResponse = await fetch(imageUrl);
                  if (imgResponse.ok) {
                    const blob = await imgResponse.blob();
                    const dataUrl = await new Promise<string>((resolve) => {
                      const reader = new FileReader();
                      reader.onloadend = () => resolve(reader.result as string);
                      reader.readAsDataURL(blob);
                    });
                    extractedParams[inputName] = dataUrl;
                  }
                } catch (err) {
                  console.warn(`Could not fetch image ${imageName}:`, err);
                }
              }
              // Update parameters with fetched images
              if (Object.keys(extractedImages).some(k => extractedParams[k])) {
                setParameterValues(prev => {
                  const newValues = { ...prev, ...extractedParams };
                  parameterValuesRef.current = newValues;
                  return newValues;
                });
              }
            }
          }

          const paramMsg = `${Object.keys(extractedParams).length} parameters`;
          const imageMsg = imageCount > 0 ? `, ${imageCount} images` : '';
          showInfo(`Restored workflow "${matchedWorkflow.name || matchedWorkflow.id}", ${paramMsg}${imageMsg}`);

        } catch (err) {
          console.error('Failed to restore workflow from Gallery:', err);
          showError('Failed to restore workflow from image metadata.');
        }
      })();
    }

    // Handler: Gallery requesting list of image/video parameters for current workflow
    function handleGalleryRequestImageParams() {
      const workflow = workflows.find(w => w.id === selectedWorkflowId);

      if (!workflow) {
        window.dispatchEvent(new CustomEvent('gallery:image-params-response', {
          detail: { params: [], error: 'No workflow selected' }
        }));
        return;
      }

      // Gather all exposed image/video/media parameters
      const imageParams = workflow.config.filter(
        p => p.exposed && (p.type === 'image' || p.type === 'image_list' || p.type === 'media' || p.type === 'video' || p.type === 'video_list')
      );

      const currentValues = parameterValuesRef.current;

      const params = imageParams.map(p => ({
        name: p.name,
        display_name: p.display_name || p.name,
        type: p.type,
        filled: !!(currentValues[p.name] && currentValues[p.name] !== ''),
      }));

      window.dispatchEvent(new CustomEvent('gallery:image-params-response', {
        detail: { params }
      }));
    }

    // Handler: Gallery renamed files — update panel image references
    function handleGalleryFilesRenamed(e: Event) {
      const detail = (e as CustomEvent).detail as { renameMap: Record<string, string> };
      if (!detail?.renameMap || Object.keys(detail.renameMap).length === 0) return;

      const renameMap = detail.renameMap;
      const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();

      setPanels(prev => {
        let changed = false;
        const updated = prev.map(panel => {
          if (!panel.imageHistory || panel.imageHistory.length === 0) return panel;

          let panelChanged = false;
          const newHistory = panel.imageHistory.map(entry => {
            const savedPath = entry.metadata?.savedPath;
            if (!savedPath || !renameMap[savedPath]) return entry;

            panelChanged = true;
            const newPath = renameMap[savedPath];
            const newUrl = `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(newPath)}`;
            return {
              ...entry,
              url: newUrl,
              metadata: {
                ...entry.metadata,
                savedPath: newPath,
              },
            };
          });

          if (!panelChanged) return panel;
          changed = true;

          // CRITICAL: Also update panel.image to the current history entry's new URL.
          // Without this, <img src={panel.image}> still points at the old (deleted) filename.
          let newImage = panel.image;
          if (panel.historyIndex >= 0 && panel.historyIndex < newHistory.length) {
            newImage = newHistory[panel.historyIndex].url;
          } else if (newHistory.length > 0) {
            newImage = newHistory[newHistory.length - 1].url;
          }

          return { ...panel, imageHistory: newHistory, image: newImage };
        });

        return changed ? updated : prev;
      });
    }

    window.addEventListener('gallery:send-reference-image', handleGallerySendReference);
    window.addEventListener('gallery:restore-workflow-from-metadata', handleGalleryRestoreWorkflow);
    window.addEventListener('gallery:files-renamed', handleGalleryFilesRenamed);
    window.addEventListener('gallery:request-image-params', handleGalleryRequestImageParams);

    return () => {
      window.removeEventListener('gallery:send-reference-image', handleGallerySendReference);
      window.removeEventListener('gallery:restore-workflow-from-metadata', handleGalleryRestoreWorkflow);
      window.removeEventListener('gallery:files-renamed', handleGalleryFilesRenamed);
      window.removeEventListener('gallery:request-image-params', handleGalleryRequestImageParams);
    };
  }, [workflows, selectedWorkflowId, showInfo, showWarning, showError, renderNodes]);

  // ---------------------------------------------------------------------------
  // Effects - Fetch PNG metadata when viewer image changes
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Reset metadata when no panel or image
    if (!viewerPanelId || !showImageViewer) {
      setPngMetadata(null);
      return;
    }

    const panel = panels.find(p => p.id === viewerPanelId);
    const currentEntry = panel?.imageHistory[panel?.historyIndex ?? 0];
    if (!currentEntry) {
      setPngMetadata(null);
      return;
    }

    // If entry already has COMPLETE metadata (from generation), use that
    // Only skip PNG fetch if we have a non-empty promptSummary
    // seed alone is not enough - we need the actual prompt text
    if (currentEntry.metadata?.promptSummary && currentEntry.metadata.promptSummary.length > 0) {
      setPngMetadata(null); // Clear PNG metadata, use entry metadata
      return;
    }

    // For images loaded from disk, fetch PNG metadata
    // Check if URL is a serve-image endpoint (local file)
    if (!currentEntry.url.includes('/api/serve-image')) {
      setPngMetadata(null);
      return;
    }

    // Extract path from URL
    const urlParams = new URLSearchParams(currentEntry.url.split('?')[1]);
    const imagePath = urlParams.get('path');
    if (!imagePath) {
      setPngMetadata(null);
      return;
    }

    // Fetch metadata from PNG
    const fetchPngMetadata = async () => {
      setIsLoadingPngMetadata(true);
      try {
        const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();
        const response = await fetch(
          `${orchestratorUrl}/api/png-metadata?path=${encodeURIComponent(imagePath)}`
        );
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setPngMetadata({
              prompt: data.prompt,
              workflow: data.workflow,
              parameters: data.parameters,
            });
          } else {
            console.warn('[PNG Metadata] Failed to extract:', data.error);
            setPngMetadata(null);
          }
        } else {
          console.warn('[PNG Metadata] Request failed:', response.status);
          setPngMetadata(null);
        }
      } catch (err) {
        console.error('[PNG Metadata] Error:', err);
        setPngMetadata(null);
      } finally {
        setIsLoadingPngMetadata(false);
      }
    };

    fetchPngMetadata();
  }, [viewerPanelId, showImageViewer, panels]);

  // Effect - Load image dimensions and file size when viewer image changes
  useEffect(() => {
    if (!viewerImage || !showImageViewer) {
      setViewerImageDimensions(undefined);
      setViewerFileSize(undefined);
      return;
    }

    // Load image to get dimensions and file size
    const loadImageData = async () => {
      try {
        // Fetch image as blob to get file size
        const response = await fetch(viewerImage);
        if (response.ok) {
          const blob = await response.blob();
          setViewerFileSize(blob.size);
          
          // Create object URL to load into Image element for dimensions
          const objectUrl = URL.createObjectURL(blob);
          const img = new Image();
          img.onload = () => {
            setViewerImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
            URL.revokeObjectURL(objectUrl);
          };
          img.onerror = () => {
            setViewerImageDimensions(undefined);
            URL.revokeObjectURL(objectUrl);
          };
          img.src = objectUrl;
        } else {
          setViewerFileSize(undefined);
          setViewerImageDimensions(undefined);
        }
      } catch {
        setViewerFileSize(undefined);
        setViewerImageDimensions(undefined);
      }
    };
    loadImageData();
  }, [viewerImage, showImageViewer]);

  // ---------------------------------------------------------------------------
  // Functions - Image Viewer Navigation & Zoom
  // ---------------------------------------------------------------------------
  const handleCloseViewer = useCallback(() => {
    setShowImageViewer(false);
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
    setViewerCompareMode(false);
    setViewerCompareImage(null);
    setIsPromptExpanded(false);
    setZoomMode('actual');
  }, []);

  const navigateViewerImage = useCallback((direction: number) => {
    if (!viewerPanelId) return;
    
    const panel = panels.find(p => p.id === viewerPanelId);
    if (!panel || panel.imageHistory.length <= 1) return;

    const newIdx = Math.max(0, Math.min(panel.imageHistory.length - 1, panel.historyIndex + direction));
    if (newIdx === panel.historyIndex) return;

    const entry = panel.imageHistory[newIdx];
    if (entry) {
      setPanels(prev => prev.map(p =>
        p.id === viewerPanelId ? { ...p, historyIndex: newIdx, image: entry.url } : p
      ));
      setViewerImage(entry.url);
      setZoomMode('actual');
      setViewerPan({ x: 0, y: 0 });
    }
  }, [viewerPanelId, panels]);

  const handleZoomIn = useCallback(() => {
    setZoomMode('custom');
    setViewerZoom(prev => clampZoom(prev * 1.25));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomMode('custom');
    setViewerZoom(prev => clampZoom(prev / 1.25));
  }, []);

  const handleFitToScreen = useCallback(() => {
    setZoomMode('fit');
    setViewerPan({ x: 0, y: 0 });
    if (viewerImageDimensions && viewerContainerRef.current) {
      const container = viewerContainerRef.current;
      const fitZoom = calculateFitZoom(
        viewerImageDimensions.width,
        viewerImageDimensions.height,
        container.clientWidth,
        container.clientHeight,
        isMetadataPanelOpen ? 40 : 20
      );
      setViewerZoom(fitZoom);
    } else {
      setViewerZoom(0.8);
    }
  }, [viewerImageDimensions, isMetadataPanelOpen]);

  const handleActualSize = useCallback(() => {
    setZoomMode('actual');
    setViewerZoom(1);
    setViewerPan({ x: 0, y: 0 });
  }, []);

  const toggleCompareMode = useCallback(() => {
    if (!viewerPanelId) return;
    const panel = panels.find(p => p.id === viewerPanelId);
    if (!panel || panel.imageHistory.length <= 1) return;

    setViewerCompareMode(prev => {
      const newMode = !prev;
      if (newMode && panel.historyIndex > 0) {
        // Default to comparing with previous version
        setViewerCompareImage(panel.imageHistory[panel.historyIndex - 1]?.url || null);
      }
      return newMode;
    });
  }, [viewerPanelId, panels]);

  // ---------------------------------------------------------------------------
  // Context Menu - Close on click outside
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!contextMenu.visible) return;
    
    const handleClick = () => setContextMenu(prev => ({ ...prev, visible: false }));
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setContextMenu(prev => ({ ...prev, visible: false }));
    };
    
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [contextMenu.visible]);

  // Handle opening file in explorer
  const handleOpenInExplorer = useCallback(async (panelId: number) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    
    const currentEntry = panel.imageHistory[panel.historyIndex];
    const savedPath = currentEntry?.metadata?.savedPath;
    
    if (!savedPath) {
      showError('Image has no saved path. Save the image first.');
      return;
    }
    
    try {
      const apiBase = '';
      const response = await fetch(`${apiBase}/api/open-explorer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: savedPath }),
      });
      
      const result = await response.json();
      if (!result.success) {
        showError(result.message || 'Failed to open explorer');
      }
    } catch (error) {
      showError(`Failed to open explorer: ${error}`);
    }
  }, [panels, showError]);

  // ---------------------------------------------------------------------------
  // Functions - Workflow Import
  // ---------------------------------------------------------------------------
  /**
   * Export all workflows to a JSON file
   */
  /**
   * Update a single workflow (used by categories modal)
   */
  const handleUpdateWorkflow = useCallback((updatedWorkflow: Workflow) => {
    const nextWorkflows = workflowsRef.current.map(workflow =>
      workflow.id === updatedWorkflow.id ? updatedWorkflow : workflow,
    );
    workflowsRef.current = nextWorkflows;
    setWorkflows(nextWorkflows);

    const visibleWorkflows = filterWorkflowsByRoute(nextWorkflows, activeTab, activeSubTab);
    if (selectedWorkflowIdRef.current && !visibleWorkflows.some(workflow => workflow.id === selectedWorkflowIdRef.current)) {
      setSelectedWorkflowId(visibleWorkflows[0]?.id || null);
    }
    addLog('info', `Updated categories for workflow: ${updatedWorkflow.name}`);
  }, [activeTab, activeSubTab, addLog]);

  const exportWorkflows = useCallback(() => {
    const exportData = {
      workflows: workflows,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflows_export_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    addLog('info', `Exported ${workflows.length} workflows`);
  }, [workflows, addLog]);

  /**
   * Import workflows from a JSON file (bulk import or single ComfyUI workflow)
   */
  const importWorkflowsBulk = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importData = JSON.parse(text);
      
      // Check if it's a bulk export (has workflows array)
      if (importData.workflows && Array.isArray(importData.workflows)) {
        // Generate new IDs for imported workflows to avoid conflicts
        const importedWorkflows = importData.workflows.map((workflow: Workflow, index: number) => ({
          ...workflow,
          id: `imported_${Date.now()}_${index}`,
          name: workflow.name || `Imported Workflow ${index + 1}`
        }));

        // Merge with existing workflows
        setWorkflows(prev => [...prev, ...importedWorkflows]);
        
        addLog('info', `Successfully imported ${importedWorkflows.length} workflows from export file`);
        showInfo(`Imported ${importedWorkflows.length} workflows`);
      }
      // Check if it's a single ComfyUI workflow (has nodes or class_type fields)
      else if (importData.nodes || Object.values(importData).some((v: any) => v && v.class_type)) {
        // This is a single ComfyUI workflow - import it using the parser
        const workflow: ComfyUIWorkflow = importData;
        
        // Check if this is graph format (not API format)
        const isGraphFormat = 'nodes' in workflow && Array.isArray((workflow as any).nodes);
        
        if (isGraphFormat) {
          showWarning('This workflow is in Graph format. For best results, export from ComfyUI using "Save (API Format)" or "Export API". Graph format may have widget mapping issues.');
          addLog('warning', 'Imported graph-format workflow - API format recommended');
        }
        
        // Parse the workflow
        const parser = getWorkflowParser();
        const parsed = parser.parseWorkflow(workflow);
        
        // Create workflow object using only a canonical route from the taxonomy.
        const importCategory: TabType = isTabType(activeTab) ? activeTab : 'image-generation';
        const importSubCategory: SubTabType = isValidWorkflowRoute(importCategory, activeSubTab)
          ? activeSubTab
          : getDefaultSubCategory(importCategory);
        const newWorkflow: Workflow = {
          id: `workflow_${Date.now()}`,
          name: file.name.replace('.json', ''),
          description: 'Imported from ComfyUI',
          category: importCategory,
          subCategory: importSubCategory,
          workflow,
          parsed,
          config: [],
        };
        
        // Convert parsed parameters to config
        newWorkflow.config = parsed.parameters.map((param, index) => ({
          name: param.name,
          display_name: param.display_name,
          node_id: param.node_id,
          input_name: param.input_name,
          type: param.type,
          default: param.default,
          description: param.description,
          constraints: param.constraints,
          schemaStatus: param.schemaStatus,
          schemaType: param.schemaType,
          schema: param.schema,
          order: index,
          // A pure API import has no App Mode exposure metadata. Keep all
          // discovered literals in the editor until the user explicitly exposes them.
          exposed: false,
          category: 'parameter',
          auto_detected: true,
          user_modified: false,
        }));
        
        // Add image/video inputs
        parsed.image_inputs.forEach((input, index) => {
          // Preserve the parsed type: 'video' for video loaders, 'image' for images/masks
          const configType = input.type === 'video' ? 'video' : 'image';
          newWorkflow.config.push({
            name: input.name,
            display_name: input.display_name,
            node_id: input.node_id,
            input_name: input.input_name,
            type: configType,
            default: '',
            description: input.description,
            order: parsed.parameters.length + index,
            exposed: false,
            category: 'image_input',
            auto_detected: true,
            user_modified: false,
          });
        });
        
        setWorkflows(prev => [...prev, newWorkflow]);
        setSelectedWorkflowId(newWorkflow.id);
        setEditingWorkflow(newWorkflow);
        setShowWorkflowEditor(true);
        addLog('info', `Imported single workflow: ${newWorkflow.name}`);
        showInfo(`Successfully imported workflow: ${newWorkflow.name}`);
      }
      else {
        throw new Error('Invalid file format: not a bulk export or ComfyUI workflow');
      }
    } catch (err) {
      console.error('Failed to import:', err);
      showError('Failed to import: ' + (err as Error).message);
    }
    
    // Reset input
    event.target.value = '';
  }, [setWorkflows, addLog, showInfo, showError, showWarning, activeTab, activeSubTab, setSelectedWorkflowId, setEditingWorkflow, setShowWorkflowEditor]);

  // ---------------------------------------------------------------------------
  // Functions - Canvas Operations
  // ---------------------------------------------------------------------------
  const addPanel = useCallback(() => {
    setPanels(prev => {
      const newId = Math.max(panelIdHighWaterRef.current, ...prev.map(p => p.id), 0) + 1;
      const existingNames = new Set(prev.map(p => p.name));
      let nameSuffix = newId;
      let panelName = `Panel_${String(nameSuffix).padStart(2, '0')}`;
      while (existingNames.has(panelName)) {
        nameSuffix += 1;
        panelName = `Panel_${String(nameSuffix).padStart(2, '0')}`;
      }
      const cols = 3;
      const index = prev.length;
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      return [...prev, {
        id: newId,
        name: panelName,  // CRITICAL: Set explicit panel name
        image: null,
        images: [],
        imageHistory: [],
        historyIndex: -1,
        currentImageIndex: 0,
        status: 'empty',
        progress: 0,
        notes: '',
        prompt: '',
        seed: -1,
        x: col * 320,
        y: row * 320,
        width: 300,
        height: 300,
      }];
    });
  }, []);
  
  const handleCanvasMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button === 1 || (e.button === 0 && e.altKey)) {
      // Middle mouse or Alt+Click to pan
      setIsPanning(true);
      setPanStart({ x: e.clientX - canvasPan.x, y: e.clientY - canvasPan.y });
      e.preventDefault();
    } else if (e.button === 0 && !e.ctrlKey && !e.metaKey) {
      // Phase 3: Start marquee selection on left-click (not Ctrl+Click)
      // Only start if clicking on empty canvas area (not on a panel)
      const target = e.target as HTMLElement;
      if (target.classList.contains('storyboard-canvas') || target.classList.contains('canvas-transform-container')) {
        setIsMarqueeSelecting(true);
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = (e.clientX - rect.left - canvasPan.x) / canvasZoom;
        const y = (e.clientY - rect.top - canvasPan.y) / canvasZoom;
        setMarqueeStart({ x, y });
        setMarqueeEnd({ x, y });
        e.preventDefault();
      }
    }
  }, [canvasPan, canvasZoom]);
  
  // Phase 3: Handle marquee selection move
  const handleMarqueeMouseMove = useCallback((e: React.MouseEvent) => {
    if (isMarqueeSelecting) {
      const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
      const x = (e.clientX - rect.left - canvasPan.x) / canvasZoom;
      const y = (e.clientY - rect.top - canvasPan.y) / canvasZoom;
      setMarqueeEnd({ x, y });
    }
  }, [isMarqueeSelecting, canvasPan, canvasZoom]);
  
  // Phase 3: Handle marquee selection end
  const handleMarqueeMouseUp = useCallback(() => {
    if (isMarqueeSelecting) {
      // Calculate selection rectangle
      const minX = Math.min(marqueeStart.x, marqueeEnd.x);
      const maxX = Math.max(marqueeStart.x, marqueeEnd.x);
      const minY = Math.min(marqueeStart.y, marqueeEnd.y);
      const maxY = Math.max(marqueeStart.y, marqueeEnd.y);
      
      // Minimum area threshold — plain click on canvas shouldn't clear selection
      const marqueeWidth = maxX - minX;
      const marqueeHeight = maxY - minY;
      if (marqueeWidth < 5 && marqueeHeight < 5) {
        // Clicked canvas without dragging — clear all selections
        setPanels(prevPanels => prevPanels.map(p => ({ ...p, selected: false })));
        setIsMarqueeSelecting(false);
        return;
      }
      
      // Select panels that intersect with the marquee rectangle
      setPanels(prevPanels =>
        prevPanels.map(panel => {
          const panelRight = panel.x + panel.width;
          const panelBottom = panel.y + panel.height;
          
          const intersects = !(
            panelRight < minX ||
            panel.x > maxX ||
            panelBottom < minY ||
            panel.y > maxY
          );
          
          return {
            ...panel,
            selected: intersects
          };
        })
      );
      
      setIsMarqueeSelecting(false);
    }
  }, [isMarqueeSelecting, marqueeStart, marqueeEnd]);
  
  const handleCanvasMouseMove = useCallback((e: React.MouseEvent) => {
    if (isPanning) {
      setCanvasPan({
        x: e.clientX - panStart.x,
        y: e.clientY - panStart.y,
      });
    }
  }, [isPanning, panStart]);
  
  const handleCanvasMouseUp = useCallback(() => {
    setIsPanning(false);
  }, []);
  
  const handleWheel = useCallback((e: WheelEvent) => {
    e.preventDefault();
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    
    // Mouse position relative to canvas container
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    // Current world point under cursor (inverse transform)
    const worldX = (mouseX - canvasPan.x) / canvasZoom;
    const worldY = (mouseY - canvasPan.y) / canvasZoom;
    
    // Calculate new zoom
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    const newZoom = Math.max(0.1, Math.min(5, canvasZoom * delta));
    
    // Adjust pan so the same world point stays under cursor
    const newPanX = mouseX - worldX * newZoom;
    const newPanY = mouseY - worldY * newZoom;
    
    setCanvasZoom(newZoom);
    setCanvasPan({ x: newPanX, y: newPanY });
  }, [canvasZoom, canvasPan]);
  
  // Attach wheel listener with { passive: false } to allow preventDefault()
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    canvas.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheel);
    };
  }, [handleWheel]);
  
  // ---------------------------------------------------------------------------
  // Functions - Generation
  // ---------------------------------------------------------------------------

  // These callbacks are declared later in this component; refs avoid a temporal
  // dead zone while keeping generation handlers current without dependency loops.
  const finishParallelJobRef = useRef<(
    runId: string,
    panelId: number,
    nodeId: string,
    status: 'error' | 'cancelled',
    promptId?: string,
  ) => void>(() => {});
  const trackParallelJobWithWebSocketRef = useRef<(
    promptId: string,
    panelId: number,
    nodeId: string,
    targetUrl: string,
    ws: ComfyUIWebSocket,
    runId: string,
    nodeName: string,
    seed: number,
    generationSnapshot: GenerationSnapshot,
    clientId?: string,
    workflowInfo?: WorkflowProgressInfo,
  ) => void>(() => {});
  const trackWithWebSocketRef = useRef<(
    promptId: string,
    panelId: number,
    targetUrl: string,
    websocket: ComfyUIWebSocket,
    runId: string,
    generationSnapshot: GenerationSnapshot,
    clientId?: string,
    workflowInfo?: WorkflowProgressInfo,
  ) => void>(() => {});

  const generationScopeIsCurrent = (options: GenerationRequestOptions, panelId: number, workflow: Workflow): boolean => {
    const currentWorkflow = workflowsRef.current.find(item => item.id === workflow.id);
    const panel = panelsRef.current.find(item => item.id === panelId);
    const activeWorkflowId = !options.usePanelSnapshot && selectedPanelIdRef.current === panelId
      ? selectedWorkflowIdRef.current || panel?.workflowId
      : panel?.workflowId;
    return projectScopeRef.current.identity === options.projectIdentity
      && projectScopeRef.current.revision === options.projectRevision
      && panelInputRevisionRef.current.get(panelId) === options.panelInputRevision
      && activeWorkflowId === options.workflowId
      && Boolean(currentWorkflow)
      && currentWorkflow?.revision === workflow.revision
      && Boolean(currentWorkflow && workflowContentFingerprint(currentWorkflow) === workflowContentFingerprint(workflow))
      && (!options.backendBindings || options.backendIds.every(id =>
        orchestratorManager.getNodes().find(node => node.id === id)?.url === options.backendBindings?.[id],
      ))
      && (!options.usePanelSnapshot || options.backendIds.every(id => selectedBackendIdsRef.current.includes(id)));
  };
  
  /**
   * Generate images in parallel across multiple render nodes
   * CRITICAL: Reuse the SAME workflow built from single-node logic, only changing seeds
   */
  const generateParallel = useCallback(async (panelId: number, backendIds: string[], requestOptions: GenerationRequestOptions) => {
    const requestPanels = requestOptions.usePanelSnapshot ? panelsRef.current : panels;
    const requestWorkflows = requestOptions.usePanelSnapshot ? workflowsRef.current : workflows;
    const requestNodes = requestOptions.usePanelSnapshot ? orchestratorManager.getNodes() : renderNodes;
    const panel = requestPanels.find(p => p.id === panelId);
    const isLivePanel = selectedPanelIdRef.current === panelId;
    // The sidebar is live only for the selected panel. Other panels must use
    // their own stored effective values/workflow, never another panel's ref.
    const currentParameterValues = requestOptions.usePanelSnapshot
      ? (panel?.parameterValues || {})
      : isLivePanel ? parameterValuesRef.current : (panel?.parameterValues || {});
    
    const workflowIdToUse = requestOptions.workflowId || (isLivePanel ? (selectedWorkflowId || panel?.workflowId) : panel?.workflowId);
    const workflow = requestWorkflows.find(w => w.id === workflowIdToUse);
    
    if (!panel || !workflow) {
      showError('Panel or workflow not found');
      return;
    }
    
    if (backendIds.length === 0) {
      showError('No render nodes selected for parallel generation');
      return;
    }

    if (!Number.isSafeInteger(workflow.revision) || !workflow.revision) {
      showError('Save the workflow to canonical storage before generating.');
      return;
    }

    const generationRun = claimGenerationRun(panelId, requestOptions.runId);
    if (!generationRun) return;

    try {
      createGenerationRun({
        runId: requestOptions.runId,
        commandId: requestOptions.commandId,
        idempotencyKey: requestOptions.idempotencyKey,
        projectIdentity: requestOptions.projectIdentity,
        panelId,
        workflowId: workflow.id,
        workflowRevision: workflow.revision,
        mode: 'parallel',
      });
      addLog('comfyui', `Starting parallel generation on ${backendIds.length} nodes for panel ${panelId}...`);
      
      // ====================================================================================
      // STEP 1: BUILD THE WORKFLOW ONCE (reusing exact logic from generatePanel)
      // ====================================================================================
      
      // ALWAYS use parameters from the UI (ref) - never use stale panel.parameterValues
      const paramsToUse = currentParameterValues;
      
      const parser = getWorkflowParser();
      // Keep original UI media references separate from transport-only filenames.
      const restorableParameters = JSON.parse(JSON.stringify(paramsToUse));
      const processedParams = JSON.parse(JSON.stringify(paramsToUse));
      const imageInputs: Record<string, string> = {};
      
      console.log('[Parallel] Processing parameter values:', Object.keys(paramsToUse));
      
      // Process image parameters (bypassed, URLs, data URLs) - SAME AS SINGLE-NODE
      for (const [key, value] of Object.entries(paramsToUse)) {
        // Handle bypassed image inputs
        if (value === '__BYPASSED__') {
          addLog('info', `Image input ${key} is bypassed`);
          imageInputs[key] = '__BYPASSED__';
          delete processedParams[key];
          continue;
        }
        
        // Handle ComfyUI view URLs
        if (typeof value === 'string' && value.includes('/view?')) {
          try {
            const url = new URL(value);
            const filename = url.searchParams.get('filename');
            const subfolder = url.searchParams.get('subfolder') || '';
            const imageType = url.searchParams.get('type') || 'output';
            
            if (filename) {
              // If image is from output folder, re-upload to ALL nodes' input folders
              // This ensures all nodes can access the image
              if (imageType === 'output') {
                console.log(`[Parallel] Image from output folder: ${filename}, re-uploading to ALL nodes' input folders`);
                addLog('info', `Re-uploading ${filename} from output to input folder on all ${backendIds.length} nodes`);
                
                // Get all selected nodes
                const selectedNodes = requestNodes.filter(n => backendIds.includes(n.id) && n.status === 'online');
                if (selectedNodes.length === 0) {
                  const errorMsg = `Cannot re-upload image: no online render nodes`;
                  addLog('error', errorMsg);
                  showError(errorMsg);
                  return;
                }
                
                try {
                  // Download the image from the view URL once
                  const imageResponse = await fetch(value);
                  if (imageResponse.ok) {
                    const blob = await imageResponse.blob();
                    const uploadFilename = `storyboard_${Date.now()}_${filename}`;
                    const file = new File([blob], uploadFilename, { type: blob.type || 'image/png' });
                    
                    // Upload to ALL selected nodes in parallel
                    const uploadPromises = selectedNodes.map(async (node) => {
                      const formData = new FormData();
                      formData.append('image', file);
                      formData.append('overwrite', 'true');
                      
                      const uploadResponse = await fetch(`${node.url}/upload/image`, {
                        method: 'POST',
                        body: formData,
                      });
                      
                      if (!uploadResponse.ok) {
                        throw new Error(`Upload to ${node.id} failed with status ${uploadResponse.status}`);
                      }
                      
                      return await uploadResponse.json();
                    });
                    
                    const uploadResults = await Promise.all(uploadPromises);
                    const uploadedName = uploadResults[0].name; // All nodes should return same filename
                    
                    console.log(`[Parallel] Re-uploaded to ${selectedNodes.length} nodes as ${uploadedName}`);
                    addLog('info', `Re-uploaded to ${selectedNodes.length} nodes as ${uploadedName}`);
                    processedParams[key] = uploadedName;
                    imageInputs[key] = uploadedName;
                    continue;
                  } else {
                    addLog('warning', `Image download failed, using original path`);
                  }
                } catch (uploadError) {
                  console.warn('[Parallel] Re-upload failed:', uploadError);
                  addLog('warning', `Re-upload failed: ${uploadError}`);
                }
                
                // Fallback: use original path
                const fullPath = subfolder ? `${subfolder}/${filename}` : filename;
                processedParams[key] = fullPath;
                imageInputs[key] = fullPath;
                continue;
              } else {
                // Image is already in input folder, use as-is
                const fullPath = subfolder ? `${subfolder}/${filename}` : filename;
                addLog('info', `Using image path: ${fullPath}`);
                processedParams[key] = fullPath;
                imageInputs[key] = fullPath;
                continue;
              }
            }
          } catch (e) {
            console.warn('[Parallel] Failed to process ComfyUI URL:', value, e);
          }
        }
        
        // Handle data:image and data:video URLs - upload to ALL nodes' input folders
        if (typeof value === 'string' && (value.startsWith('data:image') || value.startsWith('data:video'))) {
          const isVideo = value.startsWith('data:video');
          console.log(`[Parallel] ${isVideo ? 'Video' : 'Image'} parameter ${key} has data URL, uploading to ALL nodes`);
          addLog('info', `Uploading data URL ${isVideo ? 'video' : 'image'} for ${key} to all ${backendIds.length} nodes`);
          
          // Get all selected nodes
          const selectedNodes = requestNodes.filter(n => backendIds.includes(n.id) && n.status === 'online');
          if (selectedNodes.length === 0) {
            const errorMsg = `Cannot upload data URL media: no online render nodes`;
            addLog('error', errorMsg);
            showError(errorMsg);
            return;
          }
          
          try {
            // Extract MIME type and base64 data (supports both image/* and video/*)
            const matches = value.match(/^data:((?:image|video)\/[^;]+);base64,(.+)$/);
            if (!matches) {
              throw new Error('Invalid data URL format');
            }
            
            const mimeType = matches[1];
            const base64Data = matches[2];
            
            // Convert base64 to Blob once
            const byteCharacters = atob(base64Data);
            const byteNumbers = new Array(byteCharacters.length);
            for (let i = 0; i < byteCharacters.length; i++) {
              byteNumbers[i] = byteCharacters.charCodeAt(i);
            }
            const byteArray = new Uint8Array(byteNumbers);
            const blob = new Blob([byteArray], { type: mimeType });
            
            // Create file with descriptive name
            const extension = mimeType.split('/')[1] || 'png';
            const uploadFilename = `parallel_data_${Date.now()}_${key}.${extension}`;
            const file = new File([blob], uploadFilename, { type: mimeType });
            
            // Upload to ALL selected nodes in parallel
            const uploadPromises = selectedNodes.map(async (node) => {
              const formData = new FormData();
              formData.append('image', file);
              formData.append('overwrite', 'true');
              
              const uploadResponse = await fetch(`${node.url}/upload/image`, {
                method: 'POST',
                body: formData,
              });
              
              if (!uploadResponse.ok) {
                throw new Error(`Upload to ${node.id} failed with status ${uploadResponse.status}`);
              }
              
              return await uploadResponse.json();
            });
            
            const uploadResults = await Promise.all(uploadPromises);
            const uploadedName = uploadResults[0].name; // All nodes should return same filename
            
            console.log(`[Parallel] Uploaded data URL to ${selectedNodes.length} nodes as ${uploadedName}`);
            addLog('info', `Uploaded data URL to ${selectedNodes.length} nodes as ${uploadedName}`);
            
            // Replace data URL with uploaded filename
            processedParams[key] = uploadedName;
            imageInputs[key] = uploadedName;
            continue;
            
          } catch (uploadError) {
            const errorMsg = `Failed to upload data URL for ${key}: ${uploadError}`;
            console.error('[Parallel] Upload error:', uploadError);
            addLog('error', errorMsg);
            showError(errorMsg);
            return;
          }
        }
      }
      
      // Apply global prompt override if enabled
      if (useGlobalPrompt && globalPromptOverride.trim()) {
        for (const key of Object.keys(processedParams)) {
          if (key.toLowerCase().includes('prompt') || key === 'text' || key === 'positive') {
            processedParams[key] = globalPromptOverride;
            restorableParameters[key] = globalPromptOverride;
          }
        }
      }
      
      // Parse workflow to get LoRA info
      const parsedWorkflow = parser.parseWorkflow(workflow.workflow);
      
      // Extract LoRA values from processedParams
      const loraValues: Record<string, { enabled?: boolean; strength: number; bypassed?: boolean; lora_name?: string }> = {};
      const nonLoraParams: Record<string, any> = {};
      
      const loraParamNames = new Set(parsedWorkflow.loras.map(l => l.name));
      
      for (const [key, value] of Object.entries(processedParams)) {
        if (loraParamNames.has(key)) {
          if (typeof value === 'object' && value !== null) {
            const loraValue = value as {
              strength?: number;
              bypassed?: boolean;
              lora_name?: string;
            };
            loraValues[key] = {
              strength: loraValue.strength ?? 1.0,
              bypassed: loraValue.bypassed ?? false,
              lora_name: loraValue.lora_name,
              enabled: !loraValue.bypassed
            };
          } else if (typeof value === 'number') {
            loraValues[key] = {
              strength: value,
              enabled: true
            };
          }
        } else {
          nonLoraParams[key] = value;
        }
      }
      
      // Build the BASE workflow with ALL parameters properly processed
      const baseWorkflow = parser.buildWorkflow(
        workflow.workflow,
        nonLoraParams,
        imageInputs,
        loraValues,
        workflow.config
      );
      
      console.log('[Parallel] Base workflow built:', JSON.stringify(baseWorkflow, null, 2));
      addLog('info', `Base workflow nodes: ${Object.keys(baseWorkflow).length}`);
      
      // Build workflow progress info for multi-phase tracking
      const parallelWfProgressInfo = buildWorkflowProgressInfo(baseWorkflow);
      if (parallelWfProgressInfo.samplerNodeIds.length > 1) {
        addLog('info', `Multi-sampler workflow: ${parallelWfProgressInfo.samplerNodeIds.length} sampler phases detected`);
      }

      // Snapshot provenance once before any submitted job can finish.
      const generationSnapshot: GenerationSnapshot = {
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflow: JSON.parse(JSON.stringify(workflow.workflow)),
        selectedOutputNodeIds: workflow.parsed.outputs.filter(output => output.selected).map(output => output.node_id),
        parameters: restorableParameters,
      };
      
      // ====================================================================================
      // STEP 2: FOR EACH NODE, CLONE WORKFLOW AND CHANGE ONLY THE SEED
      // ====================================================================================
      
      // Helper function to apply seed to workflow (finds sampler nodes and updates seed)
      const applySeedToWorkflow = (workflow: any, seedValue: number): void => {
        for (const nodeId of Object.keys(workflow)) {
          const node = workflow[nodeId];
          
          // KSampler, KSamplerAdvanced, SamplerCustom, etc.
          if (node.class_type?.includes('Sampler') || node.class_type?.includes('KSampler')) {
            if (node.inputs && 'seed' in node.inputs) {
              node.inputs.seed = seedValue;
            }
            if (node.inputs && 'noise_seed' in node.inputs) {
              node.inputs.noise_seed = seedValue;
            }
          }
          
          // RandomNoise nodes
          if (node.class_type === 'RandomNoise') {
            if (node.inputs && 'noise_seed' in node.inputs) {
              node.inputs.noise_seed = seedValue;
            }
          }
        }
      };
      
      // Track active jobs for this panel
      const activeJobs: Array<{
        nodeId: string;
        nodeName: string;
        promptId: string;
        seed: number;
      }> = [];
      
      // Initialize parallel jobs tracking
      const parallelJobs = backendIds.map(backendId => {
        const node = requestNodes.find(n => n.id === backendId);
        return {
          nodeId: backendId,
          nodeName: node?.name || backendId,
          promptId: '',
          seed: 0,
          progress: 0,
          status: 'pending' as const,
        };
      });
      
      // Initialize atomic version counter for this panel using filesystem scan
      // This prevents version collisions when multiple parallel jobs save concurrently
      const panelName = panel?.name || `Panel_${String(panelId).padStart(2, '0')}`;
      const currentHistory = panel?.imageHistory || [];
      const startVersion = await projectManager.getNextVersion(panelName, currentHistory);
      nextVersionRef.current.set(panelId, startVersion);

      if (!generationScopeIsCurrent(requestOptions, panelId, workflow)) {
        throw new Error('The panel, project or workflow changed while preparing the parallel prompts. No prompts were submitted.');
      }
      
      // Update panel to show it's generating with parallel jobs tracking
      setPanels(prev => prev.map(p =>
        p.id === panelId ? {
          ...p,
          status: 'generating',
          progress: 0,
          parameterValues: { ...paramsToUse },
          workflowId: workflowIdToUse || undefined,
          parallelJobs: parallelJobs,
        } : p
      ));
      requestOptions.panelInputRevision = panelInputRevisionRef.current.get(panelId) || requestOptions.panelInputRevision;
      
      // Track generation start time and reset batch save trigger
      generationStartTimes.current.set(panelId, Date.now());
      batchSaveTriggeredRef.current.delete(String(panelId)); // Reset for new generation
      savedJobsRef.current.clear(); // Clear saved jobs tracking for new generation
      
      // ====================================================================================
      // STEP 3: SUBMIT TO EACH NODE DIRECTLY (NOT via Orchestrator job-group)
      // ====================================================================================
      
      for (let i = 0; i < backendIds.length; i++) {
        const backendId = backendIds[i];
        const node = requestNodes.find(n => n.id === backendId);
        const seed = Math.floor(Math.random() * 2147483647);
        prepareGenerationJob(generationRun.id, backendId, seed);
        
        if (!node || node.status !== 'online') {
          addLog('warning', `Skipping offline node: ${node?.name || backendId}`);
          updateGenerationJob(generationRun.id, backendId, 'failed_before_submission', { message: 'The selected backend was offline before submission.' });
          finishParallelJobRef.current(generationRun.id, panelId, backendId, 'error');
          continue;
        }

        if (!generationScopeIsCurrent(requestOptions, panelId, workflow)) {
          updateGenerationJob(generationRun.id, backendId, 'failed_before_submission', { message: 'Panel, project or workflow inputs changed before submission.' });
          finishParallelJobRef.current(generationRun.id, panelId, backendId, 'error');
          continue;
        }
        
        // Clone the base workflow
        const workflowCopy = JSON.parse(JSON.stringify(baseWorkflow));
        
        // Generate a random seed for this variation
        // Apply the seed to the cloned workflow
        applySeedToWorkflow(workflowCopy, seed);
        
        // Normalize path separators for this node's OS
        normalizeWorkflowPaths(workflowCopy, (node.os || 'unknown') as TargetOS);
        
        console.log(`[Parallel] Submitting to node ${node.name} (OS: ${node.os}) with seed ${seed}`);
        addLog('comfyui', `Submitting variation ${i + 1}/${backendIds.length} to ${node.name} (seed: ${seed})`);
        
        const clientId = `storyboard-parallel-${panelId}-${i}-${Date.now()}`;
        const nodeWs = getComfyUIWebSocket(node.url, clientId);
        try {
          // Create WebSocket connection for this node
          
          try {
            await nodeWs.connect();
          } catch (wsError) {
            addLog('warning', `WebSocket to ${node.name} failed, will use polling`);
          }
          
          // Submit to this specific node
          if (!generationScopeIsCurrent(requestOptions, panelId, workflow)) {
            updateGenerationJob(generationRun.id, backendId, 'failed_before_submission', { message: 'Panel, project or workflow inputs changed before submission.' });
            finishParallelJobRef.current(generationRun.id, panelId, backendId, 'error');
            disconnectWebSocket(node.url, clientId);
            continue;
          }
          const submitted = await submitPromptWithJournal({
            runId: generationRun.id,
            backendId,
            seed,
            url: `${node.url}/prompt`,
            body: {
              prompt: workflowCopy,
              client_id: clientId,
            },
          });
          const promptId = submitted.promptId;
          addLog('comfyui', `Queued on ${node.name}: ${promptId}`);
          
          // Update parallel job with prompt ID and seed
          setPanels(prev => prev.map(p => {
            if (p.id !== panelId || !p.parallelJobs) return p;
            return {
              ...p,
              parallelJobs: p.parallelJobs.map(j =>
                j.nodeId === backendId ? { ...j, promptId, seed, status: 'running' as const } : j
              )
            };
          }));
          
          // Track this job
          activeJobs.push({
            nodeId: backendId,
            nodeName: node.name,
            promptId,
            seed: seed
          });
          
          // The connection tracker also reconciles history while WebSocket is unavailable.
          trackParallelJobWithWebSocketRef.current(promptId, panelId, backendId, node.url, nodeWs, generationRun.id, node.name, seed, generationSnapshot, clientId, parallelWfProgressInfo);
          
        } catch (error) {
          disconnectWebSocket(node.url, clientId);
          const currentRun = getGenerationRun(generationRun.id);
          const currentJob = currentRun?.jobs.find(job => job.backendId === backendId);
          if (currentJob?.status === 'prepared') {
            updateGenerationJob(generationRun.id, backendId, 'failed_before_submission', { message: error instanceof Error ? error.message : String(error) });
          }
          if (error instanceof GenerationSubmissionError && error.state === 'submission_unknown' || currentJob?.status === 'submission_unknown') {
            const message = `Submission outcome is unknown on ${node.name}; inspect the durable run before retrying.`;
            addLog('warning', message);
            showWarning(message);
            setPanels(prev => prev.map(p => p.id !== panelId || !p.parallelJobs ? p : {
              ...p,
              parallelJobs: p.parallelJobs.map(job => job.nodeId === backendId
                ? { ...job, currentNodeName: 'Submission outcome unknown' }
                : job),
            }));
          } else if (currentJob && ['accepted', 'running', 'cancel_requested'].includes(currentJob.status)) {
            const message = `ComfyUI accepted the prompt on ${node.name}, but live tracking did not attach; inspect the durable run.`;
            addLog('warning', message);
            showWarning(message);
          } else {
            const errorMsg = `Failed to submit to ${node.name}: ${error}`;
            addLog('error', errorMsg);
            showError(errorMsg);
            finishParallelJobRef.current(generationRun.id, panelId, backendId, 'error');
          }
        }
      }
      
      if (activeJobs.length === 0) {
        const unresolved = getGenerationRun(generationRun.id)?.jobs.some(job => job.status === 'submission_unknown');
        if (unresolved) {
          setPanels(prev => prev.map(p => p.id === panelId ? { ...p, status: 'generating', progress: 0 } : p));
        } else {
          showError('Failed to submit to any nodes');
          setPanels(prev => prev.map(p =>
            p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
          ));
        }
        return;
      }
      
      showInfo(`Started parallel generation on ${activeJobs.length} node(s)`);
      
    } catch (error: any) {
      try { failGenerationBeforeSubmission(generationRun.id, error instanceof Error ? error.message : String(error)); } catch { /* Preserve the original generation failure. */ }
      const errorMsg = `Parallel generation failed: ${error.message || String(error)}`;
      addLog('error', errorMsg);
      showError(errorMsg);
      setPanels(prev => prev.map(p =>
        p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
      ));
    } finally {
      finishGenerationSubmission(generationRun.id);
    }
  }, [panels, workflows, selectedWorkflowId, useGlobalPrompt, globalPromptOverride, renderNodes, addLog, showError, showInfo, showWarning, claimGenerationRun, finishGenerationSubmission]);
  
  const generatePanel = useCallback(async (panelId: number, suppliedOptions?: GenerationRequestOptions) => {
    try {
      await flushPendingWorkflowSave();
    } catch {
      return;
    }
    const requestPanels = suppliedOptions?.usePanelSnapshot ? panelsRef.current : panels;
    const requestWorkflows = suppliedOptions?.usePanelSnapshot ? workflowsRef.current : workflows;
    const requestNodes = suppliedOptions?.usePanelSnapshot ? orchestratorManager.getNodes() : renderNodes;
    const panel = requestPanels.find(p => p.id === panelId);
    const isLivePanel = selectedPanelIdRef.current === panelId;
    const workflowIdToUse = suppliedOptions?.workflowId || (isLivePanel ? (selectedWorkflowId || panel?.workflowId) : panel?.workflowId);
    let backendIdsToUse = suppliedOptions?.backendIds || [...selectedBackendIds];
    if (!panel || !workflowIdToUse) {
      showError('Panel or workflow not found');
      return;
    }
    if (!suppliedOptions && backendIdsToUse.length === 0) {
      const defaultTarget = resolveGenerationTarget({
        managedNodes: requestNodes,
        browserStatuses: browserNodeStatus,
        selectedBackendIds: [],
        panelNodeId: panel.nodeId,
        connectionStatus,
      });
      if (defaultTarget.node) backendIdsToUse = [defaultTarget.node.id];
    }
    const requestOptions: GenerationRequestOptions = suppliedOptions || {
      runId: crypto.randomUUID(),
      commandId: crypto.randomUUID(),
      idempotencyKey: crypto.randomUUID(),
      projectIdentity: projectScopeRef.current.identity,
      projectRevision: projectScopeRef.current.revision,
      panelInputRevision: panelInputRevisionRef.current.get(panelId) || 1,
      workflowId: workflowIdToUse,
      backendIds: backendIdsToUse,
      mode: backendIdsToUse.length > 1 ? 'parallel' : 'single',
      usePanelSnapshot: false,
    };
    if (requestOptions.projectIdentity !== projectScopeRef.current.identity
      || requestOptions.projectRevision !== projectScopeRef.current.revision
      || requestOptions.workflowId !== workflowIdToUse
      || new Set(requestOptions.backendIds).size !== requestOptions.backendIds.length
      || (!suppliedOptions && requestOptions.backendIds.length === 0)
      || (requestOptions.mode === 'single' && requestOptions.backendIds.length !== 1)
      || (requestOptions.mode === 'parallel' && requestOptions.backendIds.length < 2)) {
      showError('The generation request no longer matches the active project, workflow, panel or backend selection.');
      return;
    }
    const unresolvedRun = listGenerationRuns(requestOptions.projectIdentity).find(run =>
      run.panelId === panelId && run.jobs.some(job => ['prepared', 'submitting', 'submission_unknown', 'accepted', 'running', 'cancel_requested'].includes(job.status)),
    );
    if (unresolvedRun) {
      showError(`Panel ${panelId} has unresolved run ${unresolvedRun.runId}. Inspect that run before submitting another prompt.`);
      return;
    }
    const panelReason = getGenerationDisabledReason(
      Boolean(requestWorkflows.find(workflow => workflow.id === requestOptions.workflowId)),
      {
        managedNodes: requestNodes,
        browserStatuses: browserNodeStatus,
        selectedBackendIds: requestOptions.backendIds,
        panelNodeId: panel?.nodeId,
        connectionStatus,
      },
    );
    if (panelReason) {
      showError(panelReason);
      return;
    }
    // Fix #2: Check if user explicitly selected multiple nodes for parallel generation
    if (requestOptions.mode === 'parallel') {
      await generateParallel(panelId, requestOptions.backendIds, requestOptions);
      return;
    }

    const generationRun = claimGenerationRun(panelId, requestOptions.runId);
    if (!generationRun) return;

    try {
      // Single-node generation uses the same target resolution as the gate and editor.
      const target = resolveGenerationTarget({
        managedNodes: requestNodes,
        browserStatuses: browserNodeStatus,
      selectedBackendIds: requestOptions.backendIds,
        panelNodeId: panel?.nodeId,
        connectionStatus,
      });
      if (target.kind !== 'managed' || !target.url || !target.node) {
        const errorMsg = target.reason || 'No managed render node available. Add one in Manage Nodes.';
        addLog('error', errorMsg);
        showError(errorMsg);
        finishGenerationSubmission(generationRun.id);
        return;
      }
      const targetUrl = target.url;
      const nodeName = target.node.name || 'Managed ComfyUI node';
      let targetOS: TargetOS = target.node?.os || 'unknown';
    
    // Check connection to target node and detect OS if not already known
    try {
      const healthCheck = await fetch(`${targetUrl}/system_stats`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (!healthCheck.ok) {
        throw new Error(`Node ${nodeName} is not responding`);
      }
      // Detect OS from health check if we don't have it yet (e.g. direct connection)
      if (targetOS === 'unknown') {
        try {
          const statsData = await healthCheck.json();
          targetOS = detectNodeOS(statsData);
        } catch { /* ignore parse errors, we already verified it's responding */ }
      }
    } catch (error) {
      const errorMsg = `Cannot connect to ${nodeName}: ${error}`;
      addLog('error', errorMsg);
      showError(errorMsg);
      finishGenerationSubmission(generationRun.id);
      return;
    }
    
    const isLivePanel = selectedPanelIdRef.current === panelId;
    // Only the selected panel owns the live sidebar values. A background panel
    // must generate from its own latest stored effective snapshot.
    const currentParameterValues = requestOptions.usePanelSnapshot
      ? (panel?.parameterValues || {})
      : isLivePanel ? parameterValuesRef.current : (panel?.parameterValues || {});
    
    const workflow = requestWorkflows.find(w => w.id === requestOptions.workflowId);
    if (!workflow || !Number.isSafeInteger(workflow.revision) || !workflow.revision) {
      const message = workflow ? 'Save the workflow to canonical storage before generating.' : 'No workflow selected';
      addLog('warning', message);
      showError(message);
      finishGenerationSubmission(generationRun.id);
      return;
    }

    if (!generationScopeIsCurrent(requestOptions, panelId, workflow)) {
      throw new Error('The panel, project or workflow changed before generation began. No prompt was submitted.');
    }
    
    // ALWAYS use parameters from the UI (ref) - never use stale panel.parameterValues
    const paramsToUse = currentParameterValues;
    
    setPanels(prev => prev.map(p =>
      p.id === panelId ? { ...p, status: 'generating', progress: 0, parameterValues: { ...paramsToUse }, workflowId: workflowIdToUse || undefined, parallelJobs: undefined } : p
    ));
    requestOptions.panelInputRevision = panelInputRevisionRef.current.get(panelId) || requestOptions.panelInputRevision;
    
    // Track generation start time
    generationStartTimes.current.set(panelId, Date.now());
    
    addLog('comfyui', `Starting generation for panel ${panelId} on ${nodeName}...`);
    
    // Debug: Log which values we're using
    console.log('[Generation] ==== GENERATION START ====');
    console.log('[Generation] Panel ID:', panelId);
    console.log('[Generation] Using parameters from UI ref (always)');
    console.log('[Generation] paramsToUse:', JSON.stringify(paramsToUse, null, 2));
    console.log('[Generation] Seed:', paramsToUse.seed);
    console.log('[Generation] Prompt preview:', paramsToUse.positive_prompt?.substring(0, 50) || paramsToUse.prompt?.substring(0, 50));
    
    // Upload any images in paramsToUse that are data URLs
    // Use the panel-specific paramsToUse, not the global parameterValues
    // Keep original UI media references separate from transport-only filenames.
    const restorableParameters = JSON.parse(JSON.stringify(paramsToUse));
    const processedParams = JSON.parse(JSON.stringify(paramsToUse));
    const imageInputs: Record<string, string> = {};
    
    console.log('[Generation] Processing parameter values for panel:', panelId, Object.keys(paramsToUse));
    
    for (const [key, value] of Object.entries(paramsToUse)) {
      // Handle bypassed image inputs - pass through to imageInputs for buildWorkflow to handle
      if (value === '__BYPASSED__') {
        addLog('info', `Image input ${key} is bypassed, will skip in workflow`);
        console.log(`[Generation] ${key} is BYPASSED`);
        imageInputs[key] = '__BYPASSED__';
        // Remove from processedParams so it doesn't get sent to nodes directly
        delete processedParams[key];
        continue;
      }
      
      // Handle ComfyUI view URLs - preserve full path including subfolder
      // ComfyUI's LoadImage node can accept either:
      // 1. A filename that exists in ComfyUI's input folder
      // 2. A full absolute path to the image
      // We preserve the full path with subfolder as provided from drag-and-drop
      if (typeof value === 'string' && value.includes('/view?')) {
        try {
          const url = new URL(value);
          const filename = url.searchParams.get('filename');
          const subfolder = url.searchParams.get('subfolder') || '';
          const imageType = url.searchParams.get('type') || 'output';
          
          if (filename) {
            // If image is from output folder, we need to re-upload it to input folder
            if (imageType === 'output') {
              console.log(`[Generation] Downloading ${filename} from output to re-upload to input`);
              addLog('info', `Downloading ${filename} from output folder for re-upload`);
              
              // Download the image from the view URL
              const imageResponse = await fetch(value);
              if (imageResponse.ok) {
                const blob = await imageResponse.blob();
                // Add timestamp to prevent conflicts
                const uploadFilename = `storyboard_${Date.now()}_${filename}`;
                const file = new File([blob], uploadFilename, { type: blob.type || 'image/png' });
                
                // Upload to ComfyUI's input folder
                const formData = new FormData();
                formData.append('image', file);
                formData.append('overwrite', 'true');
                
                const uploadResponse = await fetch(`${targetUrl}/upload/image`, {
                  method: 'POST',
                  body: formData,
                });
                
                if (uploadResponse.ok) {
                  const uploadData = await uploadResponse.json();
                  console.log(`[Generation] Re-uploaded ${filename} as ${uploadData.name}`);
                  addLog('info', `Re-uploaded ${filename} as ${uploadData.name}`);
                  processedParams[key] = uploadData.name;
                  imageInputs[key] = uploadData.name;
                  continue;
                } else {
                  console.error('[Generation] Failed to upload image:', await uploadResponse.text());
                  addLog('error', `Failed to upload image ${filename}: HTTP ${uploadResponse.status}`);
                }
              } else {
                console.error('[Generation] Failed to download image from view URL');
                addLog('error', `Failed to download image ${filename} from output folder`);
              }
              
              // Fallback: try to use the original path if download/upload failed
              const fullPath = subfolder ? `${subfolder}/${filename}` : filename;
              console.log(`[Generation] Falling back to original path: ${fullPath}`);
              addLog('warning', `Re-upload failed, falling back to: ${fullPath}`);
              processedParams[key] = fullPath;
              imageInputs[key] = fullPath;
              continue;
            } else {
              // Image is already in input folder, use as-is
              const fullPath = subfolder ? `${subfolder}/${filename}` : filename;
              addLog('info', `Using image path from ComfyUI URL: ${fullPath}`);
              console.log(`[Generation] ${key} using image path: ${fullPath}`);
              processedParams[key] = fullPath;
              imageInputs[key] = fullPath;
              continue;
            }
          }
        } catch (e) {
          console.warn('[Generation] Failed to process ComfyUI URL:', value, e);
        }
      }
      
      if (typeof value === 'string' && (value.startsWith('data:image') || value.startsWith('data:video'))) {
        const isVideo = value.startsWith('data:video');
        console.log(`[Generation] ${key} is a data:${isVideo ? 'video' : 'image'} URL, uploading...`);
        try {
          addLog('info', `Uploading ${isVideo ? 'video' : 'image'} for parameter: ${key}`);
          // Convert data URL to blob
          const response = await fetch(value);
          const blob = await response.blob();
          // Use correct extension based on MIME type
          const mimeExt = blob.type.split('/')[1] || (isVideo ? 'mp4' : 'png');
          const filename = `storyboard_${Date.now()}_${key}.${mimeExt}`;
          const file = new File([blob], filename, { type: blob.type });
          
          // Upload to ComfyUI (upload/image endpoint handles both images and videos)
          const formData = new FormData();
          formData.append('image', file);
          formData.append('overwrite', 'true');
          
          const uploadResponse = await fetch(`${targetUrl}/upload/image`, {
            method: 'POST',
            body: formData,
          });
          
          if (!uploadResponse.ok) {
            throw new Error(`Upload failed: HTTP ${uploadResponse.status}`);
          }
          
          const uploadData = await uploadResponse.json();
          const uploadedFilename = uploadData.name;
          addLog('info', `${isVideo ? 'Video' : 'Image'} uploaded as: ${uploadedFilename}`);
          console.log(`[Generation] ${key} uploaded as: ${uploadedFilename}`);
          
          // Store the filename for buildWorkflow
          processedParams[key] = uploadedFilename;
          // Also track in imageInputs for explicit image input handling
          imageInputs[key] = uploadedFilename;
        } catch (uploadError) {
          const errorMsg = `Failed to upload ${isVideo ? 'video' : 'image'} ${key}: ${uploadError}`;
          addLog('error', errorMsg);
          showError(errorMsg);
          setPanels(prev => prev.map(p => 
            p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
          ));
          finishGenerationSubmission(generationRun.id);
          return;
        }
      } else {
        console.log(`[Generation] ${key} is not media (type: ${typeof value}, startsWith data: ${typeof value === 'string' ? value.startsWith('data:') : 'N/A'})`);
      }
    }
    
    console.log('[Generation] Final imageInputs:', imageInputs);
    console.log('[Generation] Final processedParams keys:', Object.keys(processedParams));
    
    // Apply global prompt override if enabled
    if (useGlobalPrompt && globalPromptOverride.trim()) {
      // Override all prompt-type parameters
      for (const key of Object.keys(processedParams)) {
        // Check if this is a prompt parameter (positive_prompt, prompt, text, etc.)
        if (key.toLowerCase().includes('prompt') || key === 'text' || key === 'positive') {
          processedParams[key] = globalPromptOverride;
          restorableParameters[key] = globalPromptOverride;
          addLog('info', `Applied global prompt override to: ${key}`);
        }
      }
    }
    
    // Build workflow with parameters
    const parser = getWorkflowParser();
    const parsedWorkflow = parser.parseWorkflow(workflow.workflow);
    
    // Extract LoRA values from processedParams
    // LoRA parameters may be stored as complex objects { lora_name, strength, bypassed }
    // or as simple numbers (strength only) for backwards compatibility
    const loraValues: Record<string, { enabled?: boolean; strength: number; bypassed?: boolean; lora_name?: string }> = {};
    const nonLoraParams: Record<string, any> = {};
    
    // Get the list of LoRA parameter names from the parsed workflow
    const loraParamNames = new Set(parsedWorkflow.loras.map(l => l.name));
    
    for (const [key, value] of Object.entries(processedParams)) {
      if (loraParamNames.has(key)) {
        // This is a LoRA parameter
        if (typeof value === 'object' && value !== null) {
          // Complex format: { lora_name, strength, bypassed }
          const loraValue = value as {
            strength?: number;
            bypassed?: boolean;
            lora_name?: string;
          };
          loraValues[key] = {
            strength: loraValue.strength ?? 1.0,
            bypassed: loraValue.bypassed ?? false,
            lora_name: loraValue.lora_name,
            enabled: !loraValue.bypassed // For backwards compatibility
          };
        } else if (typeof value === 'number') {
          // Simple format: just strength value
          loraValues[key] = {
            strength: value,
            enabled: true
          };
        }
      } else {
        // Regular parameter
        nonLoraParams[key] = value;
      }
    }
    
    // Debug: Log parameters being applied
    console.log('Parameters being applied:', nonLoraParams);
    console.log('LoRA values being applied:', loraValues);
    console.log('Parsed workflow parameters:', parsedWorkflow.parameters);
    console.log('Custom param configs:', workflow.config);
    
    const builtWorkflow = parser.buildWorkflow(
      workflow.workflow,
      nonLoraParams,
      imageInputs,
      loraValues,
      workflow.config // Pass custom parameter configs
    );
    
    // Normalize path separators for the target node's OS
    normalizeWorkflowPaths(builtWorkflow, targetOS);

    // Snapshot provenance once before any submitted job can finish.
    const generationSnapshot: GenerationSnapshot = {
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflow: JSON.parse(JSON.stringify(workflow.workflow)),
      selectedOutputNodeIds: workflow.parsed.outputs.filter(output => output.selected).map(output => output.node_id),
      parameters: restorableParameters,
    };
    
    // Debug: Log the workflow being sent
    console.log('Workflow being sent to ComfyUI:', JSON.stringify(builtWorkflow, null, 2));
    addLog('info', `Workflow nodes: ${Object.keys(builtWorkflow).length}, target OS: ${targetOS}`);
    
    const clientId = `storyboard-panel-${panelId}-${Date.now()}`;
    const nodeWs = getComfyUIWebSocket(targetUrl, clientId);
    try {
      // Connect before submission so live events use the same client ID.
      
      try {
        await nodeWs.connect();
      } catch (wsError) {
        addLog('warning', `WebSocket to ${targetUrl} failed, will use polling`);
      }
      
      if (!generationScopeIsCurrent(requestOptions, panelId, workflow)) {
        throw new Error('The panel, project or workflow changed while preparing this prompt. No prompt was submitted.');
      }
      createGenerationRun({
        runId: generationRun.id,
        commandId: requestOptions.commandId,
        idempotencyKey: requestOptions.idempotencyKey,
        projectIdentity: requestOptions.projectIdentity,
        panelId,
        workflowId: workflow.id,
        workflowRevision: workflow.revision,
        mode: 'single',
      });
      const seedNode = Object.values(builtWorkflow).find((nodeValue: unknown) => {
        if (!nodeValue || typeof nodeValue !== 'object') return false;
        const node = nodeValue as { class_type?: unknown };
        return typeof node.class_type === 'string' && (node.class_type.includes('Sampler') || node.class_type.includes('KSampler') || node.class_type === 'RandomNoise');
      }) as { inputs?: Record<string, unknown> } | undefined;
      const graphSeed = seedNode?.inputs?.seed ?? seedNode?.inputs?.noise_seed;
      const journalSeed = typeof graphSeed === 'number' && Number.isFinite(graphSeed)
        ? graphSeed
        : typeof paramsToUse.seed === 'number' && Number.isFinite(paramsToUse.seed) ? paramsToUse.seed : -1;
      const submitted = await submitPromptWithJournal({
        runId: generationRun.id,
        backendId: target.node.id,
        seed: journalSeed,
        url: `${targetUrl}/prompt`,
        body: {
          prompt: builtWorkflow,
          client_id: clientId, // Must match WebSocket client ID!
        },
      });
      addLog('comfyui', `Queued prompt: ${submitted.promptId} on ${nodeName}`);
      
      // Build workflow progress info for multi-phase tracking (e.g., 2 KSamplers in video workflows)
      const wfProgressInfo = buildWorkflowProgressInfo(builtWorkflow);
      if (wfProgressInfo.samplerNodeIds.length > 1) {
        addLog('info', `Multi-sampler workflow detected: ${wfProgressInfo.samplerNodeIds.length} sampler phases`);
      }
      
      // Use the same callbacks for live events and history reconciliation.
      trackWithWebSocketRef.current(submitted.promptId, panelId, targetUrl, nodeWs, generationRun.id, generationSnapshot, clientId, wfProgressInfo);
    } catch (error) {
      disconnectWebSocket(targetUrl, clientId);
      const journalRun = getGenerationRun(generationRun.id);
      const targetBackendId = target.node?.id;
      const journalJob = targetBackendId ? journalRun?.jobs.find(job => job.backendId === targetBackendId) : undefined;
      if (journalRun && journalRun.jobs.length === 0) {
        try { failGenerationBeforeSubmission(generationRun.id, error instanceof Error ? error.message : String(error)); } catch { /* Preserve the original generation failure. */ }
      }
      if (error instanceof GenerationSubmissionError && error.state === 'submission_unknown' || journalJob?.status === 'submission_unknown') {
        const message = 'ComfyUI submission outcome is unknown; inspect the durable run before retrying.';
        addLog('warning', message);
        showWarning(message);
        setPanels(prev => prev.map(p => p.id === panelId ? { ...p, status: 'generating', progress: 0, progressNodeName: 'Submission outcome unknown' } : p));
      } else if (journalJob && ['accepted', 'running', 'cancel_requested'].includes(journalJob.status)) {
        const message = 'ComfyUI accepted the prompt, but live tracking did not attach; inspect the durable run.';
        addLog('warning', message);
        showWarning(message);
        setPanels(prev => prev.map(p => p.id === panelId ? { ...p, status: 'generating', progress: 0, progressNodeName: 'Accepted; tracking unavailable' } : p));
      } else {
        const errorMsg = `Failed to queue generation: ${error}`;
        addLog('error', errorMsg);
        showError(errorMsg);
        setPanels(prev => prev.map(p =>
          p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
        ));
      }
    }
    } catch (error) {
      const journalRun = getGenerationRun(generationRun.id);
      if (journalRun && journalRun.jobs.length === 0) {
        try { failGenerationBeforeSubmission(generationRun.id, error instanceof Error ? error.message : String(error)); } catch { /* Preserve the original generation failure. */ }
      }
      const errorMsg = `Generation preparation failed: ${error instanceof Error ? error.message : String(error)}`;
      addLog('error', errorMsg);
      showError(errorMsg);
      setPanels(prev => prev.map(p => p.id === panelId ? { ...p, status: 'error', progress: 0 } : p));
    } finally {
      finishGenerationSubmission(generationRun.id);
    }
  }, [workflows, selectedWorkflowId, browserNodeStatus, connectionStatus, addLog, showError, showWarning, panels, renderNodes, selectedBackendIds, globalPromptOverride, useGlobalPrompt, generateParallel, claimGenerationRun, finishGenerationSubmission, flushPendingWorkflowSave]);
  
  // Track generation progress via WebSocket (real-time)
  const trackWithWebSocket = useCallback((
    promptId: string,
    panelId: number,
    targetUrl: string,
    websocket: ComfyUIWebSocket,
    runId: string,
    generationSnapshot: GenerationSnapshot,
    clientId?: string,
    workflowInfo?: WorkflowProgressInfo,
  ) => {
    const jobKey = `${targetUrl}:${promptId}`;
    if (!registerGenerationJob(runId, jobKey, { panelId, promptId, ws: websocket })) {
      throw new Error('Generation run is no longer active');
    }
    const hasOtherActiveJobs = () => [...activeGenerationsRef.current.entries()].some(([key, job]) =>
      key !== jobKey && job.panelId === panelId && job.runId === runId && !job.finishing
    );

    // Keep the prompt entry until result/error handling, including output fetch/save, settles.
    const cleanupWs = () => {
      const activeJob = activeGenerationsRef.current.get(jobKey);
      if (activeJob?.runId === runId) activeGenerationsRef.current.delete(jobKey);
      if (clientId) {
        // Disconnect and remove this per-generation WebSocket instance
        disconnectWebSocket(targetUrl, clientId);
      }
    };
    
    try {
      websocket.trackPrompt(
        promptId,
        panelId,
      // Progress callback
      (progress) => {
        const activeJob = activeGenerationsRef.current.get(jobKey);
        if (!activeJob || activeJob.runId !== runId || activeJob.finishing || !isCurrentGenerationRun(panelId, runId)
          || progress.promptId !== promptId) return;
        try { updateGenerationJobByPrompt(runId, promptId, 'running'); } catch (error) { console.warn('[GenerationJournal] Could not persist progress:', error); }
        // Use overall percent when available (accounts for multi-sampler workflows)
        const pct = progress.overallPercent ?? Math.round((progress.value / progress.max) * 100);
        
        // Build informative log message
        let logMsg = `Progress: ${pct}%`;
        if (progress.totalPhases && progress.totalPhases > 1) {
          logMsg += ` (phase ${progress.currentPhase}/${progress.totalPhases}: ${progress.value}/${progress.max})`;
        } else {
          logMsg += ` (${progress.value}/${progress.max})`;
        }
        if (progress.currentNodeName) {
          logMsg += ` [${progress.currentNodeName}]`;
        }
        addLog('info', logMsg);
        
        // Build phase display string
        const progressPhase = (progress.totalPhases && progress.totalPhases > 1)
          ? `Phase ${progress.currentPhase}/${progress.totalPhases}`
          : undefined;
        
        setPanels(prev => prev.map(p => 
          p.id === panelId ? { 
            ...p, 
            progress: pct,
            progressPhase,
            progressNodeName: progress.currentNodeName,
            progressNodesExecuted: progress.nodesExecuted,
            progressTotalNodes: progress.totalNodes,
          } : p
        ));
      },
      // Completed callback
      async (_promptId, _outputs) => {
        const activeJob = activeGenerationsRef.current.get(jobKey);
        if (_promptId !== promptId || !activeJob || activeJob.runId !== runId || activeJob.finishing) return;
        try { updateGenerationJobByPrompt(runId, promptId, 'complete'); } catch (error) { console.warn('[GenerationJournal] Could not persist completion:', error); }
        markGenerationJobFinishing(runId, jobKey);
        if (!isCurrentGenerationRun(panelId, runId)) {
          settleGenerationJob(runId, jobKey);
          cleanupWs();
          return;
        }
        addLog('comfyui', `Generation complete for panel ${panelId}`);
        
        // CRITICAL FIX: Read project settings directly from the singleton to avoid
        // stale closure issues. The React state `projectSettings` captured in this
        // useCallback closure can be stale because `panels` changes frequently
        // (every progress update), but already-registered WebSocket callbacks
        // still hold the old closure values.
        const currentSettings = projectManager.getProject();
        
        // SKIP if this panel has parallel jobs - they're handled by saveIndividualParallelResult
        // CRITICAL: Use panelsRef.current to avoid stale closure - panels captured in this
        // callback go stale because it's registered once via ws.trackPrompt and never updated
        const panelNow = panelsRef.current.find(p => p.id === panelId);
        if (panelNow?.parallelJobs && panelNow.parallelJobs.length > 0) {
          addLog('comfyui', `Skipping single-node save - panel has parallel jobs, handled by parallel tracker`);
          settleGenerationJob(runId, jobKey);
          cleanupWs();
          return;
        }
        
        // Fetch result from history to get image URL
        try {
          let promptData = _outputs ? { outputs: _outputs } : undefined;
          if (!promptData) {
            const response = await fetch(`${targetUrl}/history/${promptId}`, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            promptData = (await response.json())[promptId];
          }
          if (promptData) {
            
            if (promptData?.outputs) {
              // Use the output selection captured when this prompt was submitted.
              const selectedOutputNodeIds = generationSnapshot.selectedOutputNodeIds;
              
              // If no outputs are explicitly selected, use all of them (backwards compatibility)
              const useAllOutputs = selectedOutputNodeIds.length === 0;
              
              // Collect media from selected output nodes only (images + videos)
              const allImages: string[] = [];
              const nodeOutputMap: Record<string, string[]> = {}; // Track which node produced which outputs
              
              for (const nodeId of Object.keys(promptData.outputs)) {
                // Skip this node if it's not selected (unless we're using all outputs)
                if (!useAllOutputs && !selectedOutputNodeIds.includes(nodeId)) {
                  addLog('comfyui', `Skipping node ${nodeId} (not selected)`);
                  continue;
                }
                
                const output = promptData.outputs[nodeId];
                const mediaOutputs = extractMediaOutputs(output, targetUrl);
                if (mediaOutputs.length > 0) {
                  const nodeUrls = mediaOutputs.map(m => m.url);
                  allImages.push(...nodeUrls);
                  nodeOutputMap[nodeId] = nodeUrls;
                  addLog('comfyui', `Node ${nodeId} produced ${mediaOutputs.length} output(s)`);
                }
              }
              
              if (allImages.length > 0) {
                // Log what we found for debugging
                addLog('comfyui', `Total: ${allImages.length} images from ${Object.keys(nodeOutputMap).length} output node(s)`);
                
                 // Auto-save if enabled - scan filesystem for correct version number
                 // Uses currentSettings from singleton (not stale closure)
                 if (currentSettings.autoSave && currentSettings.path) {
                   addLog('info', `Auto-saving ${allImages.length} image(s) to ${currentSettings.path}...`);
                   
                   // Calculate generation time
                   const startTime = generationStartTimes.current.get(panelId);
                   const generationTime = startTime ? (Date.now() - startTime) / 1000 : undefined;
                   
                   // CRITICAL FIX: Use unified getNextVersion() to prevent version collisions
                   // Use panelsRef.current to avoid stale closure from WebSocket callback
                   const panelsSnapshot = [...panelsRef.current];
                   const mediaSaveOrigin = projectManager.getProjectIdentity();
                   let mediaSavedForBatch = false;
                   await (async () => {
                     try {
                        // Get the panel to determine its current history
                        const currentPanel = panelsSnapshot.find(p => p.id === panelId);
                        const currentHistory = currentPanel?.imageHistory || [];
                        const panelName = currentPanel?.name || `Panel_${String(panelId).padStart(2, '0')}`;
                        
                        // CRITICAL FIX: Use panel NAME (not ID) to match folder structure
                        const nextVersion = await projectManager.getNextVersion(panelName, currentHistory);
                       
                       addLog('info', `Starting from version ${nextVersion}`);
                      
                      for (let idx = 0; idx < allImages.length; idx++) {
                        const url = allImages[idx];
                        const version = nextVersion + idx;
                        
                        const entry = projectManager.createHistoryEntry(
                          url,
                          panelId,
                          version,
                          generationSnapshot.workflowId,
                          generationSnapshot.workflowName,
                          generationSnapshot.workflow,
                          generationSnapshot.parameters,
                          generationTime
                        );
                        
                         addLog('info', `Saving v${version} from URL: ${url}`);
                        const result = await projectManager.saveToProjectFolder(
                          url,
                          panelId,
                          version,
                          entry.metadata,
                          panelName,  // CRITICAL: Pass panel name for per-panel folder creation
                          { notifyRevision: false },
                        );
                        
                         if (result.success) {
                           mediaSavedForBatch = true;
                           addLog('info', `Saved: ${result.savedPath}`);
                           // Match by URL since entry.id differs between auto-save and UI state entries
                           setPanels(prev => prev.map(p => {
                             if (p.id !== panelId) return p;
                             const updatedHistory = p.imageHistory.map(h =>
                               h.url === url && !h.metadata.savedPath
                                 ? { ...h, metadata: { ...h.metadata, savedPath: result.savedPath } }
                                 : h
                             );
                             return { ...p, imageHistory: updatedHistory };
                           }));
                         } else {
                           addLog('error', `Auto-save failed for v${version}: ${result.error}`);
                         }
                       }
                     } catch (err) {
                       addLog('error', `Auto-save exception: ${err}`);
                     } finally {
                       if (mediaSavedForBatch) projectManager.notifyMediaRevision(mediaSaveOrigin);
                     }
                   })();
                 } else if (currentSettings.autoSave && !currentSettings.path) {
                   addLog('warning', 'Auto-save enabled but no project folder configured');
                 } else if (!currentSettings.autoSave) {
                   addLog('info', 'Auto-save is disabled. Enable it in Project Settings to save images automatically.');
                 }
                
                // Calculate generation time BEFORE setPanels (refs shouldn't be read inside setState)
                const genStartTime = generationStartTimes.current.get(panelId);
                const genTime = genStartTime ? (Date.now() - genStartTime) / 1000 : undefined;
                if (!hasOtherActiveJobs()) generationStartTimes.current.delete(panelId);
                console.log('[Generation] Panel', panelId, 'took', genTime?.toFixed(1), 'seconds');
                
                // Update state with history entries (use memory-based version for UI)
                setPanels(prevPanels => {
                  const currentPanel = prevPanels.find(p => p.id === panelId);
                  const currentHistoryLength = currentPanel?.imageHistory?.length || 0;
                  
                  const historyEntriesForState = allImages.map((url: string, idx: number) => 
                    projectManager.createHistoryEntry(
                      url,
                      panelId,
                      currentHistoryLength + idx + 1,
                      generationSnapshot.workflowId,
                      generationSnapshot.workflowName,
                      generationSnapshot.workflow,
                      generationSnapshot.parameters,
                      genTime  // Use the pre-calculated generation time
                    )
                  );
                  
                  return prevPanels.map(p => {
                    if (p.id !== panelId) return p;
                    
                    const newHistory = [...p.imageHistory, ...historyEntriesForState];
                    return {
                      ...p,
                      status: hasOtherActiveJobs() ? 'generating' as const : 'complete' as const,
                      progress: hasOtherActiveJobs() ? p.progress : 100,
                      image: allImages[allImages.length - 1],
                      images: allImages,
                      currentImageIndex: 0,
                      imageHistory: newHistory,
                      historyIndex: newHistory.length - 1,
                    };
                  });
                });
                settleGenerationJob(runId, jobKey);
                cleanupWs();
                return;
              }
            }
          }
        } catch (error) {
          addLog('error', `Error fetching result: ${error}`);
        }
        
        // No image found; other prompts for this panel may still be running.
        settleGenerationJob(runId, jobKey);
        cleanupWs();
        setPanels(prev => prev.map(p =>
          p.id === panelId && !hasOtherActiveJobs() ? { ...p, status: 'error', progress: 0 } : p
        ));
      },
      // Error callback
      (_promptId, error) => {
        const activeJob = activeGenerationsRef.current.get(jobKey);
        if (_promptId !== promptId || !activeJob || activeJob.runId !== runId || activeJob.finishing) return;
        markGenerationJobFinishing(runId, jobKey);
        if (!isCurrentGenerationRun(panelId, runId)) {
          settleGenerationJob(runId, jobKey);
          cleanupWs();
          return;
        }
        const cancelled = error === 'Generation cancelled';
        try { updateGenerationJobByPrompt(runId, promptId, cancelled ? 'cancelled' : 'error', error); } catch (journalError) { console.warn('[GenerationJournal] Could not persist terminal state:', journalError); }
        const errorMsg = cancelled ? error : `Generation failed: ${error}`;
        addLog(cancelled ? 'info' : 'error', errorMsg);
        if (!cancelled) showError(errorMsg);
        settleGenerationJob(runId, jobKey);
        cleanupWs();
        setPanels(prev => prev.map(p =>
          p.id === panelId && !hasOtherActiveJobs()
            ? { ...p, status: cancelled ? (p.image ? 'complete' : 'empty') : 'error', progress: 0 } : p
        ));
        if (!hasOtherActiveJobs()) generationStartTimes.current.delete(panelId);
      },
        // Workflow info for multi-phase progress tracking
        workflowInfo
      );
    } catch (error) {
      settleGenerationJob(runId, jobKey);
      cleanupWs();
      throw error;
    }
  }, [addLog, showError, registerGenerationJob, markGenerationJobFinishing, settleGenerationJob, isCurrentGenerationRun]);
  trackWithWebSocketRef.current = trackWithWebSocket;
  
  // ---------------------------------------------------------------------------
  // Functions - Parallel Job Tracking (fixes race condition)
  // ---------------------------------------------------------------------------

  /**
   * Save a single parallel job result immediately when it completes.
   * Does NOT wait for other jobs. Updates UI immediately.
   */
  const saveIndividualParallelResult = useCallback(async (
    panelId: number,
    job: { nodeId: string; nodeName: string; resultUrl: string; seed: number; promptId?: string },
    generationSnapshot: GenerationSnapshot,
  ) => {
    // CRITICAL: Use panelsRef.current to avoid stale closure issues
    // The panels captured in this closure go stale as parallel jobs complete and update state
    const panel = panelsRef.current.find(p => p.id === panelId);
    if (!panel || !job.resultUrl) return;

    // Prevent duplicate saves for the same job
    const jobKey = `${panelId}-${job.nodeId}-${job.promptId || job.seed}`;
    if (savedJobsRef.current.has(jobKey)) {
      console.log(`[Parallel] Job ${jobKey} already saved, skipping duplicate`);
      return;
    }
    
    // Mark as saved IMMEDIATELY (before any async work) to prevent race conditions
    savedJobsRef.current.add(jobKey);

    console.log(`[Parallel] Saving individual result from ${job.nodeName}`);
    addLog('info', `Saving result from ${job.nodeName}...`);

    try {
      // Calculate generation time (if available)
      const startTime = generationStartTimes.current.get(panelId);
      const generationTime = startTime ? (Date.now() - startTime) / 1000 : undefined;

      // Create parameter object with the specific seed for this variation
      const paramsWithSeed = {
        ...generationSnapshot.parameters,
        seed: job.seed,
      };

      // CRITICAL FIX: Use atomic version counter to prevent version collisions
      // Multiple parallel jobs completing concurrently would all get the same version
      // from getNextVersion() because filesystem scan returns same result before any save completes
      const panelName = panel?.name || `Panel_${String(panelId).padStart(2, '0')}`;
      const nextVersion = nextVersionRef.current.get(panelId) || 1;
      nextVersionRef.current.set(panelId, nextVersion + 1);

      // Create history entry for this single job
      const entry = projectManager.createHistoryEntry(
        job.resultUrl,
        panelId,
        nextVersion,
        generationSnapshot.workflowId,
        generationSnapshot.workflowName,
        generationSnapshot.workflow,
        paramsWithSeed,
        generationTime
      );

      // Add node name to metadata
      entry.metadata.nodeName = job.nodeName;

      // Update panel state IMMEDIATELY with this result
      setPanels(prev => prev.map(p => {
        if (p.id !== panelId) return p;

        const newHistory = [...(p.imageHistory || []), entry];
        
        // Check if ALL parallel jobs are done (complete, error, or cancelled)
        const updatedJobs = p.parallelJobs?.map(j =>
          j.nodeId === job.nodeId && (!job.promptId || j.promptId === job.promptId)
            ? { ...j, status: 'complete' as const, progress: 100 }
            : j
        ) || [];
        const allDone = updatedJobs.every(j => 
          j.status === 'complete' || j.status === 'error' || j.status === 'cancelled'
        );
        const hasErrors = updatedJobs.some(j => j.status === 'error');
        
        return {
          ...p,
          image: entry.url, // Update the main image so card shows it immediately
          imageHistory: newHistory,
          historyIndex: newHistory.length - 1, // Show the latest image
          parallelJobs: updatedJobs,
          // Keep status as 'generating' until ALL jobs are done
          status: allDone ? (hasErrors ? 'error' : 'complete') : 'generating' as const,
        };
      }));

      addLog('info', `✓ Result from ${job.nodeName} saved to history (v${nextVersion})`);

      // Auto-save to filesystem if enabled
      // Read from singleton to avoid stale closure issues
      const currentSettings = projectManager.getProject();
      if (currentSettings.autoSave && currentSettings.path) {
        addLog('info', `Auto-saving ${job.nodeName} result to folder...`);

        const result = await projectManager.saveToProjectFolder(
          job.resultUrl,
          panelId,
          nextVersion,
          entry.metadata,
          panelName  // CRITICAL: Pass panel name for per-panel folder creation
        );

        if (result.success) {
          addLog('info', `✓ Saved: ${result.savedPath}`);
          
          // Update the history entry with the savedPath so delete works
          setPanels(prev => prev.map(p => {
            if (p.id !== panelId) return p;
            const updatedHistory = p.imageHistory.map(h => 
              h.id === entry.id 
                ? { ...h, metadata: { ...h.metadata, savedPath: result.savedPath } }
                : h
            );
            return { ...p, imageHistory: updatedHistory };
          }));
        } else {
          addLog('error', `✗ Save failed for ${job.nodeName}: ${result.error}`);
        }
      } else if (currentSettings.autoSave && !currentSettings.path) {
        addLog('warning', 'Auto-save enabled but no project folder configured');
      }
    } catch (err) {
      console.error(`[Parallel] Failed to save result from ${job.nodeName}:`, err);
      addLog('error', `Failed to save result from ${job.nodeName}: ${err}`);
      // Don't throw - let other jobs continue
    }
  }, [addLog]);

  const finishParallelJob = useCallback((runId: string, panelId: number, nodeId: string, status: 'error' | 'cancelled', promptId?: string) => {
    if (!isCurrentGenerationRun(panelId, runId)) return;
    setPanels(prev => prev.map(p => {
      if (p.id !== panelId || !p.parallelJobs) return p;
      const parallelJobs = p.parallelJobs.map(j =>
        j.nodeId === nodeId && (!promptId || j.promptId === promptId) ? { ...j, status } : j
      );
      const allDone = parallelJobs.every(j => ['complete', 'error', 'cancelled'].includes(j.status));
      return {
        ...p,
        parallelJobs,
        status: !allDone ? 'generating' : parallelJobs.some(j => j.status === 'error') ? 'error'
          : parallelJobs.some(j => j.status === 'complete') || p.image ? 'complete' : 'empty',
      };
    }));
  }, [isCurrentGenerationRun]);
  finishParallelJobRef.current = finishParallelJob;

  /**
   * Track a parallel job via WebSocket - updates individual job progress
   * and batches saves when ALL jobs complete to avoid race conditions
   */
  // Note: panels removed from deps - uses panelsRef.current instead to avoid stale closures
  const trackParallelJobWithWebSocket = useCallback((
    promptId: string,
    panelId: number,
    nodeId: string,
    targetUrl: string,
    ws: ComfyUIWebSocket,
    runId: string,
    nodeName: string,
    seed: number,
    generationSnapshot: GenerationSnapshot,
    clientId?: string,
    workflowInfo?: WorkflowProgressInfo
  ) => {
    const jobKey = `${targetUrl}:${promptId}`;
    if (!registerGenerationJob(runId, jobKey, { panelId, nodeId, promptId, ws })) {
      throw new Error('Generation run is no longer active');
    }

    // Keep the prompt entry until result/error handling, including output fetch/save, settles.
    const cleanupWs = () => {
      const activeJob = activeGenerationsRef.current.get(jobKey);
      if (activeJob?.runId === runId) activeGenerationsRef.current.delete(jobKey);
      if (clientId) {
        disconnectWebSocket(targetUrl, clientId);
      }
    };
    
    try {
      ws.trackPrompt(
        promptId,
        panelId,
      // Progress callback - update this specific job's progress
      (progress) => {
        const activeJob = activeGenerationsRef.current.get(jobKey);
        if (!activeJob || activeJob.runId !== runId || activeJob.finishing || !isCurrentGenerationRun(panelId, runId)
          || progress.promptId !== promptId) return;
        try { updateGenerationJobByPrompt(runId, promptId, 'running'); } catch (error) { console.warn('[GenerationJournal] Could not persist parallel progress:', error); }
        // Use overall percent when available (accounts for multi-sampler workflows)
        const pct = progress.overallPercent ?? Math.round((progress.value / progress.max) * 100);
        
        // Build phase display string
        const progressPhase = (progress.totalPhases && progress.totalPhases > 1)
          ? `Phase ${progress.currentPhase}/${progress.totalPhases}`
          : undefined;
        
        setPanels(prev => prev.map(p => {
          if (p.id !== panelId || !p.parallelJobs) return p;
          const updatedJobs = p.parallelJobs.map(j =>
            j.nodeId === nodeId && j.promptId === promptId ? {
              ...j,
              progress: pct,
              currentNodeName: progress.currentNodeName || j.currentNodeName,
              progressPhase,
              nodesExecuted: progress.nodesExecuted,
              totalNodes: progress.totalNodes,
            } : j
          );
          // Update overall panel progress as average of all jobs
          const avgProgress = Math.round(
            updatedJobs.reduce((sum, j) => sum + j.progress, 0) / updatedJobs.length
          );
          return { ...p, parallelJobs: updatedJobs, progress: avgProgress };
        }));
      },
      // Completed callback - store result URL and check if all jobs done
      async (_promptId, _outputs) => {
        const activeJob = activeGenerationsRef.current.get(jobKey);
        if (_promptId !== promptId || !activeJob || activeJob.runId !== runId || activeJob.finishing) return;
        try { updateGenerationJobByPrompt(runId, promptId, 'complete'); } catch (error) { console.warn('[GenerationJournal] Could not persist parallel completion:', error); }
        markGenerationJobFinishing(runId, jobKey);
        if (!isCurrentGenerationRun(panelId, runId)) {
          settleGenerationJob(runId, jobKey);
          cleanupWs();
          return;
        }
        addLog('comfyui', `Parallel job complete on node ${nodeId} for panel ${panelId}`);
        
        // Fetch result from history
        try {
          let promptData = _outputs ? { outputs: _outputs } : undefined;
          if (!promptData) {
            const response = await fetch(`${targetUrl}/history/${promptId}`, { signal: AbortSignal.timeout(15000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            promptData = (await response.json())[promptId];
          }
          
          if (promptData?.outputs) {
            // Use the output selection captured when this prompt was submitted.
            const useAllOutputs = generationSnapshot.selectedOutputNodeIds.length === 0;
            let resultUrl: string | undefined;
            for (const nodeIdKey of Object.keys(promptData.outputs)) {
              if (!useAllOutputs && !generationSnapshot.selectedOutputNodeIds.includes(nodeIdKey)) continue;
              const output = promptData.outputs[nodeIdKey];
              const mediaOutputs = extractMediaOutputs(output, targetUrl);
              if (mediaOutputs.length > 0) {
                resultUrl = mediaOutputs[0].url;
                break;
              }
            }
            
            if (resultUrl) {
              // Update this job's result URL and status, matching the prompt identity.
              setPanels(prev => prev.map(p => {
                if (p.id !== panelId || !p.parallelJobs) return p;
                const updatedJobs = p.parallelJobs.map(j =>
                  j.nodeId === nodeId && j.promptId === promptId
                    ? { ...j, status: 'complete' as const, progress: 100, resultUrl }
                    : j
                );

                // Check if ALL jobs are in terminal state (for cleanup/logging only, not batch save)
                const allTerminal = updatedJobs.every(j =>
                  j.status === 'complete' || j.status === 'error' || j.status === 'cancelled'
                );

                if (allTerminal) {
                  const completeCount = updatedJobs.filter(j => j.status === 'complete').length;
                  addLog('info', `All parallel jobs finished! ${completeCount} successful, ${updatedJobs.length - completeCount} failed`);
                  return {
                    ...p,
                    parallelJobs: updatedJobs,
                    status: completeCount > 0 ? 'complete' : 'error',
                    batchSaveTriggered: true
                  };
                }

                return { ...p, parallelJobs: updatedJobs };
              }));
              await saveIndividualParallelResult(panelId, {
                nodeId,
                nodeName,
                resultUrl,
                seed,
                promptId,
              }, generationSnapshot);
              return;
            }
          }
          throw new Error('Generation completed without media output');
        } catch (error) {
          addLog('error', `Error fetching parallel result: ${error}`);
          finishParallelJob(runId, panelId, nodeId, 'error', promptId);
        } finally {
          settleGenerationJob(runId, jobKey);
          cleanupWs();
        }
      },
      // Error callback
      (_promptId, error) => {
        const activeJob = activeGenerationsRef.current.get(jobKey);
        if (_promptId !== promptId || !activeJob || activeJob.runId !== runId || activeJob.finishing) return;
        markGenerationJobFinishing(runId, jobKey);
        if (!isCurrentGenerationRun(panelId, runId)) {
          settleGenerationJob(runId, jobKey);
          cleanupWs();
          return;
        }
        const cancelled = error === 'Generation cancelled';
        try { updateGenerationJobByPrompt(runId, promptId, cancelled ? 'cancelled' : 'error', error); } catch (journalError) { console.warn('[GenerationJournal] Could not persist parallel terminal state:', journalError); }
        addLog(cancelled ? 'info' : 'error', `Parallel job on node ${nodeId}: ${error}`);
        finishParallelJob(runId, panelId, nodeId, cancelled ? 'cancelled' : 'error', promptId);
        settleGenerationJob(runId, jobKey);
        cleanupWs();
      },
        // Workflow info for multi-phase progress tracking
        workflowInfo
      );
    } catch (error) {
      settleGenerationJob(runId, jobKey);
      cleanupWs();
      throw error;
    }
  }, [addLog, saveIndividualParallelResult, finishParallelJob, registerGenerationJob, markGenerationJobFinishing, settleGenerationJob, isCurrentGenerationRun]);
  trackParallelJobWithWebSocketRef.current = trackParallelJobWithWebSocket;
  
  // Note: Individual job cancel/retry functions and batchSaveParallelResults removed
  // Functionality now handled through streaming individual saves via saveIndividualParallelResult

  // ---------------------------------------------------------------------------
  // Functions - Parameter Updates
  // ---------------------------------------------------------------------------
  const handleParameterChange = useCallback((name: string, value: any) => {
    enhancementRequestRevisionRef.current += 1;
    console.log('[handleParameterChange] Called with:', name, '=', typeof value === 'string' ? value.substring(0, 50) : value);
    
    // CRITICAL: Update the ref BEFORE calling setParameterValues
    // The functional setter (prev => ...) is NOT called synchronously - React batches it
    // So we must update the ref outside the setter to ensure generatePanel gets latest values
    const newValues = { ...parameterValuesRef.current, [name]: value };
    parameterValuesRef.current = newValues;
    console.log('[handleParameterChange] Updated ref BEFORE setter, keys:', Object.keys(newValues));
    
    // Update the state (this triggers re-render but the functional form ensures consistency)
    setParameterValues(newValues);
      
    const activeWorkflow = workflowsRef.current.find(item => item.id === selectedWorkflowIdRef.current);
    const changedMedia = activeWorkflow?.config.some(config =>
      config.name === name && ['image_input', 'image', 'image_list', 'video', 'video_list', 'audio', 'audio_list', 'media'].includes(config.type || '')
    ) || false;
    if (changedMedia) {
      const invalidated = { ...enhancementPreferencesRef.current, referenceOrderConfirmed: false, mappingFingerprint: undefined };
      enhancementPreferencesRef.current = invalidated;
      setEnhancementPreferences(invalidated);
    }

    // Also update the active panel's stored parameters so they're preserved
    if (selectedPanelId) {
      setPanels(panels => panels.map(p => 
        p.id === selectedPanelId 
          ? {
            ...p,
            parameterValues: newValues,
            ...(changedMedia ? {
              enhancementPreferences: { ...enhancementPreferencesRef.current, referenceOrderConfirmed: false, mappingFingerprint: undefined },
            } : {}),
          }
          : p
      ));
    }
  }, [selectedPanelId]);
  handleParameterChangeRef.current = handleParameterChange;

  const handleEnhancementPreferencesChange = useCallback((preferences: EnhancementPreferences) => {
    enhancementRequestRevisionRef.current += 1;
    const panelId = selectedPanelIdRef.current;
    const panel = panelId === null ? undefined : panelsRef.current.find(item => item.id === panelId);
    const workflowId = selectedWorkflowIdRef.current || panel?.workflowId;
    const workflow = workflowsRef.current.find(item => item.id === workflowId);
    const values = parameterValuesRef.current;
    const snapshot = preferences.referenceOrderConfirmed && workflow
      ? enhancementMappingFingerprint(discoverEnhancementAssets(workflow, values), preferences)
      : undefined;
    const nextPreferences = { ...preferences, mappingFingerprint: snapshot };
    enhancementPreferencesRef.current = nextPreferences;
    setEnhancementPreferences(nextPreferences);
    if (panelId !== null) {
      setPanels(current => current.map(panel => panel.id === panelId
        ? { ...panel, enhancementPreferences: nextPreferences }
        : panel));
    }
  }, []);
  
  const openEnhancementSettings = useCallback((event: React.MouseEvent<HTMLElement>) => {
    const trigger = event.currentTarget;
    enhancementSettingsTriggerRef.current = document.contains(trigger) ? trigger : null;
    setShowEnhancementSettings(true);
  }, []);

  const closeEnhancementSettings = useCallback(() => {
    setShowEnhancementSettings(false);
    const trigger = enhancementSettingsTriggerRef.current;
    enhancementSettingsTriggerRef.current = null;
    if (trigger && document.contains(trigger)) trigger.focus();
  }, []);

  // Settings belong to the selected panel/workflow and must never remain open
  // while another context is active. Use the same close path for focus safety.
  useEffect(() => {
    closeEnhancementSettings();
  }, [selectedPanelId, selectedWorkflowId, closeEnhancementSettings]);

  // Handle camera angle changes for multi-angle LoRA
  const handleCameraAngleChange = useCallback((paramName: string, angle: CameraAngle | null) => {
    setCameraAngles(prev => ({ ...prev, [paramName]: angle }));
  }, []);
  
  // ---------------------------------------------------------------------------
  // Functions - AI Prompt Enhancement
  // ---------------------------------------------------------------------------
  const handleEnhancePrompt = useCallback(async (prompt: string, parameterName?: string): Promise<string | null> => {
    let agentSettings = getAgentSettingsState();
    if (agentSettings.loading) {
      await loadAgentSettings();
      agentSettings = getAgentSettingsState();
    }
    if (agentSettings.loading) throw new Error('Agent settings are still loading. Retry after they finish loading.');
    if (agentSettings.error || !agentSettings.record) throw new Error(agentSettings.error || 'Agent settings are unavailable. Retry from Settings.');
    const isLegacy = agentSettings.record.migrationState === 'legacy_explicit';
    if (!isLegacy && agentSettings.record.migrationState !== 'harness_configured') {
      throw new Error('Choose an authenticated agent model or explicitly select the legacy direct provider in Agent Settings.');
    }
    if (!isLegacy && agentSettings.record.selection?.harnessId !== 'pi' && agentSettings.record.selection?.harnessId !== 'codex') {
      throw new Error(`The selected ${agentSettings.record.selection?.harnessId ?? 'harness'} is not available for prompt enhancement.`);
    }
    const panelId = selectedPanelIdRef.current;
    const panel = panelId === null ? undefined : panelsRef.current.find(item => item.id === panelId);
    const workflowId = selectedWorkflowIdRef.current || panel?.workflowId;
    const workflow = workflowsRef.current.find(item => item.id === workflowId);
    const values = parameterValuesRef.current;
    const valuesAtSubmit = JSON.stringify(values);
    const preferences = panel?.enhancementPreferences || enhancementPreferencesRef.current;
    const preferencesAtSubmit = JSON.stringify(preferences);
    const resolveTarget = (targetPreferences: EnhancementPreferences, targetWorkflow: typeof workflow) => {
      const targetModel = targetPreferences.targetModel?.trim() || '';
      const catalogTarget = enhancementTargetModels.find(item => item.id === targetModel);
      const targetProfile = enhancementProfiles.find(item => item.target_model === targetModel);
      const catalogCategory = catalogTarget?.category?.trim().toLowerCase();
      const workflowIsVideo = isVideoWorkflow(targetWorkflow);
      const confirmedExplicitImage = Boolean(targetModel && catalogCategory === 'image');
      const targetClassificationKnown = Boolean(targetProfile || catalogTarget);
      const targetClassificationError = !targetModel
        ? 'Select a target model in Storyboard Console preferences before enhancing.'
        : !targetClassificationKnown
          ? (enhancementTargetModelsLoading || enhancementProfilesLoading
            ? `Target model "${targetModel}" is still loading. Retry after the target catalog and profiles finish loading.`
            : `Target model "${targetModel}" is unavailable${enhancementTargetModelsError || enhancementProfilesError
              ? `: ${enhancementTargetModelsError || enhancementProfilesError}`
              : '.'} Retry after the target catalog and profiles load.`)
          : undefined;
      const isVideoTarget = !confirmedExplicitImage && (
        catalogCategory === 'video'
        || Boolean(targetProfile)
        || workflowIsVideo
      );
      return { targetModel, targetProfile, isVideoTarget, isImageTarget: confirmedExplicitImage, targetClassificationError };
    };
    const effectiveTargetAtSubmit = resolveTarget(preferences, workflow);
    const profile = effectiveTargetAtSubmit.targetProfile;

    if (!workflow) {
      showError('Select a workflow before enhancing.');
      throw new Error('Select a workflow before enhancing.');
    }
    if (effectiveTargetAtSubmit.targetClassificationError) {
      showError(effectiveTargetAtSubmit.targetClassificationError);
      throw new Error(effectiveTargetAtSubmit.targetClassificationError);
    }
    if (effectiveTargetAtSubmit.isVideoTarget && !profile) {
      const message = enhancementProfilesLoading
        ? 'Video enhancement profiles are still loading. Retry after they finish loading.'
        : `Video enhancement profiles are unavailable${enhancementProfilesError ? `: ${enhancementProfilesError}` : '.'} Retry before enhancing.`;
      showError(message);
      throw new Error(message);
    }

    const built = effectiveTargetAtSubmit.isVideoTarget && profile
      ? buildEnhancementContext(workflow, values, profile, preferences)
      : undefined;
    if (effectiveTargetAtSubmit.isVideoTarget && profile && !built?.context) {
      showError(built?.error || 'The media mapping is not ready.');
      throw new Error(built?.error || 'The media mapping is not ready.');
    }
    const requestedPrompt = prompt.trim();
    const mappingAtSubmit = built?.mappingFingerprint;
    const workflowAtSubmit = workflow.id;
    const workflowSnapshotAtSubmit = JSON.stringify(workflow);
    const panelAtSubmit = panelId;
    const targetModelAtSubmit = effectiveTargetAtSubmit.targetModel;
    const requestRevision = enhancementRequestRevisionRef.current;
    const projectAtSubmit = projectManager.getSessionIdentity();
    const agentFingerprint = isLegacy ? null : getAgentExecutionFingerprint('prompt-enhancement');
    const context = built?.context;
    const hasFirstFrame = context?.assets.some(asset => asset.role === 'first_frame');
    const hasLastFrame = context?.assets.some(asset => asset.role === 'last_frame');
    const imageRouteCategories = [...new Set(getWorkflowRoutes(workflow)
      .map(route => route.category)
      .filter(category => category === 'image-editing' || category === 'image-generation'))];
    const task: StandalonePromptInput['task'] = context
      ? hasFirstFrame && hasLastFrame
        ? 'first_last'
        : context.task === 'ref2v'
          ? context.assets.length > 1 ? 'multi_reference' : 'reference'
          : context.task
      : effectiveTargetAtSubmit.isImageTarget && imageRouteCategories.length === 1
        ? imageRouteCategories[0] === 'image-editing' ? 'edit' : 't2i'
        : undefined;
    const enhancementInput: StandalonePromptInput = {
      userPrompt: requestedPrompt,
      targetModel: targetModelAtSubmit,
      ...(task ? { task } : {}),
      ...(context ? {
        enhancementContext: {
          task: context.task,
          referenceDialect: context.reference_dialect,
          durationSeconds: context.duration_seconds,
          assets: context.assets.map(asset => ({
            bindingId: asset.binding_id,
            kind: asset.kind,
            role: asset.role,
            ordinal: asset.ordinal,
            label: asset.label,
            description: asset.description,
            referenceName: asset.reference_name,
          })),
          referenceOrderConfirmed: context.reference_order_confirmed,
        },
      } : {}),
    };
    enhancementAbortControllerRef.current?.abort();
    const requestController = new AbortController();
    enhancementAbortControllerRef.current = requestController;
    enhancementUsesAgentRef.current = !isLegacy;
    setIsPromptEnhancementRunning(true);

    try {
      let enhancedPrompt: string;
      if (isLegacy) {
        const llmSettings = getSelectedLlmSettings();
        if (!llmSettings) throw new Error('No legacy provider is selected. Configure it in Settings.');
        const provider = getConfiguredProviders().find(item => item.providerId === llmSettings.provider);
        if (!provider) throw new Error('Selected legacy provider was not found. Configure it in Settings.');
        const submittedOAuthToken = provider.credentials.oauthToken;
        const result = await api.enhanceStandalonePrompt({
          ...enhancementInput,
          llmProvider: llmSettings.provider,
          llmModel: llmSettings.model,
          credentials: {
            apiKey: provider.credentials.apiKey,
            endpoint: provider.credentials.endpoint,
            oauthToken: provider.credentials.oauthToken,
          },
          signal: requestController.signal,
        });
        // OAuth refresh is independent of prompt freshness, but never crosses accounts.
        const currentProvider = getConfiguredProviders().find(item => item.providerId === llmSettings.provider);
        if (result.oauth_token && submittedOAuthToken
          && getSelectedLlmSettings()?.provider === llmSettings.provider
          && currentProvider?.credentials.oauthToken === submittedOAuthToken) {
          updateSavedOAuthToken(llmSettings.provider, result.oauth_token);
        }
        if (!result.success) throw new Error(result.error || 'Enhancement failed.');
        enhancedPrompt = result.enhanced_prompt;
      } else {
        const result = await enhanceConsolePromptWithPi(enhancementInput, {
          signal: requestController.signal,
        });
        result.warnings.forEach(warning => showWarning(warning));
        enhancedPrompt = result.enhanced_prompt;
      }

      const currentPanel = panelAtSubmit === null ? undefined : panelsRef.current.find(item => item.id === panelAtSubmit);
      const currentWorkflowId = panelAtSubmit === null
        ? selectedWorkflowIdRef.current
        : (selectedPanelIdRef.current === panelAtSubmit
          ? (selectedWorkflowIdRef.current || currentPanel?.workflowId)
          : currentPanel?.workflowId);
      const currentValues = panelAtSubmit === null || selectedPanelIdRef.current === panelAtSubmit
        ? parameterValuesRef.current
        : (currentPanel?.parameterValues || {});
      const currentPreferences = currentPanel?.enhancementPreferences || enhancementPreferencesRef.current;
      const currentWorkflow = workflowsRef.current.find(item => item.id === currentWorkflowId) || workflow;
      const currentTarget = resolveTarget(currentPreferences, currentWorkflow);
      const currentMapping = currentTarget.isVideoTarget && currentTarget.targetProfile
        ? buildEnhancementContext(currentWorkflow, currentValues, currentTarget.targetProfile, currentPreferences)
        : undefined;
      const promptStillCurrent = !parameterName || String(currentValues[parameterName] ?? '').trim() === requestedPrompt;
      const contentStillCurrent = requestRevision === enhancementRequestRevisionRef.current
        && projectManager.getSessionIdentity() === projectAtSubmit
        && (isLegacy || agentFingerprint === getAgentExecutionFingerprint('prompt-enhancement'))
        && panelAtSubmit === selectedPanelIdRef.current
        && currentWorkflowId === workflowAtSubmit
        && JSON.stringify(currentWorkflow) === workflowSnapshotAtSubmit
        && JSON.stringify(currentValues) === valuesAtSubmit
        && JSON.stringify(currentPreferences) === preferencesAtSubmit
        && currentPreferences.targetModel === preferences.targetModel
        && currentPreferences.referenceDialect === preferences.referenceDialect
        && promptStillCurrent
        && currentTarget.targetModel === targetModelAtSubmit
        && (profile
          ? currentTarget.targetProfile?.target_model === profile.target_model
            && currentMapping?.mappingFingerprint === mappingAtSubmit
          : true);
      if (!contentStillCurrent) {
        showWarning('Enhancement discarded because the prompt, panel, workflow, target, model, project, or media mapping changed.');
        return null;
      }

      showInfo('Prompt enhanced successfully');
      return enhancedPrompt;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to enhance prompt';
      if (requestController.signal.aborted) return null;
      if (!/discarded as stale/i.test(errorMsg)) showError(errorMsg);
      if (/discarded as stale/i.test(errorMsg)) return null;
      throw error;
    } finally {
      if (enhancementAbortControllerRef.current === requestController) {
        enhancementAbortControllerRef.current = null;
        enhancementUsesAgentRef.current = false;
        setIsPromptEnhancementRunning(false);
      }
    }
  }, [enhancementProfiles, enhancementProfilesLoading, enhancementProfilesError, enhancementTargetModels, enhancementTargetModelsLoading, enhancementTargetModelsError, showInfo, showWarning, showError]);
  
  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------
  const formatTime = (date: Date) => {
    return date.toTimeString().split(' ')[0];
  };
  
  const getFilteredWorkflows = () => filterWorkflowsByRoute(workflows, activeTab, activeSubTab);
  
  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
  const selectedEnhancementPanel = selectedPanelId === null ? undefined : panels.find(panel => panel.id === selectedPanelId);
  const selectedEnhancementValues = parameterValuesRef.current;
  const selectedEnhancementPreferences = selectedEnhancementPanel?.enhancementPreferences || enhancementPreferences;
  const enhancementDuration = selectedWorkflow
    ? getEffectiveDuration(selectedWorkflow, selectedEnhancementValues)
    : undefined;
  const enhancementAssets = selectedWorkflow
    ? discoverEnhancementAssets(selectedWorkflow, selectedEnhancementValues).map(asset => ({
      ...asset,
      ...selectedEnhancementPreferences.assets?.[asset.binding_id],
      include: selectedEnhancementPreferences.assets?.[asset.binding_id]?.include ?? asset.include,
    }))
    : [];
  const exposedParameters = selectedWorkflow?.config.filter(c => c.exposed) || [];
  
  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  
  // Save project handler
  const handleSaveProject = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    await sessionDraftController.flush();
    try {
      await flushPendingWorkflowSave();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Project was not saved because workflow changes were not saved: ${message}`);
      return { success: false, error: message };
    }
    const result = await saveProjectAndRecordRecent(
      projectSettings.name || 'Untitled',
      () => persistProjectStateSnapshot(
        panelsRef.current,
        parameterValuesRef.current,
        selectedWorkflowIdRef.current || undefined,
      ),
    );
    if (!result.success || !result.savedPath) {
      const error = result.error || 'The project was not saved.';
      showError(`Failed to save project: ${error}`);
      return { success: false, error };
    }

    const targetSettings = { ...projectManager.getProject(), projectFilePath: result.savedPath };
    try {
      await activateSessionIdentity(sessionDraftController, projectManager.getSessionIdentity(targetSettings));
      projectScopeRef.current.bindingId = crypto.randomUUID();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Saved project, but recovery identity did not switch: ${message}`);
      return { success: false, error: message };
    }
    projectManager.setProject({ projectFilePath: result.savedPath });
    sessionDraftController.clearFailure();
    showInfo(`Project saved to ${result.savedPath}`);
    return { success: true };
  }, [flushPendingWorkflowSave, persistProjectStateSnapshot, projectSettings.name, showInfo, showError]);

  // Save project as handler - opens file browser dialog for new location/name
  const handleSaveProjectAs = useCallback(() => {
    setFileBrowserMode('save');
  }, []);
  
  // Load project handler - opens file browser dialog to select project
  const handleLoadProject = useCallback(() => {
    setFileBrowserMode('open');
  }, []);

  // Load a recent project directly by its saved path
  const handleLoadRecentProject = (projectFilePath: string) => {
    handleLoadFromDialog(projectFilePath);
  };

  // Handle save from file browser dialog
  const handleSaveFromDialog = async (folderPath: string, projectName: string) => {
    await sessionDraftController.flush();
    try {
      await flushPendingWorkflowSave();
    } catch (error) {
      showError(`Project was not saved because workflow changes were not saved: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }
    const previousSettings = projectManager.getProject();
    const targetSettings: ProjectSettings = {
      ...previousSettings,
      name: projectName,
      path: folderPath,
      projectFilePath: undefined,
      created: new Date(),
      lastModified: new Date(),
    };

    const result = await saveProjectAndRecordRecent(
      projectName,
      () => persistProjectStateSnapshot(
        panelsRef.current,
        parameterValuesRef.current,
        selectedWorkflowIdRef.current || undefined,
        targetSettings,
      ),
    );

    if (!result.success || !result.savedPath) {
      showError(`Failed to save project: ${result.error || 'The project was not saved.'}`);
      return;
    }

    const savedSettings: ProjectSettings = { ...targetSettings, projectFilePath: result.savedPath };
    try {
      await activateSessionIdentity(sessionDraftController, projectManager.getSessionIdentity(savedSettings));
      projectScopeRef.current.bindingId = crypto.randomUUID();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(`Failed to switch recovery identity after Save As: ${message}`);
      return;
    }
    projectManager.restoreFromSession(savedSettings);
    setProjectSettings(savedSettings);
    sessionDraftController.clearFailure();
    showInfo(`Project saved to ${result.savedPath}`);
    setFileBrowserMode(null);
  };

  // Phase 3: New load handler with folder scanning
  const handleLoadFromDialog = async (projectPath: string, control?: { assertCurrent: () => void; discard?: boolean }): Promise<boolean> => {
    try {
      control?.assertCurrent();
      // Flush the old identity before any load can replace it.
      await sessionDraftController.flush();
      control?.assertCurrent();
    } catch (error) {
      console.error('[Load] Failed to load project:', error);
      showError(`Failed to load project: ${String(error)}`);
      return false;
    }
    if (sessionDraftController.getStatus().state === 'failed') {
      showError('Autosave unavailable — save manually before switching projects.');
      return false;
    }
    const previousProjectSettings = projectManager.getProject();
    // Close the file browser dialog immediately so the loading overlay is visible
    setFileBrowserMode(null);
    
    // Remember the current orchestrator URL before loadProjectState overwrites it
    const currentOrchestratorUrl = previousProjectSettings.orchestratorUrl || getDefaultOrchestratorUrl();
    
    // Derive the project directory from the selected file path
    // Handle both / (Linux/macOS) and \ (Windows) separators
    const lastSlash = Math.max(projectPath.lastIndexOf('/'), projectPath.lastIndexOf('\\'));
    const projectDir = lastSlash > 0 ? projectPath.substring(0, lastSlash) : projectPath;
    
    // Show loading progress
    setIsLoadingProject(true);
    setLoadingProgress({ progress: 0, currentFile: 'Loading project data...' });
    
    try {
      const result = await loadProjectAndRecordRecent(
        projectPath,
        () => projectManager.loadProjectState(projectPath, { commitSettings: false }),
      );
      control?.assertCurrent();
      
      if (!result.success || !result.state) {
        showError(`Failed to load project: ${result.error}`);
        return false;
      }
      const loadedState = result.state;
      
      // Keep loaded settings local until both the file read and filesystem scan succeed.
      const loadedSettings = result.state.project_settings || previousProjectSettings;
      const targetProjectSettings: ProjectSettings = {
        ...previousProjectSettings,
        ...loadedSettings,
        path: projectDir,
        projectFilePath: projectPath,
        orchestratorUrl: currentOrchestratorUrl,
        created: new Date(loadedSettings.created || Date.now()),
        lastModified: new Date(loadedSettings.lastModified || Date.now()),
      };

      // Get deleted images from saved state
      const savedDeletedImages = new Set<string>(result.state.deleted_images || []);

      // NEW APPROACH: Scan project for all panel folders
      setLoadingProgress({ progress: 10, currentFile: 'Scanning project panels...' });
      
      const scanResult = await projectManager.scanProjectPanels(targetProjectSettings);
      control?.assertCurrent();
      
      if (!scanResult.success) {
        console.error('[Load] Failed to scan project panels:', scanResult.error);
        showError(`Failed to scan project: ${scanResult.error}`);
        // A failed switch must leave the previous project and its in-memory work untouched.
        return false;
      }

      setLoadingProgress({ progress: 50, currentFile: 'Building panels...' });

      // Build panels from scanned folders
      // Each folder becomes a panel, named after the folder
      const orchestratorUrl = targetProjectSettings.orchestratorUrl || getDefaultOrchestratorUrl();
      const restoredPanels: Panel[] = [];
      const usedIds = new Set<number>();

      // Helper to get next unique ID
      const getNextUniqueId = (): number => {
        let nextId = 1;
        while (usedIds.has(nextId)) nextId++;
        usedIds.add(nextId);
        return nextId;
      };

      // STEP 1: Match scanned folders to saved panels by name
      const savedPanels = result.state.panels as Panel[];
      const matchedSavedPanels = new Set<Panel>();
      const matchedFolderNames = new Set<string>();

      // First pass: exact name matches
      for (const panelFolder of scanResult.panels) {
        const savedPanel = savedPanels.find(p => p.name === panelFolder.panel_name);
        if (savedPanel && savedPanel.name) {
          matchedSavedPanels.add(savedPanel);
          matchedFolderNames.add(panelFolder.panel_name);
        }
      }

      // STEP 2: For unmatched folders and unmatched saved panels, pair by sorted order
      // This handles the rename case: if you renamed "Panel_01" to "Hero_Shot",
      // the unmatched saved "Panel_01" gets paired with unmatched folder "Hero_Shot"
      const unmatchedFolders = scanResult.panels.filter(pf => !matchedFolderNames.has(pf.panel_name));
      const unmatchedSaved = savedPanels.filter(p => !matchedSavedPanels.has(p));
      const fallbackPairs = new Map<string, Panel>(); // folder name -> saved panel
      for (let i = 0; i < unmatchedFolders.length && i < unmatchedSaved.length; i++) {
        fallbackPairs.set(unmatchedFolders[i].panel_name, unmatchedSaved[i]);
        matchedSavedPanels.add(unmatchedSaved[i]);
        console.log(`[Load] Paired renamed folder "${unmatchedFolders[i].panel_name}" with saved panel "${unmatchedSaved[i].name}"`);
      }

      // STEP 3: Build panels from scanned folders
      // ALL folders get a panel — even empty ones (created by teammates).
      for (const panelFolder of scanResult.panels) {
        // Filter out deleted images, then sort by modified_time ascending
        // so oldest (v001) is index 0 and newest is last.
        const validImages = panelFolder.images
          .filter(img => !savedDeletedImages.has(img.image_path))
          .sort((a, b) => a.modified_time - b.modified_time);

        // Try to find saved panel data: first by exact name, then by fallback pair
        const savedPanel = savedPanels.find(p => p.name === panelFolder.panel_name)
          || fallbackPairs.get(panelFolder.panel_name)
          || undefined;

        // DEBUG: Log what we found
        console.log('[Load] Panel folder:', panelFolder.panel_name, 'images:', validImages.length, 'Saved panel found:', savedPanel ? {
          name: savedPanel.name,
          notes: savedPanel.notes,
          imageRatings: (savedPanel as Panel & { imageRatings?: Record<string, number> })?.imageRatings,
        } : 'NOT FOUND');

        // Get saved image ratings for this panel
        const savedImageRatings = (savedPanel as Panel & { imageRatings?: Record<string, number> })?.imageRatings || {};

        // Build image history from scanned images (already sorted oldest→newest)
        const imageHistory: ImageHistoryEntry[] = validImages.map((img, index) => ({
          id: `${panelFolder.panel_name}_v${index + 1}`,
          url: `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(img.image_path)}`,
          metadata: {
            timestamp: new Date(img.modified_time * 1000),
            workflowId: '',
            workflowName: 'Loaded',
            seed: 0,
            promptSummary: '',
            parameters: {},
            workflow: {},
            sourceUrl: '',
            savedPath: img.image_path,
            version: index + 1,
            rating: savedImageRatings[img.image_path], // Restore saved rating
          } as ImageMetadata
        }));

        // Use saved panel ID if available and not already taken, otherwise assign unique
        let usePanelId: number;
        if (savedPanel?.id && !usedIds.has(savedPanel.id)) {
          usePanelId = savedPanel.id;
          usedIds.add(usePanelId);
        } else {
          usePanelId = getNextUniqueId();
        }

        const panelIndex = restoredPanels.length;
        restoredPanels.push({
          id: usePanelId,
          name: panelFolder.panel_name,
          x: savedPanel?.x ?? calculateNewPanelX(panelIndex + 1, panelIndex + 1),
          y: savedPanel?.y ?? calculateNewPanelY(panelIndex + 1, panelIndex + 1),
          width: savedPanel?.width ?? 300,
          height: savedPanel?.height ?? 300,
          notes: savedPanel?.notes ?? '',
          workflowId: savedPanel?.workflowId,
          parameterValues: savedPanel?.parameterValues,
          enhancementPreferences: savedPanel?.enhancementPreferences,
          nodeId: savedPanel?.nodeId,
          imageHistory,
          historyIndex: imageHistory.length > 0 ? imageHistory.length - 1 : -1,
          image: imageHistory.length > 0 ? imageHistory[imageHistory.length - 1]?.url ?? null : null,
          images: [],
          currentImageIndex: 0,
          status: imageHistory.length > 0 ? 'complete' : 'empty',
          progress: imageHistory.length > 0 ? 100 : 0,
          locked: savedPanel?.locked ?? false,
          selected: false,
        });
      }

      // STEP 4: Restore saved panels that have no folder AND weren't paired with renamed folders
      for (const savedPanel of savedPanels) {
        if (matchedSavedPanels.has(savedPanel)) continue;
          // Panel exists in save file but has no folder - restore it empty
          // Use saved ID if not already taken, otherwise assign unique
          let emptyPanelId: number;
          if (savedPanel.id && !usedIds.has(savedPanel.id)) {
            emptyPanelId = savedPanel.id;
            usedIds.add(emptyPanelId);
          } else {
            emptyPanelId = getNextUniqueId();
          }
          restoredPanels.push({
            id: emptyPanelId,
            name: savedPanel.name,
            x: savedPanel.x,
            y: savedPanel.y,
            width: savedPanel.width ?? 300,
            height: savedPanel.height ?? 300,
            notes: savedPanel.notes ?? '',
            workflowId: savedPanel.workflowId,
            parameterValues: savedPanel.parameterValues,
            enhancementPreferences: savedPanel.enhancementPreferences,
            nodeId: savedPanel.nodeId,
            imageHistory: [],
            historyIndex: -1,
            image: null,
            images: [],
            currentImageIndex: 0,
            status: 'empty',
            progress: 0,
            locked: false,
            selected: false,
          });
      }

      // Sort panels by ID for consistent ordering
      restoredPanels.sort((a, b) => a.id - b.id);

      // NOTE: __fileref:: markers in parameterValues are intentionally NOT resolved
      // on project load. Reference images will be loaded on-demand when the user
      // selects a panel and explicitly restores its workflow parameters.
      setLoadingProgress({ progress: 70, currentFile: 'Finalizing panels...' });

      // The filesystem load is now complete; only now make project B active.
      try {
        control?.assertCurrent();
        await activateSessionIdentity(sessionDraftController, projectManager.getSessionIdentity(targetProjectSettings), {
          assertCurrent: control?.assertCurrent,
          discard: control?.discard,
          commit: () => {
            projectScopeRef.current.bindingId = crypto.randomUUID();
            projectManager.restoreFromSession(targetProjectSettings);
            setProjectSettings(targetProjectSettings);
            setPanels(restoredPanels);
            setDeletedImages(savedDeletedImages);
            const parameterValues = loadedState.parameter_values || {};
            setParameterValues(parameterValues);
            parameterValuesRef.current = parameterValues;
            setCameraAngles((loadedState.camera_angles || {}) as Record<string, CameraAngle | null>);
            const enhancementPreferences = loadedState.enhancement_preferences || EMPTY_ENHANCEMENT_PREFERENCES;
            setEnhancementPreferences(enhancementPreferences);
            enhancementPreferencesRef.current = enhancementPreferences;
            setGlobalPromptOverride(loadedState.global_prompt_override || '');
            setUseGlobalPrompt(loadedState.use_global_prompt ?? false);
            const selectedWorkflowId = loadedState.selected_workflow_id || null;
            setSelectedWorkflowId(selectedWorkflowId);
            selectedWorkflowIdRef.current = selectedWorkflowId;
            if (loadedState.comfy_url) setComfyUrl(loadedState.comfy_url);
            projectSavedFingerprintRef.current = projectStateFingerprint({
              ...readCurrentProjectState(), panels: restoredPanels, parameters: parameterValues,
              selectedWorkflowId, settings: targetProjectSettings,
              cameraAngles: (loadedState.camera_angles || {}) as Record<string, CameraAngle | null>,
              enhancementPreferences, deletedImages: [...savedDeletedImages].sort(),
              globalPromptOverride: loadedState.global_prompt_override || '', useGlobalPrompt: loadedState.use_global_prompt ?? false,
              comfyUrl: loadedState.comfy_url || projectComparisonStateRef.current.comfyUrl,
            });
          },
        });
      } catch (error) {
        throw new Error(`Recovery identity could not switch: ${error instanceof Error ? error.message : String(error)}`);
      }
      
      // Workflows are NOT restored from project files — they are managed
      // independently via the persistent workflow storage backend
      
      setLoadingProgress({ progress: 100, currentFile: 'Complete!' });
      
      // Calculate total images
      let totalImages = 0;
      restoredPanels.forEach(p => totalImages += p.imageHistory.length);
      showInfo(`Loaded project with ${restoredPanels.length} panels, ${totalImages} images`);
      return true;
      
    } catch (error) {
      console.error('[Load] Failed to load project:', error);
      showError(`Failed to load project: ${String(error)}`);
      return false;
    } finally {
      setIsLoadingProject(false);
    }
  };
  
  // Handle folder selection from the browser
  const handleLoadProjectFolderSelect = async (folderPath: string) => {
    setSelectedLoadPath(folderPath);
    setIsLoadingProjects(true);
    
    try {
      const result = await projectManager.listProjects(folderPath);
      
      if (result.success && result.projects.length > 0) {
        setAvailableProjects(result.projects);
      } else if (result.success) {
        showError('No project files found in the selected folder');
        setAvailableProjects([]);
      } else {
        showError(`Failed to list projects: ${result.error}`);
        setAvailableProjects([]);
      }
    } catch (err) {
      showError(`Error loading projects: ${err}`);
      setAvailableProjects([]);
    } finally {
      setIsLoadingProjects(false);
    }
  };
  
  // Handle loading a specific project file
  const handleLoadSelectedProject = async (projectPath: string) => {
    if (await handleLoadFromDialog(projectPath)) {
      setShowLoadProjectBrowser(false);
      setAvailableProjects([]);
    }
  };

  // Phase 6: Handle image delete with confirmation
  // CRITICAL FIX: Use entryId instead of historyIndex to handle stale indices
  const handleDeleteImage = (panelId: number, entryId: string) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    
    // Look up entry by ID to get current info
    const entry = panel.imageHistory.find(h => h.id === entryId);
    if (!entry) {
      console.error('[Delete] Entry not found:', entryId);
      showError('Cannot delete: image entry not found');
      return;
    }
    
    const filename = entry?.metadata?.savedPath 
      ? extractFilename(entry.metadata.savedPath)
      : extractFilename(entry.url) || 'image';
    
    if (suppressDeleteConfirm) {
      executeDelete(panelId, entryId);
    } else {
      setDeleteConfirm({
        isOpen: true,
        panelId,
        entryId,
        filename,
      });
    }
  };
  
  // Phase 6: Execute the actual delete
  const executeDelete = async (panelId: number, entryId: string) => {
    const panel = panels.find(p => p.id === panelId);
    if (!panel) return;
    
    // CRITICAL FIX: Look up entry by ID to get current index (handles stale indices)
    const historyIndex = panel.imageHistory.findIndex(h => h.id === entryId);
    if (historyIndex === -1) {
      console.error('[Delete] Entry not found:', entryId);
      showError('Cannot delete: image entry not found');
      return;
    }
    
    const entry = panel.imageHistory[historyIndex];
    const imagePath = entry?.metadata?.savedPath;
    
    // CRITICAL FIX: Track whether we should remove from UI
    let shouldRemoveFromUI = true;
    
    // Delete from filesystem if path exists
    if (imagePath) {
      console.log('[Delete] Attempting to delete:', imagePath);
      const result = await projectManager.deleteImage(imagePath);
      console.log('[Delete] Result:', result);
      
      if (result.success) {
        setDeletedImages(prev => new Set([...prev, imagePath]));
        showInfo(`Moved to trash: ${extractFilename(imagePath)}`);
      } else {
        console.error('[Delete] Failed:', result.error);
        showError(`Move to trash failed: ${result.error || 'Unknown error'}`);
        // CRITICAL FIX: Don't remove from UI if backend delete failed
        shouldRemoveFromUI = false;
      }
    } else {
      console.warn('[Delete] No savedPath in entry metadata - removing from UI only:', entry?.metadata);
      // If no savedPath, it's a memory-only image, so we can safely remove from UI
    }
    
    // CRITICAL FIX: Only remove from panel's imageHistory if delete succeeded or no path
    if (shouldRemoveFromUI) {
      setPanels(prev => prev.map(p => {
        if (p.id !== panelId) return p;
        
        // Re-find index in case it changed during async delete
        const currentIndex = p.imageHistory.findIndex(h => h.id === entryId);
        if (currentIndex === -1) return p; // Already deleted
        
        const newHistory = [...p.imageHistory];
        newHistory.splice(currentIndex, 1);
        
        // Adjust current index
        let newHistoryIndex = p.historyIndex;
        if (currentIndex <= p.historyIndex) {
          newHistoryIndex = Math.max(0, p.historyIndex - 1);
        }
        if (newHistory.length === 0) {
          newHistoryIndex = -1;
        }
        
        return {
          ...p,
          imageHistory: newHistory,
          historyIndex: newHistoryIndex,
          image: newHistory.length > 0 ? newHistory[newHistoryIndex]?.url : null,
          status: newHistory.length > 0 ? 'complete' : 'empty',
        };
      }));
    }
  };
  
  // Handle restarting all ComfyUI backends
  const handleRestartNodes = async () => {
    if (renderNodes.length === 0) {
      showError('No render nodes available to restart.');
      return;
    }

    setIsRestartingNodes(true);
    showInfo('Restarting all ComfyUI backends...');

    try {
      const results = await orchestratorManager.restartAllBackends();
      
      const successCount = results.filter(r => r.success).length;
      const failCount = results.length - successCount;

      if (failCount === 0) {
        showInfo(`Successfully restarted ${successCount} backend(s)`);
      } else if (successCount === 0) {
        showError(`Failed to restart all ${failCount} backend(s). Check the console for details.`);
      } else {
        showInfo(`Restarted ${successCount} backend(s), ${failCount} failed. Check the console for details.`);
      }

      // Log detailed results
      results.forEach(result => {
        if (result.success) {
          console.log(`[Restart] ${result.backendId}: ${result.message}`);
        } else {
          console.error(`[Restart] ${result.backendId}: ${result.message}`);
        }
      });
    } catch (err) {
      showError(`Error restarting nodes: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('[Restart] Error:', err);
    } finally {
      setIsRestartingNodes(false);
    }
  };

  // Cancel only prompts submitted by this canvas, not other users' work on busy nodes.
  const cancelGenerations = async (panelId?: number, nodeId?: string) => {
    const jobs = [...activeGenerationsRef.current.values()].filter(job =>
      !job.finishing &&
      (panelId === undefined || job.panelId === panelId) &&
      (nodeId === undefined || job.nodeId === nodeId)
    );
    if (!jobs.length) {
      showInfo('No submitted prompts to cancel. If submission is still in progress, try again once queued.');
      return;
    }
    let cancelled = 0;
    let blockedByOtherRunning = 0;
    let nodeWideInterrupts = 0;
    // Sequential requests avoid competing interrupts on a shared render node.
    for (const job of jobs) {
      const backend = renderNodes.find(node => node.id === job.nodeId);
      if (!backend) continue;
      const queueResponse = await fetch(`${backend.url.replace(/\/+$/, '')}/queue`, { signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => null);
      if (!queueResponse?.ok) continue;
      const queue = await queueResponse.json().catch(() => null) as Record<string, unknown> | null;
      const running = Array.isArray(queue?.queue_running) ? queue.queue_running : [];
      const pending = Array.isArray(queue?.queue_pending) ? queue.queue_pending : [];
      const hasPrompt = (entries: unknown[]) => entries.some(entry => Array.isArray(entry) && entry[1] === job.promptId);
      if (hasPrompt(running) && running.length > 1) {
        blockedByOtherRunning++;
        continue;
      }
      if (!hasPrompt(running) && !hasPrompt(pending)) continue;
      if (hasPrompt(running)) nodeWideInterrupts++;
      if (await job.ws.cancelGeneration(job.promptId)) cancelled++;
    }
    if (cancelled) showWarning(`Cancelled ${cancelled} generation(s)`);
    if (nodeWideInterrupts) showWarning(`${nodeWideInterrupts} running-prompt cancellation(s) may use ComfyUI's node-wide interrupt; only the targeted prompt was running at the preflight check.`);
    if (blockedByOtherRunning) showWarning(`${blockedByOtherRunning} prompt(s) were left running because ComfyUI interrupt is node-wide and other prompts were active on the same backend.`);
    if (cancelled < jobs.length) {
      showInfo(`${jobs.length - cancelled} prompt(s) already finished or could not be cancelled; tracking remains active.`);
    }
  };

  const applicationHandlersRef = useRef<ApplicationActionHandlers | null>(null);
  const preparedConsolePromptsRef = useRef(new Map<string, {
    projectIdentity: string;
    projectRevision: number;
    consoleBindingId: string;
    turnId: string;
    userRequest: string;
  }>());
  const applicationError = (code: string, message: string): Error & { code: string } => Object.assign(new Error(message), { code });
  const assertApplicationProject = (command: ApplicationCommand, requireRevision = true) => {
    if (!isApplicationCommandCurrent(command)) throw applicationError('action_no_longer_current', 'The initiating agent action ended; no further writes were started. Inspect any writes already submitted.');
    if (command.expectedConsoleBindingId !== undefined && command.expectedConsoleBindingId !== projectScopeRef.current.bindingId) throw applicationError('stale_console_binding', 'The Console project activation changed; this command was not retargeted.');
    if (command.projectIdentity !== projectScopeRef.current.identity) throw applicationError('project_scope_mismatch', 'The action targets a project other than the currently paired Storyboard project.');
    if (requireRevision && command.expectedProjectRevision !== projectScopeRef.current.revision) throw applicationError('stale_project', 'The project changed after this action was prepared. Refresh the application snapshot and retry.');
  };
  const isApplicationProjectCurrent = (command: ApplicationCommand): boolean =>
    isApplicationCommandCurrent(command)
    && (command.expectedConsoleBindingId === undefined || command.expectedConsoleBindingId === projectScopeRef.current.bindingId)
    && command.projectIdentity === projectScopeRef.current.identity
    && command.expectedProjectRevision === projectScopeRef.current.revision;
  const assertApplicationPanel = (command: ApplicationCommand, panelId: number): Panel => {
    if (!isApplicationCommandCurrent(command)) throw applicationError('action_no_longer_current', 'The initiating agent action ended. Inspect any writes already submitted.');
    if (command.expectedPanelRevision === undefined || command.expectedPanelRevision !== panelRevisionRef.current.get(panelId)) {
      throw applicationError('stale_panel', 'The panel changed after this action was prepared. Refresh the application snapshot and retry.');
    }
    const panel = panelsRef.current.find(item => item.id === panelId);
    if (!panel) throw applicationError('panel_not_found', `Panel ${panelId} no longer exists.`);
    return panel;
  };
  const assertApplicationWorkflow = (command: ApplicationCommand, workflowId: string): Workflow => {
    if (!isApplicationCommandCurrent(command)) throw applicationError('action_no_longer_current', 'The initiating agent action ended. Inspect any writes already submitted.');
    if (command.expectedWorkflowRevision === undefined) throw applicationError('workflow_revision_required', 'A workflow revision is required for this action.');
    const workflow = workflowsRef.current.find(item => item.id === workflowId);
    if (!workflow) throw applicationError('workflow_not_found', `Workflow '${workflowId}' is no longer available.`);
    if (workflow.revision !== command.expectedWorkflowRevision) throw applicationError('stale_workflow', 'The workflow changed after this action was prepared. Refresh the application snapshot and retry.');
    return workflow;
  };
  const assertPanelWorkflow = (panel: Panel, workflowId: string): void => {
    if (panel.workflowId !== workflowId) throw applicationError('panel_workflow_mismatch', 'Attach this workflow to the panel before editing its parameters or generating from it.');
  };
  const requireApplicationBackend = (backendId: string, requireOnline = true) => {
    const backend = orchestratorManager.getNodes().find(node => node.id === backendId);
    if (!backend || requireOnline && backend.status !== 'online') {
      throw applicationError('backend_unavailable', `Managed backend '${backendId}' is missing or offline.`);
    }
    return backend;
  };
  const requireSelectedApplicationBackend = (backendId: string, requireOnline = true) => {
    const backend = requireApplicationBackend(backendId, requireOnline);
    if (!selectedBackendIdsRef.current.includes(backendId)) throw applicationError('backend_not_selected', `Managed backend '${backendId}' is not selected in Storyboard.`);
    return backend;
  };
  const assertApplicationBackendsSelected = (backends: Array<{ id: string }>) => {
    if (backends.some(backend => !selectedBackendIdsRef.current.includes(backend.id))) {
      throw applicationError('backend_selection_changed', 'The selected managed backends changed during this action. Refresh the application snapshot before continuing.');
    }
  };
  const saveProjectSnapshot = async (
    panelsSnapshot: Panel[],
    parameters: Record<string, unknown>,
    workflowId: string | undefined,
    settings: ProjectSettings,
  ) => {
    const result = await persistProjectStateSnapshot(panelsSnapshot, parameters, workflowId, settings);
    if (!result.success) throw applicationError('project_save_failed', result.error || 'The project panel changes were not saved.');
    return result;
  };
  const repairCurrentProjectSnapshot = async (settings: ProjectSettings) => {
    const currentPanelId = selectedPanelIdRef.current;
    const currentPanel = currentPanelId === null ? undefined : panelsRef.current.find(panel => panel.id === currentPanelId);
    const currentParameters = currentPanel?.parameterValues || parameterValuesRef.current;
    await saveProjectSnapshot(
      panelsRef.current,
      currentParameters,
      selectedWorkflowIdRef.current || currentPanel?.workflowId,
      settings,
    );
  };
  const generationApplicationHandlers: ApplicationActionHandlers = {
    get_backend_node_definitions: async command => {
      assertApplicationProject(command);
      const backend = requireSelectedApplicationBackend(command.target.backendId);
      const definitions = await nodeDefinitions.fetchDefinitions(backend.url);
      assertApplicationProject(command);
      if (requireSelectedApplicationBackend(backend.id).url !== backend.url) {
        throw applicationError('backend_scope_changed', 'The managed backend changed during schema validation. Refresh the application snapshot before continuing.');
      }
      const missingClasses: string[] = [];
      const objectInfo = Object.fromEntries([...new Set(command.input.nodeClasses)].flatMap(nodeClass => {
        if (!Object.prototype.hasOwnProperty.call(definitions, nodeClass)) {
          missingClasses.push(nodeClass);
          return [];
        }
        return [[nodeClass, definitions[nodeClass]]];
      }));
      const privacyReason: { reason?: string } = {};
      const safeObjectInfo = redactAgentGraphValue(objectInfo, 0, privacyReason);
      if (privacyReason.reason) throw applicationError('node_definitions_unsafe', privacyReason.reason);
      const response = { backendId: backend.id, objectInfo: safeObjectInfo, missingClasses };
      let serialized: string | undefined;
      try {
        serialized = JSON.stringify(response);
      } catch {
        throw applicationError('node_definitions_unavailable', 'The requested node definitions could not be serialized safely.');
      }
      if (typeof serialized !== 'string') throw applicationError('node_definitions_unavailable', 'The requested node definitions could not be serialized safely.');
      if (new TextEncoder().encode(serialized).byteLength > 200 * 1024) {
        throw applicationError('node_definitions_too_large', 'The requested node definitions exceed 200 KiB. Request fewer node classes and retry.');
      }
      return response;
    },
    prepare_workflow_proposal: async command => {
      await flushPendingWorkflowSave();
      assertApplicationProject(command);
      assertApplicationPanel(command, command.target.panelId);
      const existing = command.target.workflowId
        ? assertApplicationWorkflow(command, command.target.workflowId)
        : undefined;
      if (existing && (!Number.isSafeInteger(existing.revision) || (existing.revision ?? 0) < 1)) {
        throw applicationError('workflow_revision_required', 'Editing a workflow requires its canonical revision.');
      }
      const categoryValue = command.input.category ?? existing?.category ?? 'image-generation';
      if (!isTabType(categoryValue)) throw applicationError('invalid_workflow_category', 'Choose a valid Storyboard workflow category.');
      const subCategoryValue = command.input.subCategory ?? existing?.subCategory ?? getDefaultSubCategory(categoryValue);
      if (!isSubTabType(subCategoryValue) || !isValidWorkflowRoute(categoryValue, subCategoryValue)) {
        throw applicationError('invalid_workflow_subcategory', 'Choose a valid subcategory for the selected Storyboard category.');
      }
      const backend = requireSelectedApplicationBackend(command.target.backendId);
      const objectInfo = await nodeDefinitions.fetchDefinitions(backend.url);
      assertApplicationProject(command);
      assertApplicationPanel(command, command.target.panelId);
      if (existing) assertApplicationWorkflow(command, existing.id);
      if (requireSelectedApplicationBackend(backend.id).url !== backend.url) {
        throw applicationError('backend_scope_changed', 'The managed backend changed during schema validation. Refresh the application snapshot before continuing.');
      }
      const checked = prepareAgentWorkflowProposal({
        workflow: command.input.workflow,
        config: command.input.config as unknown as ParameterConfig[],
        objectInfo,
        backendUrl: backend.url,
      });
      const workflowId = existing?.id ?? crypto.randomUUID();
      const oldBindings = new Set(existing?.config.filter(control => control.exposed).map(control => `${control.node_id}\0${control.input_name}`) ?? []);
      const proposedControls = checked.config.filter(control => control.exposed);
      const newBindings = new Set(proposedControls.map(control => `${control.node_id}\0${control.input_name}`));
      const workflow: Workflow = {
        id: workflowId,
        name: command.input.name,
        description: command.input.description ?? existing?.description ?? '',
        category: categoryValue,
        subCategory: subCategoryValue,
        workflow: checked.workflow,
        parsed: checked.parsed,
        config: checked.config,
        createdAt: existing?.createdAt ?? Date.now(),
        revision: existing?.revision,
        ...(existing?.categories ? { categories: existing.categories } : {}),
        sourceGraphFingerprint: existing?.sourceGraphFingerprint,
        sourceProvenance: [
          ...(existing?.sourceProvenance ?? []),
          ...(command.input.provenance ?? []),
          { kind: existing ? 'agent-modified' : 'agent-created', ...(existing ? { basedOnWorkflowId: existing.id, basedOnRevision: existing.revision } : {}) },
        ],
      };
      const preparedRevisionId = checked.errors.length === 0 ? crypto.randomUUID() : undefined;
      if (preparedRevisionId) {
        if (preparedWorkflowRevisionsRef.current.size >= 32) {
          const oldest = preparedWorkflowRevisionsRef.current.keys().next().value;
          if (oldest) preparedWorkflowRevisionsRef.current.delete(oldest);
        }
        preparedWorkflowRevisionsRef.current.set(preparedRevisionId, {
          workflow,
          projectIdentity: command.projectIdentity,
          consoleBindingId: projectScopeRef.current.bindingId,
          panelId: command.target.panelId,
          panelRevision: command.expectedPanelRevision!,
          workflowRevision: existing?.revision ?? null,
          backendId: backend.id,
          backendUrl: backend.url,
        });
      }
      return {
        valid: checked.errors.length === 0,
        ...(preparedRevisionId ? { preparedRevisionId } : {}),
        workflowId,
        baseRevision: existing?.revision ?? null,
        backendId: backend.id,
        validationErrors: checked.errors,
        exposedControls: proposedControls.map(control => ({ name: control.name, nodeId: control.node_id, inputName: control.input_name, type: control.type })),
        changes: {
          addedBindings: proposedControls.filter(control => !oldBindings.has(`${control.node_id}\0${control.input_name}`)).map(control => `${control.node_id}.${control.input_name}`),
          removedBindings: (existing?.config ?? []).filter(control => control.exposed && !newBindings.has(`${control.node_id}\0${control.input_name}`)).map(control => `${control.node_id}.${control.input_name}`),
        },
        readiness: 'not_verified',
      };
    },
    open_project: async command => {
      assertApplicationProject(command);
      const sourceBindingId = projectScopeRef.current.bindingId;
      const projectRevision = projectScopeRef.current.revision;
      const { projectPath, unsavedWorkChoice: choice } = command.input;
      if (typeof projectPath !== 'string' || !projectPath || projectPath.length > 4096
        || projectPath !== projectPath.trim() || projectPath.includes('\0')
        || !/^(?:\/|[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/.test(projectPath)
        || !/\.json$/i.test(projectPath)) {
        throw applicationError('invalid_project_path', 'Identify a saved project by its absolute JSON file path.');
      }
      if (choice !== undefined && !['save', 'discard', 'cancel'].includes(choice)) {
        throw applicationError('invalid_unsaved_work_choice', 'Choose save, discard, or cancel for unsaved project work.');
      }
      if (choice === 'cancel') return { status: 'cancelled' };
      if (hasUnsavedProjectWork()) {
        if (choice === undefined) return { status: 'needs_unsaved_work_choice', projectRevision };
        if (choice === 'save') return {
          status: 'save_required', projectRevision,
          reason: 'Save the current project with save_project, refresh the snapshot, then request Open again.',
        };
      }
      const fingerprint = projectStateFingerprint(readCurrentProjectState());
      const guard = () => {
        assertApplicationProject(command);
        if (projectStateFingerprint(readCurrentProjectState()) !== fingerprint) {
          throw applicationError('project_changed_during_open', 'The project changed while Open was being prepared; refresh its snapshot.');
        }
        const pending = ['preparing', 'prepared', 'submitting', 'submission_unknown', 'accepted', 'running', 'cancel_requested'];
        if (panelsRef.current.some(panel => panel.status === 'generating')
          || listGenerationRuns(command.projectIdentity).some(run => run.jobs.some(job => pending.includes(job.status)))) {
          throw applicationError('project_has_unresolved_generation', 'The project has an unresolved generation run and cannot change identity yet.');
        }
      };
      guard();
      const loaded = await handleLoadFromDialog(projectPath, { assertCurrent: guard, discard: choice === 'discard' });
      const destination = projectScopeRef.current;
      if (!loaded || destination.bindingId === sourceBindingId) {
        return { status: 'outcome_unknown', reason: 'Project activation was not confirmed. Inspect the current project before continuing.' };
      }
      return {
        status: 'completed', name: projectManager.getProject().name, projectRevision: destination.revision,
        panelCount: panelsRef.current.length,
        transition: { fromBindingId: sourceBindingId, toBindingId: destination.bindingId, projectRevision: destination.revision },
      };
    },
    new_project: async command => {
      assertApplicationProject(command);
      const sourceBindingId = projectScopeRef.current.bindingId;
      const projectRevision = projectScopeRef.current.revision;
      const sourceFingerprint = projectStateFingerprint(readCurrentProjectState());
      const choice = command.input.unsavedWorkChoice;
      if (choice !== undefined && choice !== 'save' && choice !== 'discard' && choice !== 'cancel') {
        throw applicationError('invalid_unsaved_work_choice', 'Choose save, discard, or cancel for unsaved project work.');
      }
      if (choice === 'cancel') return { status: 'cancelled' };
      if (hasUnsavedProjectWork()) {
        if (choice === undefined) return { status: 'needs_unsaved_work_choice', projectRevision };
        if (choice === 'save') return {
          status: 'save_required', projectRevision,
          reason: 'Save the current project with save_project, refresh the snapshot, then request New again.',
        };
      }
      const unresolvedStatuses = ['preparing', 'prepared', 'submitting', 'submission_unknown', 'accepted', 'running', 'cancel_requested'];
      const hasUnresolvedGeneration = () => panelsRef.current.some(panel => panel.status === 'generating')
        || listGenerationRuns(command.projectIdentity).some(run => run.jobs.some(job => unresolvedStatuses.includes(job.status)));
      const guard = () => {
        assertApplicationProject(command);
        if (command.expectedConsoleBindingId !== sourceBindingId || projectScopeRef.current.bindingId !== sourceBindingId) {
          throw applicationError('stale_console_binding', 'The Console project activation changed; New was not retargeted.');
        }
        if (projectStateFingerprint(readCurrentProjectState()) !== sourceFingerprint) {
          throw applicationError('project_changed_during_new', 'The project changed while New was being prepared; refresh the application snapshot and retry.');
        }
        if (hasUnresolvedGeneration()) {
          throw applicationError('project_has_unresolved_generation', 'The project has an unresolved generation run and cannot change identity yet.');
        }
      };
      guard();
      const defaultPanels: Panel[] = Array.from({ length: 6 }, (_, i) => ({
        id: i + 1, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0,
        x: (i % 3) * 320, y: Math.floor(i / 3) * 320, width: 300, height: 300,
        status: 'empty' as const, progress: 0, notes: '', nodeId: undefined, workflowId: undefined,
        parameterValues: undefined, prompt: '', seed: -1,
      }));
      const now = new Date();
      const newSettings: ProjectSettings = {
        name: 'Untitled Project', path: '', projectFilePath: undefined,
        namingTemplate: '{project}_Panel{panel}_{version}', autoSave: true,
        orchestratorUrl: projectManager.getProject().orchestratorUrl, created: now, lastModified: now,
      };
      const newIdentity = projectManager.createUnsavedIdentity();
      try {
        await activateSessionIdentity(sessionDraftController, newIdentity, {
          discard: choice === 'discard', assertCurrent: guard,
          commit: () => {
            projectManager.rotateUnsavedIdentity(newIdentity);
            setProjectSettings(newSettings);
            setPanels(defaultPanels);
            setParameterValues({});
            parameterValuesRef.current = {};
            setSelectedWorkflowId(null);
            selectedWorkflowIdRef.current = null;
            setCameraAngles({});
            setEnhancementPreferences(EMPTY_ENHANCEMENT_PREFERENCES);
            enhancementPreferencesRef.current = EMPTY_ENHANCEMENT_PREFERENCES;
            setDeletedImages(new Set());
            setGlobalPromptOverride('');
            setUseGlobalPrompt(false);
            projectSavedFingerprintRef.current = projectStateFingerprint({
              ...readCurrentProjectState(), panels: defaultPanels, parameters: {}, selectedWorkflowId: null,
              settings: newSettings, cameraAngles: {}, enhancementPreferences: EMPTY_ENHANCEMENT_PREFERENCES, deletedImages: [],
              globalPromptOverride: '', useGlobalPrompt: false,
            });
          },
        });
      } catch (error) {
        return { status: 'outcome_unknown', reason: error instanceof Error ? error.message : String(error) };
      }
      const destination = projectScopeRef.current;
      if (destination.bindingId === sourceBindingId) {
        return { status: 'outcome_unknown', reason: 'New activated without a distinct Console project binding.' };
      }
      return {
        status: 'completed', projectRevision: destination.revision, panelCount: 6,
        transition: { fromBindingId: sourceBindingId, toBindingId: destination.bindingId, projectRevision: destination.revision },
      };
    },
    save_project: async command => {
      assertApplicationProject(command);
      const sourceBindingId = projectScopeRef.current.bindingId;
      await sessionDraftController.flush();
      await flushPendingWorkflowSave();
      assertApplicationProject(command);
      const capturedFingerprint = JSON.stringify({
        panels: panelsRef.current, parameters: parameterValuesRef.current,
        selectedWorkflowId: selectedWorkflowIdRef.current, settings: projectManager.getProject(),
      });
      if (!capturedFingerprint) throw applicationError('project_snapshot_unavailable', 'The current project state could not be captured for saving.');
      const captured = JSON.parse(capturedFingerprint) as {
        panels: Panel[]; parameters: Record<string, unknown>; selectedWorkflowId?: string | null; settings: ProjectSettings;
      };
      const sourceSettings = captured.settings;
      const input = command.input;
      if ((input.folderPath !== undefined && typeof input.folderPath !== 'string')
        || (input.name !== undefined && typeof input.name !== 'string')) {
        throw applicationError('invalid_project_input', 'The project folder and name must be strings.');
      }
      const targetPath = input.folderPath ?? sourceSettings.path;
      if (typeof targetPath !== 'string' || !targetPath || targetPath.length > 4096
        || targetPath !== targetPath.trim() || targetPath.includes('\0')
        || !(/^(?:\/|[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/][^\\/]+(?:[\\/]|$))/.test(targetPath))) {
        throw applicationError('invalid_project_path', 'The project folder must be an absolute Unix, Windows drive, or UNC path without surrounding whitespace.');
      }
      const targetName = (input.name ?? sourceSettings.name)?.trim();
      if (typeof targetName !== 'string' || !targetName || targetName.length > 50
        || /[<>:"/\\|?*\u0000-\u001f\u007f-\u009f]/.test(targetName) || targetName === '.' || targetName === '..') {
        throw applicationError('invalid_project_name', 'The project name must be 1 to 50 characters and contain no path separators, Windows-invalid characters, or control characters.');
      }
      const targetSettings = { ...sourceSettings, path: targetPath, name: targetName };
      const filename = `${targetName.replace(/[<>:"/\\|?*]/g, '_').replace(/\s+/g, '_').substring(0, 50)}_project.json`;
      const expectedSavedPath = `${targetPath.replace(/[\\/]+$/, '')}/${filename}`;
      const normalizeFolder = (path: string) => path.replace(/\\/g, '/').replace(/\/+$/, '');
      const currentFilePath = sourceSettings.projectFilePath;
      const currentFileParts = currentFilePath?.replace(/\\/g, '/').split('/') ?? [];
      const currentFilename = currentFileParts.pop() || '';
      const knownSameDestination = Boolean(currentFilePath)
        && normalizeFolder(sourceSettings.path) === normalizeFolder(targetPath)
        && sourceSettings.name === targetName
        && normalizeFolder(currentFileParts.join('/')) === normalizeFolder(targetPath)
        && currentFilename.toLowerCase() === filename.toLowerCase();
      const targetIdentitySettings = { ...targetSettings, projectFilePath: knownSameDestination ? currentFilePath : expectedSavedPath };
      const identityChanging = projectManager.getSessionIdentity(targetIdentitySettings) !== projectManager.getSessionIdentity(sourceSettings);
      const unresolvedStatuses = ['preparing', 'prepared', 'submitting', 'submission_unknown', 'accepted', 'running', 'cancel_requested'];
      const hasUnresolvedGeneration = () => panelsRef.current.some(panel => panel.status === 'generating')
        || listGenerationRuns(command.projectIdentity).some(run => run.jobs.some(job => unresolvedStatuses.includes(job.status)));
      const assertCapturedSource = () => {
        if (!isApplicationProjectCurrent(command)) assertApplicationProject(command);
        if (JSON.stringify({
          panels: panelsRef.current, parameters: parameterValuesRef.current,
          selectedWorkflowId: selectedWorkflowIdRef.current, settings: projectManager.getProject(),
        }) !== capturedFingerprint) {
          throw applicationError('project_changed_during_save', 'The project changed while it was being saved; refresh the application snapshot and retry.');
        }
        if (identityChanging && hasUnresolvedGeneration()) {
          throw applicationError('project_has_unresolved_generation', 'The project has an unresolved generation run and cannot change identity yet.');
        }
      };
      let listed: Awaited<ReturnType<typeof projectManager.listProjects>>;
      try {
        listed = await projectManager.listProjects(targetPath);
      } catch (error) {
        throw applicationError('project_list_failed', error instanceof Error ? error.message : String(error));
      }
      if (!listed.success || !Array.isArray(listed.projects)) {
        throw applicationError('project_list_failed', listed.error || 'The target folder could not be checked for existing projects.');
      }
      if (listed.projects.some(project => (project.path.split(/[\\/]/).pop() || '').toLowerCase() === filename.toLowerCase())
        && !knownSameDestination) {
        throw applicationError('project_already_exists', `A project named '${filename}' already exists in the target folder.`);
      }
      assertCapturedSource();

      let savedPath: string;
      try {
        const result = await saveProjectAndRecordRecent(targetName, () => persistProjectStateSnapshot(
          captured.panels, captured.parameters, captured.selectedWorkflowId || undefined, targetSettings,
          assertCapturedSource,
        ));
        if (!result.success || !result.savedPath) throw applicationError('project_save_failed', result.error || 'The project was not saved.');
        savedPath = result.savedPath;
      } catch (error) {
        if (error && typeof error === 'object' && 'code' in error) throw error;
        throw applicationError('project_save_failed', error instanceof Error ? error.message : String(error));
      }
      const targetIdentity = projectManager.getSessionIdentity({ ...targetSettings, projectFilePath: savedPath });
      try {
        assertCapturedSource();
        await activateSessionIdentity(sessionDraftController, targetIdentity, {
          assertCurrent: assertCapturedSource,
          commit: () => {
            setProjectSettings({ ...targetSettings, projectFilePath: savedPath });
            sessionDraftController.clearFailure();
          },
        });
      } catch (error) {
        return { status: 'outcome_unknown', reason: error instanceof Error ? error.message : String(error), savedPath };
      }
      const finalScope = projectScopeRef.current;
      return {
        status: 'completed', savedPath, name: targetSettings.name, projectRevision: finalScope.revision,
        ...(finalScope.bindingId !== sourceBindingId ? { transition: {
          fromBindingId: sourceBindingId, toBindingId: finalScope.bindingId, projectRevision: finalScope.revision,
        } } : {}),
      };
    },
    add_panels: async command => {
      assertApplicationProject(command);
      const userRequest = getActiveConsoleUserRequest(command.projectIdentity);
      if (!userRequest) throw applicationError('console_request_required', 'Adding panels must be requested within an active Console user turn.');
      const count = command.input.count;
      if (!Number.isInteger(count) || count < 1 || count > 16) {
        throw applicationError('invalid_panel_count', 'Panel count must be an integer from 1 to 16.');
      }
      if (panelsRef.current.length + count > 256) {
        throw applicationError('panel_limit_exceeded', 'Adding these panels would exceed the 256 panel limit.');
      }
      const existingPanelIds = new Set(panelsRef.current.map(panel => panel.id));
      for (let index = 0; index < count; index += 1) addPanel();
      const newPanels = panelsRef.current.filter(panel => !existingPanelIds.has(panel.id));
      return {
        status: 'added',
        projectRevision: projectScopeRef.current.revision,
        panels: newPanels.map(panel => ({
          id: panel.id,
          name: panel.name || `Panel_${String(panel.id).padStart(2, '0')}`,
          panelRevision: panelRevisionRef.current.get(panel.id),
        })),
      };
    },
    remove_panels: async command => {
      assertApplicationProject(command);
      const userRequest = getActiveConsoleUserRequest(command.projectIdentity);
      if (!userRequest) throw applicationError('console_request_required', 'Removing panels must be requested within an active Console user turn.');
      const panelIds = command.input.panelIds;
      if (!Array.isArray(panelIds) || panelIds.length < 1 || panelIds.length > 16
        || Array.from(panelIds).some(id => !Number.isSafeInteger(id) || id <= 0)
        || new Set(panelIds).size !== panelIds.length) {
        throw applicationError('invalid_panel_ids', 'Panel IDs must be unique positive safe integers, with 1 to 16 entries.');
      }
      const revisions = command.input.expectedPanelRevisions;
      if (!revisions || typeof revisions !== 'object' || Array.isArray(revisions)
        || Reflect.ownKeys(revisions).length !== panelIds.length
        || panelIds.some(id => !Object.prototype.hasOwnProperty.call(revisions, String(id))
          || !Number.isSafeInteger(revisions[String(id)]) || revisions[String(id)] <= 0)) {
        throw applicationError('invalid_panel_revisions', 'Expected panel revisions must contain one positive safe integer for each requested panel ID.');
      }
      const requested = new Set(panelIds);
      for (const panelId of panelIds) {
        if (!panelsRef.current.some(panel => panel.id === panelId)) {
          throw applicationError('panel_not_found', `Panel ${panelId} no longer exists.`);
        }
        if (panelRevisionRef.current.get(panelId) !== revisions[String(panelId)]) {
          throw applicationError('stale_panel', `Panel ${panelId} changed after this action was prepared. Refresh the application snapshot and retry.`);
        }
      }
      const unresolvedStatuses = ['preparing', 'prepared', 'submitting', 'submission_unknown', 'accepted', 'running', 'cancel_requested'];
      if (panelsRef.current.some(panel => requested.has(panel.id) && panel.status === 'generating')
        || listGenerationRuns(command.projectIdentity).some(run => requested.has(run.panelId)
          && run.jobs.some(job => unresolvedStatuses.includes(job.status)))) {
        throw applicationError('panel_has_unresolved_run', 'A requested panel has an unresolved generation run. Inspect or cancel it before removing the panel.');
      }
      const remaining = panelsRef.current.filter(panel => !requested.has(panel.id));
      setPanels(remaining);
      if (selectedPanelIdRef.current !== null && requested.has(selectedPanelIdRef.current)) {
        const nextSelectedPanelId = remaining[0]?.id ?? null;
        setSelectedPanelId(nextSelectedPanelId);
        selectedPanelIdRef.current = nextSelectedPanelId;
      }
      return {
        status: 'removed',
        projectRevision: projectScopeRef.current.revision,
        removedPanelIds: [...panelIds],
        selectedPanelId: selectedPanelIdRef.current,
        filesDeleted: false,
      };
    },
    show_panel_controls: async command => {
      assertApplicationProject(command);
      if (!getActiveConsoleUserRequest(command.projectIdentity)) {
        throw applicationError('console_request_required', 'Showing panel controls must be requested within an active Console user turn.');
      }
      const panel = assertApplicationPanel(command, command.target.panelId);
      const workflow = assertApplicationWorkflow(command, command.target.workflowId);
      assertPanelWorkflow(panel, workflow.id);
      const routes = getWorkflowRoutes(workflow);
      const route = routes.find(candidate => candidate.category === activeTab && candidate.subCategory === activeSubTab) ?? routes[0];
      if (!route) throw applicationError('unsupported_workflow_route', 'This workflow has no supported Storyboard controls route.');

      const nextParameters = { ...(panel.parameterValues || {}) };
      if (selectedWorkflowIdRef.current !== workflow.id) skipParameterReset.current = true;
      selectedPanelIdRef.current = panel.id;
      setSelectedPanelId(panel.id);
      selectedWorkflowIdRef.current = workflow.id;
      setSelectedWorkflowId(workflow.id);
      parameterValuesRef.current = nextParameters;
      setParameterValues(nextParameters);
      setActiveTab(route.category);
      setActiveSubTab(route.subCategory);

      return {
        status: 'shown',
        panelId: panel.id,
        panelRevision: panelRevisionRef.current.get(panel.id),
        workflowId: workflow.id,
        workflowRevision: workflow.revision,
        category: route.category,
        subCategory: route.subCategory,
        controlCount: workflow.config.filter(control => control.exposed).length,
      };
    },
    select_backends: async command => {
      assertApplicationProject(command);
      const userRequest = getActiveConsoleUserRequest(command.projectIdentity);
      if (!userRequest) throw applicationError('generation_not_authorized', 'Backend selection must be requested within an active Console user turn.');
      const backendIds = command.input.backendIds;
      if (!Array.isArray(backendIds) || backendIds.length > 32
        || backendIds.some(id => typeof id !== 'string' || id.length === 0 || id.length > 256)
        || new Set(backendIds).size !== backendIds.length) {
        throw applicationError('invalid_backend_selection', 'Backend IDs must be unique, nonempty strings of at most 256 characters, with no more than 32 entries.');
      }
      const configuredBackendIds = new Set(orchestratorManager.getNodes().map(backend => backend.id));
      if (backendIds.some(id => !configuredBackendIds.has(id))) {
        throw applicationError('invalid_backend_selection', 'Every backend ID must exist in the configured Orchestrator registry.');
      }
      const next = [...backendIds];
      assertApplicationProject(command);
      if (getActiveConsoleUserRequest(command.projectIdentity)?.turnId !== userRequest.turnId) {
        throw applicationError('console_turn_changed', 'The Console user turn changed before backend selection.');
      }
      selectedBackendIdsRef.current = next;
      setSelectedBackendIds(next);
      return { status: 'selected', backendIds: [...next], projectRevision: projectScopeRef.current.revision };
    },
    get_application_snapshot: async command => {
      assertApplicationProject(command, false);
      const sensitiveText = SNAPSHOT_SENSITIVE_TEXT;
      const redactValue = (value: unknown, depth = 0): unknown => {
        if (typeof value === 'string') {
          if (/^data:(?:image|video)\//i.test(value) || value.length > 512 && /^[A-Za-z0-9+/]+={0,2}$/.test(value)) return '[media data omitted]';
          if (sensitiveText.test(value)) return '[sensitive text omitted]';
          return value.length > 1024 ? `${value.slice(0, 1024)}…` : value;
        }
        if (value === null || typeof value !== 'object') return value;
        if (depth > 3) return '[nested value omitted]';
        if (Array.isArray(value)) return value.slice(0, 40).map(item => redactValue(item, depth + 1));
        return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 40).map(([key, item]) => [
          key,
          /(?:api|access|private)[_-]?key|token|secret|password|credential|authorization/i.test(key) ? '[redacted]' : redactValue(item, depth + 1),
        ]));
      };
      const snapshotWorkflowId = selectedWorkflowIdRef.current || panelsRef.current.find(panel => panel.workflowId)?.workflowId;
      const settings = projectManager.getProject();
      const runs = listGenerationRuns(command.projectIdentity).slice(-50).map(run => ({
        runId: run.runId,
        commandId: run.commandId,
        panelId: run.panelId,
        workflowId: run.workflowId,
        workflowRevision: run.workflowRevision,
        mode: run.mode,
        status: run.status,
        createdAt: run.createdAt,
        jobs: run.jobs.map(job => ({ backendId: job.backendId, promptId: job.promptId, status: job.status, updatedAt: job.updatedAt, message: job.message ? redactValue(job.message) : undefined })),
      }));
      const selectedBackendSchema = (() => {
        const backendIds = [...new Set(selectedBackendIdsRef.current)];
        if (backendIds.length !== 1) return { ok: false, reason: 'Exactly one managed backend must be selected.' };
        const backend = orchestratorManager.getNodes().find(node => node.id === backendIds[0]);
        if (!backend) return { ok: false, reason: 'The selected managed backend is no longer configured.' };
        const workflowId = selectedWorkflowIdRef.current;
        if (!workflowId) return { ok: false, reason: 'No workflow is explicitly selected.' };
        const workflow = workflowsRef.current.find(item => item.id === workflowId);
        if (!workflow) return { ok: false, reason: 'The explicitly selected workflow is unavailable.' };
        if (typeof workflow.revision !== 'number' || !Number.isSafeInteger(workflow.revision) || workflow.revision <= 0) return { ok: false, reason: 'The selected workflow has no positive canonical revision.' };
        if (!workflowStorageReadyRef.current) return { ok: false, reason: 'Workflow storage is not ready.' };
        if (workflowConflictIdsRef.current.has(workflow.id)) return { ok: false, reason: 'The selected workflow has an unresolved storage conflict.' };
        if (workflowPersistedFingerprintRef.current.get(workflow.id) !== workflowContentFingerprint(workflow)) return { ok: false, reason: 'The selected workflow has unsaved changes.' };
        const graph = workflow.workflow as unknown as Record<string, unknown>;
        const definitions = graph.definitions;
        const subgraphs = definitions && typeof definitions === 'object' ? (definitions as Record<string, unknown>).subgraphs : undefined;
        if (subgraphs && (typeof subgraphs !== 'object' || Object.keys(subgraphs).length > 0)) return { ok: false, reason: 'unsupported_subgraph_schema_selection' };
        const cache = nodeDefinitions.getFreshDefinitionsSnapshot(backend.url);
        if (!cache) return { ok: false, reason: 'Fresh backend schema is unavailable.' };
        const uiOnlyNodes = ['Note', 'MarkdownNote', 'PrimitiveNode', 'GetNode', 'SetNode', 'Reroute', 'LoadImageOutput'];
        const nodeClasses = listWorkflowNodes(workflow.workflow).map(([, node]) => getWorkflowNodeClassType(node)).filter(classType => classType && !uiOnlyNodes.includes(classType));
        const result = selectCachedWorkflowSchema({ backendId: backend.id, workflowId: workflow.id, nodeClasses, cache });
        if (!result.ok) return result;
        const schemaAvailability: { reason?: string } = {};
        const objectInfo = redactAgentGraphValue(result.schema.objectInfo, 0, schemaAvailability);
        if (schemaAvailability.reason) return { ok: false, reason: schemaAvailability.reason };
        return { ...result, schema: { ...result.schema, workflowRevision: workflow.revision, objectInfo: objectInfo as Record<string, unknown> } };
      })();
      return {
        consoleBindingId: projectScopeRef.current.bindingId,
        project: { revision: projectScopeRef.current.revision, name: settings.name, hasUnsavedWork: hasUnsavedProjectWork() },
        selectedPanelId: selectedPanelIdRef.current,
        selectedWorkflowId: selectedWorkflowIdRef.current,
        selectedBackendSchema,
        panels: panelsRef.current.map(panel => {
          const workflow = workflowsRef.current.find(item => item.id === panel.workflowId);
          const values = panel.parameterValues || {};
          return {
            id: panel.id,
            revision: panelRevisionRef.current.get(panel.id) || 1,
            inputRevision: panelInputRevisionRef.current.get(panel.id) || 1,
            status: panel.status,
            workflowId: panel.workflowId,
            backendId: panel.nodeId,
            parameterValues: Object.fromEntries((workflow?.config || []).filter(control => control.exposed).flatMap(control =>
              Object.prototype.hasOwnProperty.call(values, control.name) ? [[control.name, redactValue(values[control.name])]] : [],
            )),
          };
        }),
        workflows: workflowsRef.current.map(workflow => {
          const graph = workflow.workflow as unknown as Record<string, unknown>;
          const graphCount = Array.isArray(graph.nodes)
            ? graph.nodes.filter(node => node && typeof node === 'object').length
            : Object.keys(graph).filter(nodeId => nodeId !== 'meta').length;
          const includeGraph = workflow.id === snapshotWorkflowId;
          const graphAvailability: { reason?: string } = {};
          const safeGraph = includeGraph ? redactAgentGraphValue(workflow.workflow, 0, graphAvailability) : undefined;
          if (includeGraph && !graphAvailability.reason) {
            try {
              if (new TextEncoder().encode(JSON.stringify(safeGraph)).byteLength > 500_000) graphAvailability.reason = 'The selected workflow is too large for a safe application snapshot.';
            } catch {
              graphAvailability.reason = 'The selected workflow could not be serialized safely.';
            }
          }
          return {
            id: workflow.id,
            name: workflow.name,
            description: workflow.description,
            category: workflow.category,
            subCategory: workflow.subCategory,
            revision: workflow.revision,
            saved: workflowStorageReadyRef.current
              && typeof workflow.revision === 'number'
              && Number.isSafeInteger(workflow.revision)
              && workflow.revision > 0
              && !workflowConflictIdsRef.current.has(workflow.id)
              && workflowPersistedFingerprintRef.current.get(workflow.id) === workflowContentFingerprint(workflow),
            recipeId: workflow.recipeId,
            sourceGraphFingerprint: workflow.sourceGraphFingerprint,
            recipeFingerprint: workflow.recipeFingerprint,
            nodeCount: graphCount,
            graph: includeGraph && !graphAvailability.reason ? safeGraph : undefined,
            graphAvailable: includeGraph && !graphAvailability.reason,
            graphOmittedReason: includeGraph ? graphAvailability.reason : 'Only the selected workflow graph is included.',
            exposedControls: workflow.config.filter(control => control.exposed).map(control => ({
              name: control.name,
              nodeId: control.node_id,
              inputName: control.input_name,
              type: control.type,
              category: control.category,
              default: redactValue(control.default),
              constraints: control.constraints ? { min: control.constraints.min, max: control.constraints.max, step: control.constraints.step, options: control.constraints.options?.slice(0, 50) } : undefined,
            })),
          };
        }),
        backends: renderNodes.map(node => ({ id: node.id, name: node.name, status: node.status, os: node.os, selected: selectedBackendIdsRef.current.includes(node.id) })),
        runs,
      };
    },
    inspect_backend: async command => {
      assertApplicationProject(command);
      const backend = requireSelectedApplicationBackend(command.target.backendId, false);
      const project = projectManager.getProject();
      if (!project.orchestratorUrl) throw applicationError('orchestrator_unavailable', 'The active project has no configured Orchestrator URL.');
      assertApplicationProject(command);
      if (requireSelectedApplicationBackend(backend.id, false).url !== backend.url) {
        throw applicationError('backend_scope_changed', 'The managed backend changed during inspection. Refresh the application snapshot before continuing.');
      }
      if (command.input.refresh === true) nodeDefinitions.clearCache(backend.url);
      let browserSchemaCacheCapturedAt: string | undefined;
      try {
        await nodeDefinitions.fetchDefinitions(backend.url);
        browserSchemaCacheCapturedAt = nodeDefinitions.getFreshDefinitionsSnapshot(backend.url)?.capturedAt;
      } catch {
        browserSchemaCacheCapturedAt = undefined;
      }
      assertApplicationProject(command);
      if (projectManager.getProject().orchestratorUrl !== project.orchestratorUrl) throw applicationError('orchestrator_scope_changed', 'The configured Orchestrator URL changed during backend inspection. Refresh the application snapshot before continuing.');
      const currentBackendAfterSchema = requireSelectedApplicationBackend(backend.id, false);
      if (currentBackendAfterSchema.id !== backend.id || currentBackendAfterSchema.url !== backend.url) throw applicationError('backend_scope_changed', 'The managed backend changed during inspection. Refresh the application snapshot before continuing.');
      const capability = await inspectManagedBackendCapabilities(project.orchestratorUrl, backend.id, command.input.refresh === true);
      assertApplicationProject(command);
      if (projectManager.getProject().orchestratorUrl !== project.orchestratorUrl) throw applicationError('orchestrator_scope_changed', 'The configured Orchestrator URL changed during backend inspection. Refresh the application snapshot before continuing.');
      const currentBackend = requireSelectedApplicationBackend(backend.id, false);
      if (currentBackend.url !== backend.url || capability.backend_id !== backend.id) {
        throw applicationError('backend_scope_changed', 'The managed backend changed during inspection. Refresh the application snapshot before continuing.');
      }
      return {
        backendId: backend.id,
        name: currentBackend.name,
        browserStatus: currentBackend.status,
        browserSchemaCacheStatus: browserSchemaCacheCapturedAt ? 'available' : 'unavailable',
        ...(browserSchemaCacheCapturedAt ? { browserSchemaCacheCapturedAt } : {}),
        inspectedAt: capability.inspected_at,
        httpReachability: capability.http_reachability,
        websocketReachability: capability.websocket_reachability,
        objectInfoStatus: capability.object_info_status,
        objectInfoHash: capability.object_info_hash,
        nodeClasses: capability.node_classes,
        loaderEnums: capability.loader_enums,
        capabilities: capability.capabilities,
        cached: capability.cached,
        errors: {
          systemStats: capability.system_stats_error_code,
          objectInfo: capability.object_info_error_code,
        },
        modelIdentity: 'not_checked',
        filenameAdvertisementMeaning: 'Advertised loader choices are name matches only; they do not prove the installed file identity.',
      };
    },
    search_workflow_sources: async command => {
      assertApplicationProject(command);
      const result = await api.searchWorkflowRecipes({
        ...(command.input.query ? { query: command.input.query } : {}),
      });
      assertApplicationProject(command);
      return {
        ...result,
        selectedTarget: null,
        readinessMeaning: 'Source and recipe fingerprints do not establish live backend compatibility or execution readiness.',
      };
    },
    get_source_recipe: async command => {
      assertApplicationProject(command);
      const result = await api.getWorkflowRecipe(command.input.recipeId);
      assertApplicationProject(command);
      const recipeBackendSchema = (() => {
        const backendIds = [...new Set(selectedBackendIdsRef.current)];
        if (backendIds.length !== 1) return { ok: false, reason: 'Exactly one managed backend must be selected.' };
        const backend = orchestratorManager.getNodes().find(node => node.id === backendIds[0]);
        if (!backend) return { ok: false, reason: 'The selected managed backend is no longer configured.' };
        const recipeId = result.id;
        if (typeof recipeId !== 'string' || recipeId !== command.input.recipeId) return { ok: false, reason: 'The resolved recipe ID does not match the requested recipe.' };
        const workflow = result.workflow;
        if (!workflow || typeof workflow !== 'object' || Array.isArray(workflow)) return { ok: false, reason: 'The recipe has no valid source workflow.' };
        const sourceGraph = result.sourceGraph && typeof result.sourceGraph === 'object' && !Array.isArray(result.sourceGraph)
          ? result.sourceGraph as Record<string, unknown> : {};
        const fingerprints = result.fingerprints && typeof result.fingerprints === 'object' && !Array.isArray(result.fingerprints)
          ? result.fingerprints as Record<string, unknown> : {};
        const sourceFingerprint = sourceGraph.sha256;
        const recipeFingerprint = fingerprints.recipe;
        if (typeof sourceFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(sourceFingerprint)
          || fingerprints.sourceGraph !== sourceFingerprint
          || typeof recipeFingerprint !== 'string' || !/^[0-9a-f]{64}$/.test(recipeFingerprint)) {
          return { ok: false, reason: 'The recipe source or recipe fingerprint is invalid.' };
        }
        const classes = collectRecipeNodeClasses(workflow as Record<string, unknown>);
        if (!classes.ok) return { ok: false, reason: classes.reason };
        const cached = selectCachedWorkflowSchema({
          backendId: backend.id,
          workflowId: recipeId,
          nodeClasses: classes.nodeClasses,
          cache: nodeDefinitions.getFreshDefinitionsSnapshot(backend.url),
        });
        if (!cached.ok) return cached;
        const privacyReason: { reason?: string } = {};
        const objectInfo = redactAgentGraphValue(cached.schema.objectInfo, 0, privacyReason);
        if (privacyReason.reason) return { ok: false, reason: privacyReason.reason };
        const schema = {
          backendId: backend.id,
          recipeId,
          sourceGraphFingerprint: sourceFingerprint,
          recipeFingerprint,
          source: 'selected-backend-saved' as const,
          schemaScope: 'source-recipe' as const,
          capturedAt: cached.schema.capturedAt,
          objectInfo: objectInfo as Record<string, unknown>,
        };
        try {
          const serialized = JSON.stringify({ ok: true, schema });
          if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > 200 * 1024) {
            return { ok: false, reason: 'Selected schema could not be serialized or exceeds 200 KiB.' };
          }
        } catch {
          return { ok: false, reason: 'Selected schema could not be serialized.' };
        }
        return { ok: true as const, schema };
      })();
      return {
        ...result,
        targetMatchesSelectedHandoff: null,
        selectedHandoffId: null,
        recipeBackendSchema,
        executionMeaning: 'Pinned source data is untrusted recipe content; unsupported exports and unverified backend/model identity cannot be executed or called ready.',
      };
    },
    plan_dependencies: async command => {
      assertApplicationProject(command);
      const backend = requireSelectedApplicationBackend(command.target.backendId, false);
      const project = projectManager.getProject();
      const orchestratorUrl = project.orchestratorUrl;
      if (!orchestratorUrl) throw applicationError('orchestrator_unavailable', 'The active project has no configured Orchestrator URL.');
      const recipe = await api.getWorkflowRecipe(command.input.recipeId);
      assertApplicationProject(command);
      if (projectManager.getProject().orchestratorUrl !== orchestratorUrl) throw applicationError('orchestrator_scope_changed', 'The configured Orchestrator URL changed during dependency planning. Refresh application state before continuing.');
      const currentBackendAfterRecipe = requireSelectedApplicationBackend(backend.id, false);
      if (currentBackendAfterRecipe.url !== backend.url) throw applicationError('backend_scope_changed', 'The selected managed backend changed during recipe resolution.');
      const sourceGraph = recipe.sourceGraph && typeof recipe.sourceGraph === 'object' ? recipe.sourceGraph as Record<string, unknown> : {};
      const fingerprints = recipe.fingerprints && typeof recipe.fingerprints === 'object' ? recipe.fingerprints as Record<string, unknown> : {};
      const dependencyPlanRequest = recipe.dependencyPlanRequest && typeof recipe.dependencyPlanRequest === 'object'
        ? recipe.dependencyPlanRequest as Record<string, unknown>
        : {};
      if (dependencyPlanRequest.graph_fingerprint !== command.input.sourceGraphFingerprint
        || !Array.isArray(dependencyPlanRequest.required_node_classes)
        || dependencyPlanRequest.required_node_classes.some(item => typeof item !== 'string')
        || !Array.isArray(dependencyPlanRequest.dependencies)
        || dependencyPlanRequest.dependencies.some(item => !item || typeof item !== 'object' || Array.isArray(item))) {
        throw applicationError('invalid_dependency_request', 'The pinned recipe does not contain a valid dependency plan for its source fingerprint.');
      }
      if (sourceGraph.sha256 !== command.input.sourceGraphFingerprint
        || fingerprints.sourceGraph !== command.input.sourceGraphFingerprint
        || dependencyPlanRequest.graph_fingerprint !== command.input.sourceGraphFingerprint) {
        throw applicationError('recipe_fingerprint_mismatch', 'The dependency request does not match the recipe source graph fingerprint. Read the recipe again before planning.');
      }
      const planRequest: ManagedDependencyPlanRequest = {
        graph_fingerprint: command.input.sourceGraphFingerprint,
        required_node_classes: dependencyPlanRequest.required_node_classes as string[],
        dependencies: dependencyPlanRequest.dependencies as Array<Record<string, unknown>>,
      };
      if (requireSelectedApplicationBackend(backend.id, false).url !== backend.url) {
        throw applicationError('backend_scope_changed', 'The managed backend changed during dependency planning. Refresh application state before continuing.');
      }
      const report = await planManagedBackendDependencies(orchestratorUrl, backend.id, planRequest);
      assertApplicationProject(command);
      if (projectManager.getProject().orchestratorUrl !== orchestratorUrl) throw applicationError('orchestrator_scope_changed', 'The configured Orchestrator URL changed during dependency planning. Refresh application state before continuing.');
      const plannedBackend = requireSelectedApplicationBackend(backend.id, false);
      if (plannedBackend.url !== backend.url || report.backend_id !== backend.id
        || report.graph_fingerprint !== command.input.sourceGraphFingerprint) {
        throw applicationError('dependency_plan_scope_changed', 'The backend or pinned graph changed during dependency planning. Refresh state before continuing.');
      }
      return {
        recipeId: command.input.recipeId,
        sourceGraphFingerprint: command.input.sourceGraphFingerprint,
        backendId: backend.id,
        report,
        readiness: 'not_verified',
        identityMeaning: 'Advertised filename matches do not prove installed file identity or task compatibility.',
      };
    },
    prepare_workflow_revision: async command => {
      await flushPendingWorkflowSave();
      assertApplicationProject(command);
      const panel = assertApplicationPanel(command, command.target.panelId);
      const backend = requireSelectedApplicationBackend(command.target.backendId);
      const exportedRecipe = command.source.exportedRecipe;
      if (exportedRecipe !== undefined && (!exportedRecipe || typeof exportedRecipe !== 'object' || Array.isArray(exportedRecipe))) {
        throw applicationError('recipe_export_invalid', 'The supplied recipe export is invalid.');
      }
      const recipe = await api.getWorkflowRecipe(command.source.recipeId);
      assertApplicationProject(command);
      assertApplicationPanel(command, panel.id);
      if (requireSelectedApplicationBackend(backend.id).url !== backend.url) {
        throw applicationError('recipe_prepare_scope_changed', 'The panel or managed backend changed during recipe resolution. Refresh the application snapshot before continuing.');
      }
      const recipeTarget = recipe.target && typeof recipe.target === 'object' ? recipe.target as Record<string, unknown> : {};
      const sourceGraph = recipe.sourceGraph && typeof recipe.sourceGraph === 'object' ? recipe.sourceGraph as Record<string, unknown> : {};
      const fingerprints = recipe.fingerprints && typeof recipe.fingerprints === 'object' ? recipe.fingerprints as Record<string, unknown> : {};
      const recipeFingerprint = fingerprints.recipe;
      const workflowGraphValue = recipe.workflow;
      const isKleinExport = recipe.id === 'flux-2-klein-4b-distilled-t2i' && sourceGraph.sha256 === 'cd4a29b0be6f71a7391f2f023e69dfc3b47d7da9f2aa215b4c8b8e17c2eea107';
      const isLtxI2vExport = recipe.id === 'ltx-2.5-distilled-i2v' && sourceGraph.sha256 === '03b136ba0ad752c1e91e496a23fa4f4826ef881777d591dc9129c459922e7dac';
      const isLtxExport = (recipe.id === 'ltx-2.5-distilled-t2v' && sourceGraph.sha256 === 'eb1a415a467a2ef1ea63cdb4e79a35315e29c971b1e4f7646ed149a2971fdbd7') || isLtxI2vExport;
      const isMiniMaxT2vExport = recipe.id === 'minimax-h3-fl2va-t2v' && sourceGraph.sha256 === '8a5eb23b0dd2df9e99b6f7af9684e770f188feca820d241364b729e01dedf3b6';
      const isMiniMaxI2vExport = recipe.id === 'minimax-h3-fl2va-i2v' && sourceGraph.sha256 === '34ee39544808fd3b0dc8de9df082940d4d41c3771beb80d3988c1ea5531cec0d';
      const isMiniMaxFastH3Export = recipe.id === 'minimax-fasth3-t2v' && sourceGraph.sha256 === '416fdaf93f35e90c41afc531f05fbfd234ff55c61bd99f643527b2204324da62';
      if (sourceGraph.sha256 !== command.source.sourceGraphFingerprint
        || fingerprints.sourceGraph !== command.source.sourceGraphFingerprint
        || typeof recipeFingerprint !== 'string'
        || !workflowGraphValue || typeof workflowGraphValue !== 'object' || Array.isArray(workflowGraphValue)) {
        throw applicationError('recipe_fingerprint_mismatch', 'The resolved recipe does not match its pinned source graph fingerprint. Read the recipe again.');
      }
      if (exportedRecipe) {
        const capturedAt = Date.parse(exportedRecipe.capturedAt);
        const exportAge = Date.now() - capturedAt;
        const exportedWorkflow = exportedRecipe.workflow;
        if ((!isKleinExport && !isLtxExport && !isMiniMaxT2vExport && !isMiniMaxI2vExport && !isMiniMaxFastH3Export)
          || exportedRecipe.recipeFingerprint !== recipeFingerprint || exportedRecipe.backendId !== backend.id
          || exportedRecipe.readiness !== 'not_verified'
          || exportedRecipe.identityVerification !== 'not_verified' || !Number.isFinite(capturedAt) || exportAge < 0 || exportAge >= 5 * 60 * 1000
          || !/^[0-9a-f]{64}$/.test(exportedRecipe.objectInfoFingerprint) || !/^[0-9a-f]{64}$/.test(exportedRecipe.exportFingerprint)
          || !exportedWorkflow || typeof exportedWorkflow !== 'object' || Array.isArray(exportedWorkflow)
          || (Object.getPrototypeOf(exportedWorkflow) !== Object.prototype && Object.getPrototypeOf(exportedWorkflow) !== null)
          || Object.keys(exportedWorkflow).length === 0) {
          throw applicationError('recipe_export_invalid', 'The supplied export is stale or does not match a pinned recipe and selected backend.');
        }
      }
      const overlay = recipe.applicationOverlay && typeof recipe.applicationOverlay === 'object' ? recipe.applicationOverlay as Record<string, unknown> : {};
      const operations = Array.isArray(overlay.operations) ? overlay.operations : [];
      const unchangedRef2va = recipe.id === 'minimax-h3-ref2va-reference'
        && recipe.supportStatus === 'source_verified_runtime_unverified'
        && overlay.status === 'proposed_unverified'
        && Array.isArray(overlay.operations) && operations.length === 0;
      if (!exportedRecipe && (recipe.id === 'minimax-fasth3-t2v' || recipe.supportStatus === 'unsupported_requires_supported_export'
        || (overlay.status !== 'no_graph_change' && !unchangedRef2va) || operations.length !== 0)) {
        return {
          valid: false,
          blocked: true,
          status: 'unsupported-recipe-overlay',
          recipeId: command.source.recipeId,
          reason: typeof recipe.statusReason === 'string' ? recipe.statusReason : 'This recipe requires an unsupported source graph operation or export.',
          requiredNextStep: 'Provide a verified supported API-format export or conversion contract for this exact pinned source; no workflow was prepared.',
        };
      }
      const workflowGraph = (exportedRecipe ? exportedRecipe.workflow : workflowGraphValue) as ComfyUIWorkflow;
      const graphRecord = workflowGraph as Record<string, unknown>;
      const definitions = graphRecord.definitions && typeof graphRecord.definitions === 'object' ? graphRecord.definitions as Record<string, unknown> : {};
      if (exportedRecipe && (Array.isArray(graphRecord.nodes)
        || Array.isArray(definitions.subgraphs) && definitions.subgraphs.length > 0
        || Object.entries(graphRecord).filter(([key]) => !['meta', 'version', 'extra', 'definitions'].includes(key)).length === 0
        || Object.entries(graphRecord).some(([key, node]) => !['meta', 'version', 'extra', 'definitions'].includes(key)
          && (!node || typeof node !== 'object' || Array.isArray(node) || typeof (node as Record<string, unknown>).class_type !== 'string'
            || !(node as Record<string, unknown>).inputs || typeof (node as Record<string, unknown>).inputs !== 'object' || Array.isArray((node as Record<string, unknown>).inputs))))) {
        throw applicationError('recipe_export_invalid', 'The supplied pinned recipe export must be a flat ComfyUI API mapping with class_type and inputs on every node.');
      }
      if (!exportedRecipe && Array.isArray(definitions.subgraphs) && definitions.subgraphs.length > 0) {
        return {
          valid: false,
          blocked: true,
          status: 'unsupported-source-export',
          recipeId: command.source.recipeId,
          sourceGraphFingerprint: command.source.sourceGraphFingerprint,
          sourceFormat: sourceGraph.format,
          reason: 'The pinned recipe contains ComfyUI subgraph definitions. The current application parser has no verified upstream API-format export for this graph.',
          requiredNextStep: 'Use a verified ComfyUI API-format export for this exact source fingerprint (or add a bounded exporter with that fingerprint contract). The application will not flatten this graph by hand.',
        };
      }
      const objectInfo = await nodeDefinitions.fetchDefinitions(backend.url);
      assertApplicationProject(command);
      assertApplicationPanel(command, panel.id);
      if (requireSelectedApplicationBackend(backend.id).url !== backend.url) throw applicationError('backend_scope_changed', 'The managed backend changed during schema validation. Refresh the application snapshot before continuing.');
      if (exportedRecipe) {
        const classes = collectRecipeNodeClasses(workflowGraphValue as Record<string, unknown>);
        if (!classes.ok) throw applicationError('recipe_export_source_invalid', `Pinned source node classes are unavailable: ${classes.reason}`);
        const cached = selectCachedWorkflowSchema({
          backendId: backend.id,
          workflowId: recipe.id as string,
          nodeClasses: classes.nodeClasses,
          cache: nodeDefinitions.getFreshDefinitionsSnapshot(backend.url),
        });
        if (!cached.ok) throw applicationError('recipe_export_schema_unavailable', cached.reason);
        const privacyReason: { reason?: string } = {};
        const safeObjectInfo = redactAgentGraphValue(cached.schema.objectInfo, 0, privacyReason);
        if (privacyReason.reason) throw applicationError('recipe_export_schema_unsafe', privacyReason.reason);
        let schemaFingerprint: string;
        let exportFingerprint: string;
        try {
          [schemaFingerprint, exportFingerprint] = await Promise.all([
            fingerprintRecipeExport(safeObjectInfo),
            fingerprintRecipeExport(workflowGraph),
          ]);
        } catch {
          throw applicationError('recipe_export_fingerprint_unavailable', 'The selected schema or pinned recipe export could not be fingerprinted safely.');
        }
        if (schemaFingerprint !== exportedRecipe.objectInfoFingerprint || exportFingerprint !== exportedRecipe.exportFingerprint) {
          throw applicationError('recipe_export_fingerprint_mismatch', 'The supplied pinned recipe export or selected backend schema changed after export capture.');
        }
        assertApplicationProject(command);
        assertApplicationPanel(command, panel.id);
        if (requireSelectedApplicationBackend(backend.id).url !== backend.url) throw applicationError('backend_scope_changed', 'The managed backend changed during export fingerprint verification. Refresh the application snapshot before continuing.');
        const exportAgeAfterHash = Date.now() - Date.parse(exportedRecipe.capturedAt);
        if (!Number.isFinite(exportAgeAfterHash) || exportAgeAfterHash < 0 || exportAgeAfterHash >= 5 * 60 * 1000) {
          throw applicationError('recipe_export_stale', 'The supplied pinned recipe export expired during schema verification. Request a fresh export.');
        }
      }
      const parsed = getWorkflowParser().parseWorkflow(workflowGraph, objectInfo);
      const inputBindings = Array.isArray(recipe.inputBindings) ? recipe.inputBindings : [];
      const safeRoles = new Set(['prompt', 'negative_prompt', 'seed', 'width', 'height', 'duration_seconds', 'fps', 'aspect_ratio', 'image', 'reference_image', 'first_frame', 'last_frame']);
      const usedNames = new Set<string>();
      const ltxPins: Record<string, { nodeId: string; nodeClass: string; inputName: string }> = {
        prompt: { nodeId: isLtxI2vExport ? '398:376' : '405:376', nodeClass: 'PrimitiveStringMultiline', inputName: 'value' },
        duration_seconds: { nodeId: isLtxI2vExport ? '398:362' : '405:362', nodeClass: 'PrimitiveInt', inputName: 'value' },
        fps: { nodeId: isLtxI2vExport ? '398:361' : '405:361', nodeClass: 'PrimitiveInt', inputName: 'value' },
        seed: { nodeId: isLtxI2vExport ? '398:339' : '405:339', nodeClass: 'RandomNoise', inputName: 'noise_seed' },
        aspect_ratio: { nodeId: isLtxI2vExport ? '403' : '409', nodeClass: 'ResolutionSelector', inputName: 'aspect_ratio' },
        ...(isLtxI2vExport ? { first_frame: { nodeId: '395', nodeClass: 'LoadImage', inputName: 'image' } } : {}),
      };
      const miniMaxRoles = isMiniMaxI2vExport
        ? ['prompt', 'duration_seconds', 'seed', 'aspect_ratio', 'first_frame']
        : ['prompt', 'duration_seconds', 'seed', 'aspect_ratio'];
      const miniMaxPins: Record<string, { nodeId: string; nodeClass: string; inputName: string }> = {
        prompt: { nodeId: isMiniMaxI2vExport || isMiniMaxFastH3Export ? '105:104' : '140:131', nodeClass: 'MiniMaxH3ImageToVideo', inputName: 'prompt' },
        duration_seconds: { nodeId: isMiniMaxI2vExport || isMiniMaxFastH3Export ? '105:111' : '140:133', nodeClass: 'PrimitiveFloat', inputName: 'value' },
        seed: { nodeId: isMiniMaxI2vExport || isMiniMaxFastH3Export ? '105:15' : '140:129', nodeClass: 'RandomNoise', inputName: 'noise_seed' },
        aspect_ratio: { nodeId: isMiniMaxFastH3Export ? '143' : '115', nodeClass: 'ResolutionSelector', inputName: 'aspect_ratio' },
        first_frame: { nodeId: '105:104', nodeClass: 'MiniMaxH3ImageToVideo', inputName: 'first_frame' },
      };
      if (exportedRecipe && (isMiniMaxT2vExport || isMiniMaxI2vExport || isMiniMaxFastH3Export)) {
        const roles = new Set(inputBindings.map(item => item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>).role : undefined));
        if (inputBindings.length !== miniMaxRoles.length || roles.size !== miniMaxRoles.length || miniMaxRoles.some(role => !roles.has(role))) {
          throw applicationError('recipe_export_binding_mismatch', 'The pinned MiniMax H3 export requires exactly one binding for each of its controls.');
        }
      }
      if (exportedRecipe && isLtxExport) {
        const roles = new Set(inputBindings.map(item => item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, unknown>).role : undefined));
        const roleCount = Object.keys(ltxPins).length;
        if (inputBindings.length !== roleCount || roles.size !== roleCount || Object.keys(ltxPins).some(role => !roles.has(role))) {
          throw applicationError('recipe_export_binding_mismatch', 'The pinned LTX export requires exactly one binding for each of its controls.');
        }
      }
      const rawNodes = (workflowGraphValue as Record<string, unknown>).nodes;
      const rawPromptNode = isKleinExport && Array.isArray(rawNodes) ? rawNodes.find(node => node && typeof node === 'object' && !Array.isArray(node)
        && String((node as Record<string, unknown>).id) === '76') as Record<string, unknown> | undefined : undefined;
      const promptWidgets = rawPromptNode?.widgets_values;
      if (exportedRecipe && isKleinExport && (!Array.isArray(promptWidgets) || typeof promptWidgets[0] !== 'string')) {
        throw applicationError('recipe_export_source_invalid', 'The pinned Klein prompt default is missing from source node 76.');
      }
      const kleinPins: Record<string, { sourceId: string; nodeId: string; nodeClass: string; inputName: string; default: unknown }> = {
        prompt: { sourceId: '76', nodeId: '76', nodeClass: 'PrimitiveStringMultiline', inputName: 'value', default: Array.isArray(promptWidgets) ? promptWidgets[0] : undefined },
        width: { sourceId: '68', nodeId: '77:68', nodeClass: 'PrimitiveInt', inputName: 'value', default: 1024 },
        height: { sourceId: '69', nodeId: '77:69', nodeClass: 'PrimitiveInt', inputName: 'value', default: 1024 },
        seed: { sourceId: '73', nodeId: '77:73', nodeClass: 'RandomNoise', inputName: 'noise_seed', default: 432262096973490 },
      };
      const proposedConfig: ParameterConfig[] = inputBindings.flatMap<ParameterConfig>((item, index) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) throw applicationError('invalid_recipe_binding', `Recipe input binding ${index} is invalid.`);
        let binding = item as Record<string, unknown>;
        const role = typeof binding.role === 'string' ? binding.role : '';
        if (exportedRecipe && isKleinExport) {
          const pin = kleinPins[role];
          if (!pin || String(binding.nodeId) !== pin.sourceId || binding.nodeClass !== pin.nodeClass
            || !Array.isArray(binding.widgetPath) || binding.widgetPath[0] !== 'widgets_values' || binding.widgetPath[1] !== 0) {
            throw applicationError('recipe_export_binding_mismatch', `Klein source binding '${role || '(missing)'}' does not match its pinned source node and widget.`);
          }
          binding = { ...binding, nodeId: pin.nodeId, inputName: pin.inputName, default: pin.default };
        }
        if (exportedRecipe && isLtxExport) {
          const pin = ltxPins[role];
          if (!pin || String(binding.nodeId) !== pin.nodeId || binding.nodeClass !== pin.nodeClass || binding.inputName !== pin.inputName) {
            throw applicationError('recipe_export_binding_mismatch', `LTX source binding '${role || '(missing)'}' does not match its pinned API node and input.`);
          }
          if (isLtxI2vExport && role === 'first_frame' && (binding.sourceImageNodeId !== 395 || binding.required !== true || binding.ordinal !== 1 || binding.default !== undefined)) {
            throw applicationError('recipe_export_binding_mismatch', "LTX source binding 'first_frame' does not match its pinned image source and required media contract.");
          }
        }
        if (exportedRecipe && (isMiniMaxT2vExport || isMiniMaxI2vExport || isMiniMaxFastH3Export)) {
          const pin = miniMaxPins[role];
          if (!pin || String(binding.nodeId) !== pin.nodeId || binding.nodeClass !== pin.nodeClass || binding.inputName !== pin.inputName
            || role === 'first_frame' && isMiniMaxI2vExport && (binding.sourceImageNodeId !== 114 || binding.required !== true || binding.ordinal !== 1)) {
            throw applicationError('recipe_export_binding_mismatch', `MiniMax H3 source binding '${role || '(missing)'}' does not match its pinned API node and input.`);
          }
        }
        if (!safeRoles.has(role)) {
          if (binding.required === true) throw applicationError('recipe_control_role_unsupported', `Required recipe input role '${role || '(missing)'}' is not supported by the panel controls.`);
          return [];
        }
        const nodeId = String(binding.nodeId ?? '');
        const node = findWorkflowNode(workflowGraph, nodeId);
        if (!node || getWorkflowNodeClassType(node) !== binding.nodeClass) {
          throw applicationError('recipe_control_node_mismatch', `Recipe input '${role}' does not match its pinned node binding.`);
        }
        if ((role === 'reference_image' || exportedRecipe && (isMiniMaxI2vExport || isLtxI2vExport) && role === 'first_frame') && binding.sourceImageNodeId !== undefined) {
          const sourceNodeId = String(binding.sourceImageNodeId ?? '');
          const sourceNode = findWorkflowNode(workflowGraph, sourceNodeId);
          const sourceNodeClass = sourceNode ? getWorkflowNodeClassType(sourceNode) : '';
          if (!sourceNode || (exportedRecipe && role === 'first_frame' && (isMiniMaxI2vExport || isLtxI2vExport) ? sourceNodeClass !== 'LoadImage' : !['LoadImage', 'LoadImageOutput'].includes(sourceNodeClass))) {
            throw applicationError('recipe_reference_image_source_mismatch', `Recipe input '${role}' does not match its pinned LoadImage source.`);
          }
          const imageMatches = parsed.image_inputs.filter(input => input.node_id === sourceNodeId && input.input_name === 'image');
          if (imageMatches.length !== 1) {
            throw applicationError('recipe_reference_image_unmapped', `Recipe input '${role}' has no unique parsed image input for its pinned source node.`);
          }
          const input = imageMatches[0];
          const ordinal = Number.isInteger(binding.ordinal) ? String(binding.ordinal) : String(index + 1);
          const name = `${role}_${ordinal}`;
          if (usedNames.has(name)) throw applicationError('recipe_reference_image_unmapped', `Recipe input '${role}' duplicates image binding '${name}'.`);
          usedNames.add(name);
          return [{
            name,
            display_name: `${input.display_name} ${ordinal}`,
            node_id: input.node_id,
            input_name: input.input_name,
            type: 'image' as const,
            requiredMedia: binding.required === true,
            default: '',
            description: input.description,
            order: index,
            exposed: true,
            category: 'image_input' as const,
            auto_detected: true,
            user_modified: false,
          }];
        }
        const hasInputName = Object.prototype.hasOwnProperty.call(binding, 'inputName');
        if (hasInputName && (typeof binding.inputName !== 'string' || !binding.inputName.trim())) {
          throw applicationError('recipe_control_input_name_invalid', `Recipe input '${role}' has an invalid pinned input name; expected a nonempty string.`);
        }
        const matches = parsed.parameters.filter(parameter => parameter.node_id === nodeId && (!hasInputName || parameter.input_name === binding.inputName));
        if (matches.length !== 1) {
          throw applicationError('recipe_control_unmapped', `Recipe input '${role}' has no unique API-format widget mapping in the current workflow parser.`);
        }
        const parameter = matches[0];
        if (binding.default !== undefined && JSON.stringify(parameter.default) !== JSON.stringify(binding.default)) {
          throw applicationError('recipe_control_default_mismatch', `Recipe input '${role}' does not match its pinned source default.`);
        }
        const name = usedNames.has(role) ? `${role}_${nodeId}` : role;
        usedNames.add(name);
        return [{
          ...parameter,
          type: role === 'prompt' ? 'prompt' as const : parameter.type,
          name,
          display_name: role.replace(/_/g, ' ').replace(/\b\w/g, letter => letter.toUpperCase()),
          order: index,
          exposed: true,
          category: 'parameter' as const,
          auto_detected: true,
          user_modified: false,
        }];
      });
      if (proposedConfig.length === 0) throw applicationError('recipe_controls_unavailable', 'No explicitly bound prompt or generation controls can be represented by the current API-format parser.');
      const checked = validateWorkflowControls(workflowGraph, proposedConfig, objectInfo, backend.url);
      const taskCategories: Partial<Record<string, TabType>> = {
        t2i: 'image-generation',
        t2v: 'video-generation',
        i2v: 'video-generation',
        ref2v: 'video-generation',
        first_last: 'video-generation',
      };
      const recipeTask = typeof recipeTarget.task === 'string' ? recipeTarget.task : null;
      const category = recipeTask === null
        ? (isTabType(activeTab) ? activeTab : 'image-generation')
        : taskCategories[recipeTask];
      if (!category) throw applicationError('unsupported_workflow_task', `The exact recipe task '${recipeTask}' has no Storyboard workflow route.`);
      const taskSubCategories: Partial<Record<string, SubTabType>> = {
        t2i: 'text2img',
        t2v: 'txt2vid',
        i2v: 'img2vid',
        ref2v: 'img2vid',
        first_last: 'fflf',
      };
      const subCategory = recipeTask === null
        ? getDefaultSubCategory(category)
        : taskSubCategories[recipeTask];
      if (!subCategory) throw applicationError('unsupported_workflow_task', `The exact recipe task '${recipeTask}' has no Storyboard subcategory.`);
      const origin = sourceGraph.origin && typeof sourceGraph.origin === 'object' ? sourceGraph.origin as Record<string, unknown> : {};
      const workflow: Workflow = {
        id: crypto.randomUUID(),
        name: typeof recipe.title === 'string' ? recipe.title : command.source.recipeId,
        description: typeof recipe.summary === 'string' ? recipe.summary : '',
        category,
        subCategory,
        workflow: workflowGraph,
        parsed: checked.parsed,
        config: checked.config,
        createdAt: Date.now(),
        recipeId: command.source.recipeId,
        sourceGraphFingerprint: command.source.sourceGraphFingerprint,
        recipeFingerprint,
        sourceProvenance: [origin],
      };
      const preparedRevisionId = crypto.randomUUID();
      if (preparedWorkflowRevisionsRef.current.size >= 32) {
        const oldest = preparedWorkflowRevisionsRef.current.keys().next().value;
        if (oldest) preparedWorkflowRevisionsRef.current.delete(oldest);
      }
      if (checked.errors.length === 0) {
        preparedWorkflowRevisionsRef.current.set(preparedRevisionId, {
          workflow,
          projectIdentity: command.projectIdentity,
          consoleBindingId: projectScopeRef.current.bindingId,
          panelId: panel.id,
          panelRevision: command.expectedPanelRevision!,
          workflowRevision: null,
          backendId: backend.id,
          backendUrl: backend.url,
        });
      }
      const proposedControls = checked.config.filter(control => control.exposed).map(control => `${control.node_id}.${control.input_name}`);
      return {
        valid: checked.errors.length === 0,
        blocked: false,
        preparedRevisionId: checked.errors.length === 0 ? preparedRevisionId : undefined,
        workflowId: workflow.id,
        baseRevision: null,
        backendId: backend.id,
        recipeId: command.source.recipeId,
        sourceGraphFingerprint: command.source.sourceGraphFingerprint,
        recipeFingerprint,
        lockedRecipeSettings: (recipe.controlProposal as Record<string, unknown> | undefined)?.lockedRecipeSettings ?? [],
        recipeSettings: recipe.recipeSettings,
        exposedControls: checked.config.filter(control => control.exposed).map(control => ({ name: control.name, nodeId: control.node_id, inputName: control.input_name, type: control.type })),
        hiddenControlCount: checked.config.filter(control => !control.exposed).length,
        changes: { addedBindings: proposedControls, removedBindings: [] },
        preservesPinnedGraph: true,
        preservesRecipeSettings: true,
        validationErrors: checked.errors,
      };
    },
    save_and_attach_workflow: async command => {
      await flushPendingWorkflowSave();
      assertApplicationProject(command);
      const panel = assertApplicationPanel(command, command.target.panelId);
      const selected = selectedPanelIdRef.current === panel.id;
      const selectedWorkflowAtStart = selectedWorkflowIdRef.current;
      let workflow: Workflow;
      let preparedId: string | undefined;
      let preparedBackend: { id: string; url: string } | undefined;
      if (command.input.preparedRevisionId) {
        preparedId = command.input.preparedRevisionId;
        const prepared = preparedWorkflowRevisionsRef.current.get(preparedId);
        if (!prepared) {
          throw applicationError('stale_preparation', 'The prepared workflow revision is missing. Prepare it again for the active project.');
        }
        if (prepared.consoleBindingId !== projectScopeRef.current.bindingId) {
          throw applicationError('stale_console_binding', 'The Console project activation changed after this workflow was prepared. Prepare it again for the active activation.');
        }
        if (prepared.projectIdentity !== command.projectIdentity || prepared.panelId !== panel.id
          || prepared.panelRevision !== command.expectedPanelRevision || prepared.workflowRevision !== (command.expectedWorkflowRevision ?? null)) {
          throw applicationError('stale_preparation', 'The prepared workflow revision no longer matches this project, panel and base revision. Prepare it again.');
        }
        if (prepared.workflowRevision !== null) assertApplicationWorkflow(command, prepared.workflow.id);
        else if (workflowsRef.current.some(item => item.id === prepared.workflow.id)) throw applicationError('workflow_id_conflict', 'The new workflow ID is already in use.');
        workflow = prepared.workflow;
        preparedBackend = { id: prepared.backendId, url: prepared.backendUrl };
      } else {
        const workflowId = command.input.workflowId || command.target.workflowId;
        if (!workflowId || command.input.workflowId && command.target.workflowId && command.input.workflowId !== command.target.workflowId) {
          throw applicationError('workflow_id_required', 'Retrying an attachment requires the exact saved workflow ID.');
        }
        if (command.input.workflowRevision === undefined || command.expectedWorkflowRevision !== command.input.workflowRevision) {
          throw applicationError('workflow_revision_required', 'Retrying an attachment requires the exact saved workflow revision.');
        }
        workflow = assertApplicationWorkflow(command, workflowId);
      }
      if (command.target.workflowId && command.target.workflowId !== workflow.id) throw applicationError('workflow_id_mismatch', 'The target workflow does not match the prepared revision.');
      if (preparedBackend && (!selectedBackendIdsRef.current.includes(preparedBackend.id)
        || !orchestratorManager.getNodes().some(node => node.id === preparedBackend!.id && node.url === preparedBackend!.url))) {
        throw applicationError('prepared_revision_stale', 'The prepared backend is no longer selected with the same managed endpoint. Prepare the recipe again.');
      }
      const currentWorkflows = workflowsRef.current;
      const alreadyStored = currentWorkflows.some(item => item.id === workflow.id);
      const requestedFingerprint = workflowContentFingerprint(workflow);
      setWorkflows(alreadyStored
        ? currentWorkflows.map(item => item.id === workflow.id ? workflow : item)
        : [...currentWorkflows, workflow]);
      await persistDirtyWorkflows();
      if (preparedBackend && (!selectedBackendIdsRef.current.includes(preparedBackend.id)
        || !orchestratorManager.getNodes().some(node => node.id === preparedBackend!.id && node.url === preparedBackend!.url))) {
        return { status: 'saved-unattached', workflowId: workflow.id, reason: 'backend_scope_changed_during_workflow_save' };
      }
      const savedWorkflow = workflowsRef.current.find(item => item.id === workflow.id);
      if (!savedWorkflow?.revision) throw applicationError('workflow_save_incomplete', 'The workflow was not confirmed by canonical storage.');
      if (preparedId) preparedWorkflowRevisionsRef.current.delete(preparedId);
      if (workflowContentFingerprint(savedWorkflow) !== requestedFingerprint
        || workflowPersistedFingerprintRef.current.get(savedWorkflow.id) !== requestedFingerprint) {
        return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'workflow_changed_during_save' };
      }
      if (!isApplicationProjectCurrent(command)) {
        return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'project_scope_changed' };
      }
      const currentPanel = panelsRef.current.find(item => item.id === panel.id);
      const stillSelected = selectedPanelIdRef.current === panel.id;
      if (!currentPanel || panelRevisionRef.current.get(panel.id) !== command.expectedPanelRevision
        || stillSelected !== selected
        || selected && selectedWorkflowIdRef.current !== selectedWorkflowAtStart) {
        return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'panel_changed_during_workflow_save' };
      }
      const settingsSnapshot = { ...projectManager.getProject() };
      const sourceValues = currentPanel.parameterValues || {};
      const nextValues = workflowParameterDefaults(savedWorkflow, sourceValues);
      const nextPanel = {
        ...currentPanel,
        workflowId: savedWorkflow.id,
        parameterValues: nextValues,
        enhancementPreferences: currentPanel.enhancementPreferences
          ? { ...currentPanel.enhancementPreferences, referenceOrderConfirmed: false, mappingFingerprint: undefined }
          : currentPanel.enhancementPreferences,
      };
      const panelRevisionBeforeSave = panelRevisionRef.current.get(panel.id);
      const inputRevisionBeforeSave = panelInputRevisionRef.current.get(panel.id);
      const nextPanels = panelsRef.current.map(item => item.id === panel.id ? nextPanel : item);
      const nextSelectedWorkflowId = selected ? savedWorkflow.id : selectedWorkflowIdRef.current || undefined;
      let savedProject: { success: boolean; savedPath?: string; error?: string };
      try {
        savedProject = await saveProjectSnapshot(
          nextPanels,
          selected ? nextValues : parameterValuesRef.current,
          nextSelectedWorkflowId,
          settingsSnapshot,
        );
      } catch (error) {
        return {
          status: 'saved-unattached',
          workflowId: savedWorkflow.id,
          workflowRevision: savedWorkflow.revision,
          reason: 'project_attachment_save_failed',
          message: error instanceof Error ? error.message : String(error),
        };
      }
      if (!isApplicationProjectCurrent(command)) {
        return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'project_scope_changed', savedPath: savedProject.savedPath };
      }
      if (preparedBackend && (!selectedBackendIdsRef.current.includes(preparedBackend.id)
        || !orchestratorManager.getNodes().some(node => node.id === preparedBackend!.id && node.url === preparedBackend!.url))) {
        return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'backend_scope_changed_during_project_attachment', savedPath: savedProject.savedPath };
      }
      if (panelRevisionRef.current.get(panel.id) !== panelRevisionBeforeSave || panelInputRevisionRef.current.get(panel.id) !== inputRevisionBeforeSave) {
        try { await repairCurrentProjectSnapshot(settingsSnapshot); } catch (error) {
          return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'panel_changed_and_repair_failed', message: error instanceof Error ? error.message : String(error), savedPath: savedProject.savedPath };
        }
        return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'panel_changed_during_attachment', savedPath: savedProject.savedPath };
      }
      if (preparedBackend && !orchestratorManager.getNodes().some(node => node.id === preparedBackend!.id && node.url === preparedBackend!.url)) {
        try { await repairCurrentProjectSnapshot(settingsSnapshot); } catch (error) {
          return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'backend_changed_and_repair_failed', message: error instanceof Error ? error.message : String(error), savedPath: savedProject.savedPath };
        }
        return { status: 'saved-unattached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, reason: 'backend_changed_during_attachment', savedPath: savedProject.savedPath };
      }
      if (selected) {
        skipParameterReset.current = true;
        parameterValuesRef.current = nextValues;
        setParameterValues(nextValues);
        setSelectedWorkflowId(savedWorkflow.id);
        if (currentPanel.enhancementPreferences) {
          enhancementPreferencesRef.current = nextPanel.enhancementPreferences!;
          setEnhancementPreferences(nextPanel.enhancementPreferences!);
        }
      }
      setPanels(nextPanels);
      return { status: 'saved-and-attached', workflowId: savedWorkflow.id, workflowRevision: savedWorkflow.revision, panelId: panel.id, panelRevision: panelRevisionRef.current.get(panel.id), savedPath: savedProject.savedPath };
    },
    bind_media: async command => {
      await flushPendingWorkflowSave();
      assertApplicationProject(command);
      const panel = assertApplicationPanel(command, command.target.panelId);
      assertPanelWorkflow(panel, command.target.workflowId);
      const workflow = assertApplicationWorkflow(command, command.target.workflowId);
      const uniqueBackendIds = [...new Set(command.target.backendIds)];
      if (uniqueBackendIds.length !== command.target.backendIds.length || uniqueBackendIds.length === 0) throw applicationError('invalid_backend_selection', 'Media binding requires a non-empty unique backend list.');
      const backends = uniqueBackendIds.map(id => requireSelectedApplicationBackend(id));
      const inlineMedia = command.input?.media;
      const assetId = command.input?.assetId;
      if (!command.input?.bindingId || Boolean(inlineMedia) === Boolean(assetId)) throw applicationError('invalid_media', 'Media binding needs a named input and exactly one inline media item or library asset.');
      let mediaKind: 'image' | 'video';
      let mediaMimeType: string;
      let mediaBlob: Blob | null = null;
      let assetFile: File | undefined;
      let mediaMatch: RegExpMatchArray | null = null;
      if (assetId) {
        const asset = getAgentMediaAsset(assetId);
        if (!asset) throw applicationError('media_asset_unavailable', 'The selected media library asset is no longer available.');
        if (asset.kind === 'audio') throw applicationError('unsupported_media_type', 'Audio assets cannot be bound to this workflow input.');
        if (asset.file.size === 0) throw applicationError('invalid_media', 'The selected media library asset is empty.');
        if (asset.file.size > 256 * 1024 * 1024) throw applicationError('media_too_large', 'The selected media library asset exceeds the 256 MiB limit.');
        const assetMimeType = asset.mimeType.toLowerCase();
        if (!/^(image|video)\/[a-z0-9.+-]+$/.test(assetMimeType) || assetMimeType.split('/')[0] !== asset.kind) {
          throw applicationError('media_type_mismatch', 'The media kind does not match its MIME type.');
        }
        mediaKind = asset.kind;
        mediaMimeType = asset.mimeType;
        mediaBlob = asset.file;
        assetFile = asset.file;
      } else {
        if (!inlineMedia || typeof inlineMedia.dataUrl !== 'string') throw applicationError('invalid_media', 'Media binding needs a data URL or a media library asset.');
        if (inlineMedia.dataUrl.length > 5_600_000) throw applicationError('media_too_large', 'Media data exceeds the 4 MiB transfer limit for this local bridge.');
        mediaMatch = inlineMedia.dataUrl.match(/^data:((?:image|video)\/[a-zA-Z0-9.+-]+);base64,([A-Za-z0-9+/=]+)$/);
        if (!mediaMatch || !mediaMatch[2].length) throw applicationError('invalid_media', 'Media must be a base64 image or video data URL.');
        if (mediaMatch[1].split('/')[0] !== inlineMedia.kind) throw applicationError('media_type_mismatch', 'The media kind does not match its MIME type.');
        mediaKind = inlineMedia.kind;
        mediaMimeType = mediaMatch[1];
      }
      const assetIsCurrent = () => !assetId || getAgentMediaAsset(assetId)?.file === assetFile;
      const control = workflow.config.find(item => item.exposed && item.category === 'image_input' && item.name === command.input.bindingId);
      if (!control) throw applicationError('binding_not_exposed', 'The requested media input is not explicitly exposed by this workflow.');
      const schemas = await Promise.all(backends.map(async backend => ({ backend, definitions: await nodeDefinitions.fetchDefinitions(backend.url) })));
      assertApplicationProject(command);
      assertApplicationBackendsSelected(backends);
      assertApplicationPanel(command, panel.id);
      assertApplicationWorkflow(command, workflow.id);
      if (backends.some(backend => !orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url))) {
        throw applicationError('backend_scope_changed', 'A managed backend changed during media-input schema validation. Refresh the application snapshot before continuing.');
      }
      const validationErrors = schemas.flatMap(({ backend, definitions }) => {
        const checked = validateWorkflowControls(workflow.workflow, workflow.config, definitions, backend.url);
        return checked.errors.map(error => `${backend.name}: ${error}`);
      });
      if (validationErrors.length) throw applicationError('workflow_schema_invalid', validationErrors.join(' '));
      assertApplicationProject(command);
      assertApplicationPanel(command, panel.id);
      assertApplicationWorkflow(command, workflow.id);
      if (assetId && !assetIsCurrent()) throw applicationError('media_asset_changed', 'The selected media library asset was removed or changed before upload.');
      if (inlineMedia && mediaMatch) {
        const byteLength = Math.floor(mediaMatch[2].length * 3 / 4) - (mediaMatch[2].endsWith('==') ? 2 : mediaMatch[2].endsWith('=') ? 1 : 0);
        if (byteLength > 4 * 1024 * 1024) throw applicationError('media_too_large', 'Media data exceeds the 4 MiB transfer limit for this local bridge.');
        const mediaResponse = await fetch(inlineMedia.dataUrl);
        if (!mediaResponse.ok) throw applicationError('invalid_media', 'The current-turn handoff media could not be decoded.');
        assertApplicationProject(command);
        assertApplicationBackendsSelected(backends);
        if (backends.some(backend => !orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url))) {
          throw applicationError('backend_scope_changed', 'A managed backend changed before the selected media could be uploaded.');
        }
        mediaBlob = await mediaResponse.blob();
        assertApplicationProject(command);
        assertApplicationPanel(command, panel.id);
        assertApplicationWorkflow(command, workflow.id);
        if (backends.some(backend => !orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url))) {
          throw applicationError('backend_scope_changed', 'A managed backend changed before the selected media could be uploaded.');
        }
      }
      if (!assetIsCurrent()) throw applicationError('media_asset_changed', 'The selected media library asset was removed or changed before upload.');
      if (!mediaBlob) throw applicationError('invalid_media', 'The selected media could not be read.');
      const uploadBlob = mediaBlob;
      const extension = mediaMimeType.split('/')[1].replace(/[^a-zA-Z0-9]/g, '').slice(0, 10) || (mediaKind === 'video' ? 'mp4' : 'png');
      const fileName = `storyboard_${command.commandId.replace(/[^a-zA-Z0-9_-]/g, '')}_${control.name.replace(/[^a-zA-Z0-9_-]/g, '_')}.${extension}`;
      const uploadResults = await Promise.allSettled(backends.map(async backend => {
        const form = new FormData();
        form.append('image', new File([uploadBlob], fileName, { type: mediaMimeType }));
        form.append('overwrite', 'true');
        const response = await fetch(`${backend.url.replace(/\/+$/, '')}/upload/image`, { method: 'POST', body: form, redirect: 'error' });
        if (!response.ok) throw new Error(`${backend.name} returned HTTP ${response.status}`);
        const payload = await response.json() as { name?: unknown };
        if (typeof payload.name !== 'string' || !payload.name) throw new Error(`${backend.name} returned no uploaded filename`);
        return { backendId: backend.id, name: payload.name };
      }));
      const uploaded = uploadResults.flatMap(result => result.status === 'fulfilled' ? [result.value] : []);
      const failures = uploadResults.flatMap((result, index) => result.status === 'rejected' ? [`${backends[index].name}: ${String(result.reason)}`] : []);
      if (!assetIsCurrent()) {
        return { status: 'uploaded-unbound', bindingId: control.name, uploaded, failures, reason: 'media_asset_changed' };
      }
      const backendSelectionChanged = backends.some(backend => !selectedBackendIdsRef.current.includes(backend.id));
      const projectScopeChanged = !isApplicationProjectCurrent(command);
      const backendScopeChanged = backends.some(backend => !orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url));
      if (projectScopeChanged || backendScopeChanged || backendSelectionChanged) {
        return {
          status: 'uploaded-unbound',
          bindingId: control.name,
          uploaded,
          failures,
          reason: projectScopeChanged ? 'project_scope_changed' : backendSelectionChanged ? 'backend_selection_changed' : 'backend_scope_changed',
        };
      }
      if (failures.length || uploaded.length !== backends.length || new Set(uploaded.map(item => item.name)).size !== 1) {
        throw applicationError('media_upload_partial', `Media was not bound to the panel. Some backends may contain an orphaned upload. ${failures.join('; ')}`);
      }
      if (backends.some(backend => !orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url))) {
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'backend_scope_changed' };
      }
      if (backends.some(backend => !selectedBackendIdsRef.current.includes(backend.id))) {
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'backend_selection_changed' };
      }
      if (!isApplicationProjectCurrent(command)) {
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'project_scope_changed' };
      }
      const currentPanel = assertApplicationPanel(command, panel.id);
      assertPanelWorkflow(currentPanel, workflow.id);
      const selected = selectedPanelIdRef.current === panel.id;
      const currentValues = currentPanel.parameterValues || {};
      const nextValues = { ...currentValues, [control.name]: uploaded[0].name };
      const invalidatedPreferences = currentPanel.enhancementPreferences
        ? { ...currentPanel.enhancementPreferences, referenceOrderConfirmed: false, mappingFingerprint: undefined }
        : undefined;
      const nextPanel = { ...currentPanel, parameterValues: nextValues, enhancementPreferences: invalidatedPreferences };
      const settingsSnapshot = { ...projectManager.getProject() };
      const panelRevisionBeforeSave = panelRevisionRef.current.get(panel.id);
      const inputRevisionBeforeSave = panelInputRevisionRef.current.get(panel.id);
      const savedProject = await saveProjectSnapshot(
        panelsRef.current.map(item => item.id === panel.id ? nextPanel : item),
        selected ? nextValues : parameterValuesRef.current,
        selectedWorkflowIdRef.current || currentPanel.workflowId,
        settingsSnapshot,
      );
      if (backends.some(backend => !selectedBackendIdsRef.current.includes(backend.id))) {
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'backend_selection_changed', savedPath: savedProject.savedPath };
      }
      if (!isApplicationProjectCurrent(command)) {
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'project_scope_changed', savedPath: savedProject.savedPath };
      }
      const currentWorkflow = workflowsRef.current.find(item => item.id === workflow.id);
      if (!currentWorkflow || currentWorkflow.revision !== workflow.revision
        || workflowContentFingerprint(currentWorkflow) !== workflowContentFingerprint(workflow)) {
        try { await repairCurrentProjectSnapshot(settingsSnapshot); } catch (error) {
          return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'workflow_changed_and_repair_failed', message: error instanceof Error ? error.message : String(error), savedPath: savedProject.savedPath };
        }
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'workflow_changed_during_binding', savedPath: savedProject.savedPath };
      }
      if (backends.some(backend => !orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url))) {
        try { await repairCurrentProjectSnapshot(settingsSnapshot); } catch (error) {
          return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'backend_changed_and_repair_failed', message: error instanceof Error ? error.message : String(error), savedPath: savedProject.savedPath };
        }
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'backend_scope_changed', savedPath: savedProject.savedPath };
      }
      if (panelRevisionRef.current.get(panel.id) !== panelRevisionBeforeSave || panelInputRevisionRef.current.get(panel.id) !== inputRevisionBeforeSave) {
        await repairCurrentProjectSnapshot(settingsSnapshot);
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'panel_changed_during_binding', savedPath: savedProject.savedPath };
      }
      if (!assetIsCurrent()) {
        try { await repairCurrentProjectSnapshot(settingsSnapshot); } catch (error) {
          return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'media_asset_changed_and_repair_failed', message: error instanceof Error ? error.message : String(error), savedPath: savedProject.savedPath };
        }
        return { status: 'uploaded-unbound', bindingId: control.name, backendIds: uploaded.map(item => item.backendId), reason: 'media_asset_changed', savedPath: savedProject.savedPath };
      }
      if (selected) {
        parameterValuesRef.current = nextValues;
        setParameterValues(nextValues);
        if (invalidatedPreferences) {
          enhancementPreferencesRef.current = invalidatedPreferences;
          setEnhancementPreferences(invalidatedPreferences);
        }
      }
      setPanels(panelsRef.current.map(item => item.id === panel.id ? nextPanel : item));
      return { status: 'bound', bindingId: control.name, fileName: uploaded[0].name, backendIds: uploaded.map(item => item.backendId), mediaKind, panelId: panel.id, panelRevision: panelRevisionRef.current.get(panel.id), inputRevision: panelInputRevisionRef.current.get(panel.id), projectRevision: projectScopeRef.current.revision, workflowId: workflow.id, workflowRevision: workflow.revision };
    },
    set_panel_parameters: async command => {
      const userRequest = getActiveConsoleUserRequest(command.projectIdentity);
      if (!userRequest) throw applicationError('console_turn_required', 'Parameter changes must run inside the current Console user turn.');
      await flushPendingWorkflowSave();
      if (getActiveConsoleUserRequest(command.projectIdentity)?.turnId !== userRequest.turnId) throw applicationError('console_turn_changed', 'The Console user turn changed before parameter validation.');
      assertApplicationProject(command);
      const panel = assertApplicationPanel(command, command.target.panelId);
      assertPanelWorkflow(panel, command.target.workflowId);
      const workflow = assertApplicationWorkflow(command, command.target.workflowId);
      const backend = requireSelectedApplicationBackend(command.target.backendId);
      const definitions = await nodeDefinitions.fetchDefinitions(backend.url);
      if (getActiveConsoleUserRequest(command.projectIdentity)?.turnId !== userRequest.turnId) throw applicationError('console_turn_changed', 'The Console user turn changed during parameter schema validation.');
      assertApplicationProject(command);
      assertApplicationPanel(command, panel.id);
      assertApplicationWorkflow(command, workflow.id);
      if (!orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url)
        || !selectedBackendIdsRef.current.includes(backend.id)) {
        throw applicationError('backend_scope_changed', 'The managed backend changed during parameter schema validation. Refresh the application snapshot before continuing.');
      }
      const checked = validateWorkflowControls(workflow.workflow, workflow.config, definitions, backend.url);
      if (checked.errors.length) throw applicationError('workflow_schema_invalid', checked.errors.join(' '));
      const errors = validatePanelParameterValues(checked.config, command.input.values);
      if (errors.length) throw applicationError('invalid_parameters', errors.join(' '));
      assertApplicationProject(command);
      const currentPanel = assertApplicationPanel(command, panel.id);
      assertPanelWorkflow(currentPanel, workflow.id);
      const selected = selectedPanelIdRef.current === panel.id;
      const nextValues = { ...(currentPanel.parameterValues || {}), ...command.input.values };
      const nextPanel = { ...currentPanel, parameterValues: nextValues };
      const settingsSnapshot = { ...projectManager.getProject() };
      const panelRevisionBeforeSave = panelRevisionRef.current.get(panel.id);
      const inputRevisionBeforeSave = panelInputRevisionRef.current.get(panel.id);
      const savedProject = await saveProjectSnapshot(
        panelsRef.current.map(item => item.id === panel.id ? nextPanel : item),
        selected ? nextValues : parameterValuesRef.current,
        selectedWorkflowIdRef.current || currentPanel.workflowId,
        settingsSnapshot,
      );
      if (!selectedBackendIdsRef.current.includes(backend.id)) {
        return { status: 'saved-unapplied', panelId: panel.id, workflowId: workflow.id, reason: 'backend_selection_changed', savedPath: savedProject.savedPath };
      }
      if (getActiveConsoleUserRequest(command.projectIdentity)?.turnId !== userRequest.turnId) {
        return { status: 'saved-unapplied', panelId: panel.id, workflowId: workflow.id, reason: 'console_turn_changed', savedPath: savedProject.savedPath };
      }
      if (!isApplicationProjectCurrent(command)) {
        return { status: 'saved-unapplied', panelId: panel.id, workflowId: workflow.id, reason: 'project_scope_changed', savedPath: savedProject.savedPath };
      }
      const currentWorkflow = workflowsRef.current.find(item => item.id === workflow.id);
      if (!currentWorkflow || currentWorkflow.revision !== workflow.revision
        || workflowContentFingerprint(currentWorkflow) !== workflowContentFingerprint(workflow)) {
        return { status: 'saved-unapplied', panelId: panel.id, workflowId: workflow.id, reason: 'workflow_changed_during_update', savedPath: savedProject.savedPath };
      }
      if (!orchestratorManager.getNodes().some(node => node.id === backend.id && node.url === backend.url)) {
        return { status: 'saved-unapplied', panelId: panel.id, workflowId: workflow.id, reason: 'backend_scope_changed', savedPath: savedProject.savedPath };
      }
      if (panelRevisionRef.current.get(panel.id) !== panelRevisionBeforeSave || panelInputRevisionRef.current.get(panel.id) !== inputRevisionBeforeSave) {
        await repairCurrentProjectSnapshot(settingsSnapshot);
        return { status: 'saved-unapplied', panelId: panel.id, workflowId: workflow.id, reason: 'panel_changed_during_update', savedPath: savedProject.savedPath };
      }
      if (selected) {
        enhancementRequestRevisionRef.current += 1;
        parameterValuesRef.current = nextValues;
        setParameterValues(nextValues);
      }
      setPanels(panelsRef.current.map(item => item.id === panel.id ? nextPanel : item));
      return { status: 'updated', panelId: panel.id, panelRevision: panelRevisionRef.current.get(panel.id), inputRevision: panelInputRevisionRef.current.get(panel.id), projectRevision: projectScopeRef.current.revision, workflowId: workflow.id, workflowRevision: workflow.revision, parameterNames: Object.keys(command.input.values) };
    },
    enhance_generation_prompt: async command => {
      assertApplicationProject(command);
      const userRequest = getActiveConsoleUserRequest(command.projectIdentity);
      if (!userRequest) throw applicationError('console_turn_required', 'Prompt preparation and validation must run inside the current Console user turn.');
      if (command.input.phase === 'prepare') {
        const preparationId = crypto.randomUUID();
        if (preparedConsolePromptsRef.current.size >= 16) {
          const oldest = preparedConsolePromptsRef.current.keys().next().value;
          if (oldest) preparedConsolePromptsRef.current.delete(oldest);
        }
        preparedConsolePromptsRef.current.set(preparationId, {
          projectIdentity: command.projectIdentity,
          projectRevision: command.expectedProjectRevision!,
          consoleBindingId: projectScopeRef.current.bindingId,
          turnId: userRequest.turnId,
          userRequest: userRequest.text,
        });
        assertApplicationProject(command);
        if (getActiveConsoleUserRequest(command.projectIdentity)?.turnId !== userRequest.turnId) {
          preparedConsolePromptsRef.current.delete(preparationId);
          throw applicationError('console_turn_changed', 'The Console user turn changed during prompt preparation. Prepare again in the current turn.');
        }
        return {
          status: 'prepared',
          preparationId,
          systemPrompt: 'Draft a generation prompt directly from the current Console user request. Follow the request without injecting Prompt Engineer or CPE constraints, target models, tasks, dialects, presets, or media rules. Return only the prompt text. This standalone Console prompt is not CPE-validated.',
          userPrompt: userRequest.text,
          warnings: ['Standalone, unconstrained Console prompt; no Prompt Engineer constraints or CPE validation are applied.'],
          action: 'Draft the generation prompt from this Console request; it will be treated as Console-authored and not CPE-validated.',
        };
      }

      const capture = preparedConsolePromptsRef.current.get(command.input.preparationId);
      if (!capture) {
        throw applicationError('stale_preparation', 'The prompt preparation is missing. Prepare it again in the current Console turn.');
      }
      if (capture.consoleBindingId !== projectScopeRef.current.bindingId) {
        throw applicationError('stale_console_binding', 'The Console project activation changed after prompt preparation. Prepare the prompt again in the active activation.');
      }
      if (capture.projectIdentity !== command.projectIdentity
        || capture.projectRevision !== command.expectedProjectRevision
        || capture.turnId !== userRequest.turnId
        || capture.userRequest !== userRequest.text) {
        throw applicationError('stale_preparation', 'The prompt preparation no longer matches the active project and Console turn. Prepare it again.');
      }
      const enhancedPrompt = command.input.enhancedPrompt;
      if (typeof enhancedPrompt !== 'string' || !enhancedPrompt.trim()) {
        throw applicationError('invalid_generation_prompt', 'The Console-authored generation prompt must be a nonempty string.');
      }
      if (enhancedPrompt.length > 20000) {
        throw applicationError('invalid_generation_prompt', 'The Console-authored generation prompt must be 20,000 characters or fewer.');
      }
      assertApplicationProject(command);
      if (getActiveConsoleUserRequest(command.projectIdentity)?.turnId !== capture.turnId) {
        throw applicationError('console_turn_changed', 'The Console user turn changed during prompt validation. Validate again in the current turn.');
      }
      preparedConsolePromptsRef.current.delete(command.input.preparationId);
      return {
        status: 'validated',
        enhancedPrompt,
        author: 'console',
        validation: 'standalone-unconstrained; not CPE-validated',
        warnings: ['Console-authored standalone prompt; no Prompt Engineer constraints or CPE validation were applied.'],
        action: 'validated only as nonempty text; no panel parameter, workflow, or Prompt Engineer state was changed',
      };
    },
    start_generation: async command => {
      const userRequest = getActiveConsoleUserRequest(command.projectIdentity);
      if (!userRequest) {
        throw applicationError('generation_not_authorized', 'Generation must be requested within an active user conversation turn.');
      }
      const assertGenerationRequest = () => {
        const current = getActiveConsoleUserRequest(command.projectIdentity);
        if (!current || current.turnId !== userRequest.turnId || current.text !== userRequest.text) {
          throw applicationError('generation_request_stale', 'The user generation request is no longer the active Console turn. Refresh the application snapshot before continuing.');
        }
      };
      await flushPendingWorkflowSave();
      assertGenerationRequest();
      assertApplicationProject(command);
      const panel = assertApplicationPanel(command, command.target.panelId);
      assertPanelWorkflow(panel, command.target.workflowId);
      const workflow = assertApplicationWorkflow(command, command.target.workflowId);
      const panelInputRevision = panelInputRevisionRef.current.get(panel.id) || 1;
      const backendIds = [...new Set(command.target.backendIds)];
      if (backendIds.length !== command.target.backendIds.length || backendIds.length === 0
        || command.target.mode === 'single' && backendIds.length !== 1
        || command.target.mode === 'parallel' && backendIds.length < 2) {
        throw applicationError('invalid_backend_selection', 'Generation needs unique backend IDs matching its single or parallel mode.');
      }
      const backends = backendIds.map(id => requireSelectedApplicationBackend(id));
      const schemas = await Promise.all(backends.map(async backend => ({
        backend,
        objectInfo: await nodeDefinitions.fetchDefinitions(backend.url),
      })));
      assertGenerationRequest();
      assertApplicationProject(command);
      assertApplicationBackendsSelected(backends);
      const currentPanel = assertApplicationPanel(command, panel.id);
      assertPanelWorkflow(currentPanel, workflow.id);
      assertApplicationWorkflow(command, workflow.id);
      if ((panelInputRevisionRef.current.get(panel.id) || 1) !== panelInputRevision
        || schemas.some(({ backend }, index) => requireSelectedApplicationBackend(backendIds[index]).url !== backend.url)) {
        throw applicationError('generation_preflight_stale', 'Panel inputs or backend configuration changed during schema validation. Refresh the snapshot and retry.');
      }
      const validationErrors = schemas.flatMap(({ backend, objectInfo }) =>
        validateWorkflowControls(workflow.workflow, workflow.config, objectInfo, backend.url).errors.map(error => `${backend.name}: ${error}`),
      );
      if (validationErrors.length) throw applicationError('workflow_schema_invalid', validationErrors.join(' '));
      const previousRun = getGenerationRunByIdempotencyKey(command.idempotencyKey);
      if (previousRun) {
        if (previousRun.projectIdentity !== command.projectIdentity || previousRun.panelId !== panel.id
          || previousRun.workflowId !== workflow.id || previousRun.workflowRevision !== workflow.revision) {
          throw applicationError('idempotency_conflict', 'This generation key already belongs to a different project, panel or workflow revision.');
        }
        return { runId: previousRun.runId, status: previousRun.status, submissions: previousRun.jobs.map(job => ({ backendId: job.backendId, promptId: job.promptId, status: job.status })) };
      }
      const missingRequiredMedia = workflow.config.filter(control => {
        if (control.category !== 'image_input' || control.requiredMedia !== true) return false;
        const value = currentPanel.parameterValues?.[control.name];
        return typeof value !== 'string' || !value.trim();
      });
      if (missingRequiredMedia.length) {
        throw applicationError('missing_required_media', `Bind required media for ${missingRequiredMedia.map(control => control.name).join(', ')} with bind_media before generation.`);
      }
      const options: GenerationRequestOptions = {
        runId: crypto.randomUUID(),
        commandId: command.commandId,
        idempotencyKey: command.idempotencyKey,
        projectIdentity: command.projectIdentity,
        projectRevision: command.expectedProjectRevision!,
        panelInputRevision: panelInputRevisionRef.current.get(panel.id) || 1,
        workflowId: workflow.id,
        backendIds,
        backendBindings: Object.fromEntries(backends.map(backend => [backend.id, backend.url])),
        mode: command.target.mode,
        usePanelSnapshot: true,
      };
      assertGenerationRequest();
      await generatePanel(panel.id, options);
      const run = getGenerationRunByIdempotencyKey(command.idempotencyKey);
      const scopeChanged = !isApplicationProjectCurrent(command)
        || backends.some(backend => orchestratorManager.getNodes().find(node => node.id === backend.id)?.url !== backend.url)
        || backends.some(backend => !selectedBackendIdsRef.current.includes(backend.id));
      if (!run) {
        if (scopeChanged) return {
          runId: options.runId,
          idempotencyKey: command.idempotencyKey,
          status: 'outcome_unknown_after_scope_change',
          scopeChanged: true,
          requiresManualResolution: true,
          recovery: 'Inspect the current application snapshot and action feed. Do not replay this submission.',
        };
        throw applicationError('generation_not_started', 'Generation stopped before a durable run or prompt submission was created.');
      }
      return {
        runId: run.runId,
        status: scopeChanged ? 'scope_changed' : run.status,
        runStatus: run.status,
        ...(scopeChanged ? {
          scopeChanged: true,
          submissionOutcome: 'Inspect the current application snapshot and action feed; do not replay this submission.',
        } : {}),
        mode: run.mode,
        workflowSchema: 'validated against the selected backend schemas',
        dependencyIdentity: 'not verified by schema validation; use plan_dependencies and report its identity limits',
        submissions: run.jobs.map(job => ({ backendId: job.backendId, promptId: job.promptId, status: job.status, message: job.message })),
      };
    },
    get_run: async command => {
      assertApplicationProject(command);
      let run = getGenerationRun(command.target.runId);
      if (!run || run.projectIdentity !== command.projectIdentity) throw applicationError('run_not_found', 'The requested run is not recorded in this project.');
      const waitMs = Math.max(0, Math.min(60, command.input?.waitSeconds ?? 0)) * 1000;
      const deadline = Date.now() + waitMs;
      while (waitMs > 0 && Date.now() < deadline
        && !['complete', 'error', 'cancelled', 'rejected', 'failed_before_submission', 'partial', 'submission_unknown'].includes(run.status)) {
        assertApplicationProject(command);
        await new Promise<void>(resolve => window.setTimeout(resolve, Math.min(500, deadline - Date.now())));
        assertApplicationProject(command);
        const refreshedRun = getGenerationRun(command.target.runId);
        if (!refreshedRun || refreshedRun.projectIdentity !== command.projectIdentity) throw applicationError('run_not_found', 'The requested run is no longer recorded in this project.');
        run = refreshedRun;
      }
      const results = [] as Array<Record<string, unknown>>;
      for (const job of run.jobs) {
        assertApplicationProject(command);
        if (!job.promptId) {
          results.push({ backendId: job.backendId, status: job.status, message: job.message, requiresManualResolution: job.status === 'submission_unknown' });
          continue;
        }
        const backend = orchestratorManager.getNodes().find(node => node.id === job.backendId);
        if (!backend) {
          results.push({ backendId: job.backendId, promptId: job.promptId, status: job.status, message: 'The original managed backend is no longer configured.' });
          continue;
        }
        const baseUrl = backend.url.replace(/\/+$/, '');
        const [historyResponse, queueResponse] = await Promise.all([
          fetch(`${baseUrl}/history/${encodeURIComponent(job.promptId)}`, { signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => null),
          fetch(`${baseUrl}/queue`, { signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => null),
        ]);
        assertApplicationProject(command);
        const currentBackend = orchestratorManager.getNodes().find(node => node.id === job.backendId);
        if (!currentBackend || currentBackend.url !== backend.url) throw applicationError('backend_scope_changed', 'The managed backend changed during run inspection. Refresh the application snapshot before continuing.');
        const [historyBody, queue] = await Promise.all([
          historyResponse?.ok ? historyResponse.json().catch(() => null) as Promise<Record<string, unknown> | null> : Promise.resolve(null),
          queueResponse?.ok ? queueResponse.json().catch(() => null) as Promise<Record<string, unknown> | null> : Promise.resolve(null),
        ]);
        assertApplicationProject(command);
        if (orchestratorManager.getNodes().find(node => node.id === job.backendId)?.url !== backend.url) throw applicationError('backend_scope_changed', 'The managed backend changed during run inspection. Refresh the application snapshot before continuing.');
        const candidate = historyBody?.[job.promptId];
        const historyEntry = candidate && typeof candidate === 'object' ? candidate as Record<string, any> : undefined;
        const containsPrompt = (list: unknown): boolean => Array.isArray(list) && list.some(entry => Array.isArray(entry) && entry[1] === job.promptId);
        const isRunning = containsPrompt(queue?.queue_running);
        const isPending = containsPrompt(queue?.queue_pending);
        let status = job.status;
        const statusRecord = historyEntry?.status && typeof historyEntry.status === 'object' ? historyEntry.status as Record<string, unknown> : {};
        const statusText = typeof statusRecord.status_str === 'string' ? statusRecord.status_str.toLowerCase() : '';
        const historyMessages = Array.isArray(statusRecord.messages) ? statusRecord.messages : [];
        const interrupted = historyMessages.some(message => Array.isArray(message) && message[0] === 'execution_interrupted');
        if (interrupted) {
          status = 'cancelled';
          try { updateGenerationJobByPrompt(run.runId, job.promptId, 'cancelled'); } catch (error) { console.warn('[GenerationJournal] Could not reconcile cancellation:', error); }
        } else if (statusText === 'error' || statusText === 'failed' || statusText === 'failure' || statusText === 'exception' || statusText === 'execution_error') {
          status = 'error';
          try { updateGenerationJobByPrompt(run.runId, job.promptId, 'error', 'ComfyUI history recorded an execution error.'); } catch (error) { console.warn('[GenerationJournal] Could not reconcile error:', error); }
        } else if (statusText === 'success' || statusText === 'completed' || statusRecord.completed === true) {
          status = 'complete';
          try { updateGenerationJobByPrompt(run.runId, job.promptId, 'complete'); } catch (error) { console.warn('[GenerationJournal] Could not reconcile completion:', error); }
        } else if (isRunning) {
          status = 'running';
          try { updateGenerationJobByPrompt(run.runId, job.promptId, 'running'); } catch (error) { console.warn('[GenerationJournal] Could not reconcile running state:', error); }
        }
        const outputs: string[] = [];
        if (historyEntry?.outputs && typeof historyEntry.outputs === 'object') {
          for (const output of Object.values(historyEntry.outputs as Record<string, unknown>)) {
            if (!output || typeof output !== 'object') continue;
            for (const media of extractMediaOutputs(output as Record<string, unknown>, baseUrl)) outputs.push(media.url);
          }
        }
        const activeJob = [...activeGenerationsRef.current.values()].find(item => item.runId === run.runId && item.promptId === job.promptId);
        const panelJob = panelsRef.current.find(item => item.id === run.panelId)?.parallelJobs?.find(item => item.promptId === job.promptId);
        let capturedMedia: Awaited<ReturnType<typeof captureRunOutputMedia>> | undefined;
        if (status === 'complete') {
          try {
            capturedMedia = await captureRunOutputMedia(run.runId, job.backendId, outputs);
          } catch (error) {
            capturedMedia = { media: [], warnings: [`Media capture failed: ${error instanceof Error ? error.message : 'unknown capture error'}`] };
          }
          assertApplicationProject(command);
          if (orchestratorManager.getNodes().find(node => node.id === job.backendId)?.url !== backend.url) {
            throw applicationError('backend_scope_changed', 'The managed backend changed during run inspection. Refresh the application snapshot before continuing.');
          }
        }
        results.push({
          backendId: job.backendId,
          promptId: job.promptId,
          status,
          queueState: isRunning ? 'running' : isPending ? 'pending' : historyEntry ? 'history' : 'not-found-ambiguous',
          progress: panelJob?.progress ?? (activeJob ? panelsRef.current.find(item => item.id === run.panelId)?.progress : undefined),
          currentNodeName: panelJob?.currentNodeName,
          outputs: [...new Set(outputs)].slice(0, 100),
          ...(capturedMedia ? { media: capturedMedia.media, mediaWarnings: capturedMedia.warnings } : {}),
          requiresManualResolution: job.status === 'submission_unknown'
            || !historyEntry && !isRunning && !isPending && ['accepted', 'running', 'cancel_requested', 'submitting'].includes(status),
        });
      }
      assertApplicationProject(command);
      return { runId: run.runId, status: getGenerationRun(run.runId)?.status || run.status, jobs: results };
    },
    cancel_run: async command => {
      assertApplicationProject(command);
      const run = getGenerationRun(command.target.runId);
      if (!run || run.projectIdentity !== command.projectIdentity) throw applicationError('run_not_found', 'The requested run is not recorded in this project.');
      const results = [] as Array<Record<string, unknown>>;
      const scopeIsCurrent = (backendId: string, backendUrl: string): boolean => isApplicationProjectCurrent(command)
        && orchestratorManager.getNodes().some(node => node.id === backendId && node.url === backendUrl);
      const scopeChanged = (job: (typeof run.jobs)[number], dispatched: boolean) => {
        results.push({
          backendId: job.backendId,
          ...(job.promptId ? { promptId: job.promptId } : {}),
          status: 'unknown_after_scope_change',
          cancelled: false,
          cancelOutcome: dispatched ? 'unknown_after_dispatch' : 'not_dispatched',
          reason: dispatched
            ? 'Scope changed after cancellation dispatch; inspect the current snapshot and action feed, then do not replay.'
            : 'Project or backend scope changed before cancellation dispatch; refresh the application snapshot.',
        });
        return { runId: run.runId, status: 'scope_changed', scopeChanged: true, jobs: results };
      };
      for (const job of run.jobs) {
        assertApplicationProject(command);
        if (!job.promptId) {
          results.push({ backendId: job.backendId, status: job.status, cancelled: false, reason: job.status === 'submission_unknown' ? 'submission_unknown_requires_manual_resolution' : 'prompt_id_unavailable' });
          continue;
        }
        const backend = orchestratorManager.getNodes().find(node => node.id === job.backendId);
        if (!backend) {
          results.push({ backendId: job.backendId, promptId: job.promptId, cancelled: false, reason: 'original_backend_unavailable' });
          continue;
        }
        if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, false);
        const baseUrl = backend.url.replace(/\/+$/, '');
        const queueResponse = await fetch(`${baseUrl}/queue`, { signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => null);
        if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, false);
        const queue = queueResponse?.ok ? await queueResponse.json().catch(() => null) as Record<string, unknown> | null : null;
        if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, false);
        const running = Array.isArray(queue?.queue_running) ? queue!.queue_running as unknown[] : [];
        const pending = Array.isArray(queue?.queue_pending) ? queue!.queue_pending as unknown[] : [];
        const isPending = pending.some(entry => Array.isArray(entry) && entry[1] === job.promptId);
        const runningEntry = running.find(entry => Array.isArray(entry) && entry[1] === job.promptId);
        const reconcileHistory = async (): Promise<string | 'scope_changed' | null> => {
          const response = await fetch(`${baseUrl}/history/${encodeURIComponent(job.promptId!)}`, { signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => null);
          if (!scopeIsCurrent(backend.id, backend.url)) return 'scope_changed';
          if (!response?.ok) return null;
          const body = await response.json().catch(() => null) as Record<string, any> | null;
          if (!scopeIsCurrent(backend.id, backend.url)) return 'scope_changed';
          const entry = body?.[job.promptId!];
          if (!entry || typeof entry !== 'object') return null;
          const historyStatus = entry.status && typeof entry.status === 'object' ? entry.status as Record<string, unknown> : {};
          const messages = Array.isArray(historyStatus.messages) ? historyStatus.messages : [];
          if (messages.some(message => Array.isArray(message) && message[0] === 'execution_interrupted')) {
            updateGenerationJobByPrompt(run.runId, job.promptId!, 'cancelled');
            return 'cancelled';
          }
          const statusText = typeof historyStatus.status_str === 'string' ? historyStatus.status_str.toLowerCase() : '';
          if (statusText === 'error' || statusText === 'failed' || statusText === 'failure' || statusText === 'exception' || statusText === 'execution_error') {
            updateGenerationJobByPrompt(run.runId, job.promptId!, 'error', 'ComfyUI history recorded an execution error.');
            return 'error';
          }
          if (statusText === 'success' || statusText === 'completed' || historyStatus.completed === true) {
            updateGenerationJobByPrompt(run.runId, job.promptId!, 'complete');
            return 'complete';
          }
          return null;
        };
        if (isPending) {
          if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, false);
          try { updateGenerationJobByPrompt(run.runId, job.promptId, 'cancel_requested'); } catch (error) { console.warn('[GenerationJournal] Could not persist cancel request:', error); }
          const response = await fetch(`${baseUrl}/queue`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ delete: [job.promptId] }),
            signal: AbortSignal.timeout(10000),
            redirect: 'error',
          }).catch(() => null);
          if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, true);
          const verifyResponse = await fetch(`${baseUrl}/queue`, { signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => null);
          if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, true);
          const verifyQueue = verifyResponse?.ok ? await verifyResponse.json().catch(() => null) as Record<string, unknown> | null : null;
          if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, true);
          const stillPending = Array.isArray(verifyQueue?.queue_pending) && verifyQueue!.queue_pending.some(entry => Array.isArray(entry) && entry[1] === job.promptId);
          const nowRunning = Array.isArray(verifyQueue?.queue_running) && verifyQueue!.queue_running.some(entry => Array.isArray(entry) && entry[1] === job.promptId);
          const historyTerminal = await reconcileHistory();
          if (historyTerminal === 'scope_changed' || !scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, true);
          results.push({
            backendId: job.backendId,
            promptId: job.promptId,
            cancelRequested: Boolean(response?.ok),
            cancelled: historyTerminal === 'cancelled',
            status: historyTerminal || (nowRunning ? 'running' : stillPending ? 'pending' : response?.ok ? 'cancel_requested' : 'cancel_outcome_unknown'),
            scope: 'exact-queued-prompt-delete',
            requiresManualResolution: !response?.ok && historyTerminal !== 'cancelled',
            reason: historyTerminal ? undefined : nowRunning
              ? 'prompt_started_during_delete; no node-wide interrupt sent'
              : !response?.ok ? 'Cancellation request outcome is unknown; inspect the run and do not replay automatically.' : undefined,
          });
          continue;
        }
        if (runningEntry && running.length === 1) {
          if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, false);
          try { updateGenerationJobByPrompt(run.runId, job.promptId, 'cancel_requested'); } catch (error) { console.warn('[GenerationJournal] Could not persist cancel request:', error); }
          const response = await fetch(`${baseUrl}/interrupt`, { method: 'POST', signal: AbortSignal.timeout(10000), redirect: 'error' }).catch(() => null);
          if (!scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, true);
          const historyTerminal = await reconcileHistory();
          if (historyTerminal === 'scope_changed' || !scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, true);
          results.push({
            backendId: job.backendId,
            promptId: job.promptId,
            cancelRequested: Boolean(response?.ok),
            cancelled: historyTerminal === 'cancelled',
            status: historyTerminal || 'cancel_requested',
            scope: 'node-wide-interrupt-no-other-running-prompt-at-check',
            requiresManualResolution: historyTerminal !== 'cancelled',
            warning: 'ComfyUI /interrupt is node-wide; only this prompt was running when checked, but the queue can change before the request lands.',
            ...(response?.ok ? {} : { reason: 'Interrupt request outcome is unknown; inspect the run and do not replay automatically.' }),
          });
          continue;
        }
        const historyTerminal = await reconcileHistory();
        if (historyTerminal === 'scope_changed' || !scopeIsCurrent(backend.id, backend.url)) return scopeChanged(job, false);
        if (historyTerminal) {
          results.push({ backendId: job.backendId, promptId: job.promptId, cancelled: historyTerminal === 'cancelled', status: historyTerminal, reason: 'ComfyUI history already recorded a terminal state.' });
          continue;
        }
        results.push({ backendId: job.backendId, promptId: job.promptId, cancelled: false, reason: runningEntry ? 'node_has_unrelated_running_prompts' : 'prompt_not_found_in_queue_or_history' });
      }
      assertApplicationProject(command);
      return { runId: run.runId, status: getGenerationRun(run.runId)?.status || run.status, jobs: results };
    },
  };
  applicationHandlersRef.current = generationApplicationHandlers;
  useEffect(() => registerAgentSurfaceContext('console', () => ({
    statusNote: null,
    projectIdentity: projectScopeRef.current.identity || null,
    getRevision: () => JSON.stringify([projectScopeRef.current.identity, projectScopeRef.current.revision]),
    getWorkspaceContext: () => ({
      bindingId: projectScopeRef.current.bindingId,
      projectIdentity: projectScopeRef.current.identity,
      projectRevision: projectScopeRef.current.revision,
    }),
  })), []);
  useEffect(() => registerWorkspaceConsoleAdapter({
    getContext: () => ({
      bindingId: projectScopeRef.current.bindingId,
      projectIdentity: projectScopeRef.current.identity,
      projectRevision: projectScopeRef.current.revision,
    }),
    dispatch: command => applicationHandlersRef.current
      ? dispatchStoryboardApplicationAction(applicationHandlersRef.current, command)
      : Promise.resolve({
        ok: false,
        commandId: command.commandId,
        action: command.action,
        error: { code: 'console_unavailable', message: 'Console actions are not ready.', retryable: false },
      }),
  }), []);

  const handleCancelGenerations = () => cancelGenerations();

  // New project handler. Save, discard, and cancel are separate outcomes;
  // failed Save must never continue into a destructive reset.
  const handleNewProject = useCallback(async () => {
    const hasWork = hasUnsavedProjectWork();
    let discard = false;
    if (hasWork) {
      const save = window.confirm(
        'Save & New? Click OK to save the current project. Click Cancel to choose Discard & New or Cancel.',
      );
      if (save) {
        const result = await handleSaveProject();
        if (!result.success) return;
      } else {
        discard = window.confirm('Discard & New? Click OK to discard this work, or Cancel to keep the current project.');
        if (!discard) return;
      }
    }

    const newIdentity = projectManager.createUnsavedIdentity();
    try {
      await activateSessionIdentity(sessionDraftController, newIdentity, { discard });
      projectScopeRef.current.bindingId = crypto.randomUUID();
    } catch (error) {
      showError(`New project was cancelled: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    const defaultPanels: Panel[] = Array.from({ length: 6 }, (_, i) => ({
      id: i + 1,
      image: null,
      images: [],
      imageHistory: [],
      historyIndex: -1,
      currentImageIndex: 0,
      x: (i % 3) * 320,
      y: Math.floor(i / 3) * 320,
      width: 300,
      height: 300,
      status: 'empty' as const,
      progress: 0,
      notes: '',
      nodeId: undefined,
      workflowId: undefined,
      parameterValues: undefined,
      prompt: '',
      seed: -1,
    }));

    const newSettings: ProjectSettings = {
      name: 'Untitled Project',
      path: '',
      projectFilePath: undefined,
      namingTemplate: '{project}_Panel{panel}_{version}',
      autoSave: true,
      orchestratorUrl: projectSettings.orchestratorUrl,
      created: new Date(),
      lastModified: new Date(),
    };
    projectManager.rotateUnsavedIdentity(newIdentity);
    projectManager.setProject(newSettings);
    setProjectSettings(newSettings);
    setPanels(defaultPanels);
    setParameterValues({});
    parameterValuesRef.current = {};
    setSelectedWorkflowId(null);
    selectedWorkflowIdRef.current = null;
    setCameraAngles({});
    setEnhancementPreferences(EMPTY_ENHANCEMENT_PREFERENCES);
    enhancementPreferencesRef.current = EMPTY_ENHANCEMENT_PREFERENCES;
    setDeletedImages(new Set());
    setGlobalPromptOverride('');
    setUseGlobalPrompt(false);
    projectSavedFingerprintRef.current = projectStateFingerprint({
      ...readCurrentProjectState(), panels: defaultPanels, parameters: {}, selectedWorkflowId: null,
      settings: newSettings, cameraAngles: {}, enhancementPreferences: EMPTY_ENHANCEMENT_PREFERENCES,
      deletedImages: [],
      globalPromptOverride: '', useGlobalPrompt: false,
    });
    setShowProjectSettings(true);
  }, [hasUnsavedProjectWork, handleSaveProject, projectSettings.orchestratorUrl, readCurrentProjectState, setProjectSettings, showError]);

  // ---------------------------------------------------------------------------
  // Effects - Global keyboard shortcuts
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept shortcuts when typing in input/textarea/select elements
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      // Ctrl+Shift+S - Save Project As (check BEFORE Ctrl+S since it's a superset)
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'S' || e.key === 's')) {
        e.preventDefault();
        handleSaveProjectAs();
        return;
      }

      // Ctrl+N - New Project
      if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
        e.preventDefault();
        handleNewProject();
        return;
      }

      // Ctrl+S - Save Project
      if ((e.ctrlKey || e.metaKey) && !e.shiftKey && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
        return;
      }

      // Ctrl+O - Load Project
      if ((e.ctrlKey || e.metaKey) && e.key === 'o') {
        e.preventDefault();
        handleLoadProject();
        return;
      }

      // Ctrl+, - Project Settings
      if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setShowProjectSettings(true);
        return;
      }

      // Ctrl+P - Print Storyboard
      if ((e.ctrlKey || e.metaKey) && e.key === 'p') {
        e.preventDefault();
        setShowPrintDialog(true);
        return;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleNewProject, handleSaveProject, handleSaveProjectAs, handleLoadProject]);

  const editorTarget = resolveGenerationTarget({
    managedNodes: renderNodes,
    browserStatuses: browserNodeStatus,
    selectedBackendIds,
    panelNodeId: actionPanel?.nodeId,
    connectionStatus,
  });
  const editorComfyUrl = editorTarget.kind === 'managed' ? editorTarget.url || '' : '';
  
  return (
    <div className="storyboard-ui">
      {/* Phase 4: Loading Progress Overlay */}
      {isLoadingProject && (
        <div className="loading-overlay">
          <div className="loading-modal">
            <h3>Loading Project...</h3>
            <div className="progress-bar">
              <div 
                className="progress-fill" 
                style={{ width: `${loadingProgress.progress}%` }}
              />
            </div>
            <p className="progress-text">
              {Math.round(loadingProgress.progress)}%
            </p>
            <p className="current-file">
              {loadingProgress.currentFile}
            </p>
          </div>
        </div>
      )}

      {isPromptEnhancementRunning && (
        <div role="status" aria-live="polite" style={{ position: 'fixed', zIndex: 20, top: 8, right: 12, display: 'flex', alignItems: 'center', gap: 10, padding: '0.45rem 0.7rem', borderRadius: 6, background: 'var(--bg-medium)', border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}>
          <span>Enhancing prompt with the selected agent…</span>
          <button type="button" onClick={() => enhancementAbortControllerRef.current?.abort()}>Cancel</button>
        </div>
      )}
      
      {/* Top Navigation Bar */}
      <div className="storyboard-top-bar">
        {/* Main Menu (left) */}
        <MainMenu
          projectName={projectSettings.name || 'Untitled Project'}
          nodeCount={renderNodes.length}
          onProjectSettings={() => setShowProjectSettings(true)}
          onPathMappings={() => setShowPathMappings(true)}
          onSaveProject={handleSaveProject}
          onSaveProjectAs={handleSaveProjectAs}
          onLoadProject={handleLoadProject}
          onLoadRecentProject={handleLoadRecentProject}
          onNewProject={handleNewProject}
          onManageNodes={() => setShowNodeManager(true)}
          onRestartNodes={handleRestartNodes}
          onCancelGenerations={handleCancelGenerations}
          onPrintStoryboard={() => setShowPrintDialog(true)}
          isLoading={isLoadingProject}
          isRestarting={isRestartingNodes}
          isGenerating={panels.some(p => p.status === 'generating') || renderNodes.some(n => n.status === 'busy')}
        />
        
        {/* Workflow Dropdown (center-left) */}
        <div className="workflow-dropdown-bar">
          <select 
            value={selectedWorkflowId || ''}
            onChange={(e) => setSelectedWorkflowId(e.target.value)}
            className="workflow-select"
          >
            <option value="">Select workflow...</option>
            {getFilteredWorkflows().map(w => (
              <option key={w.id} value={w.id}>{w.name}</option>
            ))}
          </select>
        </div>
        
        {/* Tabs (center) */}
        <div className="storyboard-tabs" onClick={(e) => e.stopPropagation()}>
          {/* Image Generation with dropdown */}
          <div className="tab-with-dropdown">
            <button 
              className={`storyboard-tab ${activeTab === 'image-generation' ? 'active' : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'image-generation' ? null : 'image-generation')}
            >
              Image Generation <ChevronDown size={14} style={{ marginLeft: 4, opacity: 0.7 }} />
            </button>
            {openDropdown === 'image-generation' && (
              <div className="tab-dropdown">
                <button 
                  className={activeSubTab === 'text2img' ? 'active' : ''}
                  onClick={() => { setActiveTab('image-generation'); setActiveSubTab('text2img'); setOpenDropdown(null); }}
                >
                  Text to Image
                </button>
                <button 
                  className={activeSubTab === 'img2img' ? 'active' : ''}
                  onClick={() => { setActiveTab('image-generation'); setActiveSubTab('img2img'); setOpenDropdown(null); }}
                >
                  Image to Image
                </button>
                <button 
                  className={activeSubTab === 'inpainting' ? 'active' : ''}
                  onClick={() => { setActiveTab('image-generation'); setActiveSubTab('inpainting'); setOpenDropdown(null); }}
                >
                  Inpainting
                </button>
              </div>
            )}
          </div>
          
          <button 
            className={`storyboard-tab ${activeTab === 'image-editing' ? 'active' : ''}`}
            onClick={() => { setActiveTab('image-editing'); setActiveSubTab('editing'); setOpenDropdown(null); }}
          >
            Image Editing
          </button>
          <button 
            className={`storyboard-tab ${activeTab === 'upscaling' ? 'active' : ''}`}
            onClick={() => { setActiveTab('upscaling'); setActiveSubTab('upscale'); setOpenDropdown(null); }}
          >
            Upscaling
          </button>
          
          {/* Video Generation with dropdown */}
          <div className="tab-with-dropdown">
            <button 
              className={`storyboard-tab ${activeTab === 'video-generation' ? 'active' : ''}`}
              onClick={() => setOpenDropdown(openDropdown === 'video-generation' ? null : 'video-generation')}
            >
              Video Generation <ChevronDown size={14} style={{ marginLeft: 4, opacity: 0.7 }} />
            </button>
            {openDropdown === 'video-generation' && (
              <div className="tab-dropdown">
                <button 
                  className={activeSubTab === 'img2vid' ? 'active' : ''}
                  onClick={() => { setActiveTab('video-generation'); setActiveSubTab('img2vid'); setOpenDropdown(null); }}
                >
                  Image to Video
                </button>
                <button 
                  className={activeSubTab === 'txt2vid' ? 'active' : ''}
                  onClick={() => { setActiveTab('video-generation'); setActiveSubTab('txt2vid'); setOpenDropdown(null); }}
                >
                  Text to Video
                </button>
                <button 
                  className={activeSubTab === 'fflf' ? 'active' : ''}
                  onClick={() => { setActiveTab('video-generation'); setActiveSubTab('fflf'); setOpenDropdown(null); }}
                >
                  FFLF
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
      {connectionHint && (
        <div className="connection-hint" role="status" aria-live="polite">{connectionHint}</div>
      )}
      
      {/* Main Content */}
      <div className="storyboard-main">
        {/* Left Sidebar */}
        <aside className="storyboard-sidebar" style={{ width: leftPanelWidth }}>
          {/* Workflow Actions - Icon buttons */}
          <div className="sidebar-section">
            <div className="sidebar-section-header">
              <span className="sidebar-section-title">Workflow</span>
              <div className="workflow-icon-buttons">
                <button 
                  className="icon-btn"
                  onClick={() => {
                    const workflow = workflows.find(w => w.id === selectedWorkflowId);
                    if (workflow) {
                      setEditingWorkflow(workflow);
                      setShowWorkflowEditor(true);
                    }
                  }} 
                  disabled={!selectedWorkflow}
                  title="Edit workflow parameters"
                >
                  <Pencil size={14} />
                </button>
                <button 
                  className="icon-btn rename"
                  onClick={() => {
                    const workflow = workflows.find(w => w.id === selectedWorkflowId);
                    if (workflow) {
                      setRenamingWorkflow(workflow);
                      setNewWorkflowName(workflow.name);
                      setShowRenameDialog(true);
                    }
                  }} 
                  disabled={!selectedWorkflow}
                  title="Rename workflow"
                >
                  <Edit3 size={14} />
                </button>
                <button 
                  className="icon-btn delete"
                  onClick={async () => {
                    const workflowId = selectedWorkflowId;
                    if (!workflowId || !confirm('Are you sure you want to delete this workflow?')) return;
                    try {
                      await flushPendingWorkflowSave();
                      const workflow = workflowsRef.current.find(item => item.id === workflowId);
                      if (!workflow) throw new Error('The selected workflow is no longer available.');
                      const fingerprint = workflowContentFingerprint(workflow);
                      workflowDeleteIdsRef.current.add(workflowId);
                      const result = await workflowStorage.delete(workflowId);
                      workflowCollectionRevisionRef.current = result.collectionRevision;
                      workflowPersistedFingerprintRef.current.delete(workflowId);
                      workflowDeleteIdsRef.current.delete(workflowId);
                      const latest = workflowsRef.current.find(item => item.id === workflowId);
                      if (latest && workflowContentFingerprint(latest) !== fingerprint) {
                        workflowConflictIdsRef.current.add(workflowId);
                        showError('The workflow was deleted while newer local edits were being made. Those edits remain in the current browser session and need an explicit re-import.');
                      } else {
                        workflowConflictIdsRef.current.delete(workflowId);
                        setWorkflows(current => current.filter(item => item.id !== workflowId));
                        setSelectedWorkflowId(current => current === workflowId ? null : current);
                        addLog('info', `Deleted workflow: ${workflow.name}`);
                      }
                    } catch (err) {
                      workflowDeleteIdsRef.current.delete(workflowId);
                      try { await reconcileWorkflowStorage(); } catch { /* Preserve the local workflow if storage cannot be reconciled. */ }
                      console.error('[Workflows] Failed to delete from backend:', err);
                      showError(`Workflow was not deleted: ${err instanceof Error ? err.message : String(err)}`);
                      addLog('error', `Failed to delete workflow file from storage: ${err}`);
                    }
                  }} 
                  disabled={!selectedWorkflow}
                  title="Delete workflow"
                >
                  <Trash2 size={14} />
                </button>
                 <button 
                   className="icon-btn export" 
                   onClick={exportWorkflows}
                   disabled={workflows.length === 0}
                   title={`Export all ${workflows.length} workflows`}
                 >
                   <Download size={14} />
                 </button>
                 <label className="icon-btn import" title="Import workflows from JSON">
                   <Upload size={14} />
                   <input
                     type="file"
                     accept=".json"
                     style={{ display: 'none' }}
                     onChange={importWorkflowsBulk}
                   />
                 </label>
                 <button
                   className="icon-btn categories"
                   onClick={() => setShowCategoriesModal(true)}
                   disabled={workflows.length === 0}
                   title={`Manage categories for ${workflows.length} workflows`}
                 >
                   <Tags size={14} />
                 </button>
               </div>
            </div>
          </div>
          
          {/* Output Node Selection */}
          {selectedWorkflow && selectedWorkflow.parsed.outputs && selectedWorkflow.parsed.outputs.length > 0 && (
            <div className="sidebar-section">
              <div className="sidebar-section-title">Output Nodes</div>
              <MultiSelectDropdown
                options={selectedWorkflow.parsed.outputs.map(output => ({
                  id: output.node_id,
                  label: output.name,
                  selected: output.selected
                }))}
                onChange={(selectedIds) => {
                  const updatedOutputs = selectedWorkflow.parsed.outputs.map(o => ({
                    ...o,
                    selected: selectedIds.includes(o.node_id)
                  }));
                  setWorkflows(prev => prev.map(w =>
                    w.id === selectedWorkflow.id
                      ? { ...w, parsed: { ...w.parsed, outputs: updatedOutputs } }
                      : w
                  ));
                }}
                placeholder="Select output nodes..."
              />
            </div>
          )}
          
          {/* Dynamic Parameters */}
          {selectedWorkflow && (
            <div className="sidebar-section parameters-section">
              {/* Global Prompt Override */}
              <div className="global-prompt-section">
                <div className="global-prompt-header">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={useGlobalPrompt}
                      onChange={(e) => setUseGlobalPrompt(e.target.checked)}
                    />
                    Global Prompt Override
                  </label>
                </div>
                {useGlobalPrompt && (
                  <textarea
                    className="global-prompt-input"
                    placeholder="Enter prompt to use for all panels..."
                    value={globalPromptOverride}
                    onChange={(e) => setGlobalPromptOverride(e.target.value)}
                    rows={3}
                  />
                )}
              </div>
              
              <ParameterPanel
                parameters={exposedParameters.map(p => ({
                  name: p.name,
                  display_name: p.display_name,
                  type: p.type,
                  node_id: p.node_id,
                  input_name: p.input_name,
                  default: p.default,
                  constraints: p.constraints,
                  description: p.description,
                }))}
                values={parameterValues}
                onChange={handleParameterChange}
                disabled={false}
                onEnhancePrompt={handleEnhancePrompt}
                onOpenEnhancementSettings={openEnhancementSettings}
                cameraAngles={cameraAngles}
                onCameraAngleChange={handleCameraAngleChange}
                comfyUrl={editorComfyUrl}
              />
              <PromptEnhancementSettingsPopup
                isOpen={showEnhancementSettings}
                onClose={closeEnhancementSettings}
                profiles={enhancementProfiles}
                targetModels={enhancementTargetModels}
                assets={enhancementAssets}
                preferences={selectedEnhancementPreferences}
                durationSeconds={enhancementDuration}
                onChange={handleEnhancementPreferencesChange}
                profilesLoading={enhancementProfilesLoading}
                profilesError={enhancementProfilesError}
                targetModelsLoading={enhancementTargetModelsLoading}
                targetModelsError={enhancementTargetModelsError}
                onRetryProfiles={loadEnhancementProfiles}
                onRetryTargetModels={loadEnhancementTargetModels}
                disabled={false}
              />
            </div>
          )}
        </aside>
        
        {/* Left Resize Handle */}
        <div 
          className="resize-handle resize-handle-left"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingLeft(true);
          }}
        />
        
        {/* Canvas */}
        <main 
          className="storyboard-canvas"
          ref={canvasRef}
          onMouseDown={handleCanvasMouseDown}
          onMouseMove={(e) => {
            handleCanvasMouseMove(e);
            handleMarqueeMouseMove(e);
          }}
          onMouseUp={() => {
            handleCanvasMouseUp();
            handleMarqueeMouseUp();
          }}
          onMouseLeave={() => {
            handleCanvasMouseUp();
            handleMarqueeMouseUp();
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleFolderDrop}
        >
          <div className="canvas-toolbar">
            <button className="icon-btn" onClick={() => setCanvasZoom((prev: number) => Math.min(5, prev * 1.2))} title="Zoom In">
              <ZoomIn size={16} />
            </button>
            <button className="icon-btn" onClick={() => setCanvasZoom((prev: number) => Math.max(0.1, prev / 1.2))} title="Zoom Out">
              <ZoomOut size={16} />
            </button>
            <button className="icon-btn" onClick={() => { setCanvasZoom(1); setCanvasPan({ x: 0, y: 0 }); }} title="Reset View">
              <RotateCcw size={16} />
            </button>
            <span className="zoom-level">{Math.round(canvasZoom * 100)}%</span>
            <button onClick={addPanel} className="add-panel-btn" title="Add Panel">
              <Plus size={14} /> Add Panel
            </button>
            <button 
              onClick={() => setShowPrintDialog(true)} 
              className="add-panel-btn" 
              title="Print Storyboard"
            >
              <Printer size={14} /> Print
            </button>
            {projectSettings.path && (
              <button 
                className="add-panel-btn"
                onClick={async () => {
                  try {
                    const scanResult = await projectManager.scanProjectPanels();
                    if (!scanResult.success || !scanResult.panels) {
                      showError('Failed to scan project folders');
                      return;
                    }
                    
                    const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();
                    
                    setPanels(prev => {
                      const updatedPanels = [...prev];
                      const existingNames = new Set(updatedPanels.map(p => p.name));
                      
                      for (const panelFolder of scanResult.panels) {
                        const validImages = panelFolder.images
                          .filter((img: { image_path: string }) => !deletedImages.has(img.image_path))
                          .sort((a: { modified_time: number }, b: { modified_time: number }) => a.modified_time - b.modified_time);
                        
                        const newHistory: ImageHistoryEntry[] = validImages.map((img: { image_path: string; modified_time: number }, index: number) => ({
                          id: `${panelFolder.panel_name}_v${index + 1}`,
                          url: `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(img.image_path)}`,
                          metadata: {
                            timestamp: new Date(img.modified_time * 1000),
                            workflowId: '',
                            workflowName: 'Loaded',
                            seed: 0,
                            promptSummary: '',
                            parameters: {},
                            workflow: {},
                            sourceUrl: '',
                            savedPath: img.image_path,
                            version: index + 1,
                          } as ImageMetadata
                        }));
                        
                        // Update existing panel or create new one
                        const existingIdx = updatedPanels.findIndex(p => p.name === panelFolder.panel_name);
                        if (existingIdx >= 0) {
                          // Refresh in-place: preserve position, workflow, notes, etc.
                          updatedPanels[existingIdx] = {
                            ...updatedPanels[existingIdx],
                            imageHistory: newHistory,
                            historyIndex: newHistory.length > 0 ? newHistory.length - 1 : -1,
                            image: newHistory.length > 0 ? newHistory[newHistory.length - 1]?.url ?? null : null,
                            status: newHistory.length > 0 ? 'complete' as const : 'empty' as const,
                            progress: newHistory.length > 0 ? 100 : 0,
                          };
                        } else {
                          // New folder discovered — add panel
                          existingNames.add(panelFolder.panel_name);
                          const panelIndex = updatedPanels.length;
                          const newId = Date.now() + panelIndex;
                          updatedPanels.push({
                            id: newId,
                            name: panelFolder.panel_name,
                            x: calculateNewPanelX(panelIndex + 1, panelIndex + 1),
                            y: calculateNewPanelY(panelIndex + 1, panelIndex + 1),
                            width: 300,
                            height: 300,
                            notes: '',
                            imageHistory: newHistory,
                            historyIndex: newHistory.length > 0 ? newHistory.length - 1 : -1,
                            image: newHistory.length > 0 ? newHistory[newHistory.length - 1]?.url ?? null : null,
                            images: [],
                            currentImageIndex: 0,
                            status: newHistory.length > 0 ? 'complete' as const : 'empty' as const,
                            progress: newHistory.length > 0 ? 100 : 0,
                            locked: false,
                            selected: false,
                          });
                        }
                      }
                      
                      return updatedPanels;
                    });
                    
                    showInfo(`Refreshed all panels from project folder`);
                  } catch (err) {
                    console.error('Global refresh failed:', err);
                    showError('Failed to refresh project');
                  }
                }}
                title="Refresh all panels from project folder"
              >
                <RefreshCw size={14} /> Refresh
              </button>
            )}
            
            {/* Phase 3: Alignment Toolbar */}
            {panels.filter(p => p.selected).length >= 2 && (
              <div className="alignment-toolbar">
                <button 
                  className="icon-btn" 
                  onClick={() => alignPanels('left')}
                  title="Align Left"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="2" y="2" width="2" height="12"/>
                    <rect x="6" y="4" width="8" height="3"/>
                    <rect x="6" y="9" width="6" height="3"/>
                  </svg>
                </button>
                <button 
                  className="icon-btn" 
                  onClick={() => alignPanels('right')}
                  title="Align Right"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="12" y="2" width="2" height="12"/>
                    <rect x="2" y="4" width="8" height="3"/>
                    <rect x="2" y="9" width="6" height="3"/>
                  </svg>
                </button>
                <button 
                  className="icon-btn" 
                  onClick={() => alignPanels('top')}
                  title="Align Top"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="2" y="2" width="12" height="2"/>
                    <rect x="4" y="6" width="3" height="8"/>
                    <rect x="9" y="6" width="3" height="6"/>
                  </svg>
                </button>
                <button 
                  className="icon-btn" 
                  onClick={() => alignPanels('bottom')}
                  title="Align Bottom"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="2" y="12" width="12" height="2"/>
                    <rect x="4" y="2" width="3" height="8"/>
                    <rect x="9" y="2" width="3" height="6"/>
                  </svg>
                </button>
                <div className="toolbar-separator" />
                <button 
                  className="icon-btn" 
                  onClick={() => distributePanels('horizontal')}
                  title="Distribute Horizontally"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="1" y="4" width="2" height="8"/>
                    <rect x="6" y="4" width="4" height="8"/>
                    <rect x="13" y="4" width="2" height="8"/>
                  </svg>
                </button>
                <button 
                  className="icon-btn" 
                  onClick={() => distributePanels('vertical')}
                  title="Distribute Vertically"
                >
                  <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                    <rect x="4" y="1" width="8" height="2"/>
                    <rect x="4" y="6" width="8" height="4"/>
                    <rect x="4" y="13" width="8" height="2"/>
                  </svg>
                </button>
              </div>
            )}
          </div>
          
          <div
            className="canvas-transform-container"
            style={{
              transform: `translate(${canvasPan.x}px, ${canvasPan.y}px) scale(${canvasZoom})`,
            }}
          >
              {/* Phase 3: Marquee Selection Rectangle */}
              {isMarqueeSelecting && (
                <div
                  className="marquee-selection"
                  style={{
                    position: 'absolute',
                    left: Math.min(marqueeStart.x, marqueeEnd.x),
                    top: Math.min(marqueeStart.y, marqueeEnd.y),
                    width: Math.abs(marqueeEnd.x - marqueeStart.x),
                    height: Math.abs(marqueeEnd.y - marqueeStart.y),
                    backgroundColor: 'rgba(59, 130, 246, 0.1)',
                    border: '1px solid rgba(59, 130, 246, 0.5)',
                    pointerEvents: 'none',
                    zIndex: 1000,
                  }}
                />
              )}

              {/* Phase 3: Snap Guides */}
              {snapGuides.map((guide, index) => (
                <div
                  key={index}
                  className="snap-guide"
                  style={{
                    position: 'absolute',
                    left: guide.type === 'vertical' ? guide.position : 0,
                    top: guide.type === 'horizontal' ? guide.position : 0,
                    width: guide.type === 'vertical' ? 1 : '100%',
                    height: guide.type === 'horizontal' ? 1 : '100%',
                    backgroundColor: 'rgba(239, 68, 68, 0.6)',
                    pointerEvents: 'none',
                    zIndex: 999,
                  }}
                />
              ))}

              {panels.map((panel) => (
                <div
                  key={panel.id}
                  className={`panel-slot ${selectedPanelId === panel.id ? 'selected' : ''} ${panel.status} ${panel.selected ? 'multi-selected' : ''}`}
                  style={{
                    left: panel.x,
                    top: panel.y,
                    width: panel.width,
                    height: panel.height,
                    zIndex: panel.zIndex || (panel.selected ? 10 : 1),
                  }}
                  onMouseDown={(e) => {
                    // Handle Ctrl+Click or Shift+Click for multi-select
                    if (e.ctrlKey || e.metaKey || e.shiftKey) {
                      e.stopPropagation();
                      togglePanelSelection(panel.id);
                    }
                  }}
                  onClick={(e) => { 
                    e.stopPropagation();
                    
                    // Don't change active panel during multi-select actions
                    if (e.ctrlKey || e.metaKey || e.shiftKey) return;
                    
                    // Select this panel - DO NOT restore parameters automatically
                    // Only the Restore button should restore parameters and workflow
                    setSelectedPanelId(panel.id);
                    // Also update ref immediately for generatePanel
                    selectedPanelIdRef.current = panel.id;
                  }}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setContextMenu({
                      visible: true,
                      x: e.clientX,
                      y: e.clientY,
                      panelId: panel.id,
                    });
                  }}
                >
                  {/* Phase 2: Panel Header with name, drag handle */}
                  <PanelHeader
                    panelId={panel.id}
                    name={panel.name || `Panel_${String(panel.id).padStart(2, '0')}`}
                    locked={panel.locked || panel.imageHistory.length > 0}
                    selected={panel.selected}
                    onNameChange={(newName) => {
                      setPanels(prev => prev.map(p => 
                        p.id === panel.id ? { ...p, name: newName } : p
                      ));
                    }}
                    onRemove={() => handleRemovePanel(panel.id)}
                    onMouseDown={(e) => {
                      // Start drag from header
                      if (panel.status !== 'generating') {
                        handleDragStart(panel.id, e);
                      }
                    }}
                  />
                <div className="panel-content">
                  {panel.image && (
                    <div 
                      className="panel-image-container"
                    >
                      {isVideoUrl(panel.image) ? (
                        <video
                          src={panel.image}
                          controls
                          loop
                          muted
                          autoPlay
                          playsInline
                          draggable={true}
                          onDragStart={(e) => {
                            const currentEntry = panel.imageHistory[panel.historyIndex];
                            const filePath = currentEntry?.metadata?.savedPath;
                            const dragData = JSON.stringify({
                              url: panel.image,
                              filePath: filePath || null
                            });
                            e.dataTransfer.setData('application/x-storyboard-image', dragData);
                            e.dataTransfer.setData('text/plain', dragData);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setViewerImage(panel.image);
                            setViewerPanelId(panel.id);
                            setZoomMode('actual');
                            setViewerZoom(1);
                            setViewerPan({ x: 0, y: 0 });
                            setShowImageViewer(true);
                          }}
                          style={{ cursor: 'pointer', width: '100%', height: '100%', objectFit: 'contain' }}
                        />
                      ) : (
                        <img
                          src={panel.image}
                          alt={`Panel ${panel.id}`}
                          draggable={true}
                          onDragStart={(e) => {
                            // Pass both URL (for display) and file path (for ComfyUI) as JSON
                            const currentEntry = panel.imageHistory[panel.historyIndex];
                            const filePath = currentEntry?.metadata?.savedPath;
                            const dragData = JSON.stringify({
                              url: panel.image,
                              filePath: filePath || null
                            });
                            e.dataTransfer.setData('application/x-storyboard-image', dragData);
                            e.dataTransfer.setData('text/plain', dragData);
                            e.dataTransfer.effectAllowed = 'copy';
                          }}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setViewerImage(panel.image);
                            setViewerPanelId(panel.id);
                            setZoomMode('actual');
                            setViewerZoom(1);
                            setViewerPan({ x: 0, y: 0 });
                            setShowImageViewer(true);
                          }}
                          style={{ cursor: 'pointer' }}
                        />
                      )}
                    </div>
                  )}
                  
                  {/* Generation time display */}
                  {panel.imageHistory.length > 0 && panel.historyIndex >= 0 && panel.imageHistory[panel.historyIndex]?.metadata?.generationTime && (
                    <div className="generation-time">
                      {panel.imageHistory[panel.historyIndex].metadata.generationTime!.toFixed(1)}s
                    </div>
                  )}
                  
                  {/* Per-image star rating */}
                  {panel.imageHistory.length > 0 && panel.historyIndex >= 0 && (
                    <div className="image-rating" onClick={(e) => e.stopPropagation()}>
                      <StarRating
                        rating={panel.imageHistory[panel.historyIndex]?.metadata?.rating || 0}
                        onRatingChange={(newRating) => {
                          setPanels(prev => prev.map(p => {
                            if (p.id !== panel.id) return p;
                            const newHistory = [...p.imageHistory];
                            if (newHistory[p.historyIndex]) {
                              newHistory[p.historyIndex] = {
                                ...newHistory[p.historyIndex],
                                metadata: {
                                  ...newHistory[p.historyIndex].metadata,
                                  rating: newRating
                                }
                              };
                            }
                            return { ...p, imageHistory: newHistory };
                          }));
                        }}
                        size={14}
                      />
                    </div>
                   )}
                  
                  {/* Minimal generating indicator — thin bottom bar + small badge */}
                  {panel.status === 'generating' && (
                    <div className="panel-generating-mini">
                      <div className="panel-gen-mini-bar">
                        <div
                          className="panel-gen-mini-bar-fill"
                          style={{ width: `${panel.progress}%` }}
                        />
                      </div>
                      <span className="panel-gen-mini-badge">
                        <span className="panel-gen-mini-spinner" />
                        {panel.progress}%
                      </span>
                    </div>
                  )}
                  
                  {/* Show play button when empty and no image */}
                  {panel.status === 'empty' && !panel.image && (
                    <button 
                      className="panel-generate-btn large"
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        generatePanel(panel.id); 
                      }}
                      disabled={Boolean(getPanelGenerationDisabledReason(panel))}
                      aria-describedby={getPanelGenerationDisabledReason(panel) ? 'generate-disabled-reason' : undefined}
                      title="Generate"
                    >
                      ▶
                    </button>
                  )}
                  
                  <span className="panel-index">{panel.id}</span>
                </div>
                
                {/* Image navigation for history - static bar below image */}
                {panel.imageHistory.length > 1 && (
                  <div className="image-nav history-nav">
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setPanels(prev => prev.map(p => {
                          if (p.id !== panel.id) return p;
                          const newIdx = Math.max(0, p.historyIndex - 1);
                          const entry = p.imageHistory[newIdx];
                          return { ...p, historyIndex: newIdx, image: entry?.url || p.image };
                        }));
                      }}
                      disabled={panel.historyIndex <= 0}
                      title="Previous version"
                    >◀</button>
                    <span className="history-counter" title={`Version ${panel.historyIndex + 1} of ${panel.imageHistory.length}`}>
                      v{panel.historyIndex + 1}/{panel.imageHistory.length}
                    </span>
                    <button 
                      onClick={(e) => {
                        e.stopPropagation();
                        setPanels(prev => prev.map(p => {
                          if (p.id !== panel.id) return p;
                          const newIdx = Math.min(p.imageHistory.length - 1, p.historyIndex + 1);
                          const entry = p.imageHistory[newIdx];
                          return { ...p, historyIndex: newIdx, image: entry?.url || p.image };
                        }));
                      }}
                      disabled={panel.historyIndex >= panel.imageHistory.length - 1}
                      title="Next version"
                    >▶</button>
                    <button
                      className="restore-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const entry = panel.imageHistory[panel.historyIndex];
                        
                        // First check if parameters are stored in entry metadata (fresh generations)
                        if (entry?.metadata?.parameters && entry?.metadata?.workflowId) {
                          // If workflow is different, skip the parameter reset effect
                          if (entry.metadata.workflowId !== selectedWorkflowId) {
                            skipParameterReset.current = true;
                            setSelectedWorkflowId(entry.metadata.workflowId);
                          }
                          const restoredParams = entry.metadata.parameters as Record<string, unknown>;
                          setParameterValues(restoredParams);
                          parameterValuesRef.current = restoredParams;
                          showInfo(`Restored parameters from v${panel.historyIndex + 1}`);
                          return;
                        }
                        
                        // For images loaded from disk, extract from PNG metadata
                        const savedPath = entry?.metadata?.savedPath;
                        if (!savedPath) {
                          showError('No image path available');
                          return;
                        }
                        
                        try {
                          const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();
                          const response = await fetch(`${orchestratorUrl}/api/png-metadata?path=${encodeURIComponent(savedPath)}`);
                          const pngMeta = await response.json();
                          
                          if (!pngMeta.success || !pngMeta.prompt) {
                            showError('Could not read PNG metadata');
                            return;
                          }
                          
                          const promptData = pngMeta.prompt as Record<string, { inputs?: Record<string, unknown>; class_type?: string }>;
                          
                          // Step 1: Match workflow by structural comparison (node IDs + class_types)
                          // This is far more reliable than filename_prefix matching since workflows
                          // built from templates preserve the same node IDs and class_types.
                          let matchedWorkflow: typeof workflows[number] | undefined;
                          
                          const promptNodeIds = Object.keys(promptData).filter(k => k !== 'meta' && k !== 'version');
                          let bestScore = 0;
                          
                          for (const wf of workflows) {
                            let matches = 0;
                            
                            for (const nodeId of promptNodeIds) {
                              if (wf.workflow[nodeId]) {
                                const promptClassType = promptData[nodeId]?.class_type;
                                const templateClassType = (wf.workflow[nodeId] as { class_type?: string })?.class_type;
                                if (promptClassType && promptClassType === templateClassType) {
                                  matches++;
                                }
                              }
                            }
                            
                            // Require at least 60% match and better than previous best
                            const score = promptNodeIds.length > 0 ? matches / promptNodeIds.length : 0;
                            if (score > 0.6 && score > bestScore) {
                              bestScore = score;
                              matchedWorkflow = wf;
                            }
                          }
                          
                          // Step 2: Extract parameters using matched workflow's parsed info
                          const extractedParams: Record<string, unknown> = {};
                          const extractedImages: Record<string, string> = {};
                          
                          if (matchedWorkflow) {
                            // Use parsed parameter info from workflow-parser
                            for (const param of matchedWorkflow.parsed.parameters) {
                              const nodeId = param.node_id;
                              const inputName = param.input_name;
                              const node = promptData[nodeId];
                              if (node?.inputs && inputName in node.inputs) {
                                const value = node.inputs[inputName];
                                // Skip array values (these are links to other nodes, not user parameters)
                                if (!Array.isArray(value)) {
                                  extractedParams[param.name] = value;
                                }
                              }
                            }
                            
                            // Extract image inputs
                            for (const imgInput of matchedWorkflow.parsed.image_inputs) {
                              const nodeId = imgInput.node_id;
                              const inputName = imgInput.input_name;
                              const node = promptData[nodeId];
                              if (node?.inputs && inputName in node.inputs) {
                                const imageName = node.inputs[inputName] as string;
                                if (imageName && typeof imageName === 'string') {
                                  // Store ComfyUI image filename - will need to fetch from ComfyUI
                                  extractedImages[imgInput.name] = imageName;
                                }
                              }
                            }
                          }
                          
                          // Fallback: extract common parameters from any node if workflow matching failed
                          if (Object.keys(extractedParams).length === 0) {
                            for (const node of Object.values(promptData)) {
                              if (!node.inputs) continue;
                              const classType = node.class_type || '';
                              
                              if (classType.includes('KSampler') || classType.includes('Sampler')) {
                                if (node.inputs.seed !== undefined) extractedParams.seed = node.inputs.seed;
                                if (node.inputs.steps !== undefined) extractedParams.steps = node.inputs.steps;
                                if (node.inputs.cfg !== undefined) extractedParams.cfg = node.inputs.cfg;
                                if (node.inputs.sampler_name) extractedParams.sampler_name = node.inputs.sampler_name;
                                if (node.inputs.scheduler) extractedParams.scheduler = node.inputs.scheduler;
                                if (node.inputs.denoise !== undefined) extractedParams.denoise = node.inputs.denoise;
                                if (node.inputs.positive_prompt) extractedParams.positive_prompt = node.inputs.positive_prompt;
                                if (node.inputs.negative_prompt) extractedParams.negative_prompt = node.inputs.negative_prompt;
                              }
                              
                              if (classType === 'CLIPTextEncode' && node.inputs.text) {
                                const text = node.inputs.text as string;
                                if (typeof text === 'string' && text.length > 20 && !extractedParams.positive_prompt) {
                                  extractedParams.positive_prompt = text;
                                }
                              }
                              
                              if (classType.includes('TextEncode') && !extractedParams.positive_prompt) {
                                const text = (node.inputs.prompt || node.inputs.text) as string;
                                if (typeof text === 'string' && text.length > 20) {
                                  extractedParams.positive_prompt = text;
                                }
                              }
                              
                              // Extract LoadImage/LoadImageOutput filenames
                              if ((classType === 'LoadImage' || classType === 'LoadImageOutput') && node.inputs.image) {
                                const imageName = node.inputs.image as string;
                                if (!extractedImages.reference_image) {
                                  extractedImages.reference_image = imageName;
                                }
                              }
                            }
                          }
                          
                          // Step 3: Apply the restored data
                          let restoredCount = 0;
                          
                          // Switch workflow if matched
                          if (matchedWorkflow && matchedWorkflow.id !== selectedWorkflowId) {
                            skipParameterReset.current = true;
                            setSelectedWorkflowId(matchedWorkflow.id);
                            restoredCount++;
                          }
                          
                          // Set parameters
                          if (Object.keys(extractedParams).length > 0) {
                            setParameterValues(prev => {
                              const newValues = { ...prev, ...extractedParams };
                              parameterValuesRef.current = newValues;
                              return newValues;
                            });
                            restoredCount += Object.keys(extractedParams).length;
                          }
                          
                          // Handle image inputs - fetch from ComfyUI and set as data URLs
                          const imageCount = Object.keys(extractedImages).length;
                          if (imageCount > 0) {
                            const comfyNodes = renderNodes.filter(n => n.status === 'online');
                            if (comfyNodes.length > 0) {
                              const comfyUrl = comfyNodes[0].url.replace(/\/$/, '');
                              
                              for (const [inputName, imageName] of Object.entries(extractedImages)) {
                                try {
                                  // Fetch image from ComfyUI input folder
                                  const imageUrl = `${comfyUrl}/view?filename=${encodeURIComponent(imageName)}&type=input`;
                                  const imgResponse = await fetch(imageUrl);
                                  if (imgResponse.ok) {
                                    const blob = await imgResponse.blob();
                                    const dataUrl = await new Promise<string>((resolve) => {
                                      const reader = new FileReader();
                                      reader.onloadend = () => resolve(reader.result as string);
                                      reader.readAsDataURL(blob);
                                    });
                                    extractedParams[inputName] = dataUrl;
                                    restoredCount++;
                                  }
                                } catch (err) {
                                  console.warn(`Could not fetch image ${imageName}:`, err);
                                }
                              }
                              
                              // Update parameters with fetched images
                              if (Object.keys(extractedImages).some(k => extractedParams[k])) {
                                setParameterValues(prev => {
                                  const newValues = { ...prev, ...extractedParams };
                                  parameterValuesRef.current = newValues;
                                  return newValues;
                                });
                              }
                            }
                          }
                          
                          if (restoredCount > 0) {
                            const workflowMsg = matchedWorkflow ? `workflow "${matchedWorkflow.name || matchedWorkflow.id}"` : '';
                            const paramMsg = `${Object.keys(extractedParams).length} parameters`;
                            const imageMsg = imageCount > 0 ? `, ${imageCount} images` : '';
                            showInfo(`Restored ${workflowMsg ? workflowMsg + ', ' : ''}${paramMsg}${imageMsg}`);
                          } else {
                            showWarning('No parameters could be extracted from PNG');
                          }
                          
                        } catch (err) {
                          console.error('Failed to restore from PNG:', err);
                          showError('Failed to restore parameters');
                        }
                      }}
                      title="Restore workflow and parameters from this version"
                    >↩</button>
                    <button 
                      className="save-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        const entry = panel.imageHistory[panel.historyIndex];
                        if (entry) {
                          try {
                            // If project folder is configured, save directly to it
                            if (projectSettings.path) {
                              const panelName = panel.name || `Panel_${String(panel.id).padStart(2, '0')}`;
                              const result = await projectManager.saveToProjectFolder(
                                entry.url,
                                panel.id,
                                entry.metadata.version,
                                entry.metadata,
                                panelName  // CRITICAL: Pass panel name for per-panel folder creation
                              );
                              
                              if (result.success) {
                                showInfo(`Saved: ${result.savedPath}`);
                              } else {
                                showError(`Failed to save: ${result.error}`);
                              }
                            } else {
                              // Fallback to browser download if no folder configured
                              const { filename, blob } = await projectManager.saveImageToProject(
                                entry.url,
                                panel.id,
                                entry.metadata.version,
                                entry.metadata
                              );
                              projectManager.triggerDownload(blob, filename);
                              
                              // Also download metadata JSON
                              const metaJson = projectManager.generateMetadataJson(entry);
                              const metaBlob = new Blob([metaJson], { type: 'application/json' });
                              projectManager.triggerDownload(metaBlob, filename.replace('.png', '_metadata.json'));
                              
                              showInfo(`Downloaded: ${filename}`);
                            }
                          } catch (err) {
                            showError(`Failed to save: ${err}`);
                          }
                        }
                      }}
                      title={projectSettings.path ? `Save to ${projectSettings.path}` : "Download image"}
                    >💾</button>
                  </div>
                )}
                
                {/* Panel controls at bottom */}
                <div className="panel-controls">
                  {(panel.status === 'empty' || panel.status === 'complete' || panel.status === 'error') && (
                    <button 
                      className={`panel-generate-btn ${panel.status !== 'empty' ? 'regenerate' : ''}`}
                      onClick={(e) => { 
                        e.stopPropagation(); 
                        // Keep previous images in history before regenerating
                        setPanels(prev => prev.map(p => {
                          if (p.id !== panel.id) return p;
                          // Add current image to history if exists
                          const newImages = p.image && !p.images.includes(p.image) 
                            ? [...p.images, p.image] 
                            : p.images;
                          return { ...p, status: 'empty', progress: 0, images: newImages };
                        }));
                        generatePanel(panel.id); 
                      }}
                      disabled={Boolean(getPanelGenerationDisabledReason(panel))}
                      aria-describedby={getPanelGenerationDisabledReason(panel) ? 'generate-disabled-reason' : undefined}
                      title={panel.status === 'empty' ? 'Generate' : 'Regenerate'}
                    >
                      {panel.status === 'error' ? '⟳' : '▶'}
                    </button>
                  )}
                  
                  {/* Render Node Selector */}
                  <select
                    className="panel-node-selector"
                    value={panel.nodeId || ''}
                    onChange={(e) => {
                      const nodeId = e.target.value || undefined;
                      setPanels(prev => prev.map(p => 
                        p.id === panel.id ? { ...p, nodeId } : p
                      ));
                    }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <option value="">Auto</option>
                    {renderNodes.map(node => (
                      <option 
                        key={node.id} 
                        value={node.id}
                        disabled={node.status === 'offline'}
                      >
                        {node.name} ({node.status})
                      </option>
                    ))}
                  </select>
                  
                  {/* Delete Image Button */}
                  {panel.imageHistory.length > 0 && panel.historyIndex >= 0 && (
                    <button
                      className="panel-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        // CRITICAL FIX: Use entry ID instead of historyIndex
                        const currentEntry = panel.imageHistory[panel.historyIndex];
                        if (currentEntry) {
                          handleDeleteImage(panel.id, currentEntry.id);
                        }
                      }}
                      title="Delete image"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                  
                  {/* Refresh Panel — re-scan this panel's folder for new/renamed files */}
                  {projectSettings.path && (
                    <button
                      className="panel-refresh-btn"
                      onClick={async (e) => {
                        e.stopPropagation();
                        try {
                          const scanResult = await projectManager.scanProjectPanels();
                          if (!scanResult.success || !scanResult.panels) return;
                          
                          const panelName = panel.name || `Panel_${String(panel.id).padStart(2, '0')}`;
                          const matchedFolder = scanResult.panels.find(
                            (pf: { panel_name: string }) => pf.panel_name === panelName
                          );
                          
                          if (!matchedFolder) return;
                          
                          const validImages = matchedFolder.images
                            .filter((img: { image_path: string }) => !deletedImages.has(img.image_path))
                            .sort((a: { modified_time: number }, b: { modified_time: number }) => a.modified_time - b.modified_time);
                          
                          const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();
                          
                          const newHistory: ImageHistoryEntry[] = validImages.map((img: { image_path: string; modified_time: number }, index: number) => ({
                            id: `${panelName}_v${index + 1}`,
                            url: `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(img.image_path)}`,
                            metadata: {
                              timestamp: new Date(img.modified_time * 1000),
                              workflowId: '',
                              workflowName: 'Loaded',
                              seed: 0,
                              promptSummary: '',
                              parameters: {},
                              workflow: {},
                              sourceUrl: '',
                              savedPath: img.image_path,
                              version: index + 1,
                            } as ImageMetadata
                          }));
                          
                          setPanels(prev => prev.map(p => {
                            if (p.id !== panel.id) return p;
                            return {
                              ...p,
                              imageHistory: newHistory,
                              historyIndex: newHistory.length > 0 ? newHistory.length - 1 : -1,
                              image: newHistory.length > 0 ? newHistory[newHistory.length - 1]?.url ?? null : null,
                              status: newHistory.length > 0 ? 'complete' as const : 'empty' as const,
                              progress: newHistory.length > 0 ? 100 : 0,
                            };
                          }));
                          
                          showInfo(`Refreshed ${panelName}: ${newHistory.length} file${newHistory.length !== 1 ? 's' : ''}`);
                        } catch (err) {
                          console.error('Panel refresh failed:', err);
                          showError('Failed to refresh panel');
                        }
                      }}
                      title="Refresh panel folder"
                    >
                      <RefreshCw size={14} />
                    </button>
                  )}
                </div>
                
                {/* Phase 4.1: Panel Notes Footer */}
                <PanelNotes
                  panelId={panel.id}
                  notes={panel.notes || ''}
                  onNotesChange={(newNotes) => {
                    setPanels(prev => prev.map(p =>
                      p.id === panel.id ? { ...p, notes: newNotes } : p
                    ));
                  }}
                />
                
                {/* Phase 2: Resize handle */}
                <div
                  className="panel-resize-handle"
                  title="Drag to resize"
                  onMouseDown={(e) => handleResizeStart(panel.id, e)}
                />
              </div>
            ))}
          </div>
        </main>
        
        {/* Right Resize Handle */}
        <div 
          className="resize-handle resize-handle-right"
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizingRight(true);
          }}
        />
        
        {/* Right Sidebar - Stats */}
        <aside className="stats-panel" style={{ width: rightPanelWidth }}>
          <div className="stats-header">System Stats</div>
          
          {/* Generation Progress — shows when any panel is generating */}
          <GenerationProgress
            panels={panels}
            onCancelSingle={(panelId) => cancelGenerations(panelId)}
            onCancelParallelJob={(panelId, nodeId) => cancelGenerations(panelId, nodeId)}
          />
          
          {/* Multi-Node Selector */}
          {renderNodes.length > 0 && (
            <div style={{ padding: '8px', borderBottom: '1px solid #3d3d3d' }}>
              <MultiNodeSelector
                selectedBackendIds={selectedBackendIds}
                onSelectionChange={setSelectedBackendIds}
                disabled={false}
              />
            </div>
          )}
          
          <div className="stats-content">
            {renderNodes.length === 0 && !systemStats ? (
              <span className="no-stats">No nodes configured</span>
            ) : (
              <div className="node-metrics-list">
                {/* Show render nodes with full metrics */}
                {renderNodes.map(node => (
                  <div key={node.id} className="node-metrics-card">
                    <div className="node-metrics-header">
                      <span 
                        className="node-status-dot"
                        style={{ 
                          color: node.status === 'online' ? '#4dff6d' : 
                                 node.status === 'busy' ? '#ffcc00' : '#ff4444'
                        }}
                      >●</span>
                      <span className="node-name">{node.name}</span>
                    </div>
                    {/* Progress bar for active jobs on this node */}
                    {(() => {
                      // Find any active job on this node
                      const activeJob = panels
                        .filter(p => p.status === 'generating' && p.parallelJobs)
                        .flatMap(p => p.parallelJobs || [])
                        .find(j => j.nodeId === node.id && (j.status === 'running' || j.status === 'pending'));
                      
                      if (!activeJob) return null;
                      
                      return (
                        <div className="node-progress-container">
                          <div className="node-progress-bar">
                            <div 
                              className="node-progress-fill"
                              style={{ width: `${activeJob.progress}%` }}
                            />
                          </div>
                          <span className="node-progress-text">
                            {activeJob.status === 'running' ? `${activeJob.progress}%` : 'Queued'}
                          </span>
                        </div>
                      );
                    })()}
                    {node.status === 'online' && (
                      <div className="node-metrics-body">
                        <div className="metric-row">
                          <span className="metric-label">GPU</span>
                          <span className="metric-value">{node.gpuName}</span>
                        </div>
                        <div className="metric-row">
                          <span className="metric-label">VRAM</span>
                          <span className="metric-value">
                            {(node.vramUsed / 1024).toFixed(1)}/{(node.vramTotal / 1024).toFixed(1)} GB
                          </span>
                          <div className="metric-bar">
                            <div className="metric-bar-fill" style={{ width: `${Math.min(100, (node.vramUsed / node.vramTotal) * 100)}%` }} />
                          </div>
                        </div>
                        <div className="metric-row">
                          <span className="metric-label">GPU%</span>
                          <span className="metric-value">{(node.gpuUsage || 0).toFixed(0)}%</span>
                          <div className="metric-bar">
                            <div className="metric-bar-fill gpu" style={{ width: `${node.gpuUsage || 0}%` }} />
                          </div>
                        </div>
                        <div className="metric-row">
                          <span className="metric-label">Temp</span>
                          <span className="metric-value">{node.gpuTemp || 0}°C</span>
                        </div>
                        <div className="metric-row">
                          <span className="metric-label">CPU</span>
                          <span className="metric-value">{(node.cpuUsage || 0).toFixed(0)}%</span>
                          <div className="metric-bar">
                            <div className="metric-bar-fill cpu" style={{ width: `${node.cpuUsage || 0}%` }} />
                          </div>
                        </div>
                        <div className="metric-row">
                          <span className="metric-label">RAM</span>
                          <span className="metric-value">
                            {(node.ramUsed || 0).toFixed(1)}/{(node.ramTotal || 0).toFixed(1)} GB
                          </span>
                          <div className="metric-bar">
                            <div className="metric-bar-fill ram" style={{ width: `${node.ramTotal ? (node.ramUsed / node.ramTotal) * 100 : 0}%` }} />
                          </div>
                        </div>
                      </div>
                    )}
                    {node.status !== 'online' && (
                      <div className="node-metrics-offline">
                        {node.status === 'offline' ? 'Offline' : node.status}
                      </div>
                    )}
                  </div>
                ))}
                
                {/* Show top bar connection stats if no render nodes */}
                {renderNodes.length === 0 && systemStats && (
                  <div className="node-metrics-card">
                    <div className="node-metrics-header">
                      <span className="node-status-dot" style={{ color: '#4dff6d' }}>●</span>
                      <span className="node-name">Top Bar URL</span>
                    </div>
                    <div className="node-metrics-body">
                      <div className="metric-row">
                        <span className="metric-label">GPU</span>
                        <span className="metric-value">{systemStats.devices?.[0]?.name?.replace(/^cuda:\d+\s+/, '').replace(/:\w+Alloc\w*$/, '') || 'Unknown'}</span>
                      </div>
                      <div className="metric-row">
                        <span className="metric-label">VRAM</span>
                        <span className="metric-value">
                          {systemStats.devices?.[0]?.vram_total ? 
                            `${((systemStats.devices[0].vram_total - (systemStats.devices[0].vram_free || 0)) / 1024 / 1024 / 1024).toFixed(1)}/${(systemStats.devices[0].vram_total / 1024 / 1024 / 1024).toFixed(1)} GB` 
                            : 'N/A'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </aside>
      </div>
      
      {/* Application Log */}
      {showLogPanel && (
        <div className="log-panel">
          <div className="log-header">
            <span>Application Log</span>
            <div className="log-controls">
              <select value={logFilter} onChange={(e) => setLogFilter(e.target.value)}>
                <option value="ALL">All</option>
                <option value="COMFYUI">COMFYUI</option>
                <option value="ERROR">Error</option>
              </select>
              <label>
                <input type="checkbox" checked={autoScroll} onChange={(e) => setAutoScroll(e.target.checked)} />
                Auto-scroll
              </label>
              <button onClick={() => setShowLogPanel(false)} className="toggle-log-btn">Hide</button>
            </div>
          </div>
          <div className="log-content">
            {logs
              .filter(log => logFilter === 'ALL' || log.tag.toUpperCase() === logFilter)
              .map((log) => (
                <div key={log.id} className={`log-entry ${log.tag}`}>
                  <span className="log-time">[{formatTime(log.timestamp)}]</span>
                  <span className="log-tag">{log.tag}</span>
                  <span className="log-message">{log.message}</span>
                </div>
              ))}
            <div ref={logEndRef} />
          </div>
        </div>
      )}
      
      {!showLogPanel && (
        <button 
          className="show-log-btn" 
          onClick={() => setShowLogPanel(true)}
        >
          Show Log
        </button>
      )}
      
      {/* Workflow Editor Modal */}
      {showWorkflowEditor && editingWorkflow && (
        <div className="modal-overlay">
          <div className="modal-content">
            <WorkflowEditor
              key={editingWorkflow.id}
              workflow={editingWorkflow.workflow}
              parsedWorkflow={editingWorkflow.parsed}
              initialConfig={editingWorkflow.config}
              comfyUrl={editorComfyUrl}
              onSave={(config) => {
                skipParameterReset.current = true;
                const previousConfig = editingWorkflow.config;
                const reconciledValues = reconcileParameterValues(
                  parameterValuesRef.current,
                  previousConfig,
                  config,
                );
                parameterValuesRef.current = reconciledValues;
                setParameterValues(reconciledValues);
                setPanels(prev => prev.map(panel => {
                  const belongsToWorkflow = panel.workflowId === editingWorkflow.id ||
                    (panel.id === selectedPanelIdRef.current && !panel.workflowId);
                  if (!belongsToWorkflow || !panel.parameterValues) return panel;
                  return {
                    ...panel,
                    parameterValues: reconcileParameterValues(
                      panel.parameterValues,
                      previousConfig,
                      config,
                    ),
                  };
                }));
                setWorkflows(prev => prev.map(w =>
                  w.id === editingWorkflow.id ? { ...w, config } : w
                ));
                setShowWorkflowEditor(false);
                addLog('info', `Updated workflow: ${editingWorkflow.name}`);
              }}
              onCancel={() => setShowWorkflowEditor(false)}
            />
          </div>
        </div>
      )}
      
      {/* Workflow Rename Dialog */}
      {showRenameDialog && renamingWorkflow && (
        <div className="modal-overlay">
          <div className="modal-content rename-dialog">
            <div className="modal-header">
              <h3>Rename Workflow</h3>
              <button 
                className="modal-close-btn"
                onClick={() => setShowRenameDialog(false)}
              >
                <X size={20} />
              </button>
            </div>
            <div className="modal-body">
              <label className="input-label">
                Workflow Name
                <input
                  type="text"
                  value={newWorkflowName}
                  onChange={(e) => setNewWorkflowName(e.target.value)}
                  placeholder="Enter workflow name..."
                  className="text-input"
                  autoFocus
                />
              </label>
            </div>
            <div className="modal-footer">
              <button 
                className="btn-secondary"
                onClick={() => setShowRenameDialog(false)}
              >
                Cancel
              </button>
              <button 
                className="btn-primary"
                onClick={() => {
                  if (newWorkflowName.trim() && renamingWorkflow) {
                    setWorkflows(prev => prev.map(w =>
                      w.id === renamingWorkflow.id 
                        ? { ...w, name: newWorkflowName.trim() } 
                        : w
                    ));
                    addLog('info', `Renamed workflow from "${renamingWorkflow.name}" to "${newWorkflowName.trim()}"`);
                    setShowRenameDialog(false);
                    setRenamingWorkflow(null);
                    setNewWorkflowName('');
                  }
                }}
                disabled={!newWorkflowName.trim()}
              >
                Rename
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Workflow Categories Modal */}
      <WorkflowCategoriesModal
        isOpen={showCategoriesModal}
        onClose={() => setShowCategoriesModal(false)}
        workflows={workflows}
        onUpdateWorkflow={handleUpdateWorkflow}
      />

      {/* Phase 4.3: Print Dialog */}
      <PrintDialog
        isOpen={showPrintDialog}
        onClose={() => setShowPrintDialog(false)}
        panels={panels}
        projectName={projectSettings.name || 'Untitled Project'}
        selectedPanelIds={panels.filter(p => p.selected).map(p => p.id)}
      />

      {/* Node Manager Modal */}
      {showNodeManager && (
        <NodeManager 
          onClose={() => setShowNodeManager(false)} 
          onRestartNodes={async (nodeIds) => {
            showInfo(`Restarting ${nodeIds.length} selected node(s)...`);
            
            try {
              const results = [];
              for (const nodeId of nodeIds) {
                const result = await orchestratorManager.restartBackend(nodeId);
                results.push({ nodeId, ...result });
              }
              
              const successCount = results.filter(r => r.success).length;
              const failCount = results.length - successCount;
              
              if (failCount === 0) {
                showInfo(`Successfully restarted ${successCount} node(s)`);
              } else if (successCount === 0) {
                showError(`Failed to restart all ${failCount} node(s)`);
              } else {
                showInfo(`Restarted ${successCount} node(s), ${failCount} failed`);
              }
            } catch (err) {
              showError(`Error restarting nodes: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }}
        />
      )}
      
      {/* Project Settings Modal */}
      {showProjectSettings && (
        <ProjectSettingsModal
          isOpen={showProjectSettings}
          onClose={() => setShowProjectSettings(false)}
          settings={projectSettings}
          onSave={setProjectSettings}
        />
      )}

      {/* Path Mappings Modal */}
      {showPathMappings && (
        <PathMappingsModal
          isOpen={showPathMappings}
          onClose={() => setShowPathMappings(false)}
          orchestratorUrl={projectSettings.orchestratorUrl || getDefaultOrchestratorUrl()}
        />
      )}

      {/* Load Project Modal - Folder Browser + Project List */}
      {showLoadProjectBrowser && (
        <div className="modal-overlay" onClick={() => setShowLoadProjectBrowser(false)}>
          <div className="modal-content load-project-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Load Project</h2>
              <button className="close-btn" onClick={() => setShowLoadProjectBrowser(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="load-project-content">
              <p className="load-project-instruction">
                Select a folder to browse for project files:
              </p>
              
              <FolderBrowserModal
                isOpen={true}
                onClose={() => {}}
                onSelect={handleLoadProjectFolderSelect}
                orchestratorUrl={projectSettings.orchestratorUrl}
                initialPath={projectSettings.path}
                title="Select Folder"
              />
              
              {isLoadingProjects && (
                <div className="loading-projects">Loading projects...</div>
              )}
              
              {availableProjects.length > 0 && (
                <div className="available-projects">
                  <h3>Select a project to load:</h3>
                  <div className="project-list">
                    {availableProjects.map((project) => (
                      <div
                        key={project.path}
                        className="project-item"
                        onClick={() => handleLoadSelectedProject(project.path)}
                      >
                        <span className="project-name">{project.name}</span>
                        <span className="project-meta">
                          {project.panel_count} panels • {new Date(project.saved_at).toLocaleString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              
              {selectedLoadPath && !isLoadingProjects && availableProjects.length === 0 && (
                <div className="no-projects-found">
                  No project files found in this folder.
                </div>
              )}
            </div>
            
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowLoadProjectBrowser(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* New File Browser Dialog (Load/Save) */}
      {fileBrowserMode && (
        <FileBrowserDialog
          isOpen={true}
          onClose={() => setFileBrowserMode(null)}
          mode={fileBrowserMode}
          orchestratorUrl={projectSettings.orchestratorUrl}
          initialPath={projectSettings.path}
          projectName={projectSettings.name}
          onOpenProject={handleLoadFromDialog}
          onSaveProject={handleSaveFromDialog}
        />
      )}

      {/* Phase 3.5: Folder Import Dialog */}
      {showFolderBrowser && (
        <div className="modal-overlay" onClick={() => setShowFolderBrowser(false)}>
          <div className="modal-content folder-import-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Import Folder</h2>
              <button className="close-btn" onClick={() => setShowFolderBrowser(false)}>
                <X size={18} />
              </button>
            </div>
            
            <div className="modal-body">
              <p className="folder-import-instruction">
                Select a folder to import images from <strong>{pendingFolderName}</strong>:
              </p>
              
              <FolderBrowserModal
                isOpen={true}
                onClose={() => {}}
                onSelect={async (path) => {
                  // Create a new panel
                  const newPanelId = Math.max(...panels.map(p => p.id), 0) + 1;
                  const panelName = `Panel_${String(newPanelId).padStart(2, '0')}`;
                  const orchestratorUrl = projectSettings.orchestratorUrl || getDefaultOrchestratorUrl();
                  
                  // First scan the folder for images
                  try {
                    addLog('info', `Scanning folder ${path} for images...`);
                    
                    const scanResponse = await fetch(`${orchestratorUrl}/api/scan-folder-images`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ folder_path: path })
                    });
                    
                    if (!scanResponse.ok) {
                      throw new Error(`Scan failed: ${scanResponse.status}`);
                    }
                    
                    const scanResult = await scanResponse.json();
                    
                    if (!scanResult.success || scanResult.images.length === 0) {
                      addLog('warning', `No images found in folder: ${path}`);
                      showWarning('No images found in the selected folder');
                      setShowFolderBrowser(false);
                      setPendingFolderName('');
                      return;
                    }
                    
                    // Build imageHistory from scanned images
                    const imageHistory: ImageHistoryEntry[] = scanResult.images.map((img: { filename: string; image_path: string; modified_time: number }, index: number) => ({
                      id: `import_${newPanelId}_${index}`,
                      url: `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(img.image_path)}`,
                      metadata: {
                        timestamp: new Date(img.modified_time * 1000),
                        workflowId: '',
                        workflowName: 'Imported',
                        seed: 0,
                        promptSummary: `Imported from ${img.filename}`,
                        parameters: {},
                        workflow: {},
                        sourceUrl: '',
                        savedPath: img.image_path,
                        version: index + 1,
                      } as ImageMetadata
                    }));
                    
                    // Use folder name as panel name if it looks meaningful
                    // Strip trailing slashes before extracting basename to avoid empty string
                    const cleanPath = path.replace(/[/\\]+$/, '');
                    const folderBasename = cleanPath.split(/[/\\]/).pop() || panelName;
                    const finalPanelName = folderBasename.match(/^[a-zA-Z0-9_-]+$/) ? folderBasename : panelName;
                    console.log('[Import] Selected path:', path, '→ panel name:', finalPanelName);
                    
                    // Create panel with populated imageHistory
                    // Position to the right of all existing panels to avoid overlap
                    setPanels(prev => {
                      const maxX = prev.reduce((max, p) => Math.max(max, p.x + (p.width || 300)), 0);
                      const newX = prev.length > 0 ? maxX + PANEL_GAP : 0;
                      const newY = 0;
                      return [...prev, {
                        id: newPanelId,
                        name: finalPanelName,
                        x: newX,
                        y: newY,
                        width: 300,
                        height: 300,
                        image: imageHistory[imageHistory.length - 1]?.url || '',
                        images: [],
                        status: imageHistory.length > 0 ? 'complete' : 'empty',
                        progress: imageHistory.length > 0 ? 100 : 0,
                        imageHistory,
                        historyIndex: imageHistory.length > 0 ? imageHistory.length - 1 : -1,
                        currentImageIndex: 0,
                        workflowId: undefined,
                        parameterValues: {},
                        notes: '',
                        locked: imageHistory.length > 0, // Lock panel if it has imported images
                        selected: false,
                      }];
                    });
                    
                    addLog('info', `Imported ${imageHistory.length} images into panel ${finalPanelName}`);
                    showInfo(`Imported ${imageHistory.length} images`);
                    
                  } catch (error) {
                    const errMsg = error instanceof Error ? error.message : 'Unknown error';
                    addLog('error', `Failed to import folder: ${errMsg}`);
                    showError(`Failed to import folder: ${errMsg}`);
                  }
                  
                  setShowFolderBrowser(false);
                  setPendingFolderName('');
                }}
                orchestratorUrl={projectSettings.orchestratorUrl}
                initialPath={projectSettings.path}
                title="Select Import Folder"
              />
            </div>
            
            <div className="modal-footer">
              <button className="cancel-btn" onClick={() => setShowFolderBrowser(false)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Error Notifications */}
      <ErrorNotificationContainer notifications={notifications} onRemove={removeNotification} />
      
      {/* Phase 6: Delete Confirmation Dialog */}
      <DeleteConfirmDialog
        isOpen={deleteConfirm?.isOpen || false}
        filename={deleteConfirm?.filename || ''}
        onConfirm={() => {
          if (deleteConfirm) {
            executeDelete(deleteConfirm.panelId, deleteConfirm.entryId);
            setDeleteConfirm(null);
          }
        }}
        onCancel={() => setDeleteConfirm(null)}
        onSuppressForSession={() => setSuppressDeleteConfirm(true)}
      />
      
      {/* Floating Generate/Cancel Button Container */}
      <div className="floating-action-container">
        {generationDisabledReason && (
          <div id="generate-disabled-reason" className="generate-disabled-reason" role="status" aria-live="polite">
            <span>{generationDisabledReason}</span>
            <button type="button" onClick={() => setShowNodeManager(true)}>Manage Nodes</button>
          </div>
        )}

        {/* Cancel Button - Only visible when generating */}
        {(panels.some(p => p.status === 'generating') || renderNodes.some(n => n.status === 'busy')) && (
          <button 
            className="floating-cancel-btn"
            onClick={handleCancelGenerations}
            title="Cancel All Generations"
          >
            <OctagonX size={18} />
            Cancel
          </button>
        )}
        
        {/* Generate Button */}
        <button 
          className="floating-generate-btn"
          onClick={() => {
            if (selectedPanelId) {
              generatePanel(selectedPanelId);
            } else if (panels.length > 0) {
              generatePanel(panels[0].id);
            }
          }}
          disabled={Boolean(generationDisabledReason)}
          aria-describedby={generationDisabledReason ? 'generate-disabled-reason' : undefined}
          title="Generate (G)"
        >
          ▶ Generate
        </button>
      </div>
      
      {/* Panel Context Menu */}
      {contextMenu.visible && (
        <div
          className="panel-context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y,
            left: contextMenu.x,
            zIndex: 10000,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            className="context-menu-item"
            onClick={() => {
              if (contextMenu.panelId) {
                handleOpenInExplorer(contextMenu.panelId);
              }
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            disabled={!contextMenu.panelId || !panels.find(p => p.id === contextMenu.panelId)?.imageHistory[panels.find(p => p.id === contextMenu.panelId)?.historyIndex ?? 0]?.metadata?.savedPath}
          >
            <FolderOpen size={14} /> Open in Explorer
          </button>
          <button
            className="context-menu-item"
            onClick={async () => {
              if (!contextMenu.panelId) return;
              const panel = panels.find(p => p.id === contextMenu.panelId);
              if (!panel || panel.imageHistory.length === 0) {
                showWarning('No image in this panel');
                setContextMenu(prev => ({ ...prev, visible: false }));
                return;
              }
              
              const entry = panel.imageHistory[panel.historyIndex];
              
              // First check if parameters are stored in entry metadata (fresh generations)
              if (entry?.metadata?.parameters && entry?.metadata?.workflowId) {
                // If workflow is different, skip the parameter reset effect
                if (entry.metadata.workflowId !== selectedWorkflowId) {
                  skipParameterReset.current = true;
                  setSelectedWorkflowId(entry.metadata.workflowId);
                }
                const restoredParams = entry.metadata.parameters as Record<string, unknown>;
                setParameterValues(restoredParams);
                parameterValuesRef.current = restoredParams;
                showInfo(`Restored parameters from v${panel.historyIndex + 1}`);
                setContextMenu(prev => ({ ...prev, visible: false }));
                return;
              }
              
              // For images loaded from disk, extract from PNG metadata
              const savedPath = entry?.metadata?.savedPath;
              if (!savedPath) {
                showError('No image path available for parameter extraction');
                setContextMenu(prev => ({ ...prev, visible: false }));
                return;
              }
              
              try {
                const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();
                const response = await fetch(`${orchestratorUrl}/api/png-metadata?path=${encodeURIComponent(savedPath)}`);
                const pngMeta = await response.json();
                
                if (!pngMeta.success || !pngMeta.prompt) {
                  showError('Could not read PNG metadata');
                  setContextMenu(prev => ({ ...prev, visible: false }));
                  return;
                }
                
                const promptData = pngMeta.prompt as Record<string, { inputs?: Record<string, unknown>; class_type?: string }>;
                
                // Match workflow by structural comparison (node IDs + class_types)
                let matchedWorkflow: typeof workflows[number] | undefined;
                
                const promptNodeIds = Object.keys(promptData).filter(k => k !== 'meta' && k !== 'version');
                let bestScore = 0;
                
                for (const wf of workflows) {
                  const templateNodeIds = Object.keys(wf.workflow).filter(k => k !== 'meta' && k !== 'version');
                  let matches = 0;
                  
                  for (const nodeId of promptNodeIds) {
                    if (wf.workflow[nodeId]) {
                      const promptClassType = promptData[nodeId]?.class_type;
                      const templateClassType = (wf.workflow[nodeId] as { class_type?: string })?.class_type;
                      if (promptClassType && promptClassType === templateClassType) {
                        matches++;
                      }
                    }
                  }
                  
                  const score = promptNodeIds.length > 0
                    ? matches / Math.max(promptNodeIds.length, templateNodeIds.length)
                    : 0;
                  
                  if (score > bestScore && score > 0.5) {
                    bestScore = score;
                    matchedWorkflow = wf;
                  }
                }
                
                // Fallback: try filename_prefix matching
                if (!matchedWorkflow) {
                  let workflowName: string | null = null;
                  for (const node of Object.values(promptData)) {
                    if (node.class_type === 'SaveImage' && node.inputs?.filename_prefix) {
                      workflowName = node.inputs.filename_prefix as string;
                      break;
                    }
                  }
                  if (workflowName) {
                    matchedWorkflow = workflows.find(w => w.id === workflowName);
                    if (!matchedWorkflow) {
                      const normalize = (s: string) => s.toLowerCase().replace(/[_\s-]/g, '');
                      const normalizedTarget = normalize(workflowName);
                      matchedWorkflow = workflows.find(w => 
                        normalize(w.id).includes(normalizedTarget) || 
                        normalizedTarget.includes(normalize(w.id)) ||
                        normalize(w.name || '').includes(normalizedTarget) ||
                        normalizedTarget.includes(normalize(w.name || ''))
                      );
                    }
                  }
                }
                
                if (!matchedWorkflow) {
                  showWarning('Could not find matching workflow. Extracting parameters only.');
                }
                
                // Extract parameters using workflow's parameter definitions
                const extractedParams: Record<string, unknown> = {};
                const extractedImages: Record<string, string> = {};
                
                if (matchedWorkflow) {
                  for (const param of matchedWorkflow.parsed.parameters) {
                    const nodeId = param.node_id;
                    const inputName = param.input_name;
                    const node = promptData[nodeId];
                    if (node?.inputs && inputName in node.inputs) {
                      const value = node.inputs[inputName];
                      if (!Array.isArray(value)) {
                        extractedParams[param.name] = value;
                      }
                    }
                  }
                  
                  // Extract image inputs
                  for (const imgInput of matchedWorkflow.parsed.image_inputs) {
                    const nodeId = imgInput.node_id;
                    const inputName = imgInput.input_name;
                    const node = promptData[nodeId];
                    if (node?.inputs && inputName in node.inputs) {
                      const imageName = node.inputs[inputName] as string;
                      if (imageName && typeof imageName === 'string') {
                        extractedImages[imgInput.name] = imageName;
                      }
                    }
                  }
                }
                
                // Fallback: extract common parameters if workflow matching failed
                if (Object.keys(extractedParams).length === 0) {
                  for (const node of Object.values(promptData)) {
                    if (!node.inputs) continue;
                    const classType = node.class_type || '';
                    
                    if (classType.includes('KSampler') || classType.includes('Sampler')) {
                      if (node.inputs.seed !== undefined) extractedParams.seed = node.inputs.seed;
                      if (node.inputs.steps !== undefined) extractedParams.steps = node.inputs.steps;
                      if (node.inputs.cfg !== undefined) extractedParams.cfg = node.inputs.cfg;
                      if (node.inputs.sampler_name) extractedParams.sampler_name = node.inputs.sampler_name;
                      if (node.inputs.scheduler) extractedParams.scheduler = node.inputs.scheduler;
                      if (node.inputs.denoise !== undefined) extractedParams.denoise = node.inputs.denoise;
                    }
                    
                    if (classType === 'CLIPTextEncode' && node.inputs.text) {
                      const text = node.inputs.text as string;
                      if (typeof text === 'string' && text.length > 20 && !extractedParams.positive_prompt) {
                        extractedParams.positive_prompt = text;
                      }
                    }
                    
                    if ((classType === 'LoadImage' || classType === 'LoadImageOutput') && node.inputs.image) {
                      const imageName = node.inputs.image as string;
                      if (!extractedImages.reference_image) {
                        extractedImages.reference_image = imageName;
                      }
                    }
                  }
                }
                
                // Apply the restored data
                let restoredCount = 0;
                
                // Switch workflow if matched
                if (matchedWorkflow && matchedWorkflow.id !== selectedWorkflowId) {
                  skipParameterReset.current = true;
                  setSelectedWorkflowId(matchedWorkflow.id);
                  restoredCount++;
                }
                
                // Set parameters
                if (Object.keys(extractedParams).length > 0) {
                  setParameterValues(prev => {
                    const newValues = { ...prev, ...extractedParams };
                    parameterValuesRef.current = newValues;
                    return newValues;
                  });
                  restoredCount += Object.keys(extractedParams).length;
                }
                
                // Handle image inputs - fetch from ComfyUI
                const imageCount = Object.keys(extractedImages).length;
                if (imageCount > 0) {
                  const comfyNodes = renderNodes.filter(n => n.status === 'online');
                  if (comfyNodes.length > 0) {
                    const comfyUrl = comfyNodes[0].url.replace(/\/$/, '');
                    
                    for (const [inputName, imageName] of Object.entries(extractedImages)) {
                      try {
                        const imageUrl = `${comfyUrl}/view?filename=${encodeURIComponent(imageName)}&type=input`;
                        const imgResponse = await fetch(imageUrl);
                        if (imgResponse.ok) {
                          const blob = await imgResponse.blob();
                          const dataUrl = await new Promise<string>((resolve) => {
                            const reader = new FileReader();
                            reader.onloadend = () => resolve(reader.result as string);
                            reader.readAsDataURL(blob);
                          });
                          extractedParams[inputName] = dataUrl;
                          restoredCount++;
                        }
                      } catch (err) {
                        console.warn(`Could not fetch image ${imageName}:`, err);
                      }
                    }
                    
                    // Update parameters with fetched images
                    if (Object.keys(extractedImages).some(k => extractedParams[k])) {
                      setParameterValues(prev => {
                        const newValues = { ...prev, ...extractedParams };
                        parameterValuesRef.current = newValues;
                        return newValues;
                      });
                    }
                  }
                }
                
                if (restoredCount > 0) {
                  const workflowMsg = matchedWorkflow ? `workflow "${matchedWorkflow.name || matchedWorkflow.id}"` : '';
                  const paramMsg = `${Object.keys(extractedParams).length} parameters`;
                  const imageMsg = imageCount > 0 ? `, ${imageCount} images` : '';
                  showInfo(`Restored ${workflowMsg ? workflowMsg + ', ' : ''}${paramMsg}${imageMsg}`);
                } else {
                  showWarning('No parameters could be extracted from PNG');
                }
                
              } catch (err) {
                console.error('Failed to restore from PNG:', err);
                showError('Failed to restore parameters');
              }
              
              setContextMenu(prev => ({ ...prev, visible: false }));
            }}
            disabled={!contextMenu.panelId || panels.find(p => p.id === contextMenu.panelId)?.imageHistory.length === 0}
          >
            <RotateCcw size={14} /> Restore Parameters
          </button>
        </div>
      )}
      
      {/* Image Viewer Modal with Navigation, Comparison, and Metadata Panel */}
      {showImageViewer && viewerImage && (
        <div
          ref={imageViewerRef}
          className="image-viewer-overlay"
          onClick={handleCloseViewer}
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              handleCloseViewer();
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              if (viewerPanelId) {
                const panel = panels.find(p => p.id === viewerPanelId);
                if (panel && panel.historyIndex > 0) {
                  navigateViewerImage(-1);
                }
              }
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              if (viewerPanelId) {
                const panel = panels.find(p => p.id === viewerPanelId);
                if (panel && panel.historyIndex < panel.imageHistory.length - 1) {
                  navigateViewerImage(1);
                }
              }
            } else if (e.key === 'Delete') {
              e.preventDefault();
              if (viewerPanelId) {
                const panel = panels.find(p => p.id === viewerPanelId);
                if (panel && panel.historyIndex >= 0 && panel.imageHistory.length > 0) {
                  // CRITICAL FIX: Use entry ID instead of historyIndex
                  const currentEntry = panel.imageHistory[panel.historyIndex];
                  if (currentEntry) {
                    handleDeleteImage(viewerPanelId, currentEntry.id);
                  }
                }
              }
            }
          }}
        >
          {/* Main Toolbar */}
          <div className="image-viewer-toolbar">
            {/* Left: Navigation */}
            <div className="toolbar-group">
              {viewerPanelId && (() => {
                const panel = panels.find(p => p.id === viewerPanelId);
                if (panel && panel.imageHistory.length > 1) {
                  return (
                    <>
                      <button
                        className="toolbar-btn"
                        onClick={(e) => { e.stopPropagation(); navigateViewerImage(-1); }}
                        disabled={panel.historyIndex <= 0}
                        title="Previous version (←)"
                        aria-label="Previous version"
                      >
                        <ChevronLeft size={20} />
                      </button>
                      <span className="viewer-version-badge">v{panel.historyIndex + 1}/{panel.imageHistory.length}</span>
                      <button
                        className="toolbar-btn"
                        onClick={(e) => { e.stopPropagation(); navigateViewerImage(1); }}
                        disabled={panel.historyIndex >= panel.imageHistory.length - 1}
                        title="Next version (→)"
                        aria-label="Next version"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </>
                  );
                }
                return null;
              })()}
            </div>

            {/* Center: Zoom Controls */}
            <div className="toolbar-group zoom-controls">
              <button
                className="toolbar-btn"
                onClick={(e) => { e.stopPropagation(); handleZoomOut(); }}
                title="Zoom Out (-)"
                aria-label="Zoom out"
              >
                <ZoomOut size={20} />
              </button>
              <span className="zoom-percentage">{Math.round(viewerZoom * 100)}%</span>
              <button
                className="toolbar-btn"
                onClick={(e) => { e.stopPropagation(); handleZoomIn(); }}
                title="Zoom In (+)"
                aria-label="Zoom in"
              >
                <ZoomIn size={20} />
              </button>
              <div className="toolbar-separator" />
              <button
                className={`toolbar-btn ${zoomMode === 'fit' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleFitToScreen(); }}
                title="Fit to Screen (F)"
                aria-label="Fit to screen"
              >
                <Maximize size={20} />
              </button>
              <button
                className={`toolbar-btn ${zoomMode === 'actual' ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); handleActualSize(); }}
                title="Actual Size (1)"
                aria-label="Actual size"
              >
                <Crosshair size={20} />
              </button>
            </div>

            {/* Right: Compare, Metadata, Close */}
            <div className="toolbar-group">
              {viewerPanelId && (() => {
                const panel = panels.find(p => p.id === viewerPanelId);
                if (panel && panel.imageHistory.length > 1) {
                  return (
                    <button
                      className={`toolbar-btn ${viewerCompareMode ? 'active' : ''}`}
                      onClick={(e) => { e.stopPropagation(); toggleCompareMode(); }}
                      title="Compare Mode (C)"
                      aria-label="Toggle compare mode"
                    >
                      <Eye size={20} />
                    </button>
                  );
                }
                return null;
              })()}
              <button
                className={`toolbar-btn ${isMetadataPanelOpen ? 'active' : ''}`}
                onClick={(e) => { e.stopPropagation(); setIsMetadataPanelOpen(prev => !prev); }}
                title="Toggle Metadata Panel (I)"
                aria-label="Toggle metadata panel"
              >
                {isMetadataPanelOpen ? <PanelRightClose size={20} /> : <PanelRight size={20} />}
              </button>
              <div className="toolbar-separator" />
              {/* Delete button */}
              {viewerPanelId && (() => {
                const panel = panels.find(p => p.id === viewerPanelId);
                if (panel && panel.historyIndex >= 0 && panel.imageHistory.length > 0) {
                  return (
                    <button
                      className="toolbar-btn delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        // CRITICAL FIX: Use entry ID instead of historyIndex
                        const currentEntry = panel.imageHistory[panel.historyIndex];
                        if (currentEntry) {
                          handleDeleteImage(viewerPanelId, currentEntry.id);
                        }
                      }}
                      title="Delete Image (Del)"
                      aria-label="Delete image"
                    >
                      <Trash2 size={20} />
                    </button>
                  );
                }
                return null;
              })()}
              <button
                className="toolbar-btn close-btn"
                onClick={(e) => { e.stopPropagation(); handleCloseViewer(); }}
                title="Close (Esc)"
                aria-label="Close viewer"
              >
                <X size={20} />
              </button>
            </div>
          </div>
          
          {/* Compare mode: version selector */}
          {viewerCompareMode && viewerPanelId && (
            <div className="image-viewer-compare-selector" onClick={(e) => e.stopPropagation()}>
              <span>Compare with:</span>
              {panels.find(p => p.id === viewerPanelId)?.imageHistory.map((entry, idx) => (
                <button
                  key={entry.id}
                  onClick={() => setViewerCompareImage(entry.url)}
                  className={viewerCompareImage === entry.url ? 'active' : ''}
                  disabled={entry.url === viewerImage}
                >
                  v{idx + 1}
                </button>
              ))}
            </div>
          )}
          
          {/* Main Content Area */}
          <div className="image-viewer-main">
            {/* Image Container with Thumbnail Strip */}
            <div
              ref={viewerContainerRef}
              className="image-viewer-container"
              style={{
                flex: 1,
                display: 'flex',
                flexDirection: 'row',
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Phase 5: Vertical Thumbnail Strip (LEFT SIDE) */}
              {viewerPanelId && (() => {
                const panel = panels.find(p => p.id === viewerPanelId);
                if (!panel || panel.imageHistory.length <= 1) return null;
                
                return (
                  <div className="thumbnail-strip-vertical" onClick={(e) => e.stopPropagation()}>
                    {panel.imageHistory.map((entry, idx) => (
                      <div 
                        key={entry.id}
                        className={`thumbnail-item ${idx === panel.historyIndex ? 'active' : ''}`}
                        onClick={() => {
                          // Navigate to this image and update viewer
                          setViewerImage(entry.url);
                          setPanels(prev => prev.map(p => 
                            p.id === viewerPanelId 
                              ? { 
                                  ...p, 
                                  historyIndex: idx,
                                  image: p.imageHistory[idx]?.url || null 
                                }
                              : p
                          ));
                        }}
                      >
                        {isVideoUrl(entry.url) ? (
                          <video 
                            src={entry.url}
                            muted
                            playsInline
                            preload="metadata"
                            style={{
                              maxHeight: 256,
                              maxWidth: 256,
                              objectFit: 'contain'
                            }}
                            draggable={false}
                          />
                        ) : (
                          <img 
                            src={entry.url}
                            alt={`Version ${idx + 1}`}
                            style={{
                              maxHeight: 256,
                              maxWidth: 256,
                              objectFit: 'contain'
                            }}
                            draggable={false}
                          />
                        )}
                        <span className="thumbnail-filename">
                          {entry.metadata?.savedPath 
                            ? entry.metadata.savedPath.split(/[\\\/]/).pop()
                            : `v${String(idx + 1).padStart(3, '0')}`}
                        </span>
                      </div>
                    ))}
                  </div>
                );
              })()}

              {/* Main Image Area */}
              <div 
                className="image-viewer-main-area"
                onWheel={(e) => {
                  e.stopPropagation();
                  const delta = e.deltaY > 0 ? -0.1 : 0.1;
                  setZoomMode('custom');
                  setViewerZoom(z => clampZoom(z + delta));
                }}
                onMouseDown={(e) => {
                  if (e.button !== 0 || viewerCompareMode) return;
                  const startX = e.clientX - viewerPan.x;
                  const startY = e.clientY - viewerPan.y;
                  
                  const onMove = (moveE: MouseEvent) => {
                    setViewerPan({
                      x: moveE.clientX - startX,
                      y: moveE.clientY - startY,
                    });
                  };
                  
                  const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                  };
                  
                  document.addEventListener('mousemove', onMove);
                  document.addEventListener('mouseup', onUp);
                }}
              >
                {/* Normal mode */}
                {!viewerCompareMode && (
                  <>
                    {isVideoUrl(viewerImage) ? (
                      <video
                        src={viewerImage}
                        controls
                        loop
                        autoPlay
                        playsInline
                        style={{
                          transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`,
                          cursor: 'grab',
                          maxWidth: '100%',
                          maxHeight: 'calc(100% - 30px)',
                          objectFit: 'contain',
                        }}
                        draggable={false}
                        onError={(e) => {
                          console.error('[ImageViewer] Failed to load video:', viewerImage);
                          console.error('[ImageViewer] Error event:', e);
                        }}
                        onLoadedData={() => {
                          console.log('[ImageViewer] Video loaded successfully');
                        }}
                      />
                    ) : (
                      <img
                        src={viewerImage}
                        alt="Viewer"
                        style={{
                          transform: `translate(${viewerPan.x}px, ${viewerPan.y}px) scale(${viewerZoom})`,
                          cursor: 'grab',
                          maxWidth: '100%',
                          maxHeight: 'calc(100% - 30px)',
                          objectFit: 'contain',
                        }}
                        draggable={false}
                        onError={(e) => {
                          console.error('[ImageViewer] Failed to load image:', viewerImage);
                          console.error('[ImageViewer] Error event:', e);
                        }}
                        onLoad={() => {
                          console.log('[ImageViewer] Image loaded successfully');
                        }}
                      />
                    )}
                    {/* Phase 5: Filename Display */}
                    {viewerPanelId && (() => {
                      const panel = panels.find(p => p.id === viewerPanelId);
                      const entry = panel?.imageHistory[panel.historyIndex];
                      const filename = entry?.metadata?.savedPath 
                        ? entry.metadata.savedPath.split(/[\\\/]/).pop()
                        : viewerImage?.split(/[\\\/]/).pop() || 'Unknown';
                      return (
                        <div className="image-viewer-filename">
                          {filename}
                        </div>
                      );
                    })()}
                  </>
                )}
              
              {/* Compare mode with wipe slider */}
              {viewerCompareMode && viewerCompareImage && (
                <div
                  className="image-compare-container"
                  onMouseMove={(e) => {
                    const rect = e.currentTarget.getBoundingClientRect();
                    const x = ((e.clientX - rect.left) / rect.width) * 100;
                    setViewerComparePosition(Math.max(0, Math.min(100, x)));
                  }}
                >
                  {/* Base image (current) */}
                  <img
                    src={viewerImage}
                    alt="Current"
                    className="compare-base"
                    draggable={false}
                  />
                  {/* Overlay image (compare) with clip */}
                  <div
                    className="compare-overlay"
                    style={{ clipPath: `inset(0 ${100 - viewerComparePosition}% 0 0)` }}
                  >
                    <img
                      src={viewerCompareImage}
                      alt="Compare"
                      draggable={false}
                    />
                  </div>
                  {/* Slider line */}
                  <div
                    className="compare-slider"
                    style={{ left: `${viewerComparePosition}%` }}
                  >
                    <div className="compare-slider-handle">⇔</div>
                  </div>
                </div>
              )}
              </div> {/* Close image-viewer-main-area */}
            </div> {/* Close image-viewer-container */}

            {/* Metadata Panel - sibling to container for proper flex layout */}
            {isMetadataPanelOpen && viewerPanelId && (() => {
              const panel = panels.find(p => p.id === viewerPanelId);
              const currentEntry = panel?.imageHistory[panel.historyIndex];
              if (!currentEntry) return null;

              // Use entry metadata if available, otherwise use fetched PNG metadata
              const entryMetadata = currentEntry.metadata;
              const hasPngMetadata = pngMetadata && (pngMetadata.prompt || pngMetadata.workflow);
              
              // Extract values from PNG metadata (ComfyUI workflow format)
              const extractFromPng = () => {
                if (!pngMetadata?.prompt) return { seed: null, prompt: null, model: null, workflowName: null, steps: null, cfg: null, sampler: null, scheduler: null, denoise: null };
                
                const promptData = pngMetadata.prompt as Record<string, { inputs?: Record<string, unknown>; class_type?: string }>;
                let seed: number | null = null;
                let prompt: string | null = null;
                let model: string | null = null;
                let workflowName: string | null = null;
                let steps: number | null = null;
                let cfg: number | null = null;
                let sampler: string | null = null;
                let scheduler: string | null = null;
                let denoise: number | null = null;
                
                // Search through nodes for relevant values
                for (const [_nodeId, node] of Object.entries(promptData)) {
                  if (!node.inputs) continue;
                  const classType = node.class_type || '';
                  
                  // === SAMPLER NODES ===
                  // KSampler, QwenImageIntegratedKSampler, SamplerCustomAdvanced, etc.
                  if (classType.includes('KSampler') || classType.includes('Sampler')) {
                    if (node.inputs.seed !== undefined && seed === null) {
                      seed = node.inputs.seed as number;
                    }
                    if (node.inputs.steps !== undefined && steps === null) {
                      steps = node.inputs.steps as number;
                    }
                    if (node.inputs.cfg !== undefined && cfg === null) {
                      cfg = node.inputs.cfg as number;
                    }
                    if (node.inputs.sampler_name && !sampler) {
                      sampler = node.inputs.sampler_name as string;
                    }
                    if (node.inputs.scheduler && !scheduler) {
                      scheduler = node.inputs.scheduler as string;
                    }
                    if (node.inputs.denoise !== undefined && denoise === null) {
                      denoise = node.inputs.denoise as number;
                    }
                    // Integrated samplers may have prompt directly (QwenImageIntegratedKSampler)
                    if (node.inputs.positive_prompt && !prompt) {
                      const text = node.inputs.positive_prompt as string;
                      if (typeof text === 'string' && text.length > 10) prompt = text;
                    }
                  }
                  
                  // === TEXT/PROMPT NODES ===
                  // CLIPTextEncode - standard prompt encoding
                  if (classType === 'CLIPTextEncode' && node.inputs.text && !prompt) {
                    const text = node.inputs.text as string;
                    if (typeof text === 'string' && text.length > 20) prompt = text;
                  }
                  // TextEncodeQwenImageEditPlus variants
                  if (classType.includes('TextEncode') && !prompt) {
                    const text = (node.inputs.prompt || node.inputs.text) as string;
                    if (typeof text === 'string' && text.length > 20) prompt = text;
                  }
                  
                  // === MODEL LOADER NODES ===
                  // UnetLoaderGGUF - quantized GGUF models
                  if (classType === 'UnetLoaderGGUF' && node.inputs.unet_name && !model) {
                    model = node.inputs.unet_name as string;
                  }
                  // UNETLoader - standard diffusers UNET
                  if (classType === 'UNETLoader' && node.inputs.unet_name && !model) {
                    model = node.inputs.unet_name as string;
                  }
                  // CheckpointLoaderSimple / CheckpointLoader - full checkpoint files
                  if ((classType === 'CheckpointLoaderSimple' || classType === 'CheckpointLoader') && node.inputs.ckpt_name && !model) {
                    model = node.inputs.ckpt_name as string;
                  }
                  // UpscaleModelLoader - for upscaling models
                  if (classType === 'UpscaleModelLoader' && node.inputs.model_name && !model) {
                    model = node.inputs.model_name as string;
                  }
                  // Generic fallback for any Loader with model_name or unet_name
                  if (classType.includes('Loader') && !model) {
                    if (node.inputs.unet_name) {
                      model = node.inputs.unet_name as string;
                    } else if (node.inputs.ckpt_name) {
                      model = node.inputs.ckpt_name as string;
                    } else if (node.inputs.model_name) {
                      model = node.inputs.model_name as string;
                    }
                  }
                  
                  // === SAVE IMAGE NODES (for workflow name fallback) ===
                  if (classType === 'SaveImage' && node.inputs.filename_prefix && !workflowName) {
                    workflowName = node.inputs.filename_prefix as string;
                  }
                }
                
                // Try to get workflow name from workflow metadata (if available)
                if (!workflowName && pngMetadata.workflow) {
                  const wf = pngMetadata.workflow as { name?: string };
                  workflowName = wf.name || null;
                }
                
                return { seed, prompt, model, workflowName, steps, cfg, sampler, scheduler, denoise };
              };
              
              const pngExtracted = hasPngMetadata ? extractFromPng() : null;
              
              // Helper to extract generation parameters from entry metadata
              const extractFromParams = (params: Record<string, unknown> | undefined) => {
                if (!params) return { steps: null, cfg: null, sampler: null, scheduler: null, denoise: null, model: null };
                
                // Debug: log what parameters we have
                console.log('[Metadata] Entry parameters:', Object.keys(params), params);
                
                // Look for common parameter names (may have node ID suffixes)
                const findParam = (keys: string[]): unknown => {
                  for (const key of keys) {
                    if (params[key] !== undefined) return params[key];
                    // Check with node ID suffix (e.g., steps_3, cfg_3)
                    for (const [k, v] of Object.entries(params)) {
                      if (k.startsWith(key + '_') || k === key) {
                        if (v !== undefined) return v;
                      }
                    }
                  }
                  return null;
                };
                
                return {
                  steps: findParam(['steps']) as number | null,
                  cfg: findParam(['cfg', 'cfg_scale', 'guidance_scale']) as number | null,
                  sampler: findParam(['sampler_name', 'sampler']) as string | null,
                  scheduler: findParam(['scheduler']) as string | null,
                  denoise: findParam(['denoise', 'denoising_strength']) as number | null,
                  model: findParam(['ckpt_name', 'unet_name', 'model_name', 'model']) as string | null,
                };
              };
              
              const paramsExtracted = extractFromParams(entryMetadata?.parameters as Record<string, unknown> | undefined);
              
              // Determine what to display
              const displaySeed = entryMetadata?.seed ?? pngExtracted?.seed ?? null;
              const displayPrompt = entryMetadata?.promptSummary || pngExtracted?.prompt || null;
              const displayModel = paramsExtracted?.model || extractModelName(entryMetadata?.parameters) || pngExtracted?.model || null;
              const displayWorkflow = entryMetadata?.workflowName || pngExtracted?.workflowName || 'Unknown';
              const displayNodeName = entryMetadata?.nodeName || null;
              const displayGenTime = entryMetadata?.generationTime || null;
              const displayTimestamp = entryMetadata?.timestamp || null;
              const displayVersion = entryMetadata?.version ?? (panel?.historyIndex !== undefined ? panel.historyIndex + 1 : 1);
              const displaySteps = paramsExtracted?.steps ?? pngExtracted?.steps ?? null;
              const displayCfg = paramsExtracted?.cfg ?? pngExtracted?.cfg ?? null;
              const displaySampler = paramsExtracted?.sampler ?? pngExtracted?.sampler ?? null;
              const displayScheduler = paramsExtracted?.scheduler ?? pngExtracted?.scheduler ?? null;
              const displayDenoise = paramsExtracted?.denoise ?? pngExtracted?.denoise ?? null;
              
              const resolution = extractResolution(entryMetadata?.parameters, viewerImageDimensions);
              const fileSizeFormatted = formatFileSize(viewerFileSize);

              return (
                <div className="image-viewer-metadata-panel" onClick={(e) => e.stopPropagation()}>
                  <div className="metadata-panel-header">
                    <Info size={16} />
                    <span>Image Info</span>
                    {isLoadingPngMetadata && <span className="metadata-loading">Loading...</span>}
                    <button
                      className="metadata-toggle-btn"
                      onClick={() => setIsMetadataPanelOpen(false)}
                      title="Hide metadata panel"
                      aria-label="Hide metadata panel"
                    >
                      <PanelRightClose size={14} />
                    </button>
                  </div>
                  
                  <div className="metadata-panel-content">
                    {/* Resolution */}
                    <div className="metadata-row">
                      <span className="metadata-label">Resolution</span>
                      <span className="metadata-value">{resolution || 'Unknown'}</span>
                    </div>

                    {/* File Size */}
                    <div className="metadata-row">
                      <span className="metadata-label">File Size</span>
                      <span className="metadata-value">{fileSizeFormatted}</span>
                    </div>

                    {/* Workflow Name */}
                    <div className="metadata-row">
                      <span className="metadata-label">Workflow</span>
                      <span className="metadata-value workflow-name" title={displayWorkflow}>
                        {displayWorkflow}
                      </span>
                    </div>

                    {/* Model */}
                    {displayModel && (
                      <div className="metadata-row">
                        <span className="metadata-label">Model</span>
                        <span className="metadata-value model-name" title={displayModel}>
                          {displayModel}
                        </span>
                      </div>
                    )}

                    {/* Seed */}
                    <div className="metadata-row">
                      <span className="metadata-label">Seed</span>
                      <span className="metadata-value">
                        {displaySeed !== null && displaySeed !== -1 ? displaySeed : 'Unknown'}
                      </span>
                    </div>

                    {/* Steps */}
                    {displaySteps !== null && (
                      <div className="metadata-row">
                        <span className="metadata-label">Steps</span>
                        <span className="metadata-value">{displaySteps}</span>
                      </div>
                    )}

                    {/* CFG */}
                    {displayCfg !== null && (
                      <div className="metadata-row">
                        <span className="metadata-label">CFG</span>
                        <span className="metadata-value">{displayCfg}</span>
                      </div>
                    )}

                    {/* Sampler */}
                    {displaySampler && (
                      <div className="metadata-row">
                        <span className="metadata-label">Sampler</span>
                        <span className="metadata-value">{displaySampler}</span>
                      </div>
                    )}

                    {/* Scheduler */}
                    {displayScheduler && (
                      <div className="metadata-row">
                        <span className="metadata-label">Scheduler</span>
                        <span className="metadata-value">{displayScheduler}</span>
                      </div>
                    )}

                    {/* Denoise */}
                    {displayDenoise !== null && (
                      <div className="metadata-row">
                        <span className="metadata-label">Denoise</span>
                        <span className="metadata-value">{displayDenoise}</span>
                      </div>
                    )}

                    {/* Render Node (for parallel generations) */}
                    {displayNodeName && (
                      <div className="metadata-row">
                        <span className="metadata-label">Render Node</span>
                        <span className="metadata-value">{displayNodeName}</span>
                      </div>
                    )}

                    {/* Generation Time */}
                    {displayGenTime && (
                      <div className="metadata-row">
                        <span className="metadata-label">Render Time</span>
                        <span className="metadata-value">{displayGenTime.toFixed(1)}s</span>
                      </div>
                    )}

                    {/* Timestamp */}
                    {displayTimestamp && (
                      <div className="metadata-row">
                        <span className="metadata-label">Created</span>
                        <span className="metadata-value">
                          {formatTimestamp(displayTimestamp) || 'Unknown'}
                        </span>
                      </div>
                    )}

                    {/* Prompt Section */}
                    {displayPrompt && (
                      <div className="metadata-prompt-section">
                        <div className="metadata-label">Prompt</div>
                        <div className={`metadata-prompt-text ${isPromptExpanded ? 'expanded' : ''}`}>
                          {isPromptExpanded ? displayPrompt : truncateText(displayPrompt, 150)}
                        </div>
                        {displayPrompt.length > 150 && (
                          <button
                            className="show-more-btn"
                            onClick={() => setIsPromptExpanded(prev => !prev)}
                          >
                            {isPromptExpanded ? 'Show less' : 'Show more'}
                          </button>
                        )}
                      </div>
                    )}

                    {/* Version info */}
                    <div className="metadata-footer">
                      Version {displayVersion} • Panel {viewerPanelId}
                    </div>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}
      
      {/* Parallel Progress Overlay - MOVED TO METRICS PANEL
      {(() => {
        // Collect all active parallel jobs (running or pending) from panels that are still generating
        const activeJobs: Array<{panelId: number; job: any}> = [];
        panels.forEach(panel => {
          if (panel.status === 'generating' && panel.parallelJobs) {
            panel.parallelJobs
              .filter(j => j.status === 'running' || j.status === 'pending')
              .forEach(job => activeJobs.push({panelId: panel.id, job}));
          }
        });
        
        if (activeJobs.length === 0) return null;
        
        return (
          <div className="parallel-progress-overlay">
            <div className="parallel-progress-header">
              Generating on {activeJobs.length} node{activeJobs.length > 1 ? 's' : ''}
            </div>
            {activeJobs.map(({panelId, job}) => (
              <div key={`${panelId}-${job.nodeId}-${job.seed}`} style={{marginBottom: '8px'}}>
                <div style={{fontSize: '11px', marginBottom: '4px'}}>{job.nodeName}</div>
                <div 
                  style={{
                    width: '100%',
                    height: '10px',
                    backgroundColor: 'rgba(255,255,255,0.25)',
                    borderRadius: '5px',
                    overflow: 'hidden',
                    marginBottom: '2px'
                  }}
                >
                  <div 
                    style={{
                      width: `${job.progress}%`,
                      height: '100%',
                      background: 'linear-gradient(90deg, #4a9eff 0%, #7b68ee 100%)',
                      transition: 'width 0.3s ease'
                    }}
                  />
                </div>
                <div style={{fontSize: '11px', textAlign: 'right'}}>
                  {job.status === 'running' ? `${job.progress}%` : '⏳'}
                </div>
              </div>
            ))}
          </div>
        );
      })()}
      */}
    </div>
  );
}

export default StoryboardUI;
