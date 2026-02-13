/**
 * PrintDialog - Generates a printable storyboard layout with live preview.
 *
 * Features:
 * - Grid layout (user-selectable columns: 1–4)
 * - Print all panels or only selected ones
 * - Includes panel notes beneath each image when present
 * - Live preview in an embedded iframe
 * - Page size (A4/Letter) and orientation (Portrait/Landscape) settings
 * - Uses iframe window.print() for clean output without app chrome
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Printer, CheckSquare, Square } from 'lucide-react';
import './PrintDialog.css';

interface PrintDialogProps {
  isOpen: boolean;
  onClose: () => void;
  projectName?: string;
  selectedPanelId?: number | null;
  panels: Array<{
    id: number;
    name?: string;
    image?: string | null;
    notes?: string;
    rating?: number;
    imageHistory: Array<{
      metadata: {
        version: number;
        generationTime?: number;
        workflowName?: string;
      };
    }>;
  }>;
}

type ColumnCount = 1 | 2 | 3 | 4;

export function PrintDialog({
  isOpen,
  onClose,
  projectName,
  selectedPanelId,
  panels,
}: PrintDialogProps) {
  const { t, i18n } = useTranslation();
  const effectiveProjectName = projectName || t('storyboard.project.untitled');
  const [columns, setColumns] = useState<ColumnCount>(3);
  const [printMode, setPrintMode] = useState<'all' | 'selected'>('all');
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [pageSize, setPageSize] = useState<'a4' | 'letter'>('a4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('landscape');
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [previewHtml, setPreviewHtml] = useState('');

  // Initialise selection when dialog opens
  useEffect(() => {
    if (isOpen) {
      const ids = new Set(panels.filter(p => p.image).map(p => p.id));
      setSelectedIds(ids);
      if (selectedPanelId) {
        setPrintMode('selected');
        setSelectedIds(new Set([selectedPanelId]));
      } else {
        setPrintMode('all');
      }
    }
  }, [isOpen, panels, selectedPanelId]);

  // Panels to print
  const panelsToPrint = printMode === 'all'
    ? panels.filter(p => p.image)
    : panels.filter(p => p.image && selectedIds.has(p.id));

  const panelsWithImages = panels.filter(p => p.image);

  // Toggle a panel chip
  const togglePanel = useCallback((id: number) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    setSelectedIds(new Set(panels.filter(p => p.image).map(p => p.id)));
  }, [panels]);

  const deselectAll = useCallback(() => {
    setSelectedIds(new Set());
  }, []);

  // Build printable HTML document for the iframe
  const buildPrintHtml = useCallback(() => {
    const cellWidth = Math.floor(100 / columns);
    const fontSize = columns <= 2 ? 11 : 9;

    const locale = (i18n.resolvedLanguage || i18n.language) === 'zh-CN' ? 'zh-CN' : undefined;
    const subtitle = t('storyboard.print.subtitle', {
      count: panelsToPrint.length,
      date: new Date().toLocaleDateString(locale),
    });
    const documentTitle = t('storyboard.print.documentTitle', { projectName: effectiveProjectName });

    // Page size CSS
    const pageSizeCSS = pageSize === 'a4'
      ? (orientation === 'landscape' ? 'size: A4 landscape;' : 'size: A4 portrait;')
      : (orientation === 'landscape' ? 'size: letter landscape;' : 'size: letter portrait;');

    const panelCells = panelsToPrint.map(panel => {
      const label = panel.name || t('storyboard.panel.defaultLabel', { id: panel.id });
      const ratingStars = panel.rating && panel.rating > 0
        ? `<span class="cell-rating">${'★'.repeat(panel.rating)}${'☆'.repeat(5 - panel.rating)}</span>`
        : '';

      // Notes section
      const notesHtml = panel.notes && panel.notes.trim()
        ? `<div class="cell-notes">${escapeHtml(panel.notes)}</div>`
        : '';

      // Metadata
      const entry = panel.imageHistory && panel.imageHistory.length > 0 ? panel.imageHistory[0] : null;
      let metaHtml = '';
      if (entry) {
        const parts: string[] = [];
        if (entry.metadata.version != null) parts.push(`v${entry.metadata.version}`);
        if (entry.metadata.generationTime) parts.push(`${entry.metadata.generationTime.toFixed(1)}s`);
        if (entry.metadata.workflowName) parts.push(escapeHtml(entry.metadata.workflowName));
        if (parts.length > 0) {
          metaHtml = `<div class="cell-meta">${parts.join(' · ')}</div>`;
        }
      }

      return `
        <div class="cell" style="width:${cellWidth}%">
          <div class="cell-inner">
            <div class="cell-header">
              <span class="cell-label">${escapeHtml(label)}</span>
              ${ratingStars}
            </div>
            <img src="${panel.image}" />
            ${metaHtml}
            ${notesHtml}
          </div>
        </div>`;
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8"/>
<title>${escapeHtml(documentTitle)}</title>
<style>
  @page { ${pageSizeCSS} margin: 10mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Segoe UI', 'Inter', Arial, sans-serif;
    background: #fff;
    color: #1a1a1a;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .header {
    text-align: center;
    padding: 8px 0 6px;
    border-bottom: 2px solid #222;
    margin-bottom: 8px;
  }
  .header h1 { font-size: 18px; font-weight: 600; }
  .header .subtitle { font-size: 10px; color: #888; margin-top: 2px; }
  .grid {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
  }
  .cell {
    padding: 4px;
    break-inside: avoid;
  }
  .cell-inner {
    border: 1px solid #d0d0d0;
    border-radius: 4px;
    overflow: hidden;
    background: #fafafa;
  }
  .cell-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 3px 6px;
    background: #222;
    color: #fff;
  }
  .cell-label {
    font-size: 9px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .cell-rating {
    font-size: 10px;
    color: #e0b967;
  }
  .cell-inner img {
    display: block;
    width: 100%;
    height: auto;
    object-fit: contain;
  }
  .cell-meta {
    padding: 2px 6px;
    font-size: 8px;
    color: #888;
    background: #f0f0f0;
    border-top: 1px solid #e0e0e0;
  }
  .cell-notes {
    padding: 4px 6px;
    font-size: ${fontSize}px;
    line-height: 1.35;
    color: #333;
    background: #f4f4f4;
    border-top: 1px solid #e0e0e0;
    white-space: pre-wrap;
    word-break: break-word;
  }
  @media print {
    body { background: #fff; }
    .header { page-break-after: avoid; }
    .cell { break-inside: avoid; }
  }
</style>
</head>
<body>
  <div class="header">
    <h1>${escapeHtml(effectiveProjectName)}</h1>
    <div class="subtitle">${escapeHtml(subtitle)}</div>
  </div>
  <div class="grid">
    ${panelCells}
  </div>
</body>
</html>`;
  }, [columns, effectiveProjectName, i18n.language, i18n.resolvedLanguage, orientation, pageSize, panelsToPrint, t]);

  // Rebuild preview whenever inputs change
  useEffect(() => {
    if (!isOpen) return;
    setPreviewHtml(buildPrintHtml());
  }, [isOpen, buildPrintHtml]);

  // Write to iframe
  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || !previewHtml) return;
    const doc = iframe.contentDocument;
    if (!doc) return;
    doc.open();
    doc.write(previewHtml);
    doc.close();
  }, [previewHtml]);

  // Print via iframe
  const handlePrint = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe?.contentWindow) return;
    iframe.contentWindow.focus();
    iframe.contentWindow.print();
  }, []);

  if (!isOpen) return null;

  return (
    <div className="print-dialog-overlay" onClick={onClose}>
      <div className="print-dialog" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="print-dialog-header">
          <h2>
            <Printer size={18} />
            {t('storyboard.print.title')}
          </h2>
          <button className="close-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Toolbar */}
        <div className="print-toolbar">
          {/* Grid columns */}
          <div className="print-toolbar-group">
            <span className="toolbar-label">{t('storyboard.print.grid')}</span>
            {([1, 2, 3, 4] as ColumnCount[]).map(n => (
              <button
                key={n}
                className={`grid-btn ${columns === n ? 'active' : ''}`}
                onClick={() => setColumns(n)}
              >{t('storyboard.print.columns', { count: n })}</button>
            ))}
          </div>

          {/* Page settings */}
          <div className="print-toolbar-group">
            <span className="toolbar-label">{t('storyboard.print.page')}</span>
            <select
              className="page-select"
              value={pageSize}
              onChange={e => setPageSize(e.target.value as 'a4' | 'letter')}
            >
              <option value="a4">{t('storyboard.print.pageA4')}</option>
              <option value="letter">{t('storyboard.print.pageLetter')}</option>
            </select>
            <select
              className="page-select"
              value={orientation}
              onChange={e => setOrientation(e.target.value as 'portrait' | 'landscape')}
            >
              <option value="landscape">{t('storyboard.print.orientationLandscape')}</option>
              <option value="portrait">{t('storyboard.print.orientationPortrait')}</option>
            </select>
          </div>

          {/* Print mode */}
          <div className="print-toolbar-group">
            <span className="toolbar-label">{t('storyboard.print.panels')}</span>
            <button
              className={`mode-btn ${printMode === 'all' ? 'active' : ''}`}
              onClick={() => setPrintMode('all')}
            >{t('storyboard.print.all')} ({panelsWithImages.length})</button>
            <button
              className={`mode-btn ${printMode === 'selected' ? 'active' : ''}`}
              onClick={() => setPrintMode('selected')}
            >{t('storyboard.print.selected')} ({selectedIds.size})</button>
          </div>

          <button className="print-action-btn" onClick={handlePrint} disabled={panelsToPrint.length === 0}>
            <Printer size={16} /> {t('storyboard.print.print')}
          </button>
        </div>

        {/* Panel chip selector (visible in selected mode) */}
        {printMode === 'selected' && (
          <div className="print-panel-selector">
            <div className="selector-actions">
              <button onClick={selectAll} className="selector-action-btn">{t('storyboard.print.selectAll')}</button>
              <button onClick={deselectAll} className="selector-action-btn">{t('storyboard.print.deselectAll')}</button>
            </div>
            <div className="panel-chips">
              {panelsWithImages.map(panel => (
                <button
                  key={panel.id}
                  className={`panel-chip ${selectedIds.has(panel.id) ? 'selected' : ''}`}
                  onClick={() => togglePanel(panel.id)}
                >
                  {selectedIds.has(panel.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                  <span className="chip-thumb">
                    {panel.image && <img src={panel.image} alt="" />}
                  </span>
                  <span>{panel.name || t('storyboard.panel.defaultLabel', { id: panel.id })}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Live Preview */}
        <div className="print-preview-container">
          {panelsToPrint.length === 0 ? (
            <div className="print-empty">
              <p>{t('storyboard.print.emptyTitle')}</p>
              <p className="hint">{t('storyboard.print.emptyHint')}</p>
            </div>
          ) : (
            <iframe
              ref={iframeRef}
              className="print-preview-iframe"
              title={t('storyboard.print.previewTitle')}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default PrintDialog;
