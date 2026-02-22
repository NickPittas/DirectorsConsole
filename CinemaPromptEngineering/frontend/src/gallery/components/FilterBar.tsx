import { X } from 'lucide-react';
import { useGalleryStore } from '../store/gallery-store';
import type { TagInfo } from '../services/gallery-service';
import './components.css';

export function FilterBar() {
  const filterType = useGalleryStore((s) => s.filterType);
  const filterRating = useGalleryStore((s) => s.filterRating);
  const filterTags = useGalleryStore((s) => s.filterTags);
  const searchQuery = useGalleryStore((s) => s.searchQuery);
  const allTags = useGalleryStore((s) => s.allTags);

  const setFilterType = useGalleryStore((s) => s.setFilterType);
  const setFilterRating = useGalleryStore((s) => s.setFilterRating);
  const setFilterTags = useGalleryStore((s) => s.setFilterTags);
  const setSearchQuery = useGalleryStore((s) => s.setSearchQuery);

  const hasType = filterType !== 'all';
  const hasRating = filterRating > 0;
  const hasTags = filterTags.length > 0;
  const hasSearch = searchQuery.trim().length > 0;
  const hasAnyFilter = hasType || hasRating || hasTags || hasSearch;

  if (!hasAnyFilter) return null;

  const tagMap = new Map<number, TagInfo>();
  for (const tag of allTags) {
    tagMap.set(tag.id, tag);
  }

  function removeTag(tagId: number) {
    setFilterTags(filterTags.filter((id) => id !== tagId));
  }

  function clearAll() {
    setFilterType('all');
    setFilterRating(0);
    setFilterTags([]);
    setSearchQuery('');
  }

  return (
    <div className="filter-bar">
      {hasType && (
        <span className="filter-bar-chip">
          <span className="filter-bar-chip-label">
            {filterType === 'image' ? 'Images only' : 'Videos only'}
          </span>
          <button
            className="filter-bar-chip-remove"
            onClick={() => setFilterType('all')}
            title="Remove type filter"
          >
            <X size={12} />
          </button>
        </span>
      )}

      {hasRating && (
        <span className="filter-bar-chip">
          <span className="filter-bar-chip-label">
            {'\u2265'} {filterRating}{'\u2605'}
          </span>
          <button
            className="filter-bar-chip-remove"
            onClick={() => setFilterRating(0)}
            title="Remove rating filter"
          >
            <X size={12} />
          </button>
        </span>
      )}

      {filterTags.map((tagId) => {
        const tag = tagMap.get(tagId);
        if (!tag) return null;
        return (
          <span
            key={tagId}
            className="filter-bar-chip filter-bar-chip--tag"
            style={{ borderColor: tag.color }}
          >
            <span
              className="filter-bar-chip-dot"
              style={{ background: tag.color }}
            />
            <span className="filter-bar-chip-label">{tag.name}</span>
            <button
              className="filter-bar-chip-remove"
              onClick={() => removeTag(tagId)}
              title={`Remove tag "${tag.name}"`}
            >
              <X size={12} />
            </button>
          </span>
        );
      })}

      {hasSearch && (
        <span className="filter-bar-chip">
          <span className="filter-bar-chip-label">
            &ldquo;{searchQuery}&rdquo;
          </span>
          <button
            className="filter-bar-chip-remove"
            onClick={() => setSearchQuery('')}
            title="Remove search filter"
          >
            <X size={12} />
          </button>
        </span>
      )}

      <button className="filter-bar-clear-all" onClick={clearAll}>
        Clear all
      </button>
    </div>
  );
}
