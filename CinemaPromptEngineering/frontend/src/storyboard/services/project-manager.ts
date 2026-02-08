/**
 * ProjectManager - Image History & Project Folder Management
 * 
 * Features:
 * - Custom project folder paths (saved to filesystem via Orchestrator API)
 * - Configurable naming templates
 * - Image history with full metadata
 * - Workflow JSON preservation
 */

import { useState, useCallback } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface ImageMetadata {
  timestamp: Date;
  workflowId: string;
  workflowName: string;
  seed: number;
  promptSummary: string;
  parameters: Record<string, unknown>;
  workflow: Record<string, unknown>; // Full workflow JSON for reproduction
  sourceUrl: string; // ComfyUI URL
  savedPath?: string; // Local path if saved
  version: number; // v001, v002, etc.
  generationTime?: number; // Generation time in seconds
  nodeName?: string; // Name of the render node that generated this image (for parallel generation)
  rating?: number; // 0-5 star rating for this image
}

export interface ImageHistoryEntry {
  id: string;
  url: string; // ComfyUI URL or local file URL
  metadata: ImageMetadata;
  thumbnail?: string; // Base64 thumbnail for quick display
}

export interface ProjectSettings {
  name: string;
  path: string; // File system path (e.g., "Z:/Projects/MyFilm/renders")
  namingTemplate: string; // e.g., "{project}_{panel}_{version}" or "{shot}_{take}_{timestamp}"
  autoSave: boolean;
  orchestratorUrl: string; // URL to Orchestrator API (e.g., "http://localhost:9800")
  created: Date;
  lastModified: Date;
}

// ============================================================================
// Phase 3: Scan Project Images Interfaces
// ============================================================================

export interface ScanProjectImagesRequest {
  folder_path: string;
  naming_pattern: string;
  project_name: string;
}

export interface ProjectImageInfo {
  panel_number: number;
  version: number;
  image_path: string;
  filename: string;
  metadata: ImageMetadata;
}

export interface ScanProjectImagesResponse {
  success: boolean;
  images: ProjectImageInfo[];
  total: number;
  skipped_files: string[];
  message: string;
}

export interface ScanProgress {
  scanned: number;
  total_estimate: number;
  current_file: string;
}

// ============================================================================
// Panel-based Project Scanning (new approach: folders = panels)
// ============================================================================

export interface FolderImageInfo {
  filename: string;
  image_path: string;
  modified_time: number;
}

export interface PanelFolderInfo {
  panel_name: string;
  folder_path: string;
  images: FolderImageInfo[];
}

export interface ScanProjectPanelsResponse {
  success: boolean;
  panels: PanelFolderInfo[];
  total_panels: number;
  total_images: number;
  message: string;
}

// Default naming template tokens:
// {project} - Project name
// {panel} - Panel number (01, 02, etc.)
// {version} - Version number (v001, v002, etc.)
// {timestamp} - YYYYMMDD_HHMMSS
// {date} - YYYYMMDD
// {time} - HHMMSS
// {seed} - Generation seed
// {workflow} - Workflow name

const DEFAULT_PROJECT: ProjectSettings = {
  name: 'Untitled Project',
  path: '',
  namingTemplate: '{project}_Panel{panel}_{version}',
  autoSave: false,
  orchestratorUrl: 'http://localhost:9820',
  created: new Date(),
  lastModified: new Date(),
};

// ============================================================================
// ProjectManager Class
// ============================================================================

class ProjectManager {
  private currentProject: ProjectSettings = { ...DEFAULT_PROJECT };
  private storageKey = 'storyboard_project_settings';
  
  constructor() {
    this.loadFromStorage();
  }
  
  // ---------------------------------------------------------------------------
  // Project Settings
  // ---------------------------------------------------------------------------
  
  /**
   * Normalize Windows backslashes to forward slashes for safe JSON transmission.
   * Python's pathlib handles both formats correctly.
   */
  private normalizePath(path: string): string {
    return path.replace(/\\/g, '/');
  }
  
  getProject(): ProjectSettings {
    return { ...this.currentProject };
  }
  
  setProject(settings: Partial<ProjectSettings>): void {
    this.currentProject = {
      ...this.currentProject,
      ...settings,
      lastModified: new Date(),
    };
    this.saveToStorage();
    
    // Sync with backend
    this.syncProjectWithBackend();
  }
  
  private async syncProjectWithBackend(): Promise<void> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    if (!orchestratorUrl) return;
    
