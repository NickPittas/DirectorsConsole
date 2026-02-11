/**
 * PathMappingsModal - Configure cross-platform path translations
 * 
 * Allows users to define path mappings between Windows, Linux, and macOS
 * mount points so the application works seamlessly across different operating systems.
 */

import { useState, useEffect, useCallback } from 'react';
import { Plus, Trash2, ArrowRightLeft, Monitor, ToggleLeft, ToggleRight } from 'lucide-react';
import './PathMappingsModal.css';

interface PathMapping {
  id: string;
  name: string;
  windows: string;
  linux: string;
  macos: string;
  enabled: boolean;
}

interface PathMappingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  orchestratorUrl: string;
}

export function PathMappingsModal({ isOpen, onClose, orchestratorUrl }: PathMappingsModalProps) {
  const [mappings, setMappings] = useState<PathMapping[]>([]);
  const [currentOs, setCurrentOs] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testPath, setTestPath] = useState('');
  const [testResult, setTestResult] = useState<string | null>(null);

  // Load mappings from the backend
  const loadMappings = useCallback(async () => {
    if (!orchestratorUrl) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${orchestratorUrl}/api/path-mappings`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      setMappings(data.mappings || []);
      setCurrentOs(data.current_os || '');
    } catch (err) {
      setError(`Failed to load path mappings: ${err}`);
    } finally {
      setLoading(false);
    }
  }, [orchestratorUrl]);

  useEffect(() => {
    if (isOpen) {
      loadMappings();
    }
  }, [isOpen, loadMappings]);

  if (!isOpen) return null;

  const addMapping = async () => {
    setSaving(true);
    try {
      const response = await fetch(`${orchestratorUrl}/api/path-mappings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Mapping ${mappings.length + 1}`,
          windows: '',
          linux: '',
          macos: '',
          enabled: true,
        }),
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      setMappings([...mappings, data.mapping]);
    } catch (err) {
      setError(`Failed to add mapping: ${err}`);
    } finally {
      setSaving(false);
    }
  };

  const updateMapping = async (id: string, updates: Partial<PathMapping>) => {
    const mapping = mappings.find(m => m.id === id);
    if (!mapping) return;

    const updated = { ...mapping, ...updates };
    
    // Optimistic update
    setMappings(mappings.map(m => m.id === id ? updated : m));

    try {
      const response = await fetch(`${orchestratorUrl}/api/path-mappings/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: updated.name,
          windows: updated.windows,
          linux: updated.linux,
          macos: updated.macos,
          enabled: updated.enabled,
        }),
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      setError(`Failed to update mapping: ${err}`);
      // Revert on failure
      loadMappings();
    }
  };

  const deleteMapping = async (id: string) => {
    // Optimistic update
    setMappings(mappings.filter(m => m.id !== id));

    try {
      const response = await fetch(`${orchestratorUrl}/api/path-mappings/${id}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
    } catch (err) {
      setError(`Failed to delete mapping: ${err}`);
      loadMappings();
    }
  };

  const testTranslation = async () => {
    if (!testPath) return;

    try {
      const response = await fetch(`${orchestratorUrl}/api/translate-path`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: testPath }),
      });
      
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      
      const data = await response.json();
      setTestResult(data.translated);
    } catch (err) {
      setTestResult(`Error: ${err}`);
    }
  };

  const osLabel = (os: string) => {
    switch (os) {
      case 'windows': return 'Windows';
      case 'linux': return 'Linux';
      case 'macos': return 'macOS';
      default: return os;
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="path-mappings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2><ArrowRightLeft size={14} /> Path Mappings</h2>
          <button className="close-btn" onClick={onClose}>&times;</button>
        </div>

        <div className="modal-body">
          {/* Server OS indicator */}
          <div className="os-indicator">
            <Monitor size={12} />
            <span>Server OS: <strong>{osLabel(currentOs)}</strong></span>
            <small>Paths will be translated to this OS format</small>
          </div>

          {/* Description */}
          <div className="mapping-description">
            Define how shared storage paths map across operating systems.
            When the frontend sends a path (e.g., from a saved project), the backend
            automatically translates it to the correct local mount point.
          </div>

          {error && (
            <div className="mapping-error">{error}</div>
          )}

          {loading ? (
            <div className="mapping-loading">Loading path mappings...</div>
          ) : (
            <>
              {/* Mappings list */}
              <div className="mappings-list">
                {mappings.length === 0 ? (
                  <div className="no-mappings">
                    No path mappings configured. Add one to enable cross-platform path translation.
                  </div>
                ) : (
                  mappings.map((mapping) => (
                    <div key={mapping.id} className={`mapping-card ${!mapping.enabled ? 'disabled' : ''}`}>
                      <div className="mapping-card-header">
                        <input
                          type="text"
                          className="mapping-name-input"
                          value={mapping.name}
                          onChange={(e) => updateMapping(mapping.id, { name: e.target.value })}
                          onBlur={(e) => updateMapping(mapping.id, { name: e.target.value })}
                          placeholder="Mapping name"
                        />
                        <div className="mapping-actions">
                          <button
                            className="toggle-btn"
                            onClick={() => updateMapping(mapping.id, { enabled: !mapping.enabled })}
                            title={mapping.enabled ? 'Disable' : 'Enable'}
                          >
                            {mapping.enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
                          </button>
                          <button
                            className="delete-mapping-btn"
                            onClick={() => deleteMapping(mapping.id)}
                            title="Delete mapping"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      <div className="mapping-paths">
                        <div className="path-row">
                          <label className={currentOs === 'windows' ? 'current-os' : ''}>
                            Windows {currentOs === 'windows' && '(current)'}
                          </label>
                          <input
                            type="text"
                            value={mapping.windows}
                            onChange={(e) => updateMapping(mapping.id, { windows: e.target.value })}
                            placeholder="e.g., W:\ or \\server\share"
                          />
                        </div>
                        <div className="path-row">
                          <label className={currentOs === 'linux' ? 'current-os' : ''}>
                            Linux {currentOs === 'linux' && '(current)'}
                          </label>
                          <input
                            type="text"
                            value={mapping.linux}
                            onChange={(e) => updateMapping(mapping.id, { linux: e.target.value })}
                            placeholder="e.g., /mnt/Mandalore"
                          />
                        </div>
                        <div className="path-row">
                          <label className={currentOs === 'macos' ? 'current-os' : ''}>
                            macOS {currentOs === 'macos' && '(current)'}
                          </label>
                          <input
                            type="text"
                            value={mapping.macos}
                            onChange={(e) => updateMapping(mapping.id, { macos: e.target.value })}
                            placeholder="e.g., /Volumes/Mandalore"
                          />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add button */}
              <button
                className="add-mapping-btn"
                onClick={addMapping}
                disabled={saving}
              >
                <Plus size={14} />
                {saving ? 'Adding...' : 'Add Path Mapping'}
              </button>

              {/* Test section */}
              <div className="test-section">
                <h4>Test Translation</h4>
                <div className="test-input-row">
                  <input
                    type="text"
                    value={testPath}
                    onChange={(e) => {
                      setTestPath(e.target.value);
                      setTestResult(null);
                    }}
                    placeholder="Enter a path to test (e.g., W:\Projects\MyFilm)"
                  />
                  <button
                    onClick={testTranslation}
                    disabled={!testPath}
                    className="test-btn"
                  >
                    Test
                  </button>
                </div>
                {testResult !== null && (
                  <div className="test-result">
                    <ArrowRightLeft size={12} />
                    <span>{testResult}</span>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
