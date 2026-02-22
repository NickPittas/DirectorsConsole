/**
 * GalleryUI — Top-level layout shell for the Gallery tab.
 *
 * Three-column layout: FolderTree (left sidebar) | Main Content | DetailPanel (right, optional).
 * Orchestrates data loading and delegates rendering to child components.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGalleryStore } from './store/gallery-store';
import { FolderTree } from './components/FolderTree';
import { Breadcrumb } from './components/Breadcrumb';
import { GalleryToolbar } from './components/GalleryToolbar';
import { GalleryGrid } from './components/GalleryGrid';
import { GalleryList } from './components/GalleryList';
import { GalleryMasonry } from './components/GalleryMasonry';
import { FolderStats } from './components/FolderStats';
import * as galleryService from './services/gallery-service';
import type { FileEntry } from './services/gallery-service';
import { ContextMenu } from './components/ContextMenu';
import { RenameDialog } from './components/RenameDialog';
import { MoveDialog } from './components/MoveDialog';
import { BatchRenameDialog } from './components/BatchRenameDialog';
import { TrashBin } from './components/TrashBin';
import { DetailPanel } from './components/DetailPanel';
import { FilterBar } from './components/FilterBar';
import { SearchPanel } from './components/SearchPanel';
import { BatchBar } from './components/BatchBar';
import { GalleryLightbox } from './components/GalleryLightbox';
import { CompareView } from './components/CompareView';
import { TimelineView } from './components/TimelineView';
import { DuplicateFinder } from './components/DuplicateFinder';
import { trashFiles } from './services/gallery-service';
import { DropMoveDialog } from './components/DropMoveDialog';
import { MoveToNewFolderDialog } from './components/MoveToNewFolderDialog';
import { RefreshCw } from 'lucide-react';
import './GalleryUI.css';

// =============================================================================
// Props
// =============================================================================

interface GalleryUIProps {
  orchestratorUrl: string;
  projectPath: string;
  /** When false the component is mounted but hidden — skip heavy data loading */
  isActive?: boolean;
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Build breadcrumb entries from the current path relative to the project root.
 */
function buildBreadcrumbs(
  currentPath: string,
  projectPath: string,
): { name: string; path: string }[] {
  if (!currentPath || !projectPath) return [];

  const relative = currentPath.startsWith(projectPath)
    ? currentPath.slice(projectPath.length).replace(/^[/\\]/, '')
    : '';
  const parts = relative.split(/[/\\]/).filter(Boolean);
  const crumbs = [{ name: 'Root', path: projectPath }];

  let accumulated = projectPath;
  for (const part of parts) {
    accumulated = accumulated + '/' + part;
    crumbs.push({ name: part, path: accumulated });
  }
  return crumbs;
}

// =============================================================================
// Component
// =============================================================================