    try {
      const response = await fetch(`${orchestratorUrl}/api/project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project: {
            name: this.currentProject.name,
            path: this.normalizePath(this.currentProject.path),
            naming_template: this.currentProject.namingTemplate,
            orchestrator_url: this.currentProject.orchestratorUrl,
            auto_save: this.currentProject.autoSave,
          }
        }),
      });
      
      if (response.ok) {
        console.log('[ProjectManager] Project synced with backend');
      } else {
        console.warn('[ProjectManager] Failed to sync project with backend:', response.status);
      }
    } catch (error) {
      console.warn('[ProjectManager] Error syncing project:', error);
    }
  }
  
  resetProject(): void {
    this.currentProject = { ...DEFAULT_PROJECT, created: new Date(), lastModified: new Date() };
    this.saveToStorage();
  }
  
  // ---------------------------------------------------------------------------
  // Naming Template
  // ---------------------------------------------------------------------------
  
  generateFilename(
    panelId: number,
    version: number,
    metadata: Partial<ImageMetadata>
  ): string {
    const now = new Date();
    const pad = (n: number, len: number = 2) => n.toString().padStart(len, '0');
    
    const tokens: Record<string, string> = {
      '{project}': this.sanitizeFilename(this.currentProject.name),
      '{panel}': pad(panelId),
      '{version}': `v${pad(version, 3)}`,
      '{timestamp}': `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      '{date}': `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      '{time}': `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      '{seed}': (metadata.seed ?? 0).toString(),
      '{workflow}': this.sanitizeFilename(metadata.workflowName ?? 'unknown'),
    };
    
    let filename = this.currentProject.namingTemplate;
    for (const [token, value] of Object.entries(tokens)) {
      filename = filename.split(token).join(value);
    }
    
    // Add node name token support
    if (metadata?.nodeName) {
      filename = filename.replace('{node}', metadata.nodeName.replace(/[^a-zA-Z0-9-_]/g, '_'));
    } else {
      filename = filename.replace('_{node}', '').replace('{node}_', '').replace('{node}', '');
    }
    
    return filename;
  }

