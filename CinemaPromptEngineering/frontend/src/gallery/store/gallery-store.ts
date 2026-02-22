/** Zustand store for Gallery tab state */

import { create } from 'zustand';
import type { FileEntry, TreeFolderEntry, TagInfo } from '../services/gallery-service';

// =============================================================================
// Store Types
// =============================================================================

interface GalleryStore {
  // View State
  viewMode: 'grid' | 'list' | 'masonry';
  sortField: 'name' | 'modified' | 'created' | 'size' | 'type' | 'rating';
  sortDirection: 'asc' | 'desc';
  secondarySortField: 'name' | 'modified' | 'created' | 'size' | 'type' | 'rating' | 'none';
  secondarySortDirection: 'asc' | 'desc';
  thumbnailSize: number;
  groupByFolder: boolean;

  // Navigation
  currentPath: string;
  folderTree: TreeFolderEntry[];
  currentFiles: FileEntry[];
  expandedFolders: Set<string>;
  breadcrumbs: { name: string; path: string }[];

  // Selection
  selectedFiles: Set<string>;
  lastSelectedFile: string | null;

  // Filtering
  filterType: 'all' | 'image' | 'video';
  filterRating: number;
  filterTags: number[];
  searchQuery: string;

  // Data
  allTags: TagInfo[];
  ratings: Record<string, number>;
  isLoading: boolean;
  isLoadingFiles: boolean;
  error: string | null;

  // Detail Panel
  detailFile: FileEntry | null;
  showDetailPanel: boolean;

  // Trash
  showTrashBin: boolean;

  // Search Panel
  showSearchPanel: boolean;

  // Lightbox
  lightboxFile: FileEntry | null;

  // Compare
  compareFiles: FileEntry[] | null;

  // Duplicate Finder
  showDuplicateFinder: boolean;

  // Timeline mode (replaces main content area)
  showTimeline: boolean;

  // View State Actions
  setViewMode: (mode: 'grid' | 'list' | 'masonry') => void;
  setSortField: (field: 'name' | 'modified' | 'created' | 'size' | 'type' | 'rating') => void;
  setSortDirection: (dir: 'asc' | 'desc') => void;
  setSecondarySortField: (field: 'name' | 'modified' | 'created' | 'size' | 'type' | 'rating' | 'none') => void;
  setSecondarySortDirection: (dir: 'asc' | 'desc') => void;
  setThumbnailSize: (size: number) => void;
  setGroupByFolder: (v: boolean) => void;

  // Navigation Actions
  setCurrentPath: (path: string) => void;
  setFolderTree: (folders: TreeFolderEntry[]) => void;
  setCurrentFiles: (files: FileEntry[]) => void;
  toggleFolder: (path: string) => void;
  setBreadcrumbs: (crumbs: { name: string; path: string }[]) => void;

  // Selection Actions
  selectFile: (path: string) => void;
  deselectFile: (path: string) => void;
  toggleFileSelection: (path: string) => void;
  selectAll: (paths: string[]) => void;
  clearSelection: () => void;

  // Filter Actions
  setFilterType: (type: 'all' | 'image' | 'video') => void;
  setFilterRating: (rating: number) => void;
  setFilterTags: (ids: number[]) => void;
  setSearchQuery: (query: string) => void;

  // Data Actions
  setAllTags: (tags: TagInfo[]) => void;
  setRatings: (ratings: Record<string, number>) => void;
  updateRating: (path: string, rating: number) => void;
  setIsLoading: (v: boolean) => void;
  setIsLoadingFiles: (v: boolean) => void;
  setError: (e: string | null) => void;

  // Detail Panel Actions
  setDetailFile: (file: FileEntry | null) => void;
  setShowDetailPanel: (v: boolean) => void;

  // Trash Actions
  setShowTrashBin: (v: boolean) => void;

  // Search Panel Actions
  setShowSearchPanel: (v: boolean) => void;

  // Lightbox Actions
  setLightboxFile: (file: FileEntry | null) => void;

  // Compare Actions
  setCompareFiles: (files: FileEntry[] | null) => void;

  // Duplicate Finder Actions
  setShowDuplicateFinder: (v: boolean) => void;

  // Timeline Actions
  setShowTimeline: (v: boolean) => void;

  // Reset
  resetGallery: () => void;
}

// =============================================================================
// Store Implementation
// =============================================================================

