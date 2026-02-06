/**
 * useFileBrowser - Custom hook for managing file browser state
 * Handles folder navigation, tree view state, and folder contents loading
 */

import { useState, useCallback, useRef, useEffect } from 'react';

// ============================================================================
// Types
// ============================================================================

export interface TreeNode {
  id: string;
  name: string;
  path: string;
  type: 'drive' | 'folder';
  children?: TreeNode[];
  isLoading?: boolean;
  isExpanded?: boolean;
}

export interface FolderItem {
  name: string;
  path: string;
  type: 'drive' | 'folder' | 'project';
  metadata?: ProjectMetadata;
}

export interface ProjectMetadata {
  name: string;
  savedAt: string;
  panelCount: number;
}

interface BrowseCombinedResponse {
  success: boolean;
  current: string;
  parent: string | null;
  items?: Array<{
    name: string;
    path: string;
    type: 'drive' | 'folder';
  }>;
  folders?: Array<{
    name: string;
    path: string;
    type: 'drive' | 'folder';
  }>;
  projects: Array<{
    name: string;
    path: string;
    saved_at: string;
    panel_count: number;
  }>;
  error?: string;
}

export interface FileBrowserState {
  currentPath: string;
  selectedItem: FolderItem | null;
  treeNodes: TreeNode[];
  folderContents: FolderItem[];
  isLoading: boolean;
  error: string | null;
  expandedPaths: Set<string>;
}

