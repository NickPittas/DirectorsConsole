import { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { renameFile } from '../services/gallery-service';
import type { FileEntry } from '../services/gallery-service';

interface RenameDialogProps {
  file: FileEntry;
  orchestratorUrl: string;
  projectPath: string;
  onClose: () => void;
  onRenamed: () => void;
}

const INVALID_CHARS = /[/\\<>:"|?*]/;

function splitNameAndExtension(filename: string): { baseName: string; extension: string } {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot <= 0) {
    return { baseName: filename, extension: '' };
  }
  return {
    baseName: filename.slice(0, lastDot),
    extension: filename.slice(lastDot),
  };
}

export function RenameDialog({
  file,
  orchestratorUrl,
  projectPath,
  onClose,
  onRenamed,
}: RenameDialogProps) {
  const { baseName, extension } = splitNameAndExtension(file.name);
  const [name, setName] = useState(baseName);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-select filename text on mount
  useEffect(() => {
    inputRef.current?.select();
  }, []);

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose();
      }
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const trimmedName = name.trim();
  const hasInvalidChars = INVALID_CHARS.test(trimmedName);
  const isUnchanged = trimmedName === baseName;
  const isEmpty = trimmedName.length === 0;
  const isDisabled = isEmpty || isUnchanged || hasInvalidChars || loading;

  const handleSubmit = useCallback(async () => {
    if (isDisabled) return;

    setLoading(true);
    setError('');

    try {
      const newNameWithExtension = trimmedName + extension;
      const result = await renameFile(orchestratorUrl, file.path, newNameWithExtension, projectPath);

      if (!result.success) {
        setError(result.message || 'Rename failed.');
        setLoading(false);
        return;
      }

      onRenamed();
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(message);
      setLoading(false);
    }
  }, [isDisabled, trimmedName, extension, orchestratorUrl, file.path, projectPath, onRenamed, onClose]);

  const handleBackdropClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  let validationHint = '';
  if (isEmpty) {
    validationHint = '';
  } else if (hasInvalidChars) {
    validationHint = 'Name contains invalid characters: / \\ < > : " | ? *';
  }

  return createPortal(
    <div className="gallery-rename-backdrop" onClick={handleBackdropClick} style={backdropStyle}>
      <div className="gallery-rename-dialog" style={dialogStyle} onClick={undefined}>
        <h3 style={titleStyle}>Rename File</h3>

        <div style={currentNameContainerStyle}>
          <span style={currentNameLabelStyle}>Current name:</span>
          <span style={currentNameValueStyle}>{file.name}</span>
        </div>

        <div style={inputRowStyle}>
          <input
            ref={inputRef}
            className="gallery-rename-input"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError('');
            }}
            onKeyDown={handleKeyDown}
            autoFocus
            style={inputStyle}
          />
          {extension && (
            <span className="gallery-rename-extension" style={extensionStyle}>
              {extension}
            </span>
          )}
        </div>

        {(error || validationHint) && (
          <div className="gallery-rename-error" style={errorStyle}>
            {error || validationHint}
          </div>
        )}

        <div className="gallery-rename-buttons" style={buttonRowStyle}>
          <button
            className="gallery-rename-cancel-btn"
            type="button"
            onClick={onClose}
            disabled={loading}
            style={cancelButtonStyle}
          >
            Cancel
          </button>
          <button
            className="gallery-rename-submit-btn"
            type="button"
            onClick={handleSubmit}
            disabled={isDisabled}
            style={{
              ...renameButtonStyle,
              opacity: isDisabled ? 0.5 : 1,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
            }}
          >
            {loading ? 'Renaming...' : 'Rename'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ---------------------------------------------------------------------------
// Inline styles
// ---------------------------------------------------------------------------

const backdropStyle: React.CSSProperties = {
  position: 'fixed',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  backgroundColor: 'rgba(0, 0, 0, 0.6)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 10000,
};

const dialogStyle: React.CSSProperties = {
  background: '#1e1e2e',
  borderRadius: '8px',
  padding: '24px',
  minWidth: '380px',
  maxWidth: '480px',
  width: '90%',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
  color: '#e0e0e0',
};

const titleStyle: React.CSSProperties = {
  margin: '0 0 16px 0',
  fontSize: '16px',
  fontWeight: 600,
  color: '#ffffff',
};

const currentNameContainerStyle: React.CSSProperties = {
  marginBottom: '12px',
  fontSize: '13px',
};

const currentNameLabelStyle: React.CSSProperties = {
  color: '#888',
  marginRight: '6px',
};

const currentNameValueStyle: React.CSSProperties = {
  color: '#aaa',
  wordBreak: 'break-all',
};

const inputRowStyle: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: '4px',
  marginBottom: '8px',
};

const inputStyle: React.CSSProperties = {
  flex: 1,
  padding: '8px 10px',
  fontSize: '14px',
  background: '#2a2a3e',
  border: '1px solid #444',
  borderRadius: '4px',
  color: '#e0e0e0',
  outline: 'none',
};

const extensionStyle: React.CSSProperties = {
  fontSize: '14px',
  color: '#888',
  flexShrink: 0,
  userSelect: 'none',
};

const errorStyle: React.CSSProperties = {
  fontSize: '12px',
  color: '#f87171',
  marginBottom: '8px',
  minHeight: '18px',
};

const buttonRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'flex-end',
  gap: '8px',
  marginTop: '16px',
};

const cancelButtonStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: '13px',
  background: 'transparent',
  border: '1px solid #555',
  borderRadius: '4px',
  color: '#ccc',
  cursor: 'pointer',
};

const renameButtonStyle: React.CSSProperties = {
  padding: '6px 16px',
  fontSize: '13px',
  background: '#3b82f6',
  border: 'none',
  borderRadius: '4px',
  color: '#fff',
  fontWeight: 600,
};
