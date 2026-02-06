import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { PanelHeader } from './PanelHeader';
import type { Panel } from '../StoryboardUI';
import './DraggablePanel.css';

interface DraggablePanelProps {
  panel: Panel;
  children: React.ReactNode;
  isSelected: boolean;
  onNameChange: (newName: string) => void;
  onRemove: () => void;
  onMouseDown: (e: React.MouseEvent) => void;
  onResizeStart: (e: React.MouseEvent) => void;
}

export function DraggablePanel({
  panel,
  children,
  isSelected,
  onNameChange,
  onRemove,
  onMouseDown,
  onResizeStart,
}: DraggablePanelProps) {
  const { listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `panel-${panel.id}`,
    data: {
      panel,
      type: 'panel',
    },
    disabled: panel.status === 'generating',
  });

  const style = {
    transform: CSS.Translate.toString(transform),
    zIndex: panel.zIndex || (isDragging ? 1000 : 1),
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`draggable-panel ${isDragging ? 'dragging' : ''} ${isSelected ? 'selected' : ''}`}
      onMouseDown={onMouseDown}
    >
      <PanelHeader
        panelId={panel.id}
        name={panel.name || `Panel_${String(panel.id).padStart(2, '0')}`}
        locked={panel.locked || panel.imageHistory.length > 0}
        selected={panel.selected}
        onNameChange={onNameChange}
        onRemove={onRemove}
        onMouseDown={onMouseDown}
        dragHandleListeners={listeners as Record<string, (e: React.SyntheticEvent) => void>}
      />
      <div className="panel-content">
        {children}
      </div>
      {/* Resize handle */}
      <div 
        className="panel-resize-handle"
        title="Drag to resize"
        onMouseDown={onResizeStart}
      />
    </div>
  );
}

export default DraggablePanel;
