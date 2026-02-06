import { useState } from 'react';
import './DeleteConfirmDialog.css';

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  filename: string;
  onConfirm: () => void;
  onCancel: () => void;
  onSuppressForSession: () => void;
}

export function DeleteConfirmDialog({
  isOpen,
  filename,
  onConfirm,
  onCancel,
  onSuppressForSession,
}: DeleteConfirmDialogProps) {
  const [dontAskAgain, setDontAskAgain] = useState(false);

  const handleConfirm = () => {
    if (dontAskAgain) {
      onSuppressForSession();
    }
    onConfirm();
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay delete-confirm-overlay">
      <div className="delete-confirm-dialog">
        <h3>Delete Image?</h3>
        <p>Are you sure you want to permanently delete:</p>
        <p className="delete-filename">{filename}</p>
        <p className="delete-warning">
          This will remove the file from disk and cannot be undone.
        </p>

        <label className="dont-ask-checkbox">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
          />
          <span>Don't ask again this session</span>
        </label>

        <div className="dialog-actions">
          <button className="cancel-btn" onClick={onCancel}>
            Cancel
          </button>
          <button className="delete-btn" onClick={handleConfirm}>
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
