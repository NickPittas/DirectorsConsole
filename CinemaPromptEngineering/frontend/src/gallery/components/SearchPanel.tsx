import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Search, X, FileText, FileImage } from 'lucide-react';
import { searchFiles, type SearchResult, type SearchResultResponse } from '../services/gallery-service';
import { useGalleryStore } from '../store/gallery-store';
import './components.css';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SearchScope = 'all' | 'filename' | 'prompt';

interface SearchPanelProps {
  orchestratorUrl: string;
  projectPath: string;
  currentPath: string;
  onSelectResult: (filePath: string) => void;
  onClose: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Highlight occurrences of `query` inside `text` by wrapping them in <mark>.
 * Returns an array of React nodes suitable for rendering.
 */
function highlightMatch(text: string, query: string): React.ReactNode[] {
  if (!query) return [text];
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part) ? <mark key={i}>{part}</mark> : part,
  );
}

/**
 * Extract the filename from a full or relative file path.
 */
function basename(filePath: string): string {
  const sep = filePath.includes('\\') ? '\\' : '/';
  const segments = filePath.split(sep);
  return segments[segments.length - 1] || filePath;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function SearchPanel({
  orchestratorUrl,
  projectPath,
  currentPath,
  onSelectResult,
  onClose,
}: SearchPanelProps) {
  const { searchQuery, setSearchQuery } = useGalleryStore();

  const [scope, setScope] = useState<SearchScope>('all');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // --------------------------------------------------
  // Perform the search
  // --------------------------------------------------
  const executeSearch = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) {
        setResults([]);
        setTotal(0);
        setHasSearched(false);
        return;
      }

      setLoading(true);
      setHasSearched(true);

      try {
        const response: SearchResultResponse = await searchFiles(
          orchestratorUrl,
          projectPath,
          trimmed,
          currentPath || undefined,
          100,
        );

        if (response.success) {
          // Client-side scope filtering
          let filtered = response.results;
          if (scope === 'filename') {
            filtered = filtered.filter((r) => r.match_field === 'filename');
          } else if (scope === 'prompt') {
            filtered = filtered.filter((r) => r.match_field !== 'filename');
          }
          setResults(filtered);
          setTotal(filtered.length);
        } else {
          setResults([]);
          setTotal(0);
        }
      } catch {
        setResults([]);
        setTotal(0);
      } finally {
        setLoading(false);
      }
    },
    [orchestratorUrl, projectPath, currentPath, scope],
  );

  // --------------------------------------------------
  // Debounced input handler
  // --------------------------------------------------
  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setSearchQuery(value);

      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }

      debounceRef.current = setTimeout(() => {
        executeSearch(value);
      }, 300);
    },
    [setSearchQuery, executeSearch],
  );

  // Re-search when scope changes (if there is already a query)
  useEffect(() => {
    if (searchQuery.trim()) {
      executeSearch(searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope]);

  // --------------------------------------------------
  // Clear
  // --------------------------------------------------
  const handleClear = useCallback(() => {
    setSearchQuery('');
    setResults([]);
    setTotal(0);
    setHasSearched(false);
    inputRef.current?.focus();
  }, [setSearchQuery]);

  // --------------------------------------------------
  // Match-field icon
  // --------------------------------------------------
  function matchIcon(field: string) {
    if (field === 'filename') return <FileImage size={14} />;
    return <FileText size={14} />;
  }

  // --------------------------------------------------
  // Render
  // --------------------------------------------------
  return (
    <div className="search-panel">
      {/* Header */}
      <div className="search-panel-header">
        <span className="search-panel-header-title">
          Search
          {hasSearched && !loading && (
            <span className="search-panel-header-count">
              {total} result{total !== 1 ? 's' : ''}
            </span>
          )}
        </span>
        <button
          className="search-panel-close-btn"
          onClick={onClose}
          title="Close search"
        >
          <X size={16} />
        </button>
      </div>

      {/* Input */}
      <div className="search-panel-input-wrapper">
        <Search size={14} className="search-panel-input-icon" />
        <input
          ref={inputRef}
          className="search-panel-input"
          type="text"
          placeholder="Search files..."
          value={searchQuery}
          onChange={handleInputChange}
        />
        {searchQuery && (
          <button
            className="search-panel-clear-btn"
            onClick={handleClear}
            title="Clear search"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Scope toggle */}
      <div className="search-panel-scope">
        {(['all', 'filename', 'prompt'] as const).map((s) => (
          <button
            key={s}
            className={`search-panel-scope-btn${scope === s ? ' search-panel-scope-btn--active' : ''}`}
            onClick={() => setScope(s)}
          >
            {s === 'all' ? 'All' : s === 'filename' ? 'Filename' : 'Prompt text'}
          </button>
        ))}
      </div>

      {/* Results */}
      <div className="search-panel-results">
        {loading && (
          <div className="search-panel-loading">
            <span className="search-panel-spinner" />
            Searching...
          </div>
        )}

        {!loading && hasSearched && results.length === 0 && (
          <div className="search-panel-empty">No results found</div>
        )}

        {!loading &&
          results.map((result) => (
            <button
              key={result.file_path}
              className="search-panel-result-item"
              onClick={() => onSelectResult(result.file_path)}
              title={result.file_path}
            >
              <div className="search-panel-result-name">
                {matchIcon(result.match_field)}
                <span className="search-panel-result-filename">
                  {basename(result.rel_path || result.file_path)}
                </span>
              </div>
              {result.match_context && (
                <div className="search-panel-result-context">
                  {highlightMatch(result.match_context, searchQuery)}
                </div>
              )}
            </button>
          ))}
      </div>
    </div>
  );
}
