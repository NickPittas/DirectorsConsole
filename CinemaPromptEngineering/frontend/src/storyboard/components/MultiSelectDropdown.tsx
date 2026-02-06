/**
 * MultiSelectDropdown - Dropdown with multiple selectable options
 */

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check } from 'lucide-react';
import './MultiSelectDropdown.css';

interface Option {
  id: string;
  label: string;
  selected: boolean;
}

interface MultiSelectDropdownProps {
  options: Option[];
  onChange: (selectedIds: string[]) => void;
  placeholder?: string;
  title?: string;
}

export function MultiSelectDropdown({
  options,
  onChange,
  placeholder = 'Select options...',
  title
}: MultiSelectDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedCount = options.filter(o => o.selected).length;
  const allSelected = selectedCount === options.length;
  const noneSelected = selectedCount === 0;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const toggleOption = (id: string) => {
    const newSelectedIds = options.map(o => 
      o.id === id ? { ...o, selected: !o.selected } : o
    ).filter(o => o.selected).map(o => o.id);
    onChange(newSelectedIds);
  };

  const selectAll = () => {
    onChange(options.map(o => o.id));
  };

  const selectNone = () => {
    onChange([]);
  };

  const getButtonLabel = () => {
    if (noneSelected) return placeholder;
    if (allSelected) return `All (${options.length})`;
    if (selectedCount === 1) {
      const selected = options.find(o => o.selected);
      return selected?.label || '1 selected';
    }
    return `${selectedCount} selected`;
  };

  return (
    <div className="multiselect-dropdown" ref={dropdownRef}>
      {title && <div className="multiselect-title">{title}</div>}
      <button 
        className={`multiselect-trigger ${isOpen ? 'open' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        type="button"
      >
        <span className="multiselect-label">{getButtonLabel()}</span>
        <ChevronDown size={14} className={`chevron ${isOpen ? 'rotated' : ''}`} />
      </button>

      {isOpen && (
        <div className="multiselect-menu">
          {/* Quick actions */}
          <div className="multiselect-actions">
            <button 
              className="action-btn"
              onClick={selectAll}
              disabled={allSelected}
            >
              Select All
            </button>
            <button 
              className="action-btn"
              onClick={selectNone}
              disabled={noneSelected}
            >
              Clear
            </button>
          </div>
          
          <div className="multiselect-divider" />
          
          {/* Options list */}
          <div className="multiselect-options">
            {options.map(option => (
              <button
                key={option.id}
                className={`multiselect-option ${option.selected ? 'selected' : ''}`}
                onClick={() => toggleOption(option.id)}
              >
                <span className="option-check">
                  {option.selected && <Check size={14} />}
                </span>
                <span className="option-label">{option.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
