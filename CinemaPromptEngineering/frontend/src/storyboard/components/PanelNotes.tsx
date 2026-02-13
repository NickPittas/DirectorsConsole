import { useState, useCallback, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { useTranslation } from 'react-i18next';
import { Edit3, Eye, MessageSquare } from 'lucide-react';
import './PanelNotes.css';

interface PanelNotesProps {
  panelId: number;
  notes: string;
  onNotesChange: (notes: string) => void;
}

export function PanelNotes({ notes, onNotesChange }: PanelNotesProps) {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [localNotes, setLocalNotes] = useState(notes);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sync local notes when prop changes
  useEffect(() => {
    setLocalNotes(notes);
  }, [notes]);

  // Focus textarea when entering edit mode
  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
    }
  }, [isEditing]);

  // Debounced save (300ms)
  const debouncedSave = useCallback((newNotes: string) => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      onNotesChange(newNotes);
    }, 300);
  }, [onNotesChange]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newNotes = e.target.value;
    setLocalNotes(newNotes);
    debouncedSave(newNotes);
  };

  const toggleEditMode = () => {
    setIsEditing(!isEditing);
    if (isEditing) {
      // When switching to view mode, ensure final save
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      onNotesChange(localNotes);
    }
  };

  const hasNotes = notes.trim().length > 0;

  return (
    <div className="panel-notes-footer">
      <div className="panel-notes-header">
        <div className="panel-notes-title">
          <MessageSquare size={12} />
          <span>{t('storyboard.notes.title')}</span>
          {hasNotes && <span className="notes-indicator">●</span>}
        </div>
        <button
          className="panel-notes-toggle"
          onClick={toggleEditMode}
          title={isEditing ? t('storyboard.notes.viewMode') : t('storyboard.notes.editMode')}
        >
          {isEditing ? <Eye size={12} /> : <Edit3 size={12} />}
        </button>
      </div>

      {isEditing ? (
        <textarea
          ref={textareaRef}
          className="panel-notes-textarea"
          value={localNotes}
          onChange={handleChange}
          placeholder={t('storyboard.notes.placeholder')}
          rows={3}
        />
      ) : (
        <div className="panel-notes-view">
          {hasNotes ? (
            <ReactMarkdown
              components={{
                p: ({ children }) => <p className="markdown-paragraph">{children}</p>,
                strong: ({ children }) => <strong className="markdown-bold">{children}</strong>,
                em: ({ children }) => <em className="markdown-italic">{children}</em>,
                code: ({ children }) => <code className="markdown-code">{children}</code>,
                ul: ({ children }) => <ul className="markdown-list">{children}</ul>,
                ol: ({ children }) => <ol className="markdown-list">{children}</ol>,
                li: ({ children }) => <li className="markdown-list-item">{children}</li>,
              }}
            >
              {notes}
            </ReactMarkdown>
          ) : (
            <span className="panel-notes-placeholder">{t('storyboard.notes.empty')}</span>
          )}
        </div>
      )}
    </div>
  );
}

export default PanelNotes;
