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
import { WorkflowEditor, ParameterConfig } from './components/WorkflowEditor';
import { getWorkflowParser, ComfyUIWorkflow, ParsedWorkflow } from './services/workflow-parser';
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
  Printer
} from 'lucide-react';
import { orchestratorManager, useRenderNodes } from './services/orchestrator';
import { getComfyUIWebSocket, ComfyUIWebSocket } from './services/comfyui-websocket';
import { projectManager, ImageHistoryEntry, ImageMetadata, useProjectSettings, type ProjectSettings, getDefaultOrchestratorUrl } from './services/project-manager';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { FolderBrowserModal } from './components/FolderBrowserModal';
import { FileBrowserDialog } from './components/FileBrowser';
import { DeleteConfirmDialog } from './components/DeleteConfirmDialog';
import { PanelNotes } from './components/PanelNotes';
import { PanelHeader } from './components/PanelHeader';
import { StarRating } from './components/StarRating';
import { PrintDialog } from './components/PrintDialog';
import { workflowStorage } from './services/workflow-storage';
import { getSelectedLlmSettings, getConfiguredProviders } from '../components/Settings';
import { api } from '../api/client';
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
// Types
// ============================================================================

type TabType = 'image-generation' | 'image-editing' | 'upscaling' | 'video-generation';
type SubTabType = 'text2img' | 'img2img' | 'inpainting' | 'editing' | 'upscale' | 'img2vid' | 'txt2vid' | 'fflf';

// Workflow Categories
export type WorkflowCategory =
  | 'Image Generation'
  | 'Text to Image'
  | 'Image to Image'
  | 'InPainting'
  | 'Image Editing'
  | 'Upscaling'
  | 'Video Generation';

export const WORKFLOW_CATEGORIES: WorkflowCategory[] = [
  'Image Generation',
  'Text to Image',
  'Image to Image',
  'InPainting',
  'Image Editing',
  'Upscaling',
  'Video Generation',
];

// Map subcategory IDs to WorkflowCategory names (1-to-1 mapping)
export const SUBCATEGORY_TO_CATEGORY_MAP: Record<string, WorkflowCategory> = {
  'text2img': 'Text to Image',
  'img2img': 'Image to Image',
  'inpainting': 'InPainting',
  'editing': 'Image Editing',
  'upscale': 'Upscaling',
  'video': 'Video Generation',
};

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
  notes: string;
  nodeId?: string; // Selected render node for this panel
  workflowId?: string; // Per-panel workflow selection
  parameterValues?: Record<string, unknown>; // Per-panel parameter values
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
  }>;
  batchSaveTriggered?: boolean; // Prevents duplicate batch saves
}

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
  categories?: WorkflowCategory[]; // Multiple functional categories
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

