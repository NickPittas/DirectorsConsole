import { useEffect, useRef } from 'react';
import { PromptEnhancementControls } from './PromptEnhancementControls';
import type {
  EnhancementAssetCandidate,
  EnhancementPreferences,
  EnhancementProfile,
} from '../services/prompt-enhancement';
import type { TargetModelOption } from './PromptEnhancementControls';
import './PromptEnhancementControls.css';

interface PromptEnhancementSettingsPopupProps {
  isOpen: boolean;
  onClose: () => void;
  profiles: EnhancementProfile[];
  targetModels: TargetModelOption[];
  assets: EnhancementAssetCandidate[];
  preferences: EnhancementPreferences;
  onChange: (preferences: EnhancementPreferences) => void;
  durationSeconds?: number;
  profilesLoading?: boolean;
  profilesError?: string | null;
  targetModelsLoading?: boolean;
  targetModelsError?: string | null;
  onRetryProfiles?: () => void;
  onRetryTargetModels?: () => void;
  disabled?: boolean;
}

export function PromptEnhancementSettingsPopup({
  isOpen,
  onClose,
  profiles,
  targetModels,
  assets,
  preferences,
  onChange,
  durationSeconds,
  profilesLoading = false,
  profilesError,
  targetModelsLoading = false,
  targetModelsError,
  onRetryProfiles,
  onRetryTargetModels,
  disabled = false,
}: PromptEnhancementSettingsPopupProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const dialog = dialogRef.current;
    const focusable = () => {
      if (!dialog) return [];
      const candidates = [
        ...dialog.querySelectorAll<HTMLElement>('button'),
        ...dialog.querySelectorAll<HTMLElement>('select'),
        ...dialog.querySelectorAll<HTMLElement>('input'),
        ...dialog.querySelectorAll<HTMLElement>('textarea'),
        ...dialog.querySelectorAll<HTMLElement>('[tabindex]'),
      ];
      return Array.from(new Set(candidates)).filter(element =>
        !('disabled' in element && element.disabled) && !element.hasAttribute('disabled') && element.getAttribute('tabindex') !== '-1',
      );
    };
    focusable()[0]?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusable();
      if (elements.length === 0) return;
      const first = elements[0];
      const last = elements[elements.length - 1];
      const focusInsideDialog = dialog?.contains(document.activeElement);
      if (event.shiftKey && (!focusInsideDialog || document.activeElement === first)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (!focusInsideDialog || document.activeElement === last)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div
      className="prompt-enhancement-overlay"
      role="presentation"
      onClick={onClose}
    >
      <div
        ref={dialogRef}
        className="prompt-enhancement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="prompt-enhancement-settings-title"
        onClick={event => event.stopPropagation()}
      >
        <header className="prompt-enhancement-header">
          <h2 id="prompt-enhancement-settings-title">Prompt enhancement settings</h2>
          <button
            type="button"
            className="prompt-enhancement-close"
            aria-label="Close prompt enhancement settings"
            onClick={onClose}
          >
            ×
          </button>
        </header>
        <div className="prompt-enhancement-content">
          <PromptEnhancementControls
            profiles={profiles}
            targetModels={targetModels}
            assets={assets}
            preferences={preferences}
            durationSeconds={durationSeconds}
            onChange={onChange}
            profilesLoading={profilesLoading}
            profilesError={profilesError}
            targetModelsLoading={targetModelsLoading}
            targetModelsError={targetModelsError}
            onRetryProfiles={onRetryProfiles}
            onRetryTargetModels={onRetryTargetModels}
            disabled={disabled}
          />
        </div>
        <footer className="prompt-enhancement-footer">
          <button type="button" className="prompt-enhancement-done" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