  /**
   * Validate that a path exists and is writable.
   * @param path - The path to validate
   * @param orchestratorUrl - URL of the Orchestrator API
   * @returns Validation result with exists flag and error message
   */
  async validateProjectPath(
    path: string,
    orchestratorUrl: string
  ): Promise<{ valid: boolean; exists: boolean; message: string }> {
    if (!path || path.trim() === '') {
      return { valid: false, exists: false, message: 'Path is required' };
    }

    try {
      const response = await fetch(`${orchestratorUrl}/api/browse-folders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path }),
      });

      if (!response.ok) {
        return { valid: false, exists: false, message: 'Path does not exist' };
      }

      return { valid: true, exists: true, message: 'Path is valid' };
    } catch (err) {
      return { valid: false, exists: false, message: `Cannot validate path: ${err}` };
    }
  }

  private sanitizeFilename(name: string): string {
    // Remove/replace invalid filename characters
    return name
      .replace(/[<>:"/\\|?*]/g, '_')
      .replace(/\s+/g, '_')
      .substring(0, 50); // Limit length
  }

  // ---------------------------------------------------------------------------
  // Phase 2: Per-Panel Folder Resolution
  // ---------------------------------------------------------------------------

  /**
   * Split the naming template into folder and filename parts.
   * For "{panel}/{project}_{version}", returns:
   *   folder: "{panel}"
   *   filename: "{project}_{version}"
   */
  private splitTemplateParts(): { folder: string | null; filename: string } {
    const template = this.currentProject.namingTemplate;
    // Normalize to forward slashes for splitting
    const normalized = template.replace(/\\/g, '/');
    
    if (normalized.includes('/')) {
      const lastSlash = normalized.lastIndexOf('/');
      return {
        folder: normalized.substring(0, lastSlash),
        filename: normalized.substring(lastSlash + 1)
      };
    }
    
    return { folder: null, filename: template };
  }

  /**
   * Resolve the output folder for a specific panel.
   * 
   * If the naming template has a folder path (e.g., "{panel}/..."), 
   * use that folder structure. Otherwise, create subfolder: {projectPath}/{panelName}/
   * 
   * @param panelName - The panel name (e.g., "Panel_01" or user-defined)
   * @param metadata - Optional metadata for token resolution
   * @returns The full folder path for this panel's outputs
   */
  resolvePanelFolder(panelName: string, metadata?: Partial<ImageMetadata>): string {
    const sanitizedName = this.sanitizeFilename(panelName);
    const basePath = this.normalizePath(this.currentProject.path);
    
    // Check if template has explicit folder structure
    const { folder } = this.splitTemplateParts();
    
    if (folder) {
      // Template has folder path - resolve tokens in folder part
      const tokens: Record<string, string> = {
        '{project}': this.sanitizeFilename(this.currentProject.name),
        '{panel}': sanitizedName,
        '{workflow}': this.sanitizeFilename(metadata?.workflowName ?? 'unknown'),
      };
      
      let resolvedFolder = folder;
      for (const [token, value] of Object.entries(tokens)) {
        resolvedFolder = resolvedFolder.split(token).join(value);
      }
      
      return `${basePath}/${resolvedFolder}`;
    }
    
    // No folder in template - use panel name as subfolder (default behavior)
    return `${basePath}/${sanitizedName}`;
  }

  /**
   * Generate filename for saving with panel name support.
   * Uses panel name instead of numeric ID.
   * 
   * IMPORTANT: Only returns the filename part, not any folder path from the template.
   * 
   * @param panelName - The panel name (e.g., "Panel_01")
   * @param version - The version number
   * @param metadata - Image metadata
   * @returns The generated filename (without extension, without folder path)
   */
  generateFilenameForPanel(
    panelName: string,
    version: number,
    metadata: Partial<ImageMetadata>
  ): string {
    const now = new Date();
    const pad = (n: number, len: number = 2) => n.toString().padStart(len, '0');
    const sanitizedPanelName = this.sanitizeFilename(panelName);
    
    const tokens: Record<string, string> = {
      '{project}': this.sanitizeFilename(this.currentProject.name),
      '{panel}': sanitizedPanelName,
      '{version}': `v${pad(version, 3)}`,
      '{timestamp}': `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      '{date}': `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`,
      '{time}': `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`,
      '{seed}': (metadata.seed ?? 0).toString(),
      '{workflow}': this.sanitizeFilename(metadata.workflowName ?? 'unknown'),
    };
    
    // Get only the filename part of the template (not folder)
    const { filename: filenameTemplate } = this.splitTemplateParts();
    
    let filename = filenameTemplate;
    for (const [token, value] of Object.entries(tokens)) {
      filename = filename.split(token).join(value);
    }
    
    // Add node name token support
    if (metadata?.nodeName) {
      filename = filename.replace('{node}', metadata.nodeName.replace(/[^a-zA-Z0-9-_]/g, '_'));
    } else {
      filename = filename.replace('_{node}', '').replace('{node}_', '').replace('{node}', '');
    }
    
    return filename;
  }
  
  // ---------------------------------------------------------------------------
  // Image History Helpers
  // ---------------------------------------------------------------------------
  
  createHistoryEntry(
    url: string,
    panelId: number,
    version: number,
    workflowId: string,
    workflowName: string,
    workflow: Record<string, unknown>,
    parameters: Record<string, unknown>,
    generationTime?: number
  ): ImageHistoryEntry {
    // Extract seed from parameters
    const seed = this.extractSeed(parameters);
    
    // Extract prompt summary
    const promptSummary = this.extractPromptSummary(parameters);
    
    const metadata: ImageMetadata = {
      timestamp: new Date(),
      workflowId,
      workflowName,
      seed,
      promptSummary,
      parameters: { ...parameters },
      workflow: { ...workflow },
      sourceUrl: url,
      version,
      generationTime,
    };
    
    return {
      id: `${panelId}_${version}_${Date.now()}`,
      url,
      metadata,
    };
  }
  
  private extractSeed(params: Record<string, unknown>): number {
    // Look for common seed parameter names
    const seedKeys = ['seed', 'noise_seed', 'Seed', 'random_seed'];
    for (const key of seedKeys) {
      if (typeof params[key] === 'number') {
        return params[key] as number;
      }
      // Check with node ID suffix
      for (const [k, v] of Object.entries(params)) {
        if (k.startsWith(key) && typeof v === 'number') {
          return v as number;
        }
      }
    }
    return -1;
  }
  
  private extractPromptSummary(params: Record<string, unknown>): string {
    // Look for common prompt parameter names
    // Return the FULL prompt - truncation happens at display time via truncateText()
    const promptKeys = ['positive_prompt', 'prompt', 'text', 'positive'];
    for (const key of promptKeys) {
      if (typeof params[key] === 'string') {
        return params[key] as string;
      }
      // Check with node ID suffix
      for (const [k, v] of Object.entries(params)) {
        if (k.startsWith(key) && typeof v === 'string') {
          return v as string;
        }
      }
    }
    return '';
  }
  
  // ---------------------------------------------------------------------------
  // Image Save - via Orchestrator API
  // ---------------------------------------------------------------------------
  
  /**
   * Save image to project folder via Orchestrator API
   * The Orchestrator fetches the image from ComfyUI and saves to the filesystem
   * Phase 2: Supports per-panel folders using panel name
   */
  async saveToProjectFolder(
    imageUrl: string,
    panelId: number,
    version: number,
    metadata: ImageMetadata,
    panelName?: string
  ): Promise<{ success: boolean; savedPath?: string; error?: string }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    
    if (!this.currentProject.path) {
      return { 
        success: false, 
        error: 'No project folder configured. Set a folder path in Project Settings.' 
      };
    }
    
    if (!orchestratorUrl) {
      return { 
        success: false, 
        error: 'No Orchestrator URL configured. Set it in Project Settings.' 
      };
    }
    
    // Phase 2: Use panel name for folder resolution if provided
    const folderPath = panelName 
      ? this.resolvePanelFolder(panelName)
      : this.currentProject.path;
    
    // Phase 2: Use panel name for filename generation if provided
    const filename = (panelName 
      ? this.generateFilenameForPanel(panelName, version, metadata)
      : this.generateFilename(panelId, version, metadata)) + '.png';
    
    try {
      // Call the Orchestrator's save-image endpoint
      // No metadata needed - PNG already contains embedded ComfyUI workflow
      const response = await fetch(`${orchestratorUrl}/api/save-image`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_url: imageUrl,
          folder_path: this.normalizePath(folderPath),
          filename: filename,
        }),
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[ProjectManager] Orchestrator error: ${response.status} - ${errorText}`);
        return { 
          success: false, 
          error: `Orchestrator error: ${response.status}` 
        };
      }
      
      const result = await response.json();
      
      if (result.success) {
        console.log(`[ProjectManager] Saved to: ${result.saved_path}`);
        return { 
          success: true, 
          savedPath: result.saved_path 
        };
      } else {
        console.error(`[ProjectManager] Save failed: ${result.message}`);
        return { 
          success: false, 
          error: result.message 
        };
      }
    } catch (error) {
      console.error(`[ProjectManager] Error saving to project folder:`, error);
      return { 
        success: false, 
        error: `Network error: ${String(error)}` 
      };
    }
  }
  
  /**
   * Check if Orchestrator is reachable
   */
  async checkOrchestratorHealth(): Promise<{ online: boolean; error?: string }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    
    if (!orchestratorUrl) {
      return { online: false, error: 'No Orchestrator URL configured' };
    }
    
    try {
      const response = await fetch(`${orchestratorUrl}/api/health`, {
        method: 'GET',
        signal: AbortSignal.timeout(5000), // 5 second timeout
      });
      
      if (response.ok) {
        const data = await response.json();
        return { online: data.status === 'healthy' || data.status === 'degraded' };
      }
      return { online: false, error: `HTTP ${response.status}` };
    } catch (error) {
      return { online: false, error: String(error) };
    }
  }
  
  // ---------------------------------------------------------------------------
  // Fallback - Browser Download
  // ---------------------------------------------------------------------------
  
  async downloadImage(url: string): Promise<Blob> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to download image: ${response.statusText}`);
    }
    return response.blob();
  }
  
  async saveImageToProject(
    url: string,
    panelId: number,
    version: number,
    metadata: Partial<ImageMetadata>
  ): Promise<{ filename: string; blob: Blob }> {
    const filename = this.generateFilename(panelId, version, metadata) + '.png';
    const blob = await this.downloadImage(url);
    return { filename, blob };
  }
  
  // Trigger browser download (fallback when no project folder configured)
  triggerDownload(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  
  // Save metadata JSON alongside image
  generateMetadataJson(entry: ImageHistoryEntry): string {
    return JSON.stringify({
      ...entry.metadata,
      timestamp: entry.metadata.timestamp instanceof Date 
        ? entry.metadata.timestamp.toISOString() 
        : entry.metadata.timestamp,
    }, null, 2);
  }
  
  // ---------------------------------------------------------------------------
  // Storage
  // ---------------------------------------------------------------------------
  
  private saveToStorage(): void {
    try {
      localStorage.setItem(this.storageKey, JSON.stringify({
        ...this.currentProject,
        created: this.currentProject.created instanceof Date 
          ? this.currentProject.created.toISOString() 
          : this.currentProject.created,
        lastModified: this.currentProject.lastModified instanceof Date 
          ? this.currentProject.lastModified.toISOString() 
          : this.currentProject.lastModified,
      }));
    } catch (error) {
      console.error('[ProjectManager] Failed to save to storage:', error);
    }
  }
  
  private loadFromStorage(): void {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        this.currentProject = {
          ...DEFAULT_PROJECT,
          ...parsed,
          created: new Date(parsed.created),
          lastModified: new Date(parsed.lastModified),
        };
      }
    } catch (error) {
      console.error('[ProjectManager] Failed to load from storage:', error);
    }
  }
  
  // ---------------------------------------------------------------------------
  // Version Scanning - Prevent overwrites
  // ---------------------------------------------------------------------------
  
  /**
   * Scan project folder for existing versions per panel.
   * Returns the highest version number found for each panel.
   */
  async scanExistingVersions(): Promise<{ success: boolean; panelVersions: Record<string, number>; error?: string }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    const folderPath = this.currentProject.path;
    
    console.log(`[ProjectManager] scanExistingVersions - orchestrator: ${orchestratorUrl}, folder: ${folderPath}, pattern: ${this.currentProject.namingTemplate}`);
    
    if (!orchestratorUrl || !folderPath) {
      console.log('[ProjectManager] scanExistingVersions - skipping (no orchestrator or folder)');
      return { success: true, panelVersions: {} };
    }
    
    try {
      const requestBody = {
        folder_path: folderPath,
        pattern: this.currentProject.namingTemplate,
      };
      console.log('[ProjectManager] scanExistingVersions - request:', JSON.stringify(requestBody));
      
      const response = await fetch(`${orchestratorUrl}/api/scan-versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });
      
      if (!response.ok) {
        console.error(`[ProjectManager] scanExistingVersions - HTTP error: ${response.status}`);
        return { success: false, panelVersions: {}, error: `HTTP ${response.status}` };
      }
      
      const result = await response.json();
      console.log('[ProjectManager] scanExistingVersions - response:', JSON.stringify(result));
      
      // CHECK FOR DEBUG MODE SIGNAL FROM BACKEND
      if (result.message && result.message.includes('🚨 DEBUG_CODE_RUNNING 🚨')) {
        console.log('%c🚨🚨🚨 DEBUG CODE IS RUNNING! 🚨🚨🚨', 'background: #ff0000; color: #ffffff; font-size: 20px; font-weight: bold; padding: 10px;');
        console.log('%cThis means server.py dummy code executed successfully!', 'background: #00aa00; color: #ffffff; font-size: 16px; padding: 5px;');
        console.log('Message from server:', result.message);
      }
      
      // Backend returns versions as strings ("001", "002"), convert to numbers for internal use
      const panelVersions: Record<string, number> = {};
      if (result.panel_versions) {
        for (const [panelId, version] of Object.entries(result.panel_versions)) {
          panelVersions[panelId] = typeof version === 'string' ? parseInt(version, 10) : (version as number);
        }
      }
      
      return {
        success: result.success,
        panelVersions,
        error: result.message,
      };
    } catch (error) {
      console.error('[ProjectManager] Failed to scan versions:', error);
      return { success: false, panelVersions: {}, error: String(error) };
    }
  }
  
  /**
   * Get the next version number for a panel (accounting for both filesystem and UI state).
   * CRITICAL FIX: Unified version computation prevents version collisions after deletion.
   * CRITICAL FIX #2: Now uses panel NAME instead of panel ID to match folder structure.
   * 
   * This method scans:
   * 1. Filesystem for existing saved versions (by panel name folder)
   * 2. Current imageHistory for versions not yet saved
   * 
   * Returns: max(filesystem_version, history_version) + 1
   */
  async getNextVersion(
    panelName: string,
    currentHistory: ImageHistoryEntry[] = []
  ): Promise<number> {
    // Scan filesystem for existing versions
    const scan = await this.scanExistingVersions();
    
    // CRITICAL: Look up by panel NAME (e.g., "Panel_01"), not panel ID (e.g., "01")
    // Folders are named by panel name, so we must match that
    const sanitizedPanelName = this.sanitizeFilename(panelName);
    const fileSystemVersion = scan.panelVersions[sanitizedPanelName] || 0;
    
    // Scan current imageHistory for highest version
    // This handles the case where images were generated but not yet saved to filesystem
    let historyVersion = 0;
    for (const entry of currentHistory) {
      if (entry.metadata?.version && entry.metadata.version > historyVersion) {
        historyVersion = entry.metadata.version;
      }
    }
    
    // Return whichever is higher + 1
    const nextVersion = Math.max(fileSystemVersion, historyVersion) + 1;
    console.log(`[ProjectManager] getNextVersion for "${panelName}": filesystem=${fileSystemVersion}, history=${historyVersion}, next=${nextVersion}`);
    
    return nextVersion;
  }
  
  // ---------------------------------------------------------------------------
  // Project State Save/Load
  // ---------------------------------------------------------------------------
  
  /**
   * Save complete project state to filesystem.
   * NOTE: Workflows are NOT saved in projects — they belong to the application
   * and are persisted independently via the workflow storage backend.
   */
  async saveProjectState(
    panels: unknown[],
    _workflows?: unknown[], // DEPRECATED — kept for call-site compat, ignored
    parameterValues?: Record<string, unknown>,
    additionalState?: {
      selectedWorkflowId?: string;
      renderNodes?: unknown[];
      comfyUrl?: string;
      cameraAngles?: Record<string, unknown>;
      deletedImages?: string[];
    }
  ): Promise<{ success: boolean; savedPath?: string; error?: string }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    const folderPath = this.currentProject.path;
    
    if (!orchestratorUrl) {
      return { success: false, error: 'No Orchestrator URL configured' };
    }
    
    if (!folderPath) {
      return { success: false, error: 'No project folder configured' };
    }
    
    try {
      // Phase 2: Strip all image data from panels - will be reconstructed on load
      const sanitizedPanels = panels.map((panel: unknown) => {
        const p = panel as Record<string, unknown>;
        
        // DEBUG: Log what we're saving
        console.log('[ProjectManager] Saving panel:', {
          id: p.id,
          name: p.name,
          notes: p.notes,
          hasImageHistory: Array.isArray(p.imageHistory) ? (p.imageHistory as unknown[]).length : 0,
        });
        
        // Extract ratings from imageHistory (saved per-image)
        const imageHistory = p.imageHistory as ImageHistoryEntry[] | undefined;
        const imageRatings: Record<string, number> = {};
        if (imageHistory && Array.isArray(imageHistory)) {
          for (const entry of imageHistory) {
            if (entry.metadata?.rating !== undefined && entry.metadata?.savedPath) {
              // Use savedPath as key since it's stable across sessions
              imageRatings[entry.metadata.savedPath] = entry.metadata.rating;
              console.log('[ProjectManager] Saving rating:', entry.metadata.savedPath, entry.metadata.rating);
            }
          }
        }
        
        // Save only essential panel configuration
        return {
          id: p.id,
          x: p.x,
          y: p.y,
          width: p.width,
          height: p.height,
          name: p.name, // Panel name for custom naming
          notes: p.notes,
          workflowId: p.workflowId,
          parameterValues: p.parameterValues,
          nodeId: p.nodeId,
          imageRatings, // Per-image star ratings keyed by savedPath
        };
      });
      
      console.log('[ProjectManager] Sanitized panels:', JSON.stringify(sanitizedPanels, null, 2));
      
      const response = await fetch(`${orchestratorUrl}/api/save-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          folder_path: folderPath,
          filename: `${this.sanitizeFilename(this.currentProject.name)}_project.json`,
          state: {
            project_settings: {
              ...this.currentProject,
              created: this.currentProject.created instanceof Date 
                ? this.currentProject.created.toISOString() 
                : this.currentProject.created,
              lastModified: new Date().toISOString(),
            },
            panels: sanitizedPanels,
            // workflows intentionally omitted — stored independently by workflow storage backend
            parameter_values: parameterValues || null,
            selected_workflow_id: additionalState?.selectedWorkflowId || null,
            render_nodes: additionalState?.renderNodes || null,
            comfy_url: additionalState?.comfyUrl || null,
            deleted_images: additionalState?.deletedImages || [],
            saved_at: new Date().toISOString(),
          },
        }),
      });
      
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      
      const result = await response.json();
      return {
        success: result.success,
        savedPath: result.saved_path,
        error: result.message,
      };
    } catch (error) {
      console.error('[ProjectManager] Failed to save project:', error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * Load project state from filesystem.
   */
  async loadProjectState(filePath: string): Promise<{
    success: boolean;
    state?: {
      project_settings: ProjectSettings;
      panels: unknown[];
      workflows?: unknown[];
      parameter_values?: Record<string, unknown>;
      selected_workflow_id?: string;
      render_nodes?: unknown[];
      comfy_url?: string;
      camera_angles?: Record<string, unknown>;
      deleted_images?: string[];
      saved_at: string;
    };
    error?: string;
  }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    
    if (!orchestratorUrl) {
      return { success: false, error: 'No Orchestrator URL configured' };
    }
    
    try {
      const response = await fetch(`${orchestratorUrl}/api/load-project`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_path: filePath }),
      });
      
      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }
      
      const result = await response.json();
      
      if (result.success && result.state) {
        // Update current project settings
        const settings = result.state.project_settings;
        this.currentProject = {
          ...DEFAULT_PROJECT,
          ...settings,
          created: new Date(settings.created),
          lastModified: new Date(settings.lastModified),
        };
        this.saveToStorage();
        
        return {
          success: true,
          state: result.state,
        };
      }
      
      return { success: false, error: result.message };
    } catch (error) {
      console.error('[ProjectManager] Failed to load project:', error);
      return { success: false, error: String(error) };
    }
  }
  
  /**
   * List available projects in a folder.
   */
  async listProjects(folderPath?: string): Promise<{
    success: boolean;
    projects: Array<{ path: string; name: string; saved_at: string; panel_count: number }>;
    error?: string;
  }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    const folder = folderPath || this.currentProject.path;
    
    if (!orchestratorUrl || !folder) {
      return { success: true, projects: [] };
    }
    
    try {
      const response = await fetch(
        `${orchestratorUrl}/api/list-projects?folder_path=${encodeURIComponent(folder)}`,
        { method: 'GET' }
      );
      
      if (!response.ok) {
        return { success: false, projects: [], error: `HTTP ${response.status}` };
      }
      
      const result = await response.json();
      return {
        success: result.success,
        projects: result.projects || [],
        error: result.message,
      };
    } catch (error) {
      console.error('[ProjectManager] Failed to list projects:', error);
      return { success: false, projects: [], error: String(error) };
    }
  }

  // ============================================================================
  // Phase 3: Scan Project Images Method
  // ============================================================================

  /**
   * Scan project folder for images matching the naming pattern.
   * Returns images grouped by panel number with metadata from sidecar JSONs.
   */
  async scanProjectImages(
    _onProgress?: (progress: ScanProgress) => void
  ): Promise<{
    success: boolean;
    imagesByPanel: Map<number, ProjectImageInfo[]>;
    maxPanelNumber: number;
    skippedFiles: string[];
    error?: string;
  }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    
    if (!orchestratorUrl) {
      return { 
        success: false, 
        imagesByPanel: new Map(),
        maxPanelNumber: 0,
        skippedFiles: [],
        error: 'No Orchestrator URL configured' 
      };
    }

    try {
      // Normalize Windows backslashes to forward slashes for JSON safety
      const normalizedPath = this.currentProject.path.replace(/\\/g, '/');
      const normalizedPattern = this.currentProject.namingTemplate.replace(/\\/g, '/');
      
      console.log('[ProjectManager] scanProjectImages - original path:', this.currentProject.path);
      console.log('[ProjectManager] scanProjectImages - normalized path:', normalizedPath);
      console.log('[ProjectManager] scanProjectImages - normalized pattern:', normalizedPattern);
      
      const request: ScanProjectImagesRequest = {
        folder_path: normalizedPath,
        naming_pattern: normalizedPattern,
        project_name: this.currentProject.name,
      };
      
      console.log('[ProjectManager] scanProjectImages - request:', JSON.stringify(request));

      const response = await fetch(`${orchestratorUrl}/api/scan-project-images`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      });

      if (!response.ok) {
        return { 
          success: false, 
          imagesByPanel: new Map(),
          maxPanelNumber: 0,
          skippedFiles: [],
          error: `HTTP ${response.status}` 
        };
      }

      const result: ScanProjectImagesResponse = await response.json();

      if (!result.success) {
        return { 
          success: false, 
          imagesByPanel: new Map(),
          maxPanelNumber: 0,
          skippedFiles: result.skipped_files || [],
          error: result.message 
        };
      }

      // Group images by panel number
      const imagesByPanel = new Map<number, ProjectImageInfo[]>();
      let maxPanelNumber = 0;

      for (const image of result.images) {
        if (!imagesByPanel.has(image.panel_number)) {
          imagesByPanel.set(image.panel_number, []);
        }
        imagesByPanel.get(image.panel_number)!.push(image);
        maxPanelNumber = Math.max(maxPanelNumber, image.panel_number);
      }

      // Sort each panel's images by version (ascending: v001, v002, v003...)
      imagesByPanel.forEach((images) => {
        images.sort((a, b) => a.version - b.version);
      });

      return {
        success: true,
        imagesByPanel,
        maxPanelNumber,
        skippedFiles: result.skipped_files || [],
      };
    } catch (error) {
      console.error('[ProjectManager] Failed to scan project images:', error);
      return { 
        success: false, 
        imagesByPanel: new Map(),
        maxPanelNumber: 0,
        skippedFiles: [],
        error: String(error) 
      };
    }
  }

  /**
   * Scan project folder for all panel subfolders (new approach).
   * Each subfolder is treated as a panel, and all images in it belong to that panel.
   * No naming pattern required - just scans all subfolders with images.
   */
  async scanProjectPanels(): Promise<{
    success: boolean;
    panels: PanelFolderInfo[];
    error?: string;
  }> {
    const orchestratorUrl = this.currentProject.orchestratorUrl;
    
    if (!orchestratorUrl) {
      return { 
        success: false, 
        panels: [],
        error: 'No Orchestrator URL configured' 
      };
    }

    if (!this.currentProject.path) {
      return { 
        success: false, 
        panels: [],
        error: 'No project path configured' 
      };
    }

    try {
      const normalizedPath = this.normalizePath(this.currentProject.path);
      
      console.log('[ProjectManager] scanProjectPanels - path:', normalizedPath);

      const response = await fetch(`${orchestratorUrl}/api/scan-project-panels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_path: normalizedPath }),
      });

      if (!response.ok) {
        return { 
          success: false, 
          panels: [],
          error: `HTTP ${response.status}` 
        };
      }

      const result: ScanProjectPanelsResponse = await response.json();
      console.log('[ProjectManager] scanProjectPanels - result:', result);

      if (!result.success) {
        return { 
          success: false, 
          panels: [],
          error: result.message 
        };
      }

      return {
        success: true,
        panels: result.panels,
      };
    } catch (error) {
      console.error('[ProjectManager] Failed to scan project panels:', error);
      return { 
        success: false, 
        panels: [],
        error: String(error) 
      };
    }
  }

  // ============================================================================
  // Phase 6: Delete Image Method
  // ============================================================================

  /**
   * Delete an image file and its JSON sidecar from the filesystem.
   */
  async deleteImage(imagePath: string): Promise<{
    success: boolean;
    deletedFiles: string[];
    error?: string;
  }> {
    // Use orchestratorUrl from project settings, fallback to default
    const orchestratorUrl = this.currentProject.orchestratorUrl || 'http://localhost:9820';
    
    console.log('[ProjectManager] deleteImage called with path:', imagePath);
    console.log('[ProjectManager] Using orchestratorUrl:', orchestratorUrl);

    try {
      const response = await fetch(`${orchestratorUrl}/api/delete-image`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image_path: imagePath }),
      });

      const result = await response.json();
      console.log('[ProjectManager] Delete API response:', result);
      
      return {
        success: result.success,
        deletedFiles: result.deleted_files || [],
        error: result.message,
      };
    } catch (error) {
      console.error('[ProjectManager] Failed to delete image:', error);
      return { success: false, deletedFiles: [], error: String(error) };
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const projectManager = new ProjectManager();

// React hook for project settings
export function useProjectSettings(): [ProjectSettings, (settings: Partial<ProjectSettings>) => void] {
  const [settings, setSettings] = useState<ProjectSettings>(projectManager.getProject());
  
  const updateSettings = useCallback((newSettings: Partial<ProjectSettings>) => {
    projectManager.setProject(newSettings);
    setSettings(projectManager.getProject());
  }, []);
  
  return [settings, updateSettings];
}