export interface UseFileBrowserReturn {
  state: FileBrowserState;
  navigateTo: (path: string) => Promise<void>;
  selectItem: (item: FolderItem) => void;
  expandTreeNode: (path: string) => Promise<void>;
  collapseTreeNode: (path: string) => void;
  refresh: () => Promise<void>;
  goToParent: () => Promise<void>;
  goToRoot: () => Promise<void>;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useFileBrowser(
  orchestratorUrl: string,
  initialPath: string = '',
  isOpen: boolean = true
): UseFileBrowserReturn {
  // -------------------------------------------------------------------------
  // State
  // -------------------------------------------------------------------------
  const [state, setState] = useState<FileBrowserState>({
    currentPath: initialPath,
    selectedItem: null,
    treeNodes: [],
    folderContents: [],
    isLoading: false,
    error: null,
    expandedPaths: new Set(),
  });

  // Cache for folder contents to avoid repeated API calls
  const folderCache = useRef<Map<string, FolderItem[]>>(new Map());

  // -------------------------------------------------------------------------
  // Helper: Fetch folder contents with caching
  // -------------------------------------------------------------------------
  const fetchFolderContents = useCallback(async (
    path: string,
    useCache = true
  ): Promise<{ items: FolderItem[]; parent: string | null }> => {
    if (useCache && folderCache.current.has(path)) {
      const cached = folderCache.current.get(path)!;
      return { items: cached, parent: null };
    }

    try {
      const response = await fetch(
        `${orchestratorUrl}/api/browse-folders?path=${encodeURIComponent(path)}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: BrowseCombinedResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to browse folder');
      }

      // Transform to FolderItems - API returns 'items', fallback to 'folders' for compatibility
      const folderData = data.items ?? data.folders ?? [];
      const items: FolderItem[] = [
        ...folderData.map((f) => ({ ...f, type: f.type as 'drive' | 'folder' })),
      ];

      // Fetch projects in a separate call if we have a valid folder
      if (data.current) {
        try {
          const projectsController = new AbortController();
          const projectsTimeoutId = setTimeout(() => projectsController.abort(), 10000); // 10 second timeout
          
          const projectsResponse = await fetch(
            `${orchestratorUrl}/api/list-projects?folder_path=${encodeURIComponent(data.current)}`,
            { 
              method: 'GET',
              signal: projectsController.signal
            }
          );
          
          clearTimeout(projectsTimeoutId);

          if (projectsResponse.ok) {
            const projectsData = await projectsResponse.json();
            if (projectsData.success && projectsData.projects) {
              const projectItems: FolderItem[] = projectsData.projects.map(
                (p: { name: string; path: string; saved_at: string; panel_count: number }) => ({
                  name: p.name,
                  path: p.path,
                  type: 'project' as const,
                  metadata: {
                    name: p.name,
                    savedAt: p.saved_at,
                    panelCount: p.panel_count,
                  },
                })
              );
              items.push(...projectItems);
            }
          }
        } catch (err) {
          console.warn('[useFileBrowser] Failed to fetch projects:', err);
        }
      }

      // Cache the result
      folderCache.current.set(path, items);

      return { items, parent: data.parent };
    } catch (error) {
      console.error('[useFileBrowser] Failed to fetch folder contents:', error);
      throw error;
    }
  }, [orchestratorUrl]);

  // -------------------------------------------------------------------------
  // Helper: Fetch tree children (for lazy loading)
  // -------------------------------------------------------------------------
  const fetchTreeChildren = useCallback(async (path: string): Promise<TreeNode[]> => {
    try {
      const response = await fetch(
        `${orchestratorUrl}/api/browse-folders?path=${encodeURIComponent(path)}`,
        { method: 'GET' }
      );

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: BrowseCombinedResponse = await response.json();

      if (!data.success) {
        throw new Error(data.error || 'Failed to browse folder');
      }

      // Only return folder children (not projects or drives at this level)
      const folderData = data.items ?? data.folders ?? [];
      return folderData
        .filter((f) => f.type === 'folder')
        .map((f) => ({
          id: f.path,
          name: f.name,
          path: f.path,
          type: 'folder' as const,
          children: undefined,
          isLoading: false,
          isExpanded: false,
        }));
    } catch (error) {
      console.error('[useFileBrowser] Failed to fetch tree children:', error);
      return [];
    }
  }, [orchestratorUrl]);

  // -------------------------------------------------------------------------
  // Navigate to a path
  // -------------------------------------------------------------------------
  const navigateTo = useCallback(async (path: string) => {
    setState((prev) => ({ ...prev, isLoading: true, error: null }));

    try {
      const { items } = await fetchFolderContents(path);

      setState((prev) => ({
        ...prev,
        currentPath: path,
        folderContents: items,
        isLoading: false,
        selectedItem: null,
      }));
    } catch (err) {
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: err instanceof Error ? err.message : 'Failed to navigate',
      }));
    }
  }, [fetchFolderContents]);

  // -------------------------------------------------------------------------
  // Select an item
  // -------------------------------------------------------------------------
  const selectItem = useCallback((item: FolderItem) => {
    setState((prev) => ({ ...prev, selectedItem: item }));
  }, []);

  // -------------------------------------------------------------------------
  // Expand a tree node (lazy load children)
  // -------------------------------------------------------------------------
  const expandTreeNode = useCallback(async (path: string) => {
    setState((prev) => {
      const newExpanded = new Set(prev.expandedPaths);
      newExpanded.add(path);
      return { ...prev, expandedPaths: newExpanded };
    });

    // Find the node and check if children are already loaded
    const findNode = (nodes: TreeNode[], targetPath: string): TreeNode | null => {
      for (const node of nodes) {
        if (node.path === targetPath) return node;
        if (node.children) {
          const found = findNode(node.children, targetPath);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(state.treeNodes, path);
    if (node && node.children && node.children.length > 0) {
      // Already loaded, just mark as expanded
      setState((prev) => {
        const updateNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((n) => {
            if (n.path === path) {
              return { ...n, isExpanded: true };
            }
            if (n.children) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        };
        return { ...prev, treeNodes: updateNode(prev.treeNodes) };
      });
      return;
    }

    // Mark node as loading
    setState((prev) => {
      const updateNode = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map((n) => {
          if (n.path === path) {
            return { ...n, isLoading: true };
          }
          if (n.children) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });
      };
      return { ...prev, treeNodes: updateNode(prev.treeNodes) };
    });

    try {
      const children = await fetchTreeChildren(path);

      setState((prev) => {
        const updateNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((n) => {
            if (n.path === path) {
              return {
                ...n,
                children,
                isLoading: false,
                isExpanded: true,
              };
            }
            if (n.children) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        };
        return { ...prev, treeNodes: updateNode(prev.treeNodes) };
      });
    } catch (err) {
      // Mark as not loading on error
      setState((prev) => {
        const updateNode = (nodes: TreeNode[]): TreeNode[] => {
          return nodes.map((n) => {
            if (n.path === path) {
              return { ...n, isLoading: false };
            }
            if (n.children) {
              return { ...n, children: updateNode(n.children) };
            }
            return n;
          });
        };
        return { ...prev, treeNodes: updateNode(prev.treeNodes) };
      });
    }
  }, [state.treeNodes, fetchTreeChildren]);

  // -------------------------------------------------------------------------
  // Collapse a tree node
  // -------------------------------------------------------------------------
  const collapseTreeNode = useCallback((path: string) => {
    setState((prev) => {
      const newExpanded = new Set(prev.expandedPaths);
      newExpanded.delete(path);

      const updateNode = (nodes: TreeNode[]): TreeNode[] => {
        return nodes.map((n) => {
          if (n.path === path) {
            return { ...n, isExpanded: false };
          }
          if (n.children) {
            return { ...n, children: updateNode(n.children) };
          }
          return n;
        });
      };

      return {
        ...prev,
        expandedPaths: newExpanded,
        treeNodes: updateNode(prev.treeNodes),
      };
    });
  }, []);

  // -------------------------------------------------------------------------
  // Refresh current folder
  // -------------------------------------------------------------------------
  const refresh = useCallback(async () => {
    folderCache.current.delete(state.currentPath);
    await navigateTo(state.currentPath);
  }, [state.currentPath, navigateTo]);

  // -------------------------------------------------------------------------
  // Go to parent folder
  // -------------------------------------------------------------------------
  const goToParent = useCallback(async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout
      
      const response = await fetch(
        `${orchestratorUrl}/api/browse-folders?path=${encodeURIComponent(state.currentPath)}`,
        { 
          method: 'GET',
          signal: controller.signal
        }
      );
      
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data: BrowseCombinedResponse = await response.json();

      if (data.success && data.parent) {
        await navigateTo(data.parent);
      }
    } catch (err) {
      console.error('[useFileBrowser] Failed to go to parent:', err);
    }
  }, [state.currentPath, orchestratorUrl, navigateTo]);

  // -------------------------------------------------------------------------
  // Go to root (drives list)
  // -------------------------------------------------------------------------
  const goToRoot = useCallback(async () => {
    await navigateTo('');
  }, [navigateTo]);

  // -------------------------------------------------------------------------
  // Initial load - fetch drives for tree view
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!isOpen) return;
    
    // Reset state when dialog opens
    folderCache.current.clear();
    
    setState({
      currentPath: initialPath,
      selectedItem: null,
      treeNodes: [],
      folderContents: [],
      isLoading: true,
      error: null,
      expandedPaths: new Set(),
    });

    const loadInitialDrives = async () => {
      try {
        const response = await fetch(
          `${orchestratorUrl}/api/browse-folders?path=`,
          { method: 'GET' }
        );

        if (!response.ok) {
          throw new Error(`HTTP ${response.status}`);
        }

        const data: BrowseCombinedResponse = await response.json();

        if (data.success) {
          const folderData = data.items ?? data.folders ?? [];
          const driveNodes: TreeNode[] = folderData
            .filter((f) => f.type === 'drive')
            .map((f) => ({
              id: f.path,
              name: f.name,
              path: f.path,
              type: 'drive',
              children: undefined,
              isLoading: false,
              isExpanded: false,
            }));

          setState((prev) => ({
            ...prev,
            isLoading: false,
            treeNodes: driveNodes,
            folderContents: folderData.map((f) => ({
              ...f,
              type: f.type as 'drive' | 'folder' | 'project',
            })),
          }));

          // If we have an initial path, navigate to it
          if (initialPath) {
            await navigateTo(initialPath);
          }
        } else {
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: data.error || 'Failed to load drives',
          }));
        }
      } catch (err) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error: err instanceof Error ? err.message : 'Failed to load drives',
        }));
      }
    };

    loadInitialDrives();
  }, [orchestratorUrl, isOpen, initialPath, navigateTo]);

  return {
    state,
    navigateTo,
    selectItem,
    expandTreeNode,
    collapseTreeNode,
    refresh,
    goToParent,
    goToRoot,
  };
}
