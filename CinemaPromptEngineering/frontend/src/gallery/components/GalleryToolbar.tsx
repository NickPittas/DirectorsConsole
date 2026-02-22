/**
 * GalleryToolbar — View controls, sort, filter, and action buttons.
 *
 * All view-state changes flow through the gallery Zustand store.
 */

import { useCallback } from 'react';
import { useGalleryStore } from '../store/gallery-store';
import {
  Grid,
  List,
  LayoutGrid,
  SortAsc,
  SortDesc,
  RefreshCw,
  Filter,
  Image,
  Film,
  Star,
  Trash2,
  Search,
  Info,
} from 'lucide-react';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface GalleryToolbarProps {
  onRefresh: () => void;
  orchestratorUrl: string;
  projectPath: string;
}

// =============================================================================
// Constants
// =============================================================================

const SORT_OPTIONS: { value: GalleryToolbarSortField; label: string }[] = [
  { value: 'name', label: 'Name' },
  { value: 'modified', label: 'Modified' },
  { value: 'created', label: 'Created' },
  { value: 'size', label: 'Size' },
  { value: 'type', label: 'Type' },
  { value: 'rating', label: 'Rating' },
];

const SECONDARY_SORT_OPTIONS: { value: GalleryToolbarSecondarySortField; label: string }[] = [
  { value: 'none', label: '— None —' },
  { value: 'name', label: 'Name' },
  { value: 'modified', label: 'Modified' },
  { value: 'created', label: 'Created' },
  { value: 'size', label: 'Size' },
  { value: 'type', label: 'Type' },
  { value: 'rating', label: 'Rating' },
];

type GalleryToolbarSortField = 'name' | 'modified' | 'created' | 'size' | 'type' | 'rating';
type GalleryToolbarSecondarySortField = GalleryToolbarSortField | 'none';

// =============================================================================
// Component
// =============================================================================