export const useGalleryStore = create<GalleryStore>((set) => ({
  // View State
  viewMode: 'grid',
  sortField: 'name',
  sortDirection: 'asc',
  secondarySortField: 'none',
  secondarySortDirection: 'asc',
  thumbnailSize: 200,
  groupByFolder: false,

  // Navigation
  currentPath: '',
  folderTree: [],
  currentFiles: [],
  expandedFolders: new Set<string>(),
  breadcrumbs: [],

  // Selection
  selectedFiles: new Set<string>(),
  lastSelectedFile: null,

  // Filtering
  filterType: 'all',
  filterRating: 0,
  filterTags: [],
  searchQuery: '',

  // Data
  allTags: [],
  ratings: {},
  isLoading: false,
  isLoadingFiles: false,
  error: null,

  // Detail Panel
  detailFile: null,
  showDetailPanel: false,

  // Trash
  showTrashBin: false,

  // Search Panel
  showSearchPanel: false,

  // Lightbox
  lightboxFile: null,

  // Compare
  compareFiles: null,

  // Duplicate Finder
  showDuplicateFinder: false,

  // Timeline
  showTimeline: false,

  // View State Actions
  setViewMode: (mode) => set({ viewMode: mode }),
  setSortField: (field) => set({ sortField: field }),
  setSortDirection: (dir) => set({ sortDirection: dir }),
  setSecondarySortField: (field) => set({ secondarySortField: field }),
  setSecondarySortDirection: (dir) => set({ secondarySortDirection: dir }),
  setThumbnailSize: (size) => set({ thumbnailSize: size }),
  setGroupByFolder: (v) => set({ groupByFolder: v }),

  // Navigation Actions
  setCurrentPath: (path) => set({ currentPath: path }),
  setFolderTree: (folders) => set({ folderTree: folders }),
  setCurrentFiles: (files) => set({ currentFiles: files }),
  toggleFolder: (path) =>
    set((state) => {
      const next = new Set(state.expandedFolders);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { expandedFolders: next };
    }),
  setBreadcrumbs: (crumbs) => set({ breadcrumbs: crumbs }),

  // Selection Actions
  selectFile: (path) =>
    set((state) => {
      const next = new Set(state.selectedFiles);
      next.add(path);
      return { selectedFiles: next, lastSelectedFile: path };
    }),
  deselectFile: (path) =>
    set((state) => {
      const next = new Set(state.selectedFiles);
      next.delete(path);
      return { selectedFiles: next };
    }),
  toggleFileSelection: (path) =>
    set((state) => {
      const next = new Set(state.selectedFiles);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return { selectedFiles: next, lastSelectedFile: path };
    }),
  selectAll: (paths) => set({ selectedFiles: new Set(paths) }),
  clearSelection: () => set({ selectedFiles: new Set<string>(), lastSelectedFile: null }),

  // Filter Actions
  setFilterType: (type) => set({ filterType: type }),
  setFilterRating: (rating) => set({ filterRating: rating }),
  setFilterTags: (ids) => set({ filterTags: ids }),
  setSearchQuery: (query) => set({ searchQuery: query }),

  // Data Actions
  setAllTags: (tags) => set({ allTags: tags }),
  setRatings: (ratings) => set({ ratings }),
  updateRating: (path, rating) =>
    set((state) => ({
      ratings: { ...state.ratings, [path]: rating },
    })),
  setIsLoading: (v) => set({ isLoading: v }),
  setIsLoadingFiles: (v) => set({ isLoadingFiles: v }),
  setError: (e) => set({ error: e }),

  // Detail Panel Actions
  setDetailFile: (file) => set({ detailFile: file }),
  setShowDetailPanel: (v) => set({ showDetailPanel: v }),

  // Trash Actions
  setShowTrashBin: (v) => set({ showTrashBin: v }),

  // Search Panel Actions
  setShowSearchPanel: (v) => set({ showSearchPanel: v }),

  // Lightbox Actions
  setLightboxFile: (file) => set({ lightboxFile: file }),

  // Compare Actions
  setCompareFiles: (files) => set({ compareFiles: files }),

  // Duplicate Finder Actions
  setShowDuplicateFinder: (v) => set({ showDuplicateFinder: v }),

  // Timeline Actions
  setShowTimeline: (v) => set({ showTimeline: v }),

  // Reset
  resetGallery: () =>
    set({
      viewMode: 'grid',
      sortField: 'name',
      sortDirection: 'asc',
      secondarySortField: 'none' as const,
      secondarySortDirection: 'asc' as const,
      thumbnailSize: 200,
      groupByFolder: false,
      currentPath: '',
      folderTree: [],
      currentFiles: [],
      expandedFolders: new Set<string>(),
      breadcrumbs: [],
      selectedFiles: new Set<string>(),
      lastSelectedFile: null,
      filterType: 'all',
      filterRating: 0,
      filterTags: [],
      searchQuery: '',
      allTags: [],
      ratings: {},
      isLoading: false,
      isLoadingFiles: false,
      error: null,
      detailFile: null,
      showDetailPanel: false,
      showTrashBin: false,
      showSearchPanel: false,
      lightboxFile: null,
      compareFiles: null,
      showDuplicateFinder: false,
      showTimeline: false,
    }),
}));
