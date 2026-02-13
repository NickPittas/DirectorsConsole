import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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
  const { t } = useTranslation();
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
        <h3>{t('storyboard.deleteConfirm.title')}</h3>
        <p>{t('storyboard.deleteConfirm.prompt')}</p>
        <p className="delete-filename">{filename}</p>
        <p className="delete-warning">
          {t('storyboard.deleteConfirm.warning')}
        </p>

        <label className="dont-ask-checkbox">
          <input
            type="checkbox"
            checked={dontAskAgain}
            onChange={(e) => setDontAskAgain(e.target.checked)}
          />
          <span>{t('storyboard.deleteConfirm.dontAskAgain')}</span>
        </label>

        <div className="dialog-actions">
          <button className="cancel-btn" onClick={onCancel}>
            {t('storyboard.deleteConfirm.cancel')}
          </button>
          <button className="delete-btn" onClick={handleConfirm}>
            {t('storyboard.deleteConfirm.delete')}
          </button>
        </div>
      </div>
    </div>
  );
}
