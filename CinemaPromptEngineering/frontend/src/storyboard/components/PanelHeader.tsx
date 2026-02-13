import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Lock, GripVertical, X } from 'lucide-react';
import './PanelHeader.css';

interface PanelHeaderProps {
  panelId: number;
  name: string;
  locked: boolean;
  selected?: boolean;
  onNameChange: (newName: string) => void;
  onRemove: () => void;
  onMouseDown?: (e: React.MouseEvent) => void;
  dragHandleListeners?: Record<string, (e: React.SyntheticEvent) => void>;
}

export function PanelHeader({
  panelId,
  name,
  locked,
  selected = false,
  onNameChange,
  onRemove,
  onMouseDown,
  dragHandleListeners = {},
}: PanelHeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(name);
  const inputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Update edit value when name prop changes
  useEffect(() => {
    setEditValue(name);
  }, [name]);

  const handleDoubleClick = () => {
    if (!locked) {
      setIsEditing(true);
    }
  };

  const handleConfirm = () => {
    const sanitized = sanitizePanelName(editValue);
    if (sanitized && sanitized !== name) {
      onNameChange(sanitized);
    }
    setIsEditing(false);
    setEditValue(sanitized || name);
  };

  const handleCancel = () => {
    setEditValue(name);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleConfirm();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  };

  const handleBlur = () => {
    handleConfirm();
  };

  return (
    <div 
      className={`panel-header ${selected ? 'selected' : ''}`}
      onMouseDown={onMouseDown}
    >
      {/* Drag Handle */}
      <div 
        className="panel-drag-handle"
        title={t('storyboard.panel.dragToMove')}
        {...dragHandleListeners}
      >
        <GripVertical size={16} />
      </div>

      {/* Panel Name */}
      <div className="panel-name-container">
        {isEditing ? (
          <input
            ref={inputRef}
            type="text"
            className="panel-name-input"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            placeholder={`Panel_${String(panelId).padStart(2, '0')}`}
            maxLength={30}
          />
        ) : (
          <span 
            className={`panel-name ${locked ? 'locked' : 'editable'}`}
            onDoubleClick={handleDoubleClick}
            title={locked ? t('storyboard.panel.lockedTitle') : t('storyboard.panel.renameTitle')}
          >
            {name}
          </span>
        )}
        
        {locked && (
          <Lock size={12} className="panel-lock-icon" />
        )}
      </div>

      {/* Actions */}
      <div className="panel-header-actions">
        <button 
          className="panel-remove-btn"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          title={t('storyboard.panel.removeTitle')}
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

/**
 * Sanitize panel name for safe filesystem use.
 * Removes special characters and path separators.
 */
function sanitizePanelName(name: string): string {
  // Remove/replace invalid filename characters
  return name
    .replace(/[<>:"\/\\|?*]/g, '_')  // Invalid Windows filename chars
    .replace(/\.\./g, '_')              // Prevent path traversal
    .replace(/^\s+|\s+$/g, '')          // Trim whitespace
    .substring(0, 30);                  // Limit length
}

export default PanelHeader;
