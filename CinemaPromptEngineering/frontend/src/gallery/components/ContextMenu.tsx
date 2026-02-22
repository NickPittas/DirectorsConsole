import { useEffect, useRef, useCallback, useState } from 'react';
import { createPortal } from 'react-dom';
import { ExternalLink, Pencil, FolderInput, FolderPlus, Files, Copy, ClipboardCopy, Trash2, Columns, Info, ImagePlus, Workflow, ChevronRight } from 'lucide-react';
import type { FileEntry } from '../services/gallery-service';

interface ContextMenuProps {
  x: number;
  y: number;
  file: FileEntry;
  selectedFiles: Set<string>;
  onClose: () => void;
  onOpen?: (file: FileEntry) => void;
  onRename: (file: FileEntry) => void;
  onMove: (files: FileEntry[]) => void;
  onMoveToNewFolder: (files: FileEntry[]) => void;
  onBatchRename: (files: FileEntry[]) => void;
  onTrash: (files: FileEntry[]) => void;
  onCompare: (files: FileEntry[]) => void;
  onInfo: (file: FileEntry) => void;
}

export function ContextMenu({
  x,
  y,
  file,
  selectedFiles,
  onClose,
  onOpen,
  onRename,
  onMove,
  onMoveToNewFolder,
  onBatchRename,
  onTrash,
  onCompare,
  onInfo,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<{ left: number; top: number }>({ left: x, top: y });

  // Submenu state for "Send to Storyboard"
  const [submenuParams, setSubmenuParams] = useState<{
    name: string;
    display_name: string;
    type: string;
    filled: boolean;
  }[]>([]);
  const [showSubmenu, setShowSubmenu] = useState(false);
  const [submenuError, setSubmenuError] = useState<string | null>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const submenuRef = useRef<HTMLDivElement>(null);

  const isFileInSelection = selectedFiles.has(file.path);
  const targetFiles: FileEntry[] = isFileInSelection ? [file] : [file];
  // When multi-selected, the actual file objects aren't available here —
  // we only have the Set<string> of paths. For operations that need FileEntry[],
  // we pass `file` as representative. The parent component should resolve
  // full FileEntry objects from the paths. For single-target operations we
  // just use the right-clicked file.
  const multiCount = isFileInSelection ? selectedFiles.size : 1;
  const isMulti = multiCount > 1;
  const isSingle = multiCount === 1;

  // Viewport-clamp after first render
  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;

    const rect = menu.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let adjustedX = x;
    let adjustedY = y;

    if (x + rect.width > vw) {
      adjustedX = vw - rect.width - 4;
    }
    if (y + rect.height > vh) {
      adjustedY = vh - rect.height - 4;
    }
    if (adjustedX < 0) adjustedX = 4;
    if (adjustedY < 0) adjustedY = 4;

    if (adjustedX !== position.left || adjustedY !== position.top) {
      setPosition({ left: adjustedX, top: adjustedY });
    }
  }, [x, y]); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on outside click
  const handleOutsideClick = useCallback(
    (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    },
    [onClose],
  );

  // Close on Escape
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    },
    [onClose],
  );

  // Close on scroll
  const handleScroll = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    document.addEventListener('mousedown', handleOutsideClick, true);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleOutsideClick, true);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [handleOutsideClick, handleKeyDown, handleScroll]);

  function handleOpen() {
    onOpen?.(file);
    onClose();
  }

  function handleRename() {
    onRename(file);
    onClose();
  }

  function handleMove() {
    onMove(targetFiles);
    onClose();
  }

  function handleMoveToNewFolder() {
    onMoveToNewFolder(targetFiles);
    onClose();
  }

  function handleBatchRename() {
    onBatchRename(targetFiles);
    onClose();
  }

  function handleCopyPath() {
    navigator.clipboard.writeText(file.path).catch(() => {
      // clipboard write may fail silently in some contexts
    });
    onClose();
  }

  function handleCopyFilename() {
    navigator.clipboard.writeText(file.name).catch(() => {
      // clipboard write may fail silently in some contexts
    });
    onClose();
  }

  function handleTrash() {
    onTrash(targetFiles);
    onClose();
  }

  function handleCompare() {
    onCompare(targetFiles);
    onClose();
  }

  function handleInfo() {
    onInfo(file);
    onClose();
  }

  const requestImageParams = useCallback(() => {
    // Listen for Storyboard's response
    function onResponse(e: Event) {
      const detail = (e as CustomEvent).detail as {
        params: { name: string; display_name: string; type: string; filled: boolean }[];
        error?: string;
      };
      window.removeEventListener('gallery:image-params-response', onResponse);
      if (detail.error) {
        setSubmenuError(detail.error);
        setSubmenuParams([]);
      } else if (detail.params.length === 0) {
        setSubmenuError('No image/video inputs in current workflow');
        setSubmenuParams([]);
      } else {
        setSubmenuError(null);
        setSubmenuParams(detail.params);
      }
      setShowSubmenu(true);
    }
    window.addEventListener('gallery:image-params-response', onResponse);
    // Fire request
    window.dispatchEvent(new CustomEvent('gallery:request-image-params'));
    // Timeout fallback — if Storyboard doesn't respond within 500ms
    setTimeout(() => {
      window.removeEventListener('gallery:image-params-response', onResponse);
      // Only set error if submenu not already showing
      setShowSubmenu(prev => {
        if (!prev) {
          setSubmenuError('Storyboard not available');
          setSubmenuParams([]);
          return true;
        }
        return prev;
      });
    }, 500);
  }, []);

  const handleSubmenuItemClick = useCallback((paramName: string) => {
    window.dispatchEvent(new CustomEvent('gallery:send-reference-image', {
      detail: { filePath: file.path, targetParam: paramName }
    }));
    onClose();
  }, [file.path, onClose]);

  const handleSubmenuEnter = useCallback(() => {
    if (submenuTimerRef.current) {
      clearTimeout(submenuTimerRef.current);
      submenuTimerRef.current = null;
    }
  }, []);

  const handleSubmenuLeave = useCallback(() => {
    submenuTimerRef.current = setTimeout(() => {
      setShowSubmenu(false);
    }, 300);
  }, []);

  function handleUseWorkflow() {
    window.dispatchEvent(new CustomEvent('gallery:restore-workflow-from-metadata', {
      detail: { filePath: file.path }
    }));
    onClose();
  }

  const isMediaFile = /\.(png|jpe?g|webp|bmp|tiff?|mp4|mov|avi|webm|mkv)$/i.test(file.name);
  const isPng = file.name.toLowerCase().endsWith('.png');

  const menu = (
    <div
      ref={menuRef}
      className="gallery-context-menu"
      style={{ position: 'fixed', left: position.left, top: position.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {isMulti && (
        <div className="gallery-context-menu-header">
          {multiCount} files selected
        </div>
      )}

      <button
        className="gallery-context-menu-item"
        onClick={handleOpen}
        disabled={isMulti}
      >
        <ExternalLink size={14} className="gallery-context-menu-icon" />
        <span>Open</span>
      </button>

      <button
        className="gallery-context-menu-item"
        onClick={handleCompare}
        disabled={multiCount !== 2}
        title={multiCount !== 2 ? 'Select exactly 2 files to compare' : undefined}
      >
        <Columns size={14} className="gallery-context-menu-icon" />
        <span>Compare</span>
      </button>

      <button
        className="gallery-context-menu-item"
        onClick={handleInfo}
        disabled={isMulti}
      >
        <Info size={14} className="gallery-context-menu-icon" />
        <span>Info</span>
      </button>

      {(isMediaFile || isPng) && (
        <>
          <div className="gallery-context-menu-separator" />

          {isMediaFile && (
            <div
              className="gallery-context-submenu-wrapper"
              onMouseEnter={() => {
                handleSubmenuEnter();
                if (!showSubmenu) requestImageParams();
              }}
              onMouseLeave={handleSubmenuLeave}
            >
              <button
                className="gallery-context-menu-item"
                onClick={() => {
                  if (!showSubmenu) requestImageParams();
                }}
                disabled={isMulti}
                title="Set as reference image/video in Storyboard"
              >
                <ImagePlus size={14} className="gallery-context-menu-icon" />
                <span>Send to Storyboard</span>
                <ChevronRight size={12} style={{ marginLeft: 'auto', opacity: 0.5 }} />
              </button>

              {showSubmenu && !isMulti && (
                <div
                  ref={submenuRef}
                  className="gallery-context-submenu"
                  onMouseEnter={handleSubmenuEnter}
                  onMouseLeave={handleSubmenuLeave}
                >
                  {submenuError ? (
                    <div className="gallery-context-submenu-empty">
                      {submenuError}
                    </div>
                  ) : submenuParams.length === 0 ? (
                    <div className="gallery-context-submenu-empty">
                      Loading...
                    </div>
                  ) : (
                    submenuParams.map(p => (
                      <button
                        key={p.name}
                        className="gallery-context-menu-item gallery-context-submenu-item"
                        onClick={() => handleSubmenuItemClick(p.name)}
                        title={`Set "${p.display_name}" to this ${file.type}`}
                      >
                        <span className={`gallery-context-submenu-type gallery-context-submenu-type--${p.type.includes('video') ? 'video' : 'image'}`}>
                          {p.type.includes('video') ? 'VID' : 'IMG'}
                        </span>
                        <span className="gallery-context-submenu-name">{p.display_name}</span>
                        {p.filled && (
                          <span className="gallery-context-submenu-filled" title="Currently has a value">●</span>
                        )}
                      </button>
                    ))
                  )}
                </div>
              )}
            </div>
          )}

          {isPng && (
            <button
              className="gallery-context-menu-item"
              onClick={handleUseWorkflow}
              disabled={isMulti}
              title="Apply workflow and parameters from this image's metadata"
            >
              <Workflow size={14} className="gallery-context-menu-icon" />
              <span>Use Workflow from Metadata</span>
            </button>
          )}
        </>
      )}

      <div className="gallery-context-menu-separator" />

      <button
        className="gallery-context-menu-item"
        onClick={handleRename}
        disabled={!isSingle}
      >
        <Pencil size={14} className="gallery-context-menu-icon" />
        <span>Rename</span>
      </button>

      <button
        className="gallery-context-menu-item"
        onClick={handleMove}
      >
        <FolderInput size={14} className="gallery-context-menu-icon" />
        <span>Move to...</span>
      </button>

      <button
        className="gallery-context-menu-item"
        onClick={handleMoveToNewFolder}
      >
        <FolderPlus size={14} className="gallery-context-menu-icon" />
        <span>Move to New Folder...</span>
      </button>

      <button
        className="gallery-context-menu-item"
        onClick={handleBatchRename}
        disabled={!isMulti}
      >
        <Files size={14} className="gallery-context-menu-icon" />
        <span>Batch Rename...</span>
      </button>

      <div className="gallery-context-menu-separator" />

      <button
        className="gallery-context-menu-item"
        onClick={handleCopyPath}
      >
        <Copy size={14} className="gallery-context-menu-icon" />
        <span>Copy Path</span>
      </button>

      <button
        className="gallery-context-menu-item"
        onClick={handleCopyFilename}
      >
        <ClipboardCopy size={14} className="gallery-context-menu-icon" />
        <span>Copy Filename</span>
      </button>

      <div className="gallery-context-menu-separator" />

      <button
        className="gallery-context-menu-item gallery-context-menu-item--danger"
        onClick={handleTrash}
      >
        <Trash2 size={14} className="gallery-context-menu-icon" />
        <span>Move to Trash</span>
      </button>
    </div>
  );

  return createPortal(menu, document.body);
}
