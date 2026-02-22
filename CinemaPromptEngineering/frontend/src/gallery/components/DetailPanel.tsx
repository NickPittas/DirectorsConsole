/**
 * DetailPanel — Right sidebar showing detailed information about a selected file.
 *
 * Sections: preview, rating, tags, notes, file metadata, PNG metadata.
 * All rating/tag mutations are delegated to the parent via callback props.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  FileImage,
  Film,
  Calendar,
  HardDrive,
  Clock,
  Info,
  ChevronDown,
  ChevronRight,
  Save,
  Edit3,
} from 'lucide-react';
import { StarRating } from '../../storyboard/components/StarRating';
import { TagManager } from './TagManager';
import { TagBadge } from './TagBadge';
import * as galleryService from '../services/gallery-service';
import type { FileEntry, TagInfo } from '../services/gallery-service';
import './components.css';

// =============================================================================
// Utility helpers
// =============================================================================

function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(i > 0 ? 1 : 0)} ${sizes[i]}`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return '\u2014';
  return new Date(timestamp * 1000).toLocaleString();
}

// =============================================================================
// ComfyUI metadata extraction
// =============================================================================

interface ExtractedComfyParams {
  positive_prompt?: string;
  negative_prompt?: string;
  checkpoint?: string;
  sampler?: string;
  scheduler?: string;
  steps?: number;
  cfg?: number;
  denoise?: number;
  seed?: number;
  image_width?: number;
  image_height?: number;
  loras?: { name: string; strength: number }[];
}

function extractComfyParams(prompt: unknown): ExtractedComfyParams | null {
  if (!prompt || typeof prompt !== 'object') return null;
  
  const nodes = prompt as Record<string, { class_type?: string; inputs?: Record<string, unknown> }>;
  const result: ExtractedComfyParams = {};
  const clipTexts: { text: string; nodeId: string }[] = [];

  for (const [nodeId, node] of Object.entries(nodes)) {
    if (!node || typeof node !== 'object' || !node.class_type) continue;
    const classType = node.class_type;
    const inputs = node.inputs || {};

    // Checkpoint
    if (classType === 'CheckpointLoaderSimple' || classType === 'CheckpointLoader') {
      if (inputs.ckpt_name && typeof inputs.ckpt_name === 'string') {
        result.checkpoint = inputs.ckpt_name;
      }
    }

    // UNet loader (for flux/newer models)
    if (classType === 'UNETLoader' || classType === 'UnetLoader') {
      if (inputs.unet_name && typeof inputs.unet_name === 'string' && !result.checkpoint) {
        result.checkpoint = inputs.unet_name;
      }
    }

    // Sampler
    if (classType.includes('KSampler') || classType === 'SamplerCustom') {
      if (inputs.sampler_name && typeof inputs.sampler_name === 'string') result.sampler = inputs.sampler_name;
      if (inputs.scheduler && typeof inputs.scheduler === 'string') result.scheduler = inputs.scheduler;
      if (typeof inputs.steps === 'number') result.steps = inputs.steps;
      if (typeof inputs.cfg === 'number') result.cfg = inputs.cfg;
      if (typeof inputs.denoise === 'number') result.denoise = inputs.denoise;
      if (inputs.seed !== undefined) result.seed = Number(inputs.seed);
    }

    // CLIP text encoders
    if (classType === 'CLIPTextEncode' && inputs.text && typeof inputs.text === 'string') {
      clipTexts.push({ text: inputs.text, nodeId });
    }

    // Empty latent image (dimensions)
    if (classType === 'EmptyLatentImage') {
      if (typeof inputs.width === 'number') result.image_width = inputs.width;
      if (typeof inputs.height === 'number') result.image_height = inputs.height;
    }

    // LoRA
    if (classType === 'LoraLoader' || classType === 'LoraLoaderModelOnly') {
      if (inputs.lora_name && typeof inputs.lora_name === 'string') {
        if (!result.loras) result.loras = [];
        result.loras.push({
          name: inputs.lora_name,
          strength: typeof inputs.strength_model === 'number' ? inputs.strength_model : 1.0,
        });
      }
    }
  }

  // Sort CLIP texts: longer = positive, shorter = negative
  if (clipTexts.length >= 2) {
    clipTexts.sort((a, b) => b.text.length - a.text.length);
    result.positive_prompt = clipTexts[0].text;
    result.negative_prompt = clipTexts[1].text;
  } else if (clipTexts.length === 1) {
    result.positive_prompt = clipTexts[0].text;
  }

  // Only return if we found anything
  return Object.keys(result).length > 0 ? result : null;
}

// =============================================================================
// Types
// =============================================================================

interface DetailPanelProps {
  file: FileEntry;
  orchestratorUrl: string;
  projectPath: string;
  rating: number;
  fileTags: TagInfo[];
  allTags: TagInfo[];
  onRatingChange: (path: string, rating: number) => void;
  onTagsChange: (path: string, tagIds: number[], action: 'add' | 'remove') => void;
  onClose: () => void;
  onNotesChange?: (path: string, notes: string) => void;
  onCreateTag?: (name: string, color: string) => void;
}

// =============================================================================
// Component
// =============================================================================

export function DetailPanel({
  file,
  orchestratorUrl,
  projectPath,
  rating,
  fileTags,
  allTags,
  onRatingChange,
  onTagsChange,
  onClose,
  onNotesChange,
  onCreateTag,
}: DetailPanelProps) {
  // ---------------------------------------------------------------------------
  // State
  // ---------------------------------------------------------------------------

  const [pngMetadata, setPngMetadata] = useState<Record<string, unknown> | null>(null);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [notes, setNotes] = useState('');
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const [showMetadata, setShowMetadata] = useState(true);
  const [showPngMetadata, setShowPngMetadata] = useState(false);
  const [isLoadingInfo, setIsLoadingInfo] = useState(false);

  const [previewError, setPreviewError] = useState(false);

  const notesRef = useRef<HTMLTextAreaElement>(null);
  const prevFilePathRef = useRef<string>(file.path);

  // ---------------------------------------------------------------------------
  // Derived values
  // ---------------------------------------------------------------------------

  const isVideo = file.type === 'video';
  const isPng = file.extension.toLowerCase() === '.png';
  const previewUrl = `${orchestratorUrl}/api/serve-image?path=${encodeURIComponent(file.path)}`;

  // ---------------------------------------------------------------------------
  // Load detailed file info on mount / file change
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let cancelled = false;

    // Reset state when the selected file changes
    if (prevFilePathRef.current !== file.path) {
      setPngMetadata(null);
      setDimensions(null);
      setNotes('');
      setIsEditingNotes(false);
      setShowPngMetadata(false);
      setPreviewError(false);
      prevFilePathRef.current = file.path;
    }

    async function loadFileInfo() {
      setIsLoadingInfo(true);
      try {
        const result = await galleryService.getFileInfo(
          orchestratorUrl,
          file.path,
          projectPath,
        );
        if (cancelled) return;
        if (result.success) {
          if (result.png_metadata) {
            setPngMetadata(result.png_metadata);
          }
          if (result.file?.width && result.file?.height) {
            setDimensions({ width: result.file.width, height: result.file.height });
          }
          // Notes may come from the file info response in the future
          // For now we just keep them in local state
        }
      } catch {
        // Silently ignore — metadata is supplementary
      } finally {
        if (!cancelled) {
          setIsLoadingInfo(false);
        }
      }
    }

    loadFileInfo();

    return () => {
      cancelled = true;
    };
  }, [file.path, orchestratorUrl, projectPath]);

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  const handleRatingChange = useCallback(
    (newRating: number) => {
      onRatingChange(file.rel_path, newRating);
    },
    [file.rel_path, onRatingChange],
  );

  const handleTagRemove = useCallback(
    (tagId: number) => {
      onTagsChange(file.rel_path, [tagId], 'remove');
    },
    [file.rel_path, onTagsChange],
  );

  const handleTagAdd = useCallback(
    (tagId: number) => {
      onTagsChange(file.rel_path, [tagId], 'add');
    },
    [file.rel_path, onTagsChange],
  );

  const handleCreateTag = useCallback(
    (name: string, color: string) => {
      if (onCreateTag) {
        onCreateTag(name, color);
      }
    },
    [onCreateTag],
  );

  const handlePreviewClick = useCallback(() => {
    if (!isVideo) {
      window.open(previewUrl, '_blank');
    }
  }, [isVideo, previewUrl]);

  const handleNotesSave = useCallback(() => {
    setIsEditingNotes(false);
    if (onNotesChange) {
      onNotesChange(file.rel_path, notes);
    }
  }, [file.rel_path, notes, onNotesChange]);

  const handleNotesToggle = useCallback(() => {
    if (isEditingNotes) {
      handleNotesSave();
    } else {
      setIsEditingNotes(true);
      // Focus textarea on next tick
      requestAnimationFrame(() => {
        notesRef.current?.focus();
      });
    }
  }, [isEditingNotes, handleNotesSave]);

  // ---------------------------------------------------------------------------
  // PNG metadata rendering helpers
  // ---------------------------------------------------------------------------

  function renderMetadataValue(key: string, value: unknown): React.ReactNode {
    if (value === null || value === undefined) return null;

    // Special handling for ComfyUI prompt — extract readable fields
    if (key === 'prompt') {
      const parsed = typeof value === 'string' ? (() => { try { return JSON.parse(value); } catch { return value; } })() : value;
      const extracted = extractComfyParams(parsed);
      if (extracted) {
        return (
          <div key={key} className="detail-panel-comfy-params">
            {extracted.positive_prompt && (
              <div className="detail-panel-comfy-row">
                <span className="detail-panel-comfy-label">Prompt</span>
                <span className="detail-panel-comfy-text">{extracted.positive_prompt}</span>
              </div>
            )}
            {extracted.negative_prompt && (
              <div className="detail-panel-comfy-row">
                <span className="detail-panel-comfy-label">Negative</span>
                <span className="detail-panel-comfy-text">{extracted.negative_prompt}</span>
              </div>
            )}
            {extracted.checkpoint && (
              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-key">Model</span>
                <span className="detail-panel-meta-value" title={extracted.checkpoint}>
                  {extracted.checkpoint.split(/[/\\]/).pop()}
                </span>
              </div>
            )}
            {extracted.loras && extracted.loras.length > 0 && extracted.loras.map((lora, i) => (
              <div key={`lora-${i}`} className="detail-panel-meta-row">
                <span className="detail-panel-meta-key">{i === 0 ? 'LoRA' : ''}</span>
                <span className="detail-panel-meta-value" title={lora.name}>
                  {lora.name.split(/[/\\]/).pop()} ({lora.strength.toFixed(2)})
                </span>
              </div>
            ))}
            {(extracted.sampler || extracted.steps) && (
              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-key">Sampler</span>
                <span className="detail-panel-meta-value">
                  {[
                    extracted.sampler,
                    extracted.scheduler,
                    extracted.steps != null ? `${extracted.steps} steps` : null,
                    extracted.cfg != null ? `cfg ${extracted.cfg}` : null,
                    extracted.denoise != null ? `denoise ${extracted.denoise}` : null,
                  ].filter(Boolean).join(', ')}
                </span>
              </div>
            )}
            {extracted.seed != null && (
              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-key">Seed</span>
                <span className="detail-panel-meta-value">{extracted.seed}</span>
              </div>
            )}
            {(extracted.image_width && extracted.image_height) && (
              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-key">Latent Size</span>
                <span className="detail-panel-meta-value">
                  {extracted.image_width} {'\u00D7'} {extracted.image_height}
                </span>
              </div>
            )}
            {/* Collapsible raw JSON for advanced users */}
            <PngSubSection
              label="Raw Prompt Data"
              content={typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
            />
          </div>
        );
      }
      // Fallback if extraction fails — show as expandable raw JSON
      const stringified = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      return <PngSubSection key={key} label={key} content={stringified} />;
    }

    // Workflow — keep as expandable raw JSON (not as useful to extract from)
    if (key === 'workflow') {
      const stringified = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
      return <PngSubSection key={key} label={key} content={stringified} />;
    }

    const display = typeof value === 'object' ? JSON.stringify(value) : String(value);
    return (
      <div key={key} className="detail-panel-meta-row">
        <span className="detail-panel-meta-key">{key}</span>
        <span className="detail-panel-meta-value">{display}</span>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="detail-panel">
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="detail-panel-header">
        <span className="detail-panel-title" title={file.name}>
          {file.name}
        </span>
        <button
          className="detail-panel-close-btn"
          onClick={onClose}
          title="Close detail panel"
          type="button"
        >
          <X size={16} />
        </button>
      </div>

      {/* ── Scrollable body ────────────────────────────────────────────── */}
      <div className="detail-panel-body">
        {/* ── Preview ──────────────────────────────────────────────────── */}
        <div className="detail-panel-preview">
          {previewError ? (
            <div className="detail-panel-preview-placeholder">
              {isVideo ? <Film size={48} /> : <FileImage size={48} />}
            </div>
          ) : isVideo ? (
            <video
              className="detail-panel-preview-video"
              src={previewUrl}
              controls
              loop
              muted
              onError={() => setPreviewError(true)}
            />
          ) : (
            <img
              className="detail-panel-preview-image"
              src={previewUrl}
              alt={file.name}
              onClick={handlePreviewClick}
              onError={() => setPreviewError(true)}
              draggable={false}
            />
          )}
        </div>

        {/* ── Rating ───────────────────────────────────────────────────── */}
        <div className="detail-panel-section">
          <div className="detail-panel-section-row">
            <span className="detail-panel-label">Rating</span>
            <StarRating
              rating={rating}
              onRatingChange={handleRatingChange}
              size={16}
            />
          </div>
        </div>

        {/* ── Tags ─────────────────────────────────────────────────────── */}
        <div className="detail-panel-section">
          <div className="detail-panel-section-row">
            <span className="detail-panel-label">Tags</span>
            {fileTags.length > 0 && (
              <span className="detail-panel-count-badge">{fileTags.length}</span>
            )}
          </div>

          {fileTags.length > 0 && (
            <div className="detail-panel-tags-list">
              {fileTags.map((tag) => (
                <TagBadge
                  key={tag.id}
                  tag={tag}
                  onRemove={() => handleTagRemove(tag.id)}
                />
              ))}
            </div>
          )}

          <TagManager
            allTags={allTags}
            fileTags={fileTags}
            orchestratorUrl={orchestratorUrl}
            projectPath={projectPath}
            onAddTag={handleTagAdd}
            onCreateTag={handleCreateTag}
          />
        </div>

        {/* ── Notes ────────────────────────────────────────────────────── */}
        <div className="detail-panel-section">
          <div className="detail-panel-section-row">
            <span className="detail-panel-label">Notes</span>
            <button
              className="detail-panel-icon-btn"
              onClick={handleNotesToggle}
              title={isEditingNotes ? 'Save notes' : 'Edit notes'}
              type="button"
            >
              {isEditingNotes ? <Save size={14} /> : <Edit3 size={14} />}
            </button>
          </div>

          {isEditingNotes ? (
            <textarea
              ref={notesRef}
              className="detail-panel-notes-textarea"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add notes about this file..."
              rows={4}
            />
          ) : (
            <div className="detail-panel-notes-display">
              {notes || (
                <span className="detail-panel-notes-empty">No notes</span>
              )}
            </div>
          )}
        </div>

        {/* ── File Metadata ────────────────────────────────────────────── */}
        <div className="detail-panel-section detail-panel-metadata">
          <button
            className="detail-panel-section-toggle"
            onClick={() => setShowMetadata((prev) => !prev)}
            type="button"
          >
            {showMetadata ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="detail-panel-label">File Info</span>
          </button>

          {showMetadata && (
            <div className="detail-panel-meta-grid">
              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-icon">
                  <Info size={13} />
                </span>
                <span className="detail-panel-meta-key">Name</span>
                <span className="detail-panel-meta-value" title={file.name}>
                  {file.name}
                </span>
              </div>

              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-icon">
                  {isVideo ? <Film size={13} /> : <FileImage size={13} />}
                </span>
                <span className="detail-panel-meta-key">Type</span>
                <span className="detail-panel-meta-value">
                  {isVideo ? 'Video' : 'Image'}
                </span>
              </div>

              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-icon">
                  <Info size={13} />
                </span>
                <span className="detail-panel-meta-key">Extension</span>
                <span className="detail-panel-meta-value">
                  {file.extension}
                </span>
              </div>

              {dimensions && (
                <div className="detail-panel-meta-row">
                  <span className="detail-panel-meta-icon">
                    <FileImage size={13} />
                  </span>
                  <span className="detail-panel-meta-key">Dimensions</span>
                  <span className="detail-panel-meta-value">
                    {dimensions.width} {'\u00D7'} {dimensions.height}
                  </span>
                </div>
              )}

              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-icon">
                  <HardDrive size={13} />
                </span>
                <span className="detail-panel-meta-key">Size</span>
                <span className="detail-panel-meta-value">
                  {formatFileSize(file.size)}
                </span>
              </div>

              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-icon">
                  <Calendar size={13} />
                </span>
                <span className="detail-panel-meta-key">Created</span>
                <span className="detail-panel-meta-value">
                  {formatDate(file.created)}
                </span>
              </div>

              <div className="detail-panel-meta-row">
                <span className="detail-panel-meta-icon">
                  <Clock size={13} />
                </span>
                <span className="detail-panel-meta-key">Modified</span>
                <span className="detail-panel-meta-value">
                  {formatDate(file.modified)}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* ── PNG Metadata ─────────────────────────────────────────────── */}
        {isPng && (pngMetadata || isLoadingInfo) && (
          <div className="detail-panel-section detail-panel-png-metadata">
            <button
              className="detail-panel-section-toggle"
              onClick={() => setShowPngMetadata((prev) => !prev)}
              type="button"
            >
              {showPngMetadata ? (
                <ChevronDown size={14} />
              ) : (
                <ChevronRight size={14} />
              )}
              <span className="detail-panel-label">PNG Metadata</span>
            </button>

            {showPngMetadata && (
              <div className="detail-panel-meta-grid">
                {isLoadingInfo && !pngMetadata && (
                  <div className="detail-panel-meta-loading">
                    Loading metadata…
                  </div>
                )}
                {pngMetadata &&
                  Object.entries(pngMetadata).map(([key, value]) =>
                    renderMetadataValue(key, value),
                  )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// =============================================================================
// Sub-component: Expandable PNG metadata sub-section (prompt / workflow)
// =============================================================================

function PngSubSection({
  label,
  content,
}: {
  label: string;
  content: string;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="detail-panel-png-subsection">
      <button
        className="detail-panel-section-toggle"
        onClick={() => setExpanded((prev) => !prev)}
        type="button"
      >
        {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="detail-panel-meta-key">{label}</span>
      </button>
      {expanded && (
        <pre className="detail-panel-png-pre">{content}</pre>
      )}
    </div>
  );
}
