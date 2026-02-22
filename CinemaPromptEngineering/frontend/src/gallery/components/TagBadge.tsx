import { X } from 'lucide-react';
import type { TagInfo } from '../services/gallery-service';
import './components.css';

interface TagBadgeProps {
  tag: TagInfo;
  onRemove?: () => void;
  size?: 'small' | 'normal';
}

export function TagBadge({ tag, onRemove, size = 'normal' }: TagBadgeProps) {
  return (
    <span
      className={`tag-badge ${size === 'small' ? 'tag-badge--small' : ''}`}
      style={{
        backgroundColor: `${tag.color}20`,
        borderColor: `${tag.color}4D`,
        color: tag.color,
      }}
    >
      <span className="tag-badge-name">{tag.name}</span>
      {onRemove && (
        <button
          className="tag-badge-remove"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          aria-label={`Remove tag ${tag.name}`}
        >
          <X size={size === 'small' ? 8 : 10} />
        </button>
      )}
    </span>
  );
}