export function GalleryToolbar({ onRefresh }: GalleryToolbarProps) {
  const {
    viewMode,
    setViewMode,
    thumbnailSize,
    setThumbnailSize,
    sortField,
    setSortField,
    sortDirection,
    setSortDirection,
    secondarySortField,
    setSecondarySortField,
    secondarySortDirection,
    setSecondarySortDirection,
    filterType,
    setFilterType,
    filterRating,
    setFilterRating,
    showTrashBin,
    setShowTrashBin,
    showSearchPanel,
    setShowSearchPanel,
    showDetailPanel,
    setShowDetailPanel,
    setDetailFile,
    selectedFiles,
  } = useGalleryStore();

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleSortFieldChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSortField(e.target.value as GalleryToolbarSortField);
    },
    [setSortField],
  );

  const handleToggleSortDirection = useCallback(() => {
    setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
  }, [sortDirection, setSortDirection]);

  const handleSecondarySortFieldChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setSecondarySortField(e.target.value as GalleryToolbarSecondarySortField);
    },
    [setSecondarySortField],
  );

  const handleToggleSecondarySortDirection = useCallback(() => {
    setSecondarySortDirection(secondarySortDirection === 'asc' ? 'desc' : 'asc');
  }, [secondarySortDirection, setSecondarySortDirection]);

  const handleThumbnailSlider = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setThumbnailSize(Number(e.target.value));
    },
    [setThumbnailSize],
  );

  const handleStarClick = useCallback(
    (star: number) => {
      // Clicking the same star again clears the filter
      setFilterRating(filterRating === star ? 0 : star);
    },
    [filterRating, setFilterRating],
  );

  const handleToggleDetailPanel = useCallback(() => {
    if (showDetailPanel) {
      setShowDetailPanel(false);
      setDetailFile(null);
    } else {
      // When opening, set the detail file to the currently selected file
      if (selectedFiles.size === 1) {
        const store = useGalleryStore.getState();
        const currentFiles = store.currentFiles;
        const selectedPath = Array.from(selectedFiles)[0];
        const file = currentFiles.find((f) => f.path === selectedPath);
        if (file) {
          setDetailFile(file);
        }
      }
      setShowDetailPanel(true);
    }
  }, [showDetailPanel, setShowDetailPanel, setDetailFile, selectedFiles]);

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function viewBtn(
    mode: 'grid' | 'list' | 'masonry',
    icon: React.ReactNode,
    title: string,
  ) {
    return (
      <button
        className={`gallery-toolbar-btn${viewMode === mode ? ' gallery-toolbar-btn--active' : ''}`}
        onClick={() => setViewMode(mode)}
        title={title}
        type="button"
      >
        {icon}
      </button>
    );
  }

  function filterBtn(
    type: 'all' | 'image' | 'video',
    icon: React.ReactNode,
    title: string,
  ) {
    return (
      <button
        className={`gallery-toolbar-btn${filterType === type ? ' gallery-toolbar-btn--active' : ''}`}
        onClick={() => setFilterType(type)}
        title={title}
        type="button"
      >
        {icon}
      </button>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="gallery-toolbar">
      {/* View mode */}
      <div className="gallery-toolbar-group">
        {viewBtn('grid', <Grid size={15} />, 'Grid view')}
        {viewBtn('list', <List size={15} />, 'List view')}
        {viewBtn('masonry', <LayoutGrid size={15} />, 'Masonry view')}
      </div>

      <div className="gallery-toolbar-separator" />

      {/* Thumbnail size slider */}
      <div className="gallery-toolbar-group" style={{ gap: '6px' }}>
        <span className="gallery-toolbar-label">Size</span>
        <input
          className="gallery-thumbnail-slider"
          type="range"
          min={80}
          max={400}
          value={thumbnailSize}
          onChange={handleThumbnailSlider}
          title={`Thumbnail size: ${thumbnailSize}px`}
        />
      </div>

      <div className="gallery-toolbar-separator" />

      {/* Sort */}
      <div className="gallery-toolbar-group" style={{ gap: '4px' }}>
        <select
          className="gallery-toolbar-select"
          value={sortField}
          onChange={handleSortFieldChange}
          title="Sort by"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <button
          className="gallery-toolbar-btn"
          onClick={handleToggleSortDirection}
          title={`Sort ${sortDirection === 'asc' ? 'ascending' : 'descending'}`}
          type="button"
        >
          {sortDirection === 'asc' ? <SortAsc size={15} /> : <SortDesc size={15} />}
        </button>
        <span className="gallery-toolbar-label" style={{ marginLeft: '4px' }}>then</span>
        <select
          className="gallery-toolbar-select"
          value={secondarySortField}
          onChange={handleSecondarySortFieldChange}
          title="Secondary sort"
        >
          {SECONDARY_SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {secondarySortField !== 'none' && (
          <button
            className="gallery-toolbar-btn"
            onClick={handleToggleSecondarySortDirection}
            title={`Secondary sort ${secondarySortDirection === 'asc' ? 'ascending' : 'descending'}`}
            type="button"
          >
            {secondarySortDirection === 'asc' ? <SortAsc size={15} /> : <SortDesc size={15} />}
          </button>
        )}
      </div>

      <div className="gallery-toolbar-separator" />

      {/* Filter type */}
      <div className="gallery-toolbar-group">
        {filterBtn('all', <Filter size={15} />, 'Show all')}
        {filterBtn('image', <Image size={15} />, 'Images only')}
        {filterBtn('video', <Film size={15} />, 'Videos only')}
      </div>

      {/* Star rating filter */}
      <div className="gallery-toolbar-star-filter" title="Minimum rating filter">
        {[1, 2, 3, 4, 5].map((star) => (
          <span
            key={star}
            className={`gallery-toolbar-star${star <= filterRating ? ' gallery-toolbar-star--filled' : ''}`}
            onClick={() => handleStarClick(star)}
          >
            <Star size={14} fill={star <= filterRating ? '#f5c542' : 'none'} />
          </span>
        ))}
      </div>

      <div className="gallery-toolbar-separator" />

      {/* Actions */}
      <div className="gallery-toolbar-group">
        <button
          className="gallery-toolbar-btn"
          onClick={onRefresh}
          title="Refresh"
          type="button"
        >
          <RefreshCw size={15} />
        </button>
        <button
          className={`gallery-toolbar-btn${showSearchPanel ? ' gallery-toolbar-btn--active' : ''}`}
          title="Search"
          type="button"
          onClick={() => setShowSearchPanel(!showSearchPanel)}
        >
          <Search size={15} />
        </button>
        <button
          className={`gallery-toolbar-btn${showTrashBin ? ' gallery-toolbar-btn--active' : ''}`}
          onClick={() => setShowTrashBin(!showTrashBin)}
          title="Toggle trash bin"
          type="button"
        >
          <Trash2 size={15} />
        </button>
        <button
          className={`gallery-toolbar-btn${showDetailPanel ? ' gallery-toolbar-btn--active' : ''}`}
          onClick={handleToggleDetailPanel}
          title="Toggle detail panel (Ctrl+I)"
          type="button"
        >
          <Info size={15} />
        </button>
      </div>

      {/* Selection count */}
      {selectedFiles.size > 0 && (
        <span className="gallery-toolbar-selection-count">
          {selectedFiles.size} selected
        </span>
      )}
    </div>
  );
}