export function GalleryUI({ orchestratorUrl, projectPath, isActive = true }: GalleryUIProps) {
  const {
    folderTree,
    currentPath,
    isLoading,
    isLoadingFiles,
    error,
    showDetailPanel,
    viewMode,
    showTrashBin,
    setShowTrashBin,
    showSearchPanel,
    setShowSearchPanel,
    selectedFiles,
    currentFiles,
    detailFile,
    allTags,
    ratings,
    setFolderTree,
    setCurrentFiles,
    setCurrentPath,
    setBreadcrumbs,
    setAllTags,
    setRatings,
    setDetailFile,
    setShowDetailPanel,
    updateRating,
    setIsLoading,
    setIsLoadingFiles,
    setError,
    sortField,
    sortDirection,
    thumbnailSize,
    filterType,
    filterRating,
    filterTags,
    setViewMode,
    setSortField,
    setSortDirection,
    setThumbnailSize,
    setFilterType,
    setFilterRating,
    setFilterTags,
    resetGallery,
    lightboxFile,
    setLightboxFile,
    compareFiles,
    setCompareFiles,
    showDuplicateFinder,
    setShowDuplicateFinder,
    showTimeline,
  } = useGalleryStore();

  // Track the latest projectPath to avoid stale closures in async callbacks
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;

  // Dialog state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; file: FileEntry } | null>(null);
  const [renameTarget, setRenameTarget] = useState<FileEntry | null>(null);
  const [moveTargets, setMoveTargets] = useState<FileEntry[] | null>(null);
  const [batchRenameTargets, setBatchRenameTargets] = useState<FileEntry[] | null>(null);
  const [dropMoveTarget, setDropMoveTarget] = useState<{ filePaths: string[]; targetFolder: string } | null>(null);
  const [moveToNewFolderTargets, setMoveToNewFolderTargets] = useState<FileEntry[] | null>(null);

  // Sidebar resize state
  const [sidebarWidth, setSidebarWidth] = useState(250);
  const resizingRef = useRef(false);
  const folderLoadIdRef = useRef(0);

  // ---------------------------------------------------------------------------
  // Data loading
  // ---------------------------------------------------------------------------

  const loadFolderFiles = useCallback(async (folderPath: string) => {
    if (!orchestratorUrl || !projectPath) return;

    const loadId = ++folderLoadIdRef.current;
    setIsLoadingFiles(true);
    try {
      const result = await galleryService.scanFolder(orchestratorUrl, folderPath, projectPath);
      if (loadId !== folderLoadIdRef.current) return; // stale — user clicked another folder
      if (result.success) {
        setCurrentFiles(result.files);
      } else {
        setCurrentFiles([]);
      }
    } catch (err) {
      if (loadId !== folderLoadIdRef.current) return; // stale
      console.warn('Failed to load folder files:', err);
      setCurrentFiles([]);
    } finally {
      if (loadId === folderLoadIdRef.current) {
        setIsLoadingFiles(false);
      }
    }
  }, [orchestratorUrl, projectPath, setCurrentFiles, setIsLoadingFiles]);

  const loadGalleryData = useCallback(async () => {
    if (!projectPath || !orchestratorUrl) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fire lightweight requests in parallel — NO full recursive scan
      const [treeResult, ratingsResult, tagsResult, viewResult] = await Promise.all([
        galleryService.scanTree(orchestratorUrl, projectPath),
        galleryService.getRatings(orchestratorUrl, projectPath).catch(() => ({ success: false, ratings: {} })),
        galleryService.listTags(orchestratorUrl, projectPath).catch(() => ({ success: false, tags: [] })),
        galleryService.getView(orchestratorUrl, projectPath).catch(() => null),
      ]);

      // Guard against stale response if projectPath changed mid-flight
      if (projectPathRef.current !== projectPath) return;

      if (treeResult.success) {
        setFolderTree(treeResult.folders);
      }

      if (ratingsResult.success) {
        setRatings(ratingsResult.ratings);
      }
      if (tagsResult.success) {
        setAllTags(tagsResult.tags);
      }

      // Restore view state
      let restoredPath = '';
      if (viewResult?.success && viewResult.view) {
        const v = viewResult.view;
        if (v.view_mode) setViewMode(v.view_mode as 'grid' | 'list' | 'masonry');
        if (v.sort_field) setSortField(v.sort_field as 'name' | 'modified' | 'created' | 'size' | 'type' | 'rating');
        if (v.sort_direction) setSortDirection(v.sort_direction as 'asc' | 'desc');
        if (v.thumbnail_size) setThumbnailSize(v.thumbnail_size);
        if (v.current_path) {
          restoredPath = v.current_path;
          setCurrentPath(v.current_path);
          setBreadcrumbs(buildBreadcrumbs(v.current_path, projectPath));
        }
        if (v.filters_json) {
          try {
            const filters = JSON.parse(v.filters_json);
            if (filters.filterType) setFilterType(filters.filterType);
            if (filters.filterRating !== undefined) setFilterRating(filters.filterRating);
            if (filters.filterTags) setFilterTags(filters.filterTags);
          } catch { /* ignore */ }
        }
      }

      // If no saved path was restored, set the store to project root
      if (!restoredPath) {
        setCurrentPath(projectPath);
        setBreadcrumbs(buildBreadcrumbs(projectPath, projectPath));
      }
      // Now load files for the active folder (restored path or project root)
      const activePath = restoredPath || projectPath;
      await loadFolderFiles(activePath);

    } catch (err) {
      if (projectPathRef.current === projectPath) {
        setError(err instanceof Error ? err.message : 'Failed to load gallery data');
      }
    } finally {
      if (projectPathRef.current === projectPath) {
        setIsLoading(false);
      }
    }
  }, [
    orchestratorUrl,
    projectPath,
    loadFolderFiles,
    setFolderTree,
    setCurrentFiles,
    setRatings,
    setAllTags,
    setIsLoading,
    setError,
    setCurrentPath,
    setBreadcrumbs,
    setViewMode,
    setSortField,
    setSortDirection,
    setThumbnailSize,
    setFilterType,
    setFilterRating,
    setFilterTags,
  ]);

  // Track which projectPath we already loaded so we don't re-fetch on every
  // tab switch when the project hasn't changed.
  const loadedProjectRef = useRef<string>('');

  // Load data when the tab becomes active with a new project, or the very
  // first time the tab is activated.  Switching away and back to the Gallery
  // tab re-uses the already-loaded data.
  useEffect(() => {
    if (!isActive) return;               // tab hidden — do nothing
    if (!projectPath) return;            // no project configured yet

    // Already loaded for this project — nothing to do
    if (loadedProjectRef.current === projectPath) return;

    resetGallery();
    loadedProjectRef.current = projectPath;
    setIsLoading(true); // Set immediately so loading overlay shows (resetGallery clears it)
    loadGalleryData();
  }, [projectPath, isActive]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---------------------------------------------------------------------------
  // Auto-save view state (debounced)
  // ---------------------------------------------------------------------------

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isActive || !projectPath || !orchestratorUrl) return;

    // Clear previous timer
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      galleryService.saveView(orchestratorUrl, {
        project_path: projectPath,
        name: 'default',
        view_mode: viewMode,
        sort_field: sortField,
        sort_direction: sortDirection,
        thumbnail_size: thumbnailSize,
        filters_json: JSON.stringify({
          filterType,
          filterRating,
          filterTags,
        }),
        current_path: currentPath || '',
        folder_tree_state: '{}',
      }).catch(() => {
        // Silent failure — view state persistence is best-effort
      });
    }, 1500);

    return () => {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
      }
    };
  }, [
    orchestratorUrl,
    projectPath,
    viewMode,
    sortField,
    sortDirection,
    thumbnailSize,
    filterType,
    filterRating,
    filterTags,
    currentPath,
  ]);

  // ---------------------------------------------------------------------------
  // Folder navigation
  // ---------------------------------------------------------------------------

  const handleNavigateFolder = useCallback(
    (folderPath: string) => {
      setCurrentPath(folderPath);
      setBreadcrumbs(buildBreadcrumbs(folderPath, projectPath));
      loadFolderFiles(folderPath);
    },
    [projectPath, setCurrentPath, setBreadcrumbs, loadFolderFiles],
  );

  // ---------------------------------------------------------------------------
  // Refresh
  // ---------------------------------------------------------------------------

  const handleRefresh = useCallback(async () => {
    if (!projectPath || !orchestratorUrl) return;
    const activePath = useGalleryStore.getState().currentPath || projectPath;
    // Lightweight refresh: re-scan tree structure + reload current folder files only
    try {
      const treeResult = await galleryService.scanTree(orchestratorUrl, projectPath);
      if (treeResult.success) {
        setFolderTree(treeResult.folders);
      }
      await loadFolderFiles(activePath);
    } catch (err) {
      console.warn('Refresh failed:', err);
    }
  }, [orchestratorUrl, projectPath, loadFolderFiles, setFolderTree]);

  // ---------------------------------------------------------------------------
  // Folder drop (drag files from gallery grid onto folder tree items)
  // ---------------------------------------------------------------------------

  const handleDropFilesToFolder = useCallback(
    (filePaths: string[], targetFolder: string) => {
      // If the dragged file is in the selection, move all selected files
      const draggedPath = filePaths[0];
      const pathsToMove = selectedFiles.has(draggedPath)
        ? Array.from(selectedFiles)
        : filePaths;
      setDropMoveTarget({ filePaths: pathsToMove, targetFolder });
    },
    [selectedFiles],
  );

  const handleDropMoveComplete = useCallback(() => {
    setDropMoveTarget(null);
    handleRefresh();
  }, [handleRefresh]);

  const handleDropMoveClose = useCallback(() => {
    setDropMoveTarget(null);
  }, []);

  const handleCreateFolder = useCallback(
    async (parentPath: string, folderName: string) => {
      try {
        const result = await galleryService.createFolder(orchestratorUrl, parentPath, folderName);
        if (result.success) {
          // Ensure the parent folder is expanded so the new subfolder is visible
          const { expandedFolders } = useGalleryStore.getState();
          if (!expandedFolders.has(parentPath)) {
            useGalleryStore.getState().toggleFolder(parentPath);
          }
          // Lightweight refresh — only re-scan the folder tree, no loading overlay.
          const treeResult = await galleryService.scanTree(orchestratorUrl, projectPath);
          if (treeResult.success) {
            setFolderTree(treeResult.folders);
          }
        }
      } catch (err) {
        console.error('Failed to create folder:', err);
      }
    },
    [orchestratorUrl, projectPath, setFolderTree],
  );

  // Context menu handler
  const handleContextMenu = useCallback(
    (e: React.MouseEvent, file: FileEntry) => {
      e.preventDefault();
      setContextMenu({ x: e.clientX, y: e.clientY, file });
    },
    [],
  );

  // Resolve selected file paths to FileEntry objects
  const resolveSelectedFiles = useCallback(
    (contextFile: FileEntry): FileEntry[] => {
      if (selectedFiles.has(contextFile.path) && selectedFiles.size > 1) {
        return currentFiles.filter((f) => selectedFiles.has(f.path));
      }
      return [contextFile];
    },
    [selectedFiles, currentFiles],
  );

  const handleTrashFiles = useCallback(
    async (files: FileEntry[]) => {
      try {
        await trashFiles(orchestratorUrl, files.map((f) => f.path), projectPath);
        handleRefresh();
      } catch {
        // Error handling could be improved in future
      }
    },
    [orchestratorUrl, projectPath, handleRefresh],
  );

  // ---------------------------------------------------------------------------
  // Dismiss error
  // ---------------------------------------------------------------------------

  const handleDismissError = useCallback(() => {
    setError(null);
  }, [setError]);

  // ---------------------------------------------------------------------------
  // Detail panel handlers
  // ---------------------------------------------------------------------------

  const handleCloseDetail = useCallback(() => {
    setShowDetailPanel(false);
    setDetailFile(null);
  }, [setShowDetailPanel, setDetailFile]);

  const handleRatingChange = useCallback(
    async (relPath: string, newRating: number) => {
      // Optimistic update in store
      updateRating(relPath, newRating);
      // Persist to backend
      try {
        await galleryService.setRatings(orchestratorUrl, projectPath, { [relPath]: newRating });
      } catch {
        // Revert on failure could be added later
      }
    },
    [orchestratorUrl, projectPath, updateRating],
  );

  const handleTagsChange = useCallback(
    async (relPath: string, tagIds: number[], action: 'add' | 'remove') => {
      try {
        await galleryService.updateFileTags(orchestratorUrl, projectPath, relPath, tagIds, action);
        // Refresh to get updated tags
        handleRefresh();
      } catch {
        // Error handling could be improved
      }
    },
    [orchestratorUrl, projectPath, handleRefresh],
  );

  const handleCreateTag = useCallback(
    async (name: string, color: string) => {
      try {
        const result = await galleryService.createTag(orchestratorUrl, projectPath, name, color);
        if (result.success) {
          // Refresh tags list
          const tagsResult = await galleryService.listTags(orchestratorUrl, projectPath);
          if (tagsResult.success) {
            setAllTags(tagsResult.tags);
          }
        }
      } catch {
        // Error handling
      }
    },
    [orchestratorUrl, projectPath, setAllTags],
  );

  // Search result handler — navigate to the file's folder and select it
  const handleSearchResult = useCallback(
    async (filePath: string) => {
      // Extract the folder path from the file path
      const sep = filePath.includes('\\') ? '\\' : '/';
      const parts = filePath.split(sep);
      parts.pop(); // remove filename
      const folderPath = parts.join(sep) || projectPath;

      // Navigate to the folder and wait for files to load
      setCurrentPath(folderPath);
      setBreadcrumbs(buildBreadcrumbs(folderPath, projectPath));
      await loadFolderFiles(folderPath);

      // Read fresh store state after files have loaded
      const { selectFile, clearSelection, currentFiles: freshFiles } = useGalleryStore.getState();
      clearSelection();
      selectFile(filePath);

      // Open detail panel for the file
      const file = freshFiles.find((f: FileEntry) => f.path === filePath);
      if (file) {
        setDetailFile(file);
        setShowDetailPanel(true);
      }

      // Close search panel
      setShowSearchPanel(false);
    },
    [projectPath, loadFolderFiles, setCurrentPath, setBreadcrumbs, setDetailFile, setShowDetailPanel, setShowSearchPanel],
  );

  // Batch move handler — opens the move dialog for the given paths
  const handleBatchMove = useCallback(
    (filePaths: string[]) => {
      const files = currentFiles.filter((f) => filePaths.includes(f.path));
      if (files.length > 0) {
        setMoveTargets(files);
      }
    },
    [currentFiles],
  );

  // Batch trash handler
  const handleBatchTrash = useCallback(
    (filePaths: string[]) => {
      const files = currentFiles.filter((f) => filePaths.includes(f.path));
      if (files.length > 0) {
        handleTrashFiles(files);
      }
    },
    [currentFiles, handleTrashFiles],
  );

  // Lightbox: open on double-click (called from grid/list/masonry)
  const handleOpenLightbox = useCallback(
    (file: FileEntry) => {
      setLightboxFile(file);
    },
    [setLightboxFile],
  );

  const handleLightboxNavigate = useCallback(
    (file: FileEntry) => {
      setLightboxFile(file);
    },
    [setLightboxFile],
  );

  // Compare handler — opens compare view with the given files
  const handleCompare = useCallback(
    (_files: FileEntry[]) => {
      const resolved = currentFiles.filter((f) => selectedFiles.has(f.path));
      if (resolved.length >= 2) {
        setCompareFiles(resolved.slice(0, 2));
      }
    },
    [currentFiles, selectedFiles, setCompareFiles],
  );

  // Batch compare handler — resolves file paths to FileEntry objects
  const handleBatchCompare = useCallback(
    (filePaths: string[]) => {
      const files = currentFiles.filter((f) => filePaths.includes(f.path));
      if (files.length >= 2) {
        setCompareFiles(files.slice(0, 2));
      }
    },
    [currentFiles, setCompareFiles],
  );

  // Duplicate finder trash handler
  const handleDuplicateTrash = useCallback(
    async (filePaths: string[]) => {
      try {
        await trashFiles(orchestratorUrl, filePaths, projectPath);
        setShowDuplicateFinder(false);
        handleRefresh();
      } catch {
        // Error handling
      }
    },
    [orchestratorUrl, projectPath, setShowDuplicateFinder, handleRefresh],
  );

  // Update detail panel when selection changes and panel is open
  useEffect(() => {
    if (showDetailPanel && selectedFiles.size === 1) {
      const selectedPath = Array.from(selectedFiles)[0];
      const file = currentFiles.find((f) => f.path === selectedPath);
      if (file && file.path !== detailFile?.path) {
        setDetailFile(file);
      }
    }
  }, [selectedFiles, showDetailPanel, currentFiles, detailFile?.path, setDetailFile]);

  // ---------------------------------------------------------------------------
  // Keyboard shortcuts
  // ---------------------------------------------------------------------------

  useEffect(() => {
    function handleGalleryKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      // Skip when focus is on form elements (inputs, textareas, selects)
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.tagName === 'SELECT' ||
        target.isContentEditable
      ) {
        return;
      }
      // Skip when ANY dialog/modal overlay is open — these are rendered via
      // createPortal into document.body, so keyboard events on their children
      // still bubble to document. Without this guard, pressing Backspace/Delete
      // while a batch-rename dialog is open trashes the selected files.
      const backdrop = document.querySelector(
        '.gallery-batch-rename-backdrop, .gallery-move-overlay, .gallery-rename-backdrop, ' +
        '.gallery-lightbox-backdrop, .compare-view-backdrop, .dup-finder-backdrop, .gallery-trash-backdrop'
      );
      if (backdrop) {
        // Only allow Escape through so dialogs can close themselves
        if (e.key !== 'Escape') return;
      }

      const isMod = e.ctrlKey || e.metaKey;

      // Escape — close overlays in priority order, then deselect
      if (e.key === 'Escape') {
        const state = useGalleryStore.getState();
        if (state.lightboxFile) {
          state.setLightboxFile(null);
        } else if (state.compareFiles) {
          state.setCompareFiles(null);
        } else if (state.showDuplicateFinder) {
          state.setShowDuplicateFinder(false);
        } else if (state.showSearchPanel) {
          state.setShowSearchPanel(false);
        } else if (state.showDetailPanel) {
          state.setShowDetailPanel(false);
          state.setDetailFile(null);
        } else if (state.showTrashBin) {
          state.setShowTrashBin(false);
        } else if (state.selectedFiles.size > 0) {
          state.clearSelection();
        }
        return;
      }

      // Delete / Backspace — trash selected
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const state = useGalleryStore.getState();
        if (state.selectedFiles.size > 0) {
          e.preventDefault();
          const filesToTrash = currentFiles.filter((f) => state.selectedFiles.has(f.path));
          if (filesToTrash.length > 0) {
            handleTrashFiles(filesToTrash);
          }
        }
        return;
      }

      // Ctrl+A — select all
      if (isMod && e.key === 'a') {
        e.preventDefault();
        const { selectAll: selectAllFn } = useGalleryStore.getState();
        selectAllFn(currentFiles.map((f) => f.path));
        return;
      }

      // Ctrl+D — deselect all
      if (isMod && e.key === 'd') {
        e.preventDefault();
        useGalleryStore.getState().clearSelection();
        return;
      }

      // Ctrl+F — toggle search
      if (isMod && e.key === 'f') {
        e.preventDefault();
        const state = useGalleryStore.getState();
        state.setShowSearchPanel(!state.showSearchPanel);
        return;
      }

      // Ctrl+I — toggle detail panel
      if (isMod && e.key === 'i') {
        e.preventDefault();
        const state = useGalleryStore.getState();
        if (state.showDetailPanel) {
          state.setShowDetailPanel(false);
          state.setDetailFile(null);
        } else if (state.selectedFiles.size === 1) {
          const selectedPath = Array.from(state.selectedFiles)[0];
          const file = currentFiles.find((f) => f.path === selectedPath);
          if (file) {
            state.setDetailFile(file);
            state.setShowDetailPanel(true);
          }
        }
        return;
      }

      // Enter — open lightbox for single selected file
      if (e.key === 'Enter') {
        const state = useGalleryStore.getState();
        if (state.selectedFiles.size === 1) {
          const selectedPath = Array.from(state.selectedFiles)[0];
          const file = currentFiles.find((f) => f.path === selectedPath);
          if (file) {
            state.setLightboxFile(file);
          }
        }
        return;
      }

      // Arrow navigation
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) {
        e.preventDefault();
        const state = useGalleryStore.getState();
        if (currentFiles.length === 0) return;

        // Find current index
        let currentIndex = -1;
        if (state.lastSelectedFile) {
          currentIndex = currentFiles.findIndex((f) => f.path === state.lastSelectedFile);
        }

        let nextIndex = 0;
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          nextIndex = currentIndex < currentFiles.length - 1 ? currentIndex + 1 : 0;
        } else {
          nextIndex = currentIndex > 0 ? currentIndex - 1 : currentFiles.length - 1;
        }

        state.clearSelection();
        state.selectFile(currentFiles[nextIndex].path);
        return;
      }

      // 0-5 — set rating
      if (!isMod && e.key >= '0' && e.key <= '5') {
        const rating = parseInt(e.key, 10);
        const state = useGalleryStore.getState();
        if (state.selectedFiles.size > 0) {
          state.selectedFiles.forEach((filePath) => {
            const file = currentFiles.find((f) => f.path === filePath);
            if (file) {
              handleRatingChange(file.rel_path, rating);
            }
          });
        }
        return;
      }

      // T — toggle timeline
      if (!isMod && (e.key === 't' || e.key === 'T')) {
        const state = useGalleryStore.getState();
        state.setShowTimeline(!state.showTimeline);
        return;
      }
    }

    document.addEventListener('keydown', handleGalleryKeyDown);
    return () => document.removeEventListener('keydown', handleGalleryKeyDown);
  }, [currentFiles, handleTrashFiles, handleRatingChange]);

  // ---------------------------------------------------------------------------
  // Sidebar resize
  // (Must be above the early return to keep hook count stable across renders)
  // ---------------------------------------------------------------------------

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    resizingRef.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;

    function onMouseMove(ev: MouseEvent) {
      if (!resizingRef.current) return;
      const delta = ev.clientX - startX;
      const newWidth = Math.max(180, Math.min(400, startWidth + delta));
      setSidebarWidth(newWidth);
    }

    function onMouseUp() {
      resizingRef.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    }

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  // ---------------------------------------------------------------------------
  // Empty project guard
  // ---------------------------------------------------------------------------

  if (!projectPath) {
    return (
      <div className="gallery-ui">
        <div className="gallery-empty-state">
          Open a project in Storyboard to browse the gallery
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="gallery-ui">
      {/* Left sidebar — Folder tree */}
      <aside className="gallery-sidebar" style={{ width: sidebarWidth }}>
        <div className="gallery-sidebar-header">
          <span className="gallery-sidebar-title">Folders</span>
          <button
            className="gallery-sidebar-refresh-btn"
            onClick={handleRefresh}
            title="Refresh folder tree"
            type="button"
          >
            <RefreshCw size={14} />
          </button>
        </div>
        <div className="gallery-sidebar-content">
          <FolderTree
            folders={folderTree}
            currentPath={currentPath}
            projectPath={projectPath}
            onNavigate={handleNavigateFolder}
            onDropFiles={handleDropFilesToFolder}
            onCreateFolder={handleCreateFolder}
          />
        </div>
      </aside>

      {/* Resize handle between sidebar and main content */}
      <div
        className="gallery-sidebar-resize-handle"
        onMouseDown={handleResizeStart}
      />

      {/* Main content area */}
      <section className="gallery-main">
        {/* Toolbar + Breadcrumbs */}
        <div className="gallery-toolbar-area">
          <GalleryToolbar
            onRefresh={handleRefresh}
            orchestratorUrl={orchestratorUrl}
            projectPath={projectPath}
          />
          <Breadcrumb
            crumbs={buildBreadcrumbs(currentPath || projectPath, projectPath)}
            onNavigate={handleNavigateFolder}
          />
          <FolderStats
            orchestratorUrl={orchestratorUrl}
            folderPath={currentPath || projectPath}
          />
          <FilterBar />
        </div>

        {/* Search panel (floating) */}
        {showSearchPanel && (
          <div className="gallery-search-panel-anchor">
            <SearchPanel
              orchestratorUrl={orchestratorUrl}
              projectPath={projectPath}
              currentPath={currentPath || projectPath}
              onSelectResult={handleSearchResult}
              onClose={() => setShowSearchPanel(false)}
            />
          </div>
        )}

        {/* Error banner */}
        {error && (
          <div className="gallery-error-banner">
            <span>{error}</span>
            <button
              className="gallery-error-dismiss"
              onClick={handleDismissError}
              aria-label="Dismiss error"
            >
              &times;
            </button>
          </div>
        )}

        {/* Content area with loading overlay */}
        <div className="gallery-content">
          {(isLoading || isLoadingFiles) && (
            <div className="gallery-loading-overlay">
              <div className="spinner" />
            </div>
          )}
          {showTimeline ? (
            <TimelineView
              files={currentFiles}
              orchestratorUrl={orchestratorUrl}
              onSelectFile={handleOpenLightbox}
            />
          ) : viewMode === 'list' ? (
            <GalleryList
              orchestratorUrl={orchestratorUrl}
              projectPath={projectPath}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleOpenLightbox}
            />
          ) : viewMode === 'masonry' ? (
            <GalleryMasonry
              orchestratorUrl={orchestratorUrl}
              projectPath={projectPath}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleOpenLightbox}
            />
          ) : (
            <GalleryGrid
              orchestratorUrl={orchestratorUrl}
              projectPath={projectPath}
              onContextMenu={handleContextMenu}
              onDoubleClick={handleOpenLightbox}
            />
          )}
          <BatchBar
            orchestratorUrl={orchestratorUrl}
            projectPath={projectPath}
            totalFiles={currentFiles.length}
            allFilePaths={currentFiles.map((f) => f.path)}
            onMove={handleBatchMove}
            onTrash={handleBatchTrash}
            onCompare={handleBatchCompare}
            onRefresh={handleRefresh}
          />
        </div>
      </section>

      {/* Right panel — Detail */}
      {showDetailPanel && detailFile && (
        <aside className="gallery-detail-panel">
          <DetailPanel
            file={detailFile}
            orchestratorUrl={orchestratorUrl}
            projectPath={projectPath}
            rating={ratings[detailFile.rel_path] ?? 0}
            fileTags={detailFile.tags ?? []}
            allTags={allTags}
            onRatingChange={handleRatingChange}
            onTagsChange={handleTagsChange}
            onClose={handleCloseDetail}
            onCreateTag={handleCreateTag}
          />
        </aside>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          file={contextMenu.file}
          selectedFiles={selectedFiles}
          onClose={() => setContextMenu(null)}
          onOpen={handleOpenLightbox}
          onRename={(file) => {
            setContextMenu(null);
            setRenameTarget(file);
          }}
          onMove={(files) => {
            setContextMenu(null);
            setMoveTargets(resolveSelectedFiles(files[0]));
          }}
          onMoveToNewFolder={(files) => {
            setContextMenu(null);
            setMoveToNewFolderTargets(resolveSelectedFiles(files[0]));
          }}
          onBatchRename={(files) => {
            setContextMenu(null);
            setBatchRenameTargets(resolveSelectedFiles(files[0]));
          }}
          onTrash={(files) => {
            setContextMenu(null);
            handleTrashFiles(resolveSelectedFiles(files[0]));
          }}
          onCompare={(files) => {
            setContextMenu(null);
            handleCompare(files);
          }}
          onInfo={(file) => {
            setContextMenu(null);
            setDetailFile(file);
            setShowDetailPanel(true);
          }}
        />
      )}

      {/* Rename Dialog */}
      {renameTarget && (
        <RenameDialog
          file={renameTarget}
          orchestratorUrl={orchestratorUrl}
          projectPath={projectPath}
          onClose={() => setRenameTarget(null)}
          onRenamed={handleRefresh}
        />
      )}

      {/* Move Dialog */}
      {moveTargets && (
        <MoveDialog
          files={moveTargets}
          orchestratorUrl={orchestratorUrl}
          projectPath={projectPath}
          folderTree={folderTree}
          onClose={() => setMoveTargets(null)}
          onMoved={handleRefresh}
        />
      )}

      {/* Move to New Folder Dialog */}
      {moveToNewFolderTargets && (
        <MoveToNewFolderDialog
          files={moveToNewFolderTargets}
          currentFolder={currentPath || projectPath}
          orchestratorUrl={orchestratorUrl}
          projectPath={projectPath}
          onMoved={() => {
            setMoveToNewFolderTargets(null);
            handleRefresh();
          }}
          onClose={() => setMoveToNewFolderTargets(null)}
        />
      )}

      {/* Batch Rename Dialog */}
      {batchRenameTargets && (
        <BatchRenameDialog
          files={batchRenameTargets}
          orchestratorUrl={orchestratorUrl}
          projectPath={projectPath}
          onClose={() => setBatchRenameTargets(null)}
          onRenamed={handleRefresh}
        />
      )}

      {/* Trash Bin */}
      {showTrashBin && (
        <TrashBin
          orchestratorUrl={orchestratorUrl}
          projectPath={projectPath}
          onClose={() => setShowTrashBin(false)}
          onRestored={handleRefresh}
        />
      )}

      {/* Drop Move Dialog — shown when files are dropped onto a folder */}
      {dropMoveTarget && (
        <DropMoveDialog
          filePaths={dropMoveTarget.filePaths}
          targetFolder={dropMoveTarget.targetFolder}
          orchestratorUrl={orchestratorUrl}
          projectPath={projectPath}
          onMoved={handleDropMoveComplete}
          onClose={handleDropMoveClose}
        />
      )}

      {/* Lightbox */}
      {lightboxFile && (
        <GalleryLightbox
          file={lightboxFile}
          files={currentFiles}
          orchestratorUrl={orchestratorUrl}
          onClose={() => setLightboxFile(null)}
          onNavigate={handleLightboxNavigate}
        />
      )}

      {/* Compare View */}
      {compareFiles && compareFiles.length >= 2 && (
        <CompareView
          files={compareFiles}
          orchestratorUrl={orchestratorUrl}
          onClose={() => setCompareFiles(null)}
        />
      )}

      {/* Duplicate Finder */}
      {showDuplicateFinder && (
        <DuplicateFinder
          orchestratorUrl={orchestratorUrl}
          projectPath={projectPath}
          currentPath={currentPath || projectPath}
          onClose={() => setShowDuplicateFinder(false)}
          onTrash={handleDuplicateTrash}
        />
      )}
    </div>
  );
}
