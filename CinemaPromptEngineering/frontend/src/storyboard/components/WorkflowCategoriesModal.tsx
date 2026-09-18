import React, { useState, useCallback } from 'react';
import { X, Tags, Check } from 'lucide-react';
import type { Workflow } from '../StoryboardUI';
import {
  applyWorkflowCategorySelection,
  getCategoryForRoute,
  getCategorySelectionError,
  getPrimaryWorkflowRoute,
  getWorkflowCategoryLabel,
  isValidWorkflowRoute,
  WORKFLOW_CATEGORIES,
  type CanonicalWorkflowCategory,
  type WorkflowCategory,
} from '../workflow-categories';

interface WorkflowCategoriesModalProps {
  isOpen: boolean;
  onClose: () => void;
  workflows: Workflow[];
  onUpdateWorkflow: (workflow: Workflow) => void;
}

const VIDEO_CATEGORIES: CanonicalWorkflowCategory[] = [
  'Image to Video',
  'Text to Video',
  'First/Last Frame to Video',
];

function hasCategory(categories: readonly WorkflowCategory[], category: string): boolean {
  return categories.some(value => getWorkflowCategoryLabel(value) === category);
}

function isVideoCategory(category: WorkflowCategory): boolean {
  return VIDEO_CATEGORIES.includes(getWorkflowCategoryLabel(category) as CanonicalWorkflowCategory);
}