export function StoryboardUI() {
  // ---------------------------------------------------------------------------
  // Error Notifications
  // ---------------------------------------------------------------------------
  const { showError, showWarning, showInfo, notifications, removeNotification } = useErrorNotifications();
  
  // ---------------------------------------------------------------------------
  // State - Tabs (with localStorage persistence)
  // ---------------------------------------------------------------------------
  const [activeTab, setActiveTab] = useState<TabType>(() => {
    const saved = localStorage.getItem('storyboard-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.activeTab ?? 'image-generation';
      } catch { /* ignore parse errors */ }
    }
    return 'image-generation';
  });
  const [activeSubTab, setActiveSubTab] = useState<SubTabType>(() => {
    const saved = localStorage.getItem('storyboard-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.activeSubTab ?? 'text2img';
      } catch { /* ignore parse errors */ }
    }
    return 'text2img';
  });
  const [openDropdown, setOpenDropdown] = useState<TabType | null>(null);
  
  // ---------------------------------------------------------------------------
  // State - Canvas
  // ---------------------------------------------------------------------------
  const [panels, setPanels] = useState<Panel[]>(() => [
    { id: 1, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 0, y: 0, width: 300, height: 300 },
    { id: 2, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 320, y: 0, width: 300, height: 300 },
    { id: 3, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 640, y: 0, width: 300, height: 300 },
    { id: 4, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 0, y: 320, width: 300, height: 300 },
    { id: 5, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 320, y: 320, width: 300, height: 300 },
    { id: 6, image: null, images: [], imageHistory: [], historyIndex: -1, currentImageIndex: 0, status: 'empty', progress: 0, notes: '', prompt: '', seed: -1, x: 640, y: 320, width: 300, height: 300 },
  ]);
  const [selectedPanelId, setSelectedPanelId] = useState<number | null>(null);
  const [canvasZoom, setCanvasZoom] = useState<number>(() => {
    const saved = localStorage.getItem('storyboard-ui-state');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        return parsed.canvasZoom ?? 1;
      } catch { /* ignore parse errors */ }
    }
    return 1;
  });
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
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
  const generationStartTimes = useRef<Map<number, number>>(new Map());
  
  // ---------------------------------------------------------------------------
  // State - Workflows
  // ---------------------------------------------------------------------------
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const workflowsLoadedRef = useRef(false); // Tracks whether initial load from localStorage is done
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string | null>(null);
  const [showWorkflowEditor, setShowWorkflowEditor] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [showCategoriesModal, setShowCategoriesModal] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [renamingWorkflow, setRenamingWorkflow] = useState<Workflow | null>(null);
  const [newWorkflowName, setNewWorkflowName] = useState('');
  const [parameterValues, setParameterValues] = useState<Record<string, any>>({});
  const [cameraAngles, setCameraAngles] = useState<Record<string, CameraAngle | null>>({});
  const [globalPromptOverride, setGlobalPromptOverride] = useState<string>('');
  const [useGlobalPrompt, setUseGlobalPrompt] = useState(false);
  
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
  const [comfyUrl, setComfyUrl] = useState(`${window.location.protocol}//${window.location.hostname}:8188`);
  const [connectionStatus, _setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [systemStats, _setSystemStats] = useState<any>(null);
  
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
  const wsRef = useRef<ComfyUIWebSocket | null>(null);
  const batchSaveTriggeredRef = useRef<Set<string>>(new Set()); // Track which panels have triggered batch save
  const savedJobsRef = useRef<Set<string>>(new Set()); // Track which parallel jobs have been saved to prevent duplicates
  const nextVersionRef = useRef<Map<number, number>>(new Map()); // Atomic version counter per panel to prevent race conditions
  const activePollsRef = useRef<Set<string>>(new Set()); // Track active polling loops to prevent accumulation
  const logIdCounter = useRef(0);
  
  // Refs to always have access to latest state values in callbacks (avoids stale closures)
  const parameterValuesRef = useRef<Record<string, any>>(parameterValues);
  const selectedPanelIdRef = useRef<number | null>(selectedPanelId);
  const panelsRef = useRef(panels);
  
  // Keep refs in sync with state
  parameterValuesRef.current = parameterValues;
  selectedPanelIdRef.current = selectedPanelId;
  panelsRef.current = panels;

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
  const [selectedBackendIds, setSelectedBackendIds] = useState<string[]>([]);
  
  // ---------------------------------------------------------------------------
  // State - Project Settings
  // ---------------------------------------------------------------------------
  const [showProjectSettings, setShowProjectSettings] = useState(false);
  const [projectSettings, setProjectSettings] = useProjectSettings();
  
  // Phase 6: Track deleted images to filter on reload
  const [_deletedImages, setDeletedImages] = useState<Set<string>>(new Set());
  
  // Phase 4: Loading progress state for project scanning
  const [isLoadingProject, setIsLoadingProject] = useState(false);
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
  }, [projectSettings.orchestratorUrl]);
  
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
  }, [projectSettings.orchestratorUrl]);
  
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
      try {
        // Load from persistent backend storage
        const result = await workflowStorage.loadAll();
        if (result.workflows && result.workflows.length > 0) {
          setWorkflows(result.workflows as typeof workflows);
          if (!selectedWorkflowId) {
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
                if (!selectedWorkflowId) {
                  setSelectedWorkflowId(parsed[0].id);
                }
                // Migrate to backend
                await workflowStorage.saveAll(parsed);
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
        console.error('[Workflows] Failed to load from backend, falling back to localStorage:', error);
        // Fallback to localStorage if backend is not available
        const savedWorkflows = localStorage.getItem('storyboard_workflows');
        if (savedWorkflows) {
          try {
            const parsed = JSON.parse(savedWorkflows);
            setWorkflows(parsed);
            if (parsed.length > 0 && !selectedWorkflowId) {
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
  }, []);
  
  // ---------------------------------------------------------------------------
  // Effects - Save workflows to persistent backend storage
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Skip save on initial mount — the load hasn't completed yet
    if (!workflowsLoadedRef.current) return;
    
    // Debounce save to avoid hammering the backend on rapid changes
    const timer = setTimeout(() => {
      workflowStorage.saveAll(workflows as unknown as Record<string, unknown>[]).catch(error => {
        console.error('[Workflows] Failed to save to backend:', error);
      });
    }, 500);
    
    return () => clearTimeout(timer);
  }, [workflows]);
  
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
    const workflow = workflows.find(w => w.id === selectedWorkflowId);
    if (workflow) {
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
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWorkflowId]); // Only re-run when workflow selection changes, not workflows array

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
    setWorkflows(prev => prev.map(w => 
      w.id === updatedWorkflow.id ? updatedWorkflow : w
    ));
    addLog('info', `Updated categories for workflow: ${updatedWorkflow.name}`);
  }, [addLog]);

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
        
        // Create workflow object
        const newWorkflow: Workflow = {
          id: `workflow_${Date.now()}`,
          name: file.name.replace('.json', ''),
          description: 'Imported from ComfyUI',
          category: activeTab,
          subCategory: activeSubTab,
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
          order: index,
          exposed: true,
          category: 'parameter',
          auto_detected: true,
          user_modified: false,
        }));
        
        // Add image inputs
        parsed.image_inputs.forEach((input, index) => {
          newWorkflow.config.push({
            name: input.name,
            display_name: input.display_name,
            node_id: input.node_id,
            input_name: input.input_name,
            type: 'image',
            default: '',
            description: input.description,
            order: parsed.parameters.length + index,
            exposed: true,
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
  }, [workflows, setWorkflows, addLog, showInfo, showError, activeTab, activeSubTab, setSelectedWorkflowId, setEditingWorkflow, setShowWorkflowEditor]);

  // ---------------------------------------------------------------------------
  // Functions - Canvas Operations
  // ---------------------------------------------------------------------------
  const addPanel = useCallback(() => {
    setPanels(prev => {
      const newId = Math.max(...prev.map(p => p.id), 0) + 1;
      const cols = 3;
      const index = prev.length;
      const row = Math.floor(index / cols);
      const col = index % cols;
      
      return [...prev, {
        id: newId,
        name: `Panel_${String(newId).padStart(2, '0')}`,  // CRITICAL: Set explicit panel name
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
  
  /**
   * Generate images in parallel across multiple render nodes
   * CRITICAL: Reuse the SAME workflow built from single-node logic, only changing seeds
   */
  const generateParallel = useCallback(async (panelId: number, backendIds: string[]) => {
    const panel = panels.find(p => p.id === panelId);
    
    // ALWAYS use the current UI values from the ref - this ensures parameter panel changes propagate
    // The only modification allowed is seed changes for multi-node parallel generation
    const currentParameterValues = parameterValuesRef.current;
    
    // Use the currently selected workflow from the UI dropdown
    const workflowIdToUse = selectedWorkflowId || panel?.workflowId;
    const workflow = workflows.find(w => w.id === workflowIdToUse);
    
    if (!panel || !workflow) {
      showError('Panel or workflow not found');
      return;
    }
    
    if (backendIds.length === 0) {
      showError('No render nodes selected for parallel generation');
      return;
    }

    try {
      addLog('comfyui', `Starting parallel generation on ${backendIds.length} nodes for panel ${panelId}...`);
      
      // ====================================================================================
      // STEP 1: BUILD THE WORKFLOW ONCE (reusing exact logic from generatePanel)
      // ====================================================================================
      
      // ALWAYS use parameters from the UI (ref) - never use stale panel.parameterValues
      const paramsToUse = currentParameterValues;
      
      const parser = getWorkflowParser();
      const processedParams = { ...paramsToUse };
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
                const selectedNodes = renderNodes.filter(n => backendIds.includes(n.id) && n.status === 'online');
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
        
        // Handle data:image URLs - upload to ALL nodes' input folders
        if (typeof value === 'string' && value.startsWith('data:image')) {
          console.log(`[Parallel] Image parameter ${key} has data URL, uploading to ALL nodes`);
          addLog('info', `Uploading data URL image for ${key} to all ${backendIds.length} nodes`);
          
          // Get all selected nodes
          const selectedNodes = renderNodes.filter(n => backendIds.includes(n.id) && n.status === 'online');
          if (selectedNodes.length === 0) {
            const errorMsg = `Cannot upload data URL image: no online render nodes`;
            addLog('error', errorMsg);
            showError(errorMsg);
            return;
          }
          
          try {
            // Extract MIME type and base64 data
            const matches = value.match(/^data:(image\/[^;]+);base64,(.+)$/);
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
            loraValues[key] = {
              strength: value.strength ?? 1.0,
              bypassed: value.bypassed ?? false,
              lora_name: value.lora_name,
              enabled: !value.bypassed
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
        const node = renderNodes.find(n => n.id === backendId);
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
      
      // Track generation start time and reset batch save trigger
      generationStartTimes.current.set(panelId, Date.now());
      batchSaveTriggeredRef.current.delete(String(panelId)); // Reset for new generation
      savedJobsRef.current.clear(); // Clear saved jobs tracking for new generation
      
      // ====================================================================================
      // STEP 3: SUBMIT TO EACH NODE DIRECTLY (NOT via Orchestrator job-group)
      // ====================================================================================
      
      for (let i = 0; i < backendIds.length; i++) {
        const backendId = backendIds[i];
        const node = renderNodes.find(n => n.id === backendId);
        
        if (!node || node.status !== 'online') {
          addLog('warning', `Skipping offline node: ${node?.name || backendId}`);
          // Update parallel job status to error
          setPanels(prev => prev.map(p => {
            if (p.id !== panelId || !p.parallelJobs) return p;
            return {
              ...p,
              parallelJobs: p.parallelJobs.map(j =>
                j.nodeId === backendId ? { ...j, status: 'error' as const } : j
              )
            };
          }));
          continue;
        }
        
        // Clone the base workflow
        const workflowCopy = JSON.parse(JSON.stringify(baseWorkflow));
        
        // Generate a random seed for this variation
        const seed = Math.floor(Math.random() * 2147483647);
        
        // Apply the seed to the cloned workflow
        applySeedToWorkflow(workflowCopy, seed);
        
        console.log(`[Parallel] Submitting to node ${node.name} with seed ${seed}`);
        addLog('comfyui', `Submitting variation ${i + 1}/${backendIds.length} to ${node.name} (seed: ${seed})`);
        
        try {
          // Create WebSocket connection for this node
          const clientId = `storyboard-parallel-${panelId}-${i}-${Date.now()}`;
          const nodeWs = getComfyUIWebSocket(node.url, clientId);
          
          try {
            await nodeWs.connect();
          } catch (wsError) {
            addLog('warning', `WebSocket to ${node.name} failed, will use polling`);
          }
          
          // Submit to this specific node
          const response = await fetch(`${node.url}/prompt`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: workflowCopy,
              client_id: clientId,
            }),
          });
          
          if (!response.ok) {
            let errorDetail = `HTTP ${response.status}`;
            try {
              const errorData = await response.json();
              console.error('ComfyUI error response:', errorData);
              if (errorData.error) {
                errorDetail = typeof errorData.error === 'string'
                  ? errorData.error
                  : JSON.stringify(errorData.error);
              }
            } catch (e) {
              // Response wasn't JSON
            }
            throw new Error(errorDetail);
          }
          
          const data = await response.json();
          addLog('comfyui', `Queued on ${node.name}: ${data.prompt_id}`);
          
          // Update parallel job with prompt ID and seed
          setPanels(prev => prev.map(p => {
            if (p.id !== panelId || !p.parallelJobs) return p;
            return {
              ...p,
              parallelJobs: p.parallelJobs.map(j =>
                j.nodeId === backendId ? { ...j, promptId: data.prompt_id, seed, status: 'running' as const } : j
              )
            };
          }));
          
          // Track this job
          activeJobs.push({
            nodeId: backendId,
            nodeName: node.name,
            promptId: data.prompt_id,
            seed: seed
          });
          
          // Track progress via WebSocket if connected, otherwise poll
          if (nodeWs.connected) {
            trackParallelJobWithWebSocket(data.prompt_id, panelId, backendId, node.url, nodeWs);
          } else {
            trackParallelJobWithPolling(data.prompt_id, panelId, backendId, node.url);
          }
          
        } catch (error) {
          const errorMsg = `Failed to submit to ${node.name}: ${error}`;
          addLog('error', errorMsg);
          showError(errorMsg);
          // Update parallel job status to error
          setPanels(prev => prev.map(p => {
            if (p.id !== panelId || !p.parallelJobs) return p;
            return {
              ...p,
              parallelJobs: p.parallelJobs.map(j =>
                j.nodeId === backendId ? { ...j, status: 'error' as const } : j
              )
            };
          }));
        }
      }
      
      if (activeJobs.length === 0) {
        showError('Failed to submit to any nodes');
        setPanels(prev => prev.map(p =>
          p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
        ));
        return;
      }
      
      showInfo(`Started parallel generation on ${activeJobs.length} node(s)`);
      
    } catch (error: any) {
      const errorMsg = `Parallel generation failed: ${error.message || String(error)}`;
      addLog('error', errorMsg);
      showError(errorMsg);
      setPanels(prev => prev.map(p =>
        p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
      ));
    }
  }, [panels, workflows, selectedWorkflowId, parameterValues, useGlobalPrompt, globalPromptOverride, renderNodes, addLog, showError, showInfo, selectedPanelId]);
  
  const generatePanel = useCallback(async (panelId: number) => {
    // Fix #2: Check if user explicitly selected multiple nodes for parallel generation
    if (selectedBackendIds.length > 1) {
      await generateParallel(panelId, selectedBackendIds);
      return;
    }
    
    // Single-node generation (original logic)
    const panel = panels.find(p => p.id === panelId);
    
    // Determine which node to use - prioritize explicit selection, then panel-specific, then auto-select
    let targetUrl = '';
    let nodeName = '';
    
    // Fix #2: First check if user explicitly selected a single node
    if (selectedBackendIds.length === 1) {
      const selectedNode = renderNodes.find(n => n.id === selectedBackendIds[0]);
      if (selectedNode && selectedNode.status === 'online') {
        targetUrl = selectedNode.url;
        nodeName = selectedNode.name;
      }
    }
    
    // Then check if panel has a specific node assigned
    if (!targetUrl && panel?.nodeId) {
      const node = renderNodes.find(n => n.id === panel.nodeId);
      if (node && node.status === 'online') {
        targetUrl = node.url;
        nodeName = node.name;
      }
    }
    
    // If no explicit or panel-specific node, find the best available node from orchestrator
    if (!targetUrl) {
      const onlineNodes = renderNodes.filter(n => n.status === 'online');
      if (onlineNodes.length > 0) {
        // Pick the node with most free VRAM (or first available)
        const bestNode = onlineNodes[0]; // TODO: Sort by free VRAM
        targetUrl = bestNode.url;
        nodeName = bestNode.name;
      }
    }
    
    // Fall back to top bar URL only if no orchestrator nodes available
    if (!targetUrl && comfyUrl && connectionStatus === 'connected') {
      targetUrl = comfyUrl;
      nodeName = 'Direct Connection';
    }
    
    // If still no target, show error
    if (!targetUrl) {
      const errorMsg = 'No render nodes available. Add nodes in Manage Nodes or connect via URL.';
      addLog('error', errorMsg);
      showError(errorMsg);
      return;
    }
    
    // Check connection to target node
    try {
      const healthCheck = await fetch(`${targetUrl}/system_stats`, { 
        method: 'GET',
        signal: AbortSignal.timeout(5000)
      });
      if (!healthCheck.ok) {
        throw new Error(`Node ${nodeName} is not responding`);
      }
    } catch (error) {
      const errorMsg = `Cannot connect to ${nodeName}: ${error}`;
      addLog('error', errorMsg);
      showError(errorMsg);
      return;
    }
    
    // ALWAYS use the current UI values from the ref - this ensures parameter panel changes propagate
    // The only modification allowed is seed changes for multi-node parallel generation
    const currentParameterValues = parameterValuesRef.current;
    
    // Use the currently selected workflow from the UI dropdown
    const workflowIdToUse = selectedWorkflowId || panel?.workflowId;
    const workflow = workflows.find(w => w.id === workflowIdToUse);
    if (!workflow) {
      addLog('warning', 'No workflow selected');
      return;
    }
    
    // ALWAYS use parameters from the UI (ref) - never use stale panel.parameterValues
    const paramsToUse = currentParameterValues;
    
    setPanels(prev => prev.map(p =>
      p.id === panelId ? { ...p, status: 'generating', progress: 0, parameterValues: { ...paramsToUse }, workflowId: workflowIdToUse || undefined, parallelJobs: undefined } : p
    ));
    
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
    const processedParams = { ...paramsToUse };
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
      
      if (typeof value === 'string' && value.startsWith('data:image')) {
        console.log(`[Generation] ${key} is a data:image URL, uploading...`);
        try {
          addLog('info', `Uploading image for parameter: ${key}`);
          // Convert data URL to blob
          const response = await fetch(value);
          const blob = await response.blob();
          const filename = `storyboard_${Date.now()}_${key}.png`;
          const file = new File([blob], filename, { type: blob.type });
          
          // Upload to ComfyUI
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
          addLog('info', `Image uploaded as: ${uploadedFilename}`);
          console.log(`[Generation] ${key} uploaded as: ${uploadedFilename}`);
          
          // Store the filename for buildWorkflow
          processedParams[key] = uploadedFilename;
          // Also track in imageInputs for explicit image input handling
          imageInputs[key] = uploadedFilename;
        } catch (uploadError) {
          const errorMsg = `Failed to upload image ${key}: ${uploadError}`;
          addLog('error', errorMsg);
          showError(errorMsg);
          setPanels(prev => prev.map(p => 
            p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
          ));
          return;
        }
      } else {
        console.log(`[Generation] ${key} is not an image (type: ${typeof value}, startsWith data:image: ${typeof value === 'string' ? value.startsWith('data:image') : 'N/A'})`);
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
          loraValues[key] = {
            strength: value.strength ?? 1.0,
            bypassed: value.bypassed ?? false,
            lora_name: value.lora_name,
            enabled: !value.bypassed // For backwards compatibility
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
    
    // Debug: Log the workflow being sent
    console.log('Workflow being sent to ComfyUI:', JSON.stringify(builtWorkflow, null, 2));
    addLog('info', `Workflow nodes: ${Object.keys(builtWorkflow).length}`);
    
    try {
      // Create WebSocket connection FIRST with unique client ID for this panel
      // This ensures we receive progress updates for this specific job
      const clientId = `storyboard-panel-${panelId}-${Date.now()}`;
      const nodeWs = getComfyUIWebSocket(targetUrl, clientId);
      
      try {
        await nodeWs.connect();
      } catch (wsError) {
        addLog('warning', `WebSocket to ${targetUrl} failed, will use polling`);
      }
      
      // Submit to selected ComfyUI node with matching client_id
      const response = await fetch(`${targetUrl}/prompt`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: builtWorkflow,
          client_id: clientId, // Must match WebSocket client ID!
        }),
      });
      
      if (!response.ok) {
        // Try to get detailed error from ComfyUI
        let errorDetail = `HTTP ${response.status}`;
        try {
          const errorData = await response.json();
          console.error('ComfyUI error response:', errorData);
          if (errorData.error) {
            errorDetail = typeof errorData.error === 'string' 
              ? errorData.error 
              : JSON.stringify(errorData.error);
          }
          if (errorData.node_errors) {
            console.error('Node errors:', errorData.node_errors);
            errorDetail += ` | Node errors: ${JSON.stringify(errorData.node_errors)}`;
          }
        } catch (e) {
          // Response wasn't JSON
        }
        throw new Error(errorDetail);
      }
      
      const data = await response.json();
      addLog('comfyui', `Queued prompt: ${data.prompt_id} on ${nodeName}`);
      
      // Track progress via WebSocket if connected, otherwise poll
      if (nodeWs.connected) {
        trackWithWebSocket(data.prompt_id, panelId, targetUrl, nodeWs);
      } else {
        addLog('warning', `WebSocket not connected, falling back to polling`);
        pollForResult(data.prompt_id, panelId, targetUrl);
      }
    } catch (error) {
      const errorMsg = `Failed to queue generation: ${error}`;
      addLog('error', errorMsg);
      showError(errorMsg);
      setPanels(prev => prev.map(p => 
        p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
      ));
    }
  }, [connectionStatus, workflows, selectedWorkflowId, parameterValues, comfyUrl, addLog, showError, panels, renderNodes, selectedPanelId]);
  
  const pollForResult = useCallback(async (promptId: string, panelId: number, targetUrl: string) => {
    const pollKey = `${panelId}-${promptId}`;
    
    // Cancel any existing poll for this panel to prevent accumulation
    activePollsRef.current.forEach(key => {
      if (key.startsWith(`${panelId}-`)) {
        activePollsRef.current.delete(key);
      }
    });
    
    // Register this poll
    activePollsRef.current.add(pollKey);
    
    const maxAttempts = 600; // 10 minutes at 1 second intervals
    let attempts = 0;
    
    const checkStatus = async () => {
      // Exit if this poll has been cancelled
      if (!activePollsRef.current.has(pollKey)) {
        return;
      }
      
      if (attempts >= maxAttempts) {
        addLog('error', `Generation timeout for panel ${panelId}`);
        setPanels(prev => prev.map(p => 
          p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
        ));
        activePollsRef.current.delete(pollKey);
        return;
      }
      
      attempts++;
      
      try {
        // Check history for completed prompt
        const historyResponse = await fetch(`${targetUrl}/history/${promptId}`);
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          
          if (history[promptId]) {
            const outputs = history[promptId].outputs;
            
            // Collect ALL output images (matching WebSocket path behavior)
            const allImages: string[] = [];
            for (const nodeId in outputs) {
              const nodeOutput = outputs[nodeId];
              if (nodeOutput.images && nodeOutput.images.length > 0) {
                for (const img of nodeOutput.images) {
                  const imageUrl = `${targetUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
                  allImages.push(imageUrl);
                }
              }
            }
            
            if (allImages.length > 0) {
              addLog('comfyui', `Generation complete for panel ${panelId} (polling): ${allImages.length} image(s)`);
              activePollsRef.current.delete(pollKey);
              
              // Auto-save if enabled - read from singleton to avoid stale closure
              const currentSettings = projectManager.getProject();
              if (currentSettings.autoSave && currentSettings.path) {
                addLog('info', `Auto-saving ${allImages.length} image(s) to ${currentSettings.path}...`);
                
                const startTime = generationStartTimes.current.get(panelId);
                const generationTime = startTime ? (Date.now() - startTime) / 1000 : undefined;
                
                (async () => {
                  try {
                    // Get panel info from current state
                    const panelName = await new Promise<string>(resolve => {
                      setPanels(prev => {
                        const p = prev.find(p => p.id === panelId);
                        resolve(p?.name || `Panel_${String(panelId).padStart(2, '0')}`);
                        return prev; // No mutation
                      });
                    });
                    
                    const nextVersion = await projectManager.getNextVersion(panelName, []);
                    addLog('info', `Starting from version ${nextVersion}`);
                    
                    for (let idx = 0; idx < allImages.length; idx++) {
                      const url = allImages[idx];
                      const version = nextVersion + idx;
                      
                      // Get panel workflow info for metadata (avoid stale closure — read from panels state)
                      const panelWorkflowId = await new Promise<string>(resolve => {
                        setPanels(prev => {
                          const p = prev.find(p => p.id === panelId);
                          resolve(p?.workflowId || '');
                          return prev;
                        });
                      });
                      const panelParams = await new Promise<Record<string, unknown>>(resolve => {
                        setPanels(prev => {
                          const p = prev.find(p => p.id === panelId);
                          resolve((p?.parameterValues || {}) as Record<string, unknown>);
                          return prev;
                        });
                      });
                      
                      const entry = projectManager.createHistoryEntry(
                        url, panelId, version, panelWorkflowId, panelWorkflowId || 'Unknown', {}, panelParams, generationTime
                      );
                      
                      addLog('info', `Saving v${version} from URL: ${url}`);
                      const result = await projectManager.saveToProjectFolder(
                        url, panelId, version, entry.metadata, panelName
                      );
                      
                      if (result.success) {
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
                  }
                })();
              } else if (currentSettings.autoSave && !currentSettings.path) {
                addLog('warning', 'Auto-save enabled but no project folder configured');
              } else if (!currentSettings.autoSave) {
                addLog('info', 'Auto-save is disabled. Enable it in Project Settings to save images automatically.');
              }
              
              // Calculate generation time
              const genStartTime = generationStartTimes.current.get(panelId);
              const genTime = genStartTime ? (Date.now() - genStartTime) / 1000 : undefined;
              generationStartTimes.current.delete(panelId);
              
              // Update state with history entries
              setPanels(prevPanels => {
                const currentPanel = prevPanels.find(p => p.id === panelId);
                const currentHistoryLength = currentPanel?.imageHistory?.length || 0;
                
                const historyEntries = allImages.map((url: string, idx: number) => 
                  projectManager.createHistoryEntry(
                    url, panelId, currentHistoryLength + idx + 1,
                    currentPanel?.workflowId || '', 'Unknown', {}, 
                    currentPanel?.parameterValues || {}, genTime
                  )
                );
                
                return prevPanels.map(p => {
                  if (p.id !== panelId) return p;
                  const newHistory = [...p.imageHistory, ...historyEntries];
                  return {
                    ...p,
                    status: 'complete' as const,
                    progress: 100,
                    image: allImages[allImages.length - 1],
                    images: allImages,
                    currentImageIndex: 0,
                    imageHistory: newHistory,
                    historyIndex: newHistory.length - 1,
                  };
                });
              });
              return;
            }
          }
        }
        
        // Check queue status for progress
        const queueResponse = await fetch(`${targetUrl}/queue`);
        if (queueResponse.ok) {
          const queueData = await queueResponse.json();
          
          // Check if our prompt is still running
          const running = queueData.queue_running?.find((item: any) => 
            item[1] === promptId
          );
          
          if (running) {
            // Still running, update progress
            setPanels(prev => prev.map(p => 
              p.id === panelId ? { 
                ...p, 
                progress: Math.min((attempts / 100) * 100, 90)
              } : p
            ));
          }
        }
        
        // Only continue polling if still active
        if (activePollsRef.current.has(pollKey)) {
          setTimeout(checkStatus, 1000);
        }
      } catch (error) {
        addLog('error', `Error polling for result: ${error}`);
        // Only retry if still active
        if (activePollsRef.current.has(pollKey)) {
          setTimeout(checkStatus, 1000);
        }
      }
    };
    
    checkStatus();
  }, [addLog]);
  
  // Track generation progress via WebSocket (real-time)
  const trackWithWebSocket = useCallback((promptId: string, panelId: number, targetUrl: string, ws?: ComfyUIWebSocket) => {
    const websocket = ws || wsRef.current;
    if (!websocket) {
      // Fallback to polling
      pollForResult(promptId, panelId, targetUrl);
      return;
    }
    
    websocket.trackPrompt(
      promptId,
      panelId,
      // Progress callback
      (progress) => {
        const pct = Math.round((progress.value / progress.max) * 100);
        addLog('info', `Progress: ${pct}% (${progress.value}/${progress.max})`);
        setPanels(prev => prev.map(p => 
          p.id === panelId ? { ...p, progress: pct } : p
        ));
      },
      // Completed callback
      async (_promptId, _outputs) => {
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
          return;
        }
        
        // Fetch result from history to get image URL
        try {
          const historyResponse = await fetch(`${targetUrl}/history/${promptId}`);
          if (historyResponse.ok) {
            const historyData = await historyResponse.json();
            const promptData = historyData[promptId];
            
            if (promptData?.outputs) {
              // Get the list of selected output node IDs
              const selectedOutputNodeIds = selectedWorkflow?.parsed.outputs
                ?.filter(o => o.selected)
                .map(o => o.node_id) || [];
              
              // If no outputs are explicitly selected, use all of them (backwards compatibility)
              const useAllOutputs = selectedOutputNodeIds.length === 0;
              
              // Collect images from selected output nodes only
              const allImages: string[] = [];
              const nodeOutputMap: Record<string, string[]> = {}; // Track which node produced which images
              
              for (const nodeId of Object.keys(promptData.outputs)) {
                // Skip this node if it's not selected (unless we're using all outputs)
                if (!useAllOutputs && !selectedOutputNodeIds.includes(nodeId)) {
                  addLog('comfyui', `Skipping node ${nodeId} (not selected)`);
                  continue;
                }
                
                const output = promptData.outputs[nodeId];
                if (output.images && output.images.length > 0) {
                  const nodeImages = output.images.map((img: any) => 
                    `${targetUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`
                  );
                  allImages.push(...nodeImages);
                  nodeOutputMap[nodeId] = nodeImages;
                  addLog('comfyui', `Node ${nodeId} produced ${nodeImages.length} image(s)`);
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
                   (async () => {
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
                          selectedWorkflowId || '',
                          selectedWorkflow?.name || 'Unknown',
                          selectedWorkflow?.workflow || {},
                          parameterValues,
                          generationTime
                        );
                        
                         addLog('info', `Saving v${version} from URL: ${url}`);
                        const result = await projectManager.saveToProjectFolder(
                          url,
                          panelId,
                          version,
                          entry.metadata,
                          panelName  // CRITICAL: Pass panel name for per-panel folder creation
                        );
                        
                         if (result.success) {
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
                generationStartTimes.current.delete(panelId);
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
                      currentPanel?.workflowId || selectedWorkflowId || '',
                      selectedWorkflow?.name || 'Unknown',
                      selectedWorkflow?.workflow || {},
                      currentPanel?.parameterValues || parameterValues,  // FIX: Use panel's saved params
                      genTime  // Use the pre-calculated generation time
                    )
                  );
                  
                  return prevPanels.map(p => {
                    if (p.id !== panelId) return p;
                    
                    const newHistory = [...p.imageHistory, ...historyEntriesForState];
                    return {
                      ...p,
                      status: 'complete' as const,
                      progress: 100,
                      image: allImages[allImages.length - 1],
                      images: allImages,
                      currentImageIndex: 0,
                      imageHistory: newHistory,
                      historyIndex: newHistory.length - 1,
                    };
                  });
                });
                return;
              }
            }
          }
        } catch (error) {
          addLog('error', `Error fetching result: ${error}`);
        }
        
        // No image found
        setPanels(prev => prev.map(p => 
          p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
        ));
      },
      // Error callback
      (_promptId, error) => {
        const errorMsg = `Generation failed: ${error}`;
        addLog('error', errorMsg);
        showError(errorMsg);
        setPanels(prev => prev.map(p => 
          p.id === panelId ? { ...p, status: 'error', progress: 0 } : p
        ));
      }
    );
  }, [addLog, showError, pollForResult, panels]);
  
  // ---------------------------------------------------------------------------
  // Functions - Parallel Job Tracking (fixes race condition)
  // ---------------------------------------------------------------------------

  /**
   * Save a single parallel job result immediately when it completes.
   * Does NOT wait for other jobs. Updates UI immediately.
   */
  const saveIndividualParallelResult = useCallback(async (
    panelId: number,
    job: { nodeId: string; nodeName: string; resultUrl: string; seed: number }
  ) => {
    // CRITICAL: Use panelsRef.current to avoid stale closure issues
    // The panels captured in this closure go stale as parallel jobs complete and update state
    const panel = panelsRef.current.find(p => p.id === panelId);
    if (!panel || !job.resultUrl) return;

    // Prevent duplicate saves for the same job
    const jobKey = `${panelId}-${job.nodeId}-${job.seed}`;
    if (savedJobsRef.current.has(jobKey)) {
      console.log(`[Parallel] Job ${jobKey} already saved, skipping duplicate`);
      return;
    }
    
    // Mark as saved IMMEDIATELY (before any async work) to prevent race conditions
    savedJobsRef.current.add(jobKey);

    console.log(`[Parallel] Saving individual result from ${job.nodeName}`);
    addLog('info', `Saving result from ${job.nodeName}...`);

    try {
      // Get current workflow
      const currentWorkflow = workflows.find(w => w.id === (panel.workflowId || selectedWorkflowId));

      // Calculate generation time (if available)
      const startTime = generationStartTimes.current.get(panelId);
      const generationTime = startTime ? (Date.now() - startTime) / 1000 : undefined;

      // Create parameter object with the specific seed for this variation
      const paramsWithSeed = {
        ...(panel.parameterValues || parameterValues),
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
        panel.workflowId || selectedWorkflowId || '',
        currentWorkflow?.name || 'Unknown',
        currentWorkflow?.workflow || {},
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
          j.nodeId === job.nodeId ? { ...j, status: 'complete' as const, progress: 100 } : j
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
  }, [workflows, selectedWorkflowId, parameterValues, addLog, projectManager]);

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
    ws: ComfyUIWebSocket
  ) => {
    ws.trackPrompt(
      promptId,
      panelId,
      // Progress callback - update this specific job's progress
      (progress) => {
        const pct = Math.round((progress.value / progress.max) * 100);
        setPanels(prev => prev.map(p => {
          if (p.id !== panelId || !p.parallelJobs) return p;
          const updatedJobs = p.parallelJobs.map(j =>
            j.nodeId === nodeId ? { ...j, progress: pct } : j
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
        addLog('comfyui', `Parallel job complete on node ${nodeId} for panel ${panelId}`);
        
        // Fetch result from history
        try {
          const historyResponse = await fetch(`${targetUrl}/history/${promptId}`);
          if (!historyResponse.ok) throw new Error(`HTTP ${historyResponse.status}`);
          
          const historyData = await historyResponse.json();
          const promptData = historyData[promptId];
          
          if (promptData?.outputs) {
            // Collect image URL from first output
            let resultUrl: string | undefined;
            for (const nodeIdKey of Object.keys(promptData.outputs)) {
              const output = promptData.outputs[nodeIdKey];
              if (output.images && output.images.length > 0) {
                const img = output.images[0];
                resultUrl = `${targetUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
                break;
              }
            }
            
            if (resultUrl) {
              // Update this job's result URL and status
              setPanels(prev => prev.map(p => {
                if (p.id !== panelId || !p.parallelJobs) return p;
                const updatedJobs = p.parallelJobs.map(j =>
                  j.nodeId === nodeId ? { ...j, status: 'complete' as const, progress: 100, resultUrl } : j
                );
                
                // NEW: Save this individual result immediately (don't wait for all)
                // Find the updated job to pass to save function
                const completedJob = updatedJobs.find(j => j.nodeId === nodeId);
                if (completedJob && completedJob.resultUrl) {
                  // Use setTimeout to avoid state update conflicts
                  setTimeout(() => {
                    saveIndividualParallelResult(panelId, {
                      nodeId: completedJob.nodeId,
                      nodeName: completedJob.nodeName,
                      resultUrl: completedJob.resultUrl!,
                      seed: completedJob.seed
                    });
                  }, 0);
                }
                
                // Check if ALL jobs are in terminal state (for cleanup/logging only, not batch save)
                const allTerminal = updatedJobs.every(j =>
                  j.status === 'complete' || j.status === 'error' || j.status === 'cancelled'
                );
                
                if (allTerminal) {
                  // All jobs done - just log completion (images already saved individually)
                  const completeCount = updatedJobs.filter(j => j.status === 'complete').length;
                  addLog('info', `All parallel jobs finished! ${completeCount} successful, ${updatedJobs.length - completeCount} failed`);
                  
                  // Clear parallel jobs state
                  return { 
                    ...p, 
                    parallelJobs: updatedJobs, 
                    status: completeCount > 0 ? 'complete' : 'error',
                    batchSaveTriggered: true
                  };
                }
                
                return { ...p, parallelJobs: updatedJobs };
              }));
            }
          }
        } catch (error) {
          addLog('error', `Error fetching parallel result: ${error}`);
          setPanels(prev => prev.map(p => {
            if (p.id !== panelId || !p.parallelJobs) return p;
            return {
              ...p,
              parallelJobs: p.parallelJobs.map(j =>
                j.nodeId === nodeId ? { ...j, status: 'error' as const } : j
              )
            };
          }));
        }
      },
      // Error callback
      (_promptId, error) => {
        addLog('error', `Parallel job failed on node ${nodeId}: ${error}`);
        setPanels(prev => prev.map(p => {
          if (p.id !== panelId || !p.parallelJobs) return p;
          return {
            ...p,
            parallelJobs: p.parallelJobs.map(j =>
              j.nodeId === nodeId ? { ...j, status: 'error' as const } : j
            )
          };
        }));
      }
    );
  }, [addLog, saveIndividualParallelResult]);
  
  /**
   * Track a parallel job via polling (fallback when WebSocket fails)
   */
  const trackParallelJobWithPolling = useCallback(async (
    promptId: string,
    panelId: number,
    nodeId: string,
    targetUrl: string
  ) => {
    const maxAttempts = 600;
    let attempts = 0;
    
    const checkStatus = async () => {
      if (attempts >= maxAttempts) {
        addLog('error', `Parallel job timeout on node ${nodeId}`);
        setPanels(prev => prev.map(p => {
          if (p.id !== panelId || !p.parallelJobs) return p;
          return {
            ...p,
            parallelJobs: p.parallelJobs.map(j =>
              j.nodeId === nodeId ? { ...j, status: 'error' as const } : j
            )
          };
        }));
        return;
      }
      
      attempts++;
      
      try {
        const historyResponse = await fetch(`${targetUrl}/history/${promptId}`);
        if (historyResponse.ok) {
          const history = await historyResponse.json();
          
          if (history[promptId]?.outputs) {
            // Job complete - extract result
            let resultUrl: string | undefined;
            for (const nodeIdKey of Object.keys(history[promptId].outputs)) {
              const output = history[promptId].outputs[nodeIdKey];
              if (output.images && output.images.length > 0) {
                const img = output.images[0];
                resultUrl = `${targetUrl}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${img.type || 'output'}`;
                break;
              }
            }
            
            if (resultUrl) {
              setPanels(prev => prev.map(p => {
                if (p.id !== panelId || !p.parallelJobs) return p;
                const updatedJobs = p.parallelJobs.map(j =>
                  j.nodeId === nodeId ? { ...j, status: 'complete' as const, progress: 100, resultUrl } : j
                );
                
                // NEW: Save this individual result immediately (don't wait for all)
                // Find the updated job to pass to save function
                const completedJob = updatedJobs.find(j => j.nodeId === nodeId);
                if (completedJob && completedJob.resultUrl) {
                  // Use setTimeout to avoid state update conflicts
                  setTimeout(() => {
                    saveIndividualParallelResult(panelId, {
                      nodeId: completedJob.nodeId,
                      nodeName: completedJob.nodeName,
                      resultUrl: completedJob.resultUrl!,
                      seed: completedJob.seed
                    });
                  }, 0);
                }
                
                // Check if ALL jobs are in terminal state (for cleanup/logging only, not batch save)
                const allTerminal = updatedJobs.every(j =>
                  j.status === 'complete' || j.status === 'error' || j.status === 'cancelled'
                );
                
                if (allTerminal) {
                  // All jobs done - just log completion (images already saved individually)
                  const completeCount = updatedJobs.filter(j => j.status === 'complete').length;
                  addLog('info', `All parallel jobs finished! ${completeCount} successful, ${updatedJobs.length - completeCount} failed`);
                  
                  // Clear parallel jobs state
                  return { 
                    ...p, 
                    parallelJobs: updatedJobs, 
                    status: completeCount > 0 ? 'complete' : 'error',
                    batchSaveTriggered: true
                  };
                }
                
                return { ...p, parallelJobs: updatedJobs };
              }));
              return;
            }
          }
        }
        
        // Update progress estimate
        const progress = Math.min((attempts / 100) * 100, 90);
        setPanels(prev => prev.map(p => {
          if (p.id !== panelId || !p.parallelJobs) return p;
          return {
            ...p,
            parallelJobs: p.parallelJobs.map(j =>
              j.nodeId === nodeId ? { ...j, progress } : j
            )
          };
        }));
        
        setTimeout(checkStatus, 1000);
      } catch (error) {
        addLog('error', `Error polling parallel result: ${error}`);
        setTimeout(checkStatus, 1000);
      }
    };
    
    checkStatus();
  }, [addLog, saveIndividualParallelResult]);
  
  // Note: Individual job cancel/retry functions and batchSaveParallelResults removed
  // Functionality now handled through streaming individual saves via saveIndividualParallelResult

  // ---------------------------------------------------------------------------
  // Functions - Parameter Updates
  // ---------------------------------------------------------------------------
  const handleParameterChange = useCallback((name: string, value: any) => {
    console.log('[handleParameterChange] Called with:', name, '=', typeof value === 'string' ? value.substring(0, 50) : value);
    
    // CRITICAL: Update the ref BEFORE calling setParameterValues
    // The functional setter (prev => ...) is NOT called synchronously - React batches it
    // So we must update the ref outside the setter to ensure generatePanel gets latest values
    const newValues = { ...parameterValuesRef.current, [name]: value };
    parameterValuesRef.current = newValues;
    console.log('[handleParameterChange] Updated ref BEFORE setter, keys:', Object.keys(newValues));
    
    // Update the state (this triggers re-render but the functional form ensures consistency)
    setParameterValues(newValues);
      
    // Also update the active panel's stored parameters so they're preserved
    if (selectedPanelId) {
      setPanels(panels => panels.map(p => 
        p.id === selectedPanelId 
          ? { ...p, parameterValues: newValues }
          : p
      ));
    }
  }, [selectedPanelId]);
  
  // Handle camera angle changes for multi-angle LoRA
  const handleCameraAngleChange = useCallback((paramName: string, angle: CameraAngle | null) => {
    setCameraAngles(prev => ({ ...prev, [paramName]: angle }));
  }, []);
  
  // ---------------------------------------------------------------------------
  // Functions - AI Prompt Enhancement
  // ---------------------------------------------------------------------------
  const handleEnhancePrompt = useCallback(async (prompt: string): Promise<string> => {
    // Get the user's selected LLM settings
    const llmSettings = getSelectedLlmSettings();
    if (!llmSettings) {
      throw new Error('No LLM provider configured. Please configure in Settings.');
    }
    
    const { provider: llmProvider, model: llmModel } = llmSettings;
    
    // Get the configured providers to retrieve credentials
    const configuredProviders = getConfiguredProviders();
    const provider = configuredProviders.find(p => p.providerId === llmProvider);
    
    if (!provider) {
      throw new Error('Selected provider not found. Please configure in Settings.');
    }
    
    try {
      const result = await api.enhancePrompt({
        userPrompt: prompt.trim(),
        llmProvider: llmProvider,
        llmModel: llmModel,
        targetModel: 'flux', // Default target model
        projectType: 'live_action',
        config: {} as any,
        credentials: {
          apiKey: provider.credentials.apiKey,
          endpoint: provider.credentials.endpoint,
          oauthToken: provider.credentials.oauthToken,
        },
      });
      
      if (result.success) {
        showInfo('Prompt enhanced successfully');
        return result.enhanced_prompt;
      } else {
        throw new Error(result.error || 'Enhancement failed');
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to enhance prompt';
      showError(errorMsg);
      throw error;
    }
  }, [showInfo, showError]);
  
  // ---------------------------------------------------------------------------
  // Render Helpers
  // ---------------------------------------------------------------------------
  const formatTime = (date: Date) => {
    return date.toTimeString().split(' ')[0];
  };
  
  const getFilteredWorkflows = () => {
    return workflows.filter(w => {
      // Check if workflow belongs to this tab by original category/subcategory
      const matchesOriginalCategory = w.category === activeTab && w.subCategory === activeSubTab;
      
      // Check if workflow is tagged with the specific category for this subcategory
      const expectedCategory = SUBCATEGORY_TO_CATEGORY_MAP[activeSubTab];
      const matchesNewCategories = expectedCategory && w.categories?.includes(expectedCategory);
      
      return matchesOriginalCategory || matchesNewCategories;
    });
  };
  
  const selectedWorkflow = workflows.find(w => w.id === selectedWorkflowId);
  const exposedParameters = selectedWorkflow?.config.filter(c => c.exposed) || [];
  
  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  
  // Save project handler
  const handleSaveProject = async () => {
    const result = await projectManager.saveProjectState(
      panels,
      undefined, // Workflows are NOT saved in projects — they belong to the application
      parameterValues,
      {
        selectedWorkflowId: selectedWorkflowId || undefined,
        renderNodes: renderNodes,
        comfyUrl: comfyUrl,
        cameraAngles: cameraAngles,
      }
    );
    if (result.success) {
      showInfo(`Project saved to ${result.savedPath}`);
    } else {
      showError(`Failed to save project: ${result.error}`);
    }
  };

  // Save project as handler - opens file browser dialog for new location/name
  const handleSaveProjectAs = () => {
    setFileBrowserMode('save');
  };
  
  // Load project handler - opens file browser dialog to select project
  const handleLoadProject = () => {
    setFileBrowserMode('open');
  };

  // Handle save from file browser dialog
  const handleSaveFromDialog = async (folderPath: string, projectName: string) => {
    // Update project settings with new path and name
    const newSettings = {
      ...projectSettings,
      name: projectName,
      path: folderPath,
    };
    setProjectSettings(newSettings);
    projectManager.setProject(newSettings);

    // Save the project
    const result = await projectManager.saveProjectState(
      panels,
      undefined, // Workflows are NOT saved in projects — they belong to the application
      parameterValues,
      {
        selectedWorkflowId: selectedWorkflowId || undefined,
        renderNodes: renderNodes,
        comfyUrl: comfyUrl,
        cameraAngles: cameraAngles,
      }
    );

    if (result.success) {
      showInfo(`Project saved to ${result.savedPath}`);
      setFileBrowserMode(null);
    } else {
      showError(`Failed to save project: ${result.error}`);
    }
  };

  // Phase 3: New load handler with folder scanning
  const handleLoadFromDialog = async (projectPath: string) => {
    // Show loading progress
    setIsLoadingProject(true);
    setLoadingProgress({ progress: 0, currentFile: 'Loading project data...' });
    
    try {
      const result = await projectManager.loadProjectState(projectPath);
      
      if (!result.success || !result.state) {
        showError(`Failed to load project: ${result.error}`);
        setIsLoadingProject(false);
        return;
      }

      // Get deleted images from saved state
      const savedDeletedImages = new Set<string>(result.state.deleted_images || []);
      setDeletedImages(savedDeletedImages);

      // NEW APPROACH: Scan project for all panel folders
      setLoadingProgress({ progress: 10, currentFile: 'Scanning project panels...' });
      
      const scanResult = await projectManager.scanProjectPanels();
      
      if (!scanResult.success) {
        console.error('[Load] Failed to scan project panels:', scanResult.error);
        showError(`Failed to scan project: ${scanResult.error}`);
        setIsLoadingProject(false);
        return;
      }

      setLoadingProgress({ progress: 50, currentFile: 'Building panels...' });

      // Build panels from scanned folders
      // Each folder becomes a panel, named after the folder
      const orchestratorUrl = projectManager.getProject().orchestratorUrl || getDefaultOrchestratorUrl();
      const restoredPanels: Panel[] = [];
      let panelId = 1;

      for (const panelFolder of scanResult.panels) {
        // Filter out deleted images
        const validImages = panelFolder.images.filter(
          img => !savedDeletedImages.has(img.image_path)
        );

        if (validImages.length === 0) {
          // Skip folders with no valid images
          continue;
        }

        // Try to find saved panel data by name
        const savedPanel = result.state.panels.find(
          (p: unknown) => (p as Panel).name === panelFolder.panel_name
        ) as Panel | undefined;

        // DEBUG: Log what we found
        console.log('[Load] Panel folder:', panelFolder.panel_name, 'Saved panel found:', savedPanel ? {
          name: savedPanel.name,
          notes: savedPanel.notes,
          imageRatings: (savedPanel as Panel & { imageRatings?: Record<string, number> })?.imageRatings,
        } : 'NOT FOUND');
        console.log('[Load] All saved panels:', result.state.panels.map((p: unknown) => (p as Panel).name));

        // Get saved image ratings for this panel
        const savedImageRatings = (savedPanel as Panel & { imageRatings?: Record<string, number> })?.imageRatings || {};

        // Build image history from scanned images
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

        // Use saved panel ID if available, otherwise use next available ID
        const usePanelId = savedPanel?.id ?? panelId;

        restoredPanels.push({
          id: usePanelId,
          name: panelFolder.panel_name,
          x: savedPanel?.x ?? calculateNewPanelX(panelId, panelId),
          y: savedPanel?.y ?? calculateNewPanelY(panelId, panelId),
          width: savedPanel?.width ?? 300,
          height: savedPanel?.height ?? 300,
          notes: savedPanel?.notes ?? '',
          workflowId: savedPanel?.workflowId,
          parameterValues: savedPanel?.parameterValues,
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

        panelId++;
      }

      // Also restore any saved panels that don't have folders (empty panels)
      for (const savedPanel of result.state.panels as Panel[]) {
        const hasFolder = scanResult.panels.some(pf => pf.panel_name === savedPanel.name);
        if (!hasFolder && savedPanel.name) {
          // Panel exists in save file but has no folder - restore it empty
          restoredPanels.push({
            id: savedPanel.id,
            name: savedPanel.name,
            x: savedPanel.x,
            y: savedPanel.y,
            width: savedPanel.width ?? 300,
            height: savedPanel.height ?? 300,
            notes: savedPanel.notes ?? '',
            workflowId: savedPanel.workflowId,
            parameterValues: savedPanel.parameterValues,
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
      }

      // Sort panels by ID for consistent ordering
      restoredPanels.sort((a, b) => a.id - b.id);

      setPanels(restoredPanels);
      
      // Workflows are NOT restored from project files — they are managed
      // independently via the persistent workflow storage backend
      
      // Restore parameter values if available
      if (result.state.parameter_values) {
        setParameterValues(result.state.parameter_values);
        parameterValuesRef.current = result.state.parameter_values;
      }
      
      // Restore camera angles if available
      if (result.state.camera_angles) {
        setCameraAngles(result.state.camera_angles as Record<string, CameraAngle | null>);
      }
      
      // Restore selected workflow
      if (result.state.selected_workflow_id) {
        setSelectedWorkflowId(result.state.selected_workflow_id);
      }
      
      // Restore ComfyUI URL if available
      if (result.state.comfy_url) {
        setComfyUrl(result.state.comfy_url);
      }
      
      // Update project settings
      setProjectSettings(projectManager.getProject());
      
      setLoadingProgress({ progress: 100, currentFile: 'Complete!' });
      
      // Calculate total images
      let totalImages = 0;
      restoredPanels.forEach(p => totalImages += p.imageHistory.length);
      showInfo(`Loaded project with ${restoredPanels.length} panels, ${totalImages} images`);
      
      // Close the dialog after a brief delay
      setTimeout(() => {
        setFileBrowserMode(null);
        setIsLoadingProject(false);
      }, 500);
      
    } catch (error) {
      console.error('[Load] Failed to load project:', error);
      showError(`Failed to load project: ${String(error)}`);
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
    const result = await projectManager.loadProjectState(projectPath);
    
    if (result.success && result.state) {
      // Restore panels with all their history, but reset generation state
      const restoredPanels = (result.state.panels as typeof panels).map(panel => {
        const newStatus = panel.image ? 'complete' : 'empty';
        return {
          ...panel,
          status: newStatus as 'empty' | 'complete',
          progress: panel.image ? 100 : 0,
          parallelJobs: undefined,
        };
      });
      setPanels(restoredPanels);
      // Workflows are NOT restored from project files — they are managed
      // independently via the persistent workflow storage backend
      // Restore parameter values if available
      if (result.state.parameter_values) {
        setParameterValues(result.state.parameter_values);
        parameterValuesRef.current = result.state.parameter_values;
      }
      // Restore camera angles if available
      if (result.state.camera_angles) {
        setCameraAngles(result.state.camera_angles as Record<string, CameraAngle | null>);
      }
      // Restore selected workflow
      if (result.state.selected_workflow_id) {
        setSelectedWorkflowId(result.state.selected_workflow_id);
      }
      // Note: renderNodes are managed by useRenderNodes hook and restored via localStorage
      // Restore ComfyUI URL if available
      if (result.state.comfy_url) {
        setComfyUrl(result.state.comfy_url);
      }
      // Update project settings
      setProjectSettings(projectManager.getProject());
      showInfo(`Loaded project with ${result.state.panels.length} panels`);
      // Close the browser
      setShowLoadProjectBrowser(false);
      setAvailableProjects([]);
    } else {
      showError(`Failed to load project: ${result.error}`);
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
        showInfo(`Deleted: ${extractFilename(imagePath)}`);
      } else {
        console.error('[Delete] Failed:', result.error);
        showError(`Delete failed: ${result.error || 'Unknown error'}`);
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

  // Handle cancelling all running generations
  const handleCancelGenerations = async () => {
    const hasBusyNodes = renderNodes.some(n => n.status === 'busy');
    const hasGeneratingPanels = panels.some(p => p.status === 'generating');
    
    if (!hasBusyNodes && !hasGeneratingPanels) {
      showInfo('No generations are currently running');
      return;
    }

    showInfo('Cancelling all running generations...');

    try {
      const results = await orchestratorManager.cancelAllGenerations();
      
      const successCount = results.filter(r => r.success).length;
      
      if (successCount > 0) {
        showInfo(`Cancelled ${successCount} generation(s)`);
      } else {
        showError('Failed to cancel generations');
      }

      // Update panels to reflect cancellation
      setPanels(prev => prev.map(p => 
        p.status === 'generating' 
          ? { ...p, status: 'error', error: 'Cancelled by user' }
          : p
      ));
    } catch (err) {
      showError(`Error cancelling generations: ${err instanceof Error ? err.message : 'Unknown error'}`);
      console.error('[Cancel] Error:', err);
    }
  };

  // New project handler
  const handleNewProject = useCallback(async () => {
    // 1. Check if current project has content (panels with images or notes)
    const hasContent = panels.some(p => p.image || p.images.length > 0 || p.notes.trim() !== '');
    
    // 2. If there's content, prompt to save
    if (hasContent) {
      const shouldProceed = window.confirm(
        'You have unsaved work. Would you like to save before creating a new project?\n\n' +
        'Click OK to save first, or Cancel to discard changes.'
      );
      if (shouldProceed) {
        await handleSaveProject();
      }
    }
    
    // 3. Reset state to defaults
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
    
    setPanels(defaultPanels);
    setParameterValues({});
    parameterValuesRef.current = {};
    setSelectedWorkflowId(null);
    
    // 4. Reset project settings to defaults
    const newSettings: ProjectSettings = {
      name: 'Untitled Project',
      path: '',
      namingTemplate: '{project}_Panel{panel}_{version}',
      autoSave: true,
      orchestratorUrl: projectSettings.orchestratorUrl, // Keep existing orchestrator URL
      created: new Date(),
      lastModified: new Date(),
    };
    setProjectSettings(newSettings);
    projectManager.setProject(newSettings);
    
    // 5. Open project settings modal for user to configure
    setShowProjectSettings(true);
    
  }, [panels, handleSaveProject, projectSettings.orchestratorUrl]);

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
      
      {/* Top Navigation Bar */}
      <div className="storyboard-top-bar">
        {/* Main Menu (left) */}
        <MainMenu
          projectName={projectSettings.name || 'Untitled Project'}
          nodeCount={renderNodes.length}
          onProjectSettings={() => setShowProjectSettings(true)}
          onSaveProject={handleSaveProject}
          onSaveProjectAs={handleSaveProjectAs}
          onLoadProject={handleLoadProject}
          onNewProject={handleNewProject}
          onManageNodes={() => setShowNodeManager(true)}
          onRestartNodes={handleRestartNodes}
          onCancelGenerations={handleCancelGenerations}
          onPrintStoryboard={() => setShowPrintDialog(true)}
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
                  onClick={() => {
                    if (selectedWorkflowId && confirm('Are you sure you want to delete this workflow?')) {
                      const workflow = workflows.find(w => w.id === selectedWorkflowId);
                      setWorkflows(prev => prev.filter(w => w.id !== selectedWorkflowId));
                      setSelectedWorkflowId(null);
                      if (workflow) {
                        addLog('info', `Deleted workflow: ${workflow.name}`);
                      }
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
                  type: (p.type === 'string' ? 'prompt' : p.type) as 'integer' | 'float' | 'seed' | 'enum' | 'boolean' | 'prompt',
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
                cameraAngles={cameraAngles}
                onCameraAngleChange={handleCameraAngleChange}
                comfyUrl={comfyUrl}
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
                  
                  {/* Image navigation for history - shows when there's history */}
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
                              
                              // Score: ratio of matching nodes, accounting for both prompt and template size
                              const score = promptNodeIds.length > 0
                                ? matches / Math.max(promptNodeIds.length, templateNodeIds.length)
                                : 0;
                              
                              if (score > bestScore && score > 0.5) {
                                bestScore = score;
                                matchedWorkflow = wf;
                              }
                            }
                            
                            // Fallback: try filename_prefix matching if structural match failed
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
                            
                            // Step 2: Extract parameters using workflow's parameter definitions
                            const extractedParams: Record<string, unknown> = {};
                            const extractedImages: Record<string, string> = {};
                            
                            if (matchedWorkflow) {
                              // Use workflow's parsed parameter definitions to map node_id -> input_name
                              for (const param of matchedWorkflow.parsed.parameters) {
                                const nodeId = param.node_id;
                                const inputName = param.input_name;
                                const node = promptData[nodeId];
                                if (node?.inputs && inputName in node.inputs) {
                                  const value = node.inputs[inputName];
                                  // Skip array references (connections to other nodes)
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
                                
                                // Extract LoadImage filenames
                                if (classType === 'LoadImage' && node.inputs.image) {
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
                  
                  {/* Progress indicator with bar for single node generation */}
                  {panel.status === 'generating' && (
                    <div className="panel-generating-indicator">
                      <div className="progress-content">
                        <div className="progress-spinner" />
                        <div className="progress-text-container">
                          <span className="progress-percentage">{panel.progress}%</span>
                          <div className="progress-bar-container">
                            <div 
                              className="progress-bar-fill"
                              style={{ width: `${panel.progress}%` }}
                            />
                          </div>
                        </div>
                      </div>
                      <button
                        className="cancel-generation-btn"
                        onClick={async (e) => {
                          e.stopPropagation();
                          if (wsRef.current) {
                            const success = await wsRef.current.cancelGeneration();
                            if (success) {
                              setPanels(prev => prev.map(p =>
                                p.id === panel.id ? { ...p, status: 'empty', progress: 0, parallelJobs: undefined } : p
                              ));
                              showWarning('Generation cancelled');
                            } else {
                              showError('Failed to cancel generation');
                            }
                          }
                        }}
                        title="Cancel generation"
                      >
                        ✕
                      </button>
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
                      disabled={!selectedWorkflow || (connectionStatus !== 'connected' && renderNodes.filter(n => n.status === 'online').length === 0)}
                      title="Generate"
                    >
                      ▶
                    </button>
                  )}
                  
                  <span className="panel-index">{panel.id}</span>
                </div>
                
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
                      disabled={!selectedWorkflow || (connectionStatus !== 'connected' && renderNodes.filter(n => n.status === 'online').length === 0)}
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
              comfyUrl={comfyUrl}
              onSave={(config) => {
                skipParameterReset.current = true;
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
        selectedPanelId={selectedPanelId}
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
                    const folderBasename = path.split(/[/\\]/).pop() || panelName;
                    const finalPanelName = folderBasename.match(/^[a-zA-Z0-9_-]+$/) ? folderBasename : panelName;
                    
                    // Create panel with populated imageHistory
                    setPanels(prev => [...prev, {
                      id: newPanelId,
                      name: finalPanelName,
                      x: 50 + (prev.length * 20),
                      y: 50 + (prev.length * 20),
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
                    }]);
                    
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
          disabled={!selectedWorkflow || (connectionStatus !== 'connected' && renderNodes.filter(n => n.status === 'online').length === 0)}
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
                    
                    if (classType === 'LoadImage' && node.inputs.image) {
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
