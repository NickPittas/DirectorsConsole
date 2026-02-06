import React, { useState, useCallback } from 'react';
import { X, Tags, Check } from 'lucide-react';
import { Workflow, WORKFLOW_CATEGORIES, WorkflowCategory } from '../StoryboardUI';

interface WorkflowCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflows: Workflow[];
  onUpdateWorkflow: (workflow: Workflow) => void;
}

export const WorkflowCategoriesModal: React.FC<WorkflowCategoriesModalProps> = ({
  isOpen,
  onClose,
  workflows,
  onUpdateWorkflow,
}) => {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<WorkflowCategory[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  const handleWorkflowSelect = useCallback((workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setSelectedCategories(workflow.categories || []);
  }, []);

  const handleCategoryToggle = useCallback((category: WorkflowCategory) => {
    setSelectedCategories(prev => {
      if (prev.includes(category)) {
        return prev.filter(c => c !== category);
      }
      return [...prev, category];
    });
  }, []);

  const handleSave = useCallback(() => {
    if (selectedWorkflow) {
      onUpdateWorkflow({
        ...selectedWorkflow,
        categories: selectedCategories,
      });
    }
  }, [selectedWorkflow, selectedCategories, onUpdateWorkflow]);

  const filteredWorkflows = workflows.filter(w =>
    w.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    w.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const getCategoryColor = (category: WorkflowCategory): string => {
    // Muted colors matching CPE palette
    const colors: Record<WorkflowCategory, string> = {
      'Image Generation': '#3d8b6e',
      'Text to Image': '#4a7aa8',
      'Image to Image': '#8b5a7a',
      'InPainting': '#9b7a4a',
      'Image Editing': '#7a6a9a',
      'Upscaling': '#8a8a4a',
      'Video Generation': '#9a5a5a',
    };
    return colors[category] || '#6a7a8a';
  };

  if (!isOpen) return null;

  return (
    <div className="workflow-categories-modal-overlay" onClick={onClose}>
      <div className="workflow-categories-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2><Tags size={20} /> Manage Workflow Categories</h2>
          <button className="close-btn" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        <div className="modal-content">
          <div className="workflows-list-section">
            <div className="search-box">
              <input
                type="text"
                placeholder="Search workflows..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="workflows-list">
              {filteredWorkflows.map(workflow => (
                <div
                  key={workflow.id}
                  className={`workflow-item ${selectedWorkflow?.id === workflow.id ? 'selected' : ''}`}
                  onClick={() => handleWorkflowSelect(workflow)}
                >
                  <div className="workflow-info">
                    <div className="workflow-name">{workflow.name}</div>
                    <div className="workflow-description">{workflow.description}</div>
                  </div>
                  <div className="workflow-categories-preview">
                    {workflow.categories?.map((cat: WorkflowCategory) => (
                      <span
                        key={cat}
                        className="category-tag"
                        style={{ backgroundColor: getCategoryColor(cat) }}
                      >
                        {cat}
                      </span>
                    ))}
                    {!workflow.categories?.length && (
                      <span className="no-categories">No categories</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="categories-section">
            {selectedWorkflow ? (
              <>
                <h3>Assign Categories to: {selectedWorkflow.name}</h3>
                <p className="help-text">
                  Select all categories that apply to this workflow. A workflow can have multiple categories.
                </p>

                <div className="categories-grid">
                  {WORKFLOW_CATEGORIES.map(category => (
                    <button
                      key={category}
                      className={`category-btn ${selectedCategories.includes(category) ? 'selected' : ''}`}
                      onClick={() => handleCategoryToggle(category)}
                      style={{
                        borderColor: getCategoryColor(category),
                        backgroundColor: selectedCategories.includes(category) 
                          ? `${getCategoryColor(category)}20`
                          : 'transparent',
                      }}
                    >
                      <span 
                        className="category-indicator"
                        style={{ backgroundColor: getCategoryColor(category) }}
                      />
                      <span className="category-name">{category}</span>
                      {selectedCategories.includes(category) && (
                        <Check size={16} className="check-icon" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="selected-categories-summary">
                  <h4>Selected Categories:</h4>
                  <div className="selected-tags">
                    {selectedCategories.map(cat => (
                      <span
                        key={cat}
                        className="selected-tag"
                        style={{ backgroundColor: getCategoryColor(cat) }}
                      >
                        {cat}
                      </span>
                    ))}
                    {!selectedCategories.length && (
                      <span className="no-selection">No categories selected</span>
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="save-btn" onClick={handleSave}>
                    Save Categories
                  </button>
                  <button className="cancel-btn" onClick={() => setSelectedWorkflow(null)}>
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <div className="no-selection-message">
                <Tags size={48} />
                <p>Select a workflow from the list to assign categories</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
