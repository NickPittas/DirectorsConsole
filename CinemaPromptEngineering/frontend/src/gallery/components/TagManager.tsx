import { useState, useCallback, useRef, useEffect } from 'react';
import { Plus, Check, Palette } from 'lucide-react';
import type { TagInfo } from '../services/gallery-service';
import './components.css';

interface TagManagerProps {
  allTags: TagInfo[];
  fileTags: TagInfo[];
  orchestratorUrl: string;
  projectPath: string;
  onAddTag: (tagId: number) => void;
  onCreateTag: (name: string, color: string) => void;
}

const PRESET_COLORS = [
  '#ef4444', // red
  '#f97316', // orange
  '#eab308', // yellow
  '#22c55e', // green
  '#06b6d4', // cyan
  '#3b82f6', // blue
  '#8b5cf6', // purple
  '#ec4899', // pink
];

export function TagManager({
  allTags,
  fileTags,
  orchestratorUrl: _orchestratorUrl,
  projectPath: _projectPath,
  onAddTag,
  onCreateTag,
}: TagManagerProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [newTagColor, setNewTagColor] = useState('#3b82f6');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on click outside
  useEffect(() => {
    if (!showDropdown) return;

    function handleMouseDown(e: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setShowDropdown(false);
        setShowCreateForm(false);
      }
    }

    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [showDropdown]);

  const availableTags = allTags.filter(
    (t) => !fileTags.some((ft) => ft.id === t.id)
  );

  const handleAddTag = useCallback(
    (tagId: number) => {
      onAddTag(tagId);
      setShowDropdown(false);
      setShowCreateForm(false);
    },
    [onAddTag]
  );

  const handleCreate = useCallback(() => {
    const trimmed = newTagName.trim();
    if (!trimmed) return;
    onCreateTag(trimmed, newTagColor);
    setNewTagName('');
    setShowCreateForm(false);
  }, [newTagName, newTagColor, onCreateTag]);

  const handleToggleDropdown = useCallback(() => {
    setShowDropdown((prev) => {
      if (prev) {
        setShowCreateForm(false);
      }
      return !prev;
    });
  }, []);

  const handleKeyDownInput = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        handleCreate();
      }
    },
    [handleCreate]
  );

  return (
    <div className="tag-manager" ref={dropdownRef}>
      <button
        className="tag-manager-trigger"
        onClick={handleToggleDropdown}
        type="button"
      >
        <Plus size={14} />
        Add tag...
      </button>

      {showDropdown && (
        <div className="tag-manager-dropdown">
          {availableTags.length === 0 && !showCreateForm && (
            <div className="tag-manager-empty">All tags assigned</div>
          )}

          {availableTags.map((tag) => (
            <button
              key={tag.id}
              className="tag-manager-tag-row"
              onClick={() => handleAddTag(tag.id)}
              type="button"
            >
              <span
                className="tag-manager-tag-dot"
                style={{ backgroundColor: tag.color }}
              />
              <span className="tag-manager-tag-name">{tag.name}</span>
            </button>
          ))}

          {!showCreateForm ? (
            <button
              className="tag-manager-create-btn"
              onClick={() => setShowCreateForm(true)}
              type="button"
            >
              <Palette size={14} />
              Create new tag
            </button>
          ) : (
            <div className="tag-manager-create-section">
              <input
                className="tag-manager-input"
                type="text"
                placeholder="Tag name"
                value={newTagName}
                onChange={(e) => setNewTagName(e.target.value)}
                onKeyDown={handleKeyDownInput}
                autoFocus
              />
              <div className="tag-manager-color-swatches">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    className={`tag-manager-color-swatch${
                      newTagColor === color ? ' tag-manager-color-swatch--selected' : ''
                    }`}
                    style={{ backgroundColor: color }}
                    onClick={() => setNewTagColor(color)}
                    type="button"
                    aria-label={`Select color ${color}`}
                  />
                ))}
              </div>
              <button
                className="tag-manager-submit-btn"
                onClick={handleCreate}
                disabled={newTagName.trim().length === 0}
                type="button"
              >
                <Check size={14} />
                Create
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
