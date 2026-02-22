/**
 * Breadcrumb — Horizontal breadcrumb navigation bar.
 *
 * Renders clickable path segments: Root > FolderA > SubFolder
 * Last segment is non-interactive (current location).
 */

import { ChevronRight, Home } from 'lucide-react';
import './components.css';

// =============================================================================
// Types
// =============================================================================

interface BreadcrumbProps {
  crumbs: { name: string; path: string }[];
  onNavigate: (path: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function Breadcrumb({ crumbs, onNavigate }: BreadcrumbProps) {
  if (crumbs.length === 0) return null;

  const lastIndex = crumbs.length - 1;

  return (
    <nav className="gallery-breadcrumb" aria-label="Folder breadcrumb">
      {crumbs.map((crumb, index) => {
        const isLast = index === lastIndex;
        const isRoot = index === 0;

        return (
          <span key={crumb.path} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            {/* Separator between segments */}
            {index > 0 && (
              <span className="gallery-breadcrumb-separator" aria-hidden="true">
                <ChevronRight size={12} />
              </span>
            )}

            {isLast ? (
              /* Last segment — non-interactive */
              <span className="gallery-breadcrumb-current">
                {isRoot && <Home size={13} />}
                {crumb.name}
              </span>
            ) : (
              /* Clickable segment */
              <button
                className="gallery-breadcrumb-segment"
                onClick={() => onNavigate(crumb.path)}
                type="button"
              >
                {isRoot && <Home size={13} />}
                {crumb.name}
              </button>
            )}
          </span>
        );
      })}
    </nav>
  );
}