export const WorkflowCategoriesModal: React.FC<WorkflowCategoriesModalProps> = ({
  isOpen,
  onClose,
  workflows,
  onUpdateWorkflow,
}) => {
  const [selectedWorkflow, setSelectedWorkflow] = useState<Workflow | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<WorkflowCategory[]>([]);
  const [primaryCategory, setPrimaryCategory] = useState<string | undefined>();
  const [searchTerm, setSearchTerm] = useState('');
  const [validationError, setValidationError] = useState<string | undefined>();

  const handleWorkflowSelect = useCallback((workflow: Workflow) => {
    setSelectedWorkflow(workflow);
    setSelectedCategories([...(workflow.categories || [])]);
    const route = getPrimaryWorkflowRoute(workflow);
    setPrimaryCategory(getCategoryForRoute(route));
    setValidationError(undefined);
  }, []);

  const handleCategoryToggle = useCallback((category: CanonicalWorkflowCategory) => {
    setValidationError(undefined);
    const isSelected = hasCategory(selectedCategories, category);
    let next = isSelected
      ? selectedCategories.filter(current => getWorkflowCategoryLabel(current) !== category)
      : [...selectedCategories, category];
    let nextPrimary = primaryCategory;

    if (category === 'Video Generation' && isSelected) {
      next = next.filter(current => !isVideoCategory(current));
      nextPrimary = undefined;
    } else if (VIDEO_CATEGORIES.includes(category as CanonicalWorkflowCategory)) {
      if (!hasCategory(next, 'Video Generation')) next = [...next, 'Video Generation'];
      if (!isSelected) nextPrimary = category;
      else if (primaryCategory === category) {
        nextPrimary = getCategoryForRoute(getPrimaryWorkflowRoute({ categories: next }));
      }
    } else if (!isSelected) {
      nextPrimary = category;
    } else if (primaryCategory === category) {
      nextPrimary = undefined;
    }

    setSelectedCategories(next);
    setPrimaryCategory(nextPrimary);
  }, [primaryCategory, selectedCategories]);

  const handleSave = useCallback(() => {
    if (!selectedWorkflow) return;
    const hasVideoLeaf = selectedCategories.some(isVideoCategory);
    const legacyVideoNeedsChild = selectedWorkflow.category === 'video-generation'
      && !isValidWorkflowRoute(selectedWorkflow.category, selectedWorkflow.subCategory)
      && !hasVideoLeaf;
    const error = legacyVideoNeedsChild
      ? 'Choose Image to Video, Text to Video, or First/Last Frame to Video before saving Video Generation.'
      : getCategorySelectionError(selectedCategories);
    if (error) {
      setValidationError(error);
      return;
    }

    try {
      const updatedWorkflow = applyWorkflowCategorySelection(
        selectedWorkflow,
        selectedCategories,
        primaryCategory,
      );
      onUpdateWorkflow(updatedWorkflow);
      setSelectedWorkflow(updatedWorkflow);
      setSelectedCategories([...(updatedWorkflow.categories || [])]);
      setPrimaryCategory(getCategoryForRoute(getPrimaryWorkflowRoute(updatedWorkflow)));
      setValidationError(undefined);
    } catch (saveError) {
      setValidationError(saveError instanceof Error ? saveError.message : 'Choose a valid workflow category.');
    }
  }, [onUpdateWorkflow, primaryCategory, selectedCategories, selectedWorkflow]);

  const filteredWorkflows = workflows.filter(workflow =>
    workflow.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    String(workflow.description || '').toLowerCase().includes(searchTerm.toLowerCase()),
  );

  const getCategoryColor = (category: string): string => {
    const colors: Record<string, string> = {
      'Image Generation': '#3d8b6e',
      'Text to Image': '#4a7aa8',
      'Image to Image': '#8b5a7a',
      InPainting: '#9b7a4a',
      'Image Editing': '#7a6a9a',
      Upscaling: '#8a8a4a',
      'Video Generation': '#9a5a5a',
      'Image to Video': '#a86464',
      'Text to Video': '#b87575',
      'First/Last Frame to Video': '#c48686',
    };
    return colors[category] || '#6a7a8a';
  };

  if (!isOpen) return null;

  const imageCategories = WORKFLOW_CATEGORIES.filter(category => !VIDEO_CATEGORIES.includes(category) && category !== 'Video Generation');
  const showVideoChildren = hasCategory(selectedCategories, 'Video Generation')
    || selectedCategories.some(isVideoCategory);

  return (
    <div className="workflow-categories-modal-overlay" onClick={onClose}>
      <div className="workflow-categories-modal" onClick={event => event.stopPropagation()}>
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
                onChange={event => setSearchTerm(event.target.value)}
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
                    {workflow.categories?.map((category, index) => {
                      const label = getWorkflowCategoryLabel(category) || 'Legacy category';
                      return (
                        <span
                          key={`${label}-${index}`}
                          className="category-tag"
                          style={{ backgroundColor: getCategoryColor(label) }}
                        >
                          {label}
                        </span>
                      );
                    })}
                    {!workflow.categories?.length && <span className="no-categories">Legacy route</span>}
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
                  Select all applicable categories. Video Generation requires a video child category before saving.
                </p>

                <div className="categories-grid">
                  {imageCategories.map(category => (
                    <button
                      key={category}
                      className={`category-btn ${hasCategory(selectedCategories, category) ? 'selected' : ''}`}
                      onClick={() => handleCategoryToggle(category)}
                      style={{
                        borderColor: getCategoryColor(category),
                        backgroundColor: hasCategory(selectedCategories, category) ? `${getCategoryColor(category)}20` : 'transparent',
                      }}
                    >
                      <span className="category-indicator" style={{ backgroundColor: getCategoryColor(category) }} />
                      <span className="category-name">{category}</span>
                      {hasCategory(selectedCategories, category) && <Check size={16} className="check-icon" />}
                    </button>
                  ))}

                  <button
                    className={`category-btn ${hasCategory(selectedCategories, 'Video Generation') ? 'selected' : ''}`}
                    onClick={() => handleCategoryToggle('Video Generation')}
                    style={{
                      borderColor: getCategoryColor('Video Generation'),
                      backgroundColor: hasCategory(selectedCategories, 'Video Generation') ? `${getCategoryColor('Video Generation')}20` : 'transparent',
                    }}
                  >
                    <span className="category-indicator" style={{ backgroundColor: getCategoryColor('Video Generation') }} />
                    <span className="category-name">Video Generation</span>
                    {hasCategory(selectedCategories, 'Video Generation') && <Check size={16} className="check-icon" />}
                  </button>

                  {showVideoChildren && VIDEO_CATEGORIES.map(category => (
                    <button
                      key={category}
                      className={`category-btn video-child ${hasCategory(selectedCategories, category) ? 'selected' : ''}`}
                      onClick={() => handleCategoryToggle(category)}
                      style={{
                        borderColor: getCategoryColor(category),
                        backgroundColor: hasCategory(selectedCategories, category) ? `${getCategoryColor(category)}20` : 'transparent',
                      }}
                    >
                      <span className="category-indicator" style={{ backgroundColor: getCategoryColor(category) }} />
                      <span className="category-name">↳ {category}</span>
                      {hasCategory(selectedCategories, category) && <Check size={16} className="check-icon" />}
                    </button>
                  ))}
                </div>

                {validationError && <p className="help-text" role="alert">{validationError}</p>}

                <div className="selected-categories-summary">
                  <h4>Selected Categories:</h4>
                  <div className="selected-tags">
                    {selectedCategories.map((category, index) => {
                      const label = getWorkflowCategoryLabel(category) || 'Legacy category';
                      return (
                        <span key={`${label}-${index}`} className="selected-tag" style={{ backgroundColor: getCategoryColor(label) }}>
                          {label}
                        </span>
                      );
                    })}
                    {!selectedCategories.length && <span className="no-selection">No categories selected</span>}
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="save-btn" onClick={handleSave}>Save Categories</button>
                  <button className="cancel-btn" onClick={() => setSelectedWorkflow(null)}>Cancel</button>
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
