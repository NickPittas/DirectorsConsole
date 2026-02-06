# Frontend Best Practices Review

**Report Date:** February 4, 2026
**Analyzer:** AI Code Review
**Overall Rating:** MEDIUM

## Executive Summary

The Director's Console frontend demonstrates mixed adherence to React and TypeScript best practices. Key issues include large monolithic components, missing virtualization, accessibility gaps, and inconsistent state management.

## Verification Status (Feb 4, 2026)

**Verified:**
- `ParallelResultsView.tsx` handles Enter key but not Space for role="button".
- `ErrorNotification.tsx` close button lacks an `aria-label`.
- `Settings.tsx` uses heavy inline styling.
- `ImageDropZone.tsx` uses base64/canvas flows (potential memory pressure).
- Some storyboard modals include keyboard/focus handlers (e.g., FolderBrowserModal/FileBrowserDialog).
- Several storyboard modals lack role/aria and focus trap (DeleteConfirmDialog, WorkflowCategoriesModal, ProjectSettingsModal, FolderBrowserModal, CropMaskEditor). FileBrowserDialog has keyboard handling but no role/aria or focus trap.

**Incorrect:**
- "MultiNodeSelector usage unclear" is incorrect (used in `StoryboardUI.tsx`).

**Needs Recheck:**
- Any remaining modal/dialog components not yet inspected.

---

## 1. REACT PATTERNS

### 1.1 Large, Monolithic Component

**Severity:** HIGH
**File:** `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx`
**Lines:** 190-1200+

**Issue:** `StoryboardUI` is doing *everything* (tabs, canvas, workflows, viewer, logs, orchestrator, project settings, file browser, etc.)

**Impact:**
- Hard to reason about, high coupling, difficult to optimize for render performance and side effects

**Recommendation:**
```typescript
// Split into feature-level subcomponents
// Canvas.tsx - Panel grid and canvas rendering
// WorkflowManager.tsx - Workflow selection and editing
// Viewer.tsx - Image viewing and zoom
// Logs.tsx - Log display and filtering
// ProjectSettings.tsx - Project configuration
// NodeManager.tsx - Backend node management

// StoryboardUI becomes orchestration
export function StoryboardUI() {
  return (
    <div className="storyboard-ui">
      <Tabs />
      <Canvas />
      <WorkflowManager />
      <Viewer />
      <Logs />
      <ProjectSettings />
      <NodeManager />
    </div>
  );
}
```

---

### 1.2 Prop Drilling / State Scoping

**Severity:** MEDIUM
**File:** `StoryboardUI.tsx`

**Issue:** Many state values are passed to multiple nested components (e.g., parameter values, workflow metadata, camera angles, nodes, etc.)

**Impact:** Prop drilling increases component coupling and makes refactors risky

**Recommendation:**
```typescript
// Consider colocated stores (Zustand slices or context) for:
// - Workflow + viewer + canvas state

// Example Zustand store
import { create } from 'zustand';

interface WorkflowStore {
  selectedWorkflowId: string | null;
  parameters: Record<string, unknown>;
  setSelectedWorkflow: (id: string) => void;
  updateParameter: (name: string, value: unknown) => void;
}

const useWorkflowStore = create<WorkflowStore>((set) => ({
  selectedWorkflowId: null,
  parameters: {},

  setSelectedWorkflow: (id) => set({ selectedWorkflowId: id }),

  updateParameter: (name, value) => set((state) => ({
    parameters: { ...state.parameters, [name]: value }
  })),
}));

// Usage in components
const { selectedWorkflowId, updateParameter } = useWorkflowStore();
```

---

### 1.3 Hooks Dependency Correctness

**Severity:** MEDIUM
**File:** `StoryboardUI.tsx`

**Lines 597-623:** `useEffect` for workflow parameter reset

**Issue:** Uses `workflows` but `workflows` is **missing** from dependency array. This can cause stale workflows when `selectedWorkflowId` changes after workflows change.

**Lines 593-444:** Endpoint availability effect

**Issue:** Uses `showWarning` but it is **not** listed in dependency array.

**Impact:** Stale closures; effects may not run with correct data

**Recommendation:**
```typescript
// Add missing deps
useEffect(() => {
  if (selectedWorkflowId && workflows[selectedWorkflowId]) {
    const workflow = workflows[selectedWorkflowId];
    const defaults = workflow.parameters || {};

    setPanels(prev => prev.map(panel => {
      if (panel.id === selectedPanelId) {
        return {
          ...panel,
          parameterValues: preserveValues(panel.parameterValues, defaults),
        };
      }
      return panel;
    }));
  }
}, [selectedWorkflowId, workflows, selectedPanelId]); // Added workflows to deps

// Or extract stable callbacks
const resetToDefaults = useCallback(() => {
  if (selectedWorkflowId && workflows[selectedWorkflowId]) {
    // ... logic
  }
}, [selectedWorkflowId, workflows]);
```

---

### 1.4 Rules of Hooks

**Status:** ✅ No explicit rules-of-hooks violations found in inspected components

---

## 2. PERFORMANCE PATTERNS

### 2.1 No Virtualization for Large Lists

**Severity:** MEDIUM
**File:** `ParallelResultsView.tsx`
**Lines:** 309-320

**Issue:** Rendering `child_jobs.map(...)` with no virtualization. If parallel results are large (dozens/hundreds), this will become expensive.

**File:** `WorkflowEditor.tsx`
**Lines:** 567-603

**Issue:** Mapping all configs or nodes without virtualization

**Recommendation:**
```typescript
import { FixedSizeList as List } from 'react-window';
import { VariableSizeGrid as Grid } from 'react-window';

// ParallelResultsView.tsx
const Row = ({ index, style }) => {
  const job = jobs[index];
  return (
    <div style={style}>
      <JobCard job={job} />
    </div>
  );
};

return (
  <List
    height={600}
    itemCount={jobs.length}
    itemSize={150}
    width="100%"
  >
    {Row}
  </List>
);
```

---

### 2.2 Components Render All UI Even When Hidden

**Severity:** MEDIUM
**File:** `App.tsx`
**Lines:** 51-58

**Issue:** Both `CinemaPromptEngineering` and `StoryboardUI` are always mounted; visibility is toggled by CSS

**Impact:** Heavy memory usage, expensive effects running for hidden tabs

**Recommendation:**
```typescript
// Use lazy loading + conditional rendering
import { lazy, Suspense } from 'react';

const CinemaPromptEngineering = lazy(() => import('./CinemaPromptEngineering'));
const StoryboardUI = lazy(() => import('./storyboard/StoryboardUI'));

export function App() {
  const [activeTab, setActiveTab] = useState<'cinema' | 'storyboard'>('cinema');

  return (
    <div className="app">
      <TabBar activeTab={activeTab} onTabChange={setActiveTab} />
      <Suspense fallback={<div>Loading...</div>}>
        {activeTab === 'cinema' && <CinemaPromptEngineering />}
        {activeTab === 'storyboard' && <StoryboardUI />}
      </Suspense>
    </div>
  );
}
```

---

### 2.3 Missing Memoization for Frequent Renders

**Severity:** MEDIUM
**File:** `ParallelResultsView.tsx`

**Issue:** `JobCard` is not memoized, and `child_jobs.map` is always re-rendered

**File:** `MultiNodeSelector.tsx`

**Issue:** `sortedNodes` recomputed on every render

**Recommendation:**
```typescript
// React.memo for cards
const JobCard = React.memo(({ job }) => {
  return (
    <div className="job-card">
      {/* ... */}
    </div>
  );
}, (prev, next) => {
  return prev.job.id === next.job.id &&
         prev.job.status === next.job.status;
});

// useMemo for derived lists
const sortedNodes = useMemo(() => {
  return Object.values(nodes).sort((a, b) =>
    (a.status === 'online' ? -1 : 1)
  );
}, [nodes]);
```

---

### 2.4 Heavy Re-fetching / Lack of Abort in Async Effects

**Severity:** MEDIUM
**File:** `StoryboardUI.tsx`
**Lines:** 699-737

**Issue:** Viewer image fetches on each image change; no `AbortController`, so stale async responses can set state after unmount

**Recommendation:**
```typescript
// Add aborts or tracking `isMounted`
const abortControllerRef = useRef<AbortController | null>(null);
const isMountedRef = useRef(true);

useEffect(() => {
  isMountedRef.current = true;

  return () => {
    isMountedRef.current = false;
    abortControllerRef.current?.abort();
  };
}, []);

const loadImage = async (path: string) => {
  const controller = new AbortController();
  abortControllerRef.current = controller;

  try {
    const response = await fetch(path, { signal: controller.signal });
    if (!isMountedRef.current) return;

    // ... process image
  } catch (error) {
    if (error.name !== 'AbortError') {
      console.error('Failed to load image:', error);
    }
  }
};
```

---

### 2.5 Base64 Images in State (Memory Pressure)

**Severity:** MEDIUM
**File:** `ImageDropZone.tsx`
**Lines:** 235-242

**Issue:** Uses `FileReader.readAsDataURL`, keeping large blobs in memory

**Impact:** Large base64 strings bloat memory and re-render costs

**Recommendation:**
```typescript
// Use object URLs + revoke them, or upload to backend and keep a URL
const objectUrlRef = useRef<string | null>(null);

const handleFileDrop = async (file: File) => {
  // Create object URL instead of base64
  const url = URL.createObjectURL(file);
  objectUrlRef.current = url;

  // Cleanup on unmount
  return () => {
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
    }
  };
};
```

---

## 3. ACCESSIBILITY (A11Y)

### 3.1 Missing Keyboard & Focus Management in Modals

**Severity:** HIGH
**File:** `ParallelResultsView.tsx`
**Lines:** 70-84

**Issue:** Image modal uses `<div className="image-modal">` with click-to-close but **no focus trap**, **no escape handling**, **no aria role**

**File:** `Settings.tsx`

**Issue:** Uses `role="dialog"` and `aria-modal`, good start, but **no focus trap**, no initial focus management

**Recommendation:**
```typescript
import { FocusTrap } from '@headlessui/react'; // or implement custom

// Modal with proper a11y
export function ImageModal({ image, onClose }: Props) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    if (dialogRef.current) {
      const focusableElements = dialogRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      firstElement?.focus();
    }
  }, []);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
      className="image-modal"
      ref={dialogRef}
    >
      <h2 id="modal-title">Image Viewer</h2>
      {/* ... */}
      <button onClick={onClose} aria-label="Close modal">
        ✕
      </button>
    </div>
  );
}
```

---

### 3.2 Custom Interactive Elements Missing Keyboard Semantics

**Severity:** MEDIUM
**File:** `ParallelResultsView.tsx`
**Lines:** 111-118

**Issue:** `div` with `role="button"` handles Enter only; **Space is missing**, and no `aria-pressed`

**File:** `ImageDropZone.tsx`

**Issue:** Drag/drop area is a `div` with no keyboard affordance; no `role="button"` or keyboard handling

**Recommendation:**
```typescript
// Accessible button-like div
export function AccessibleButton({ onClick, children, ...props }: Props) {
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onClick={onClick}
      aria-pressed={undefined} // or boolean for toggle buttons
      {...props}
    >
      {children}
    </div>
  );
}
```

---

### 3.3 Icon-Only Buttons Without Accessible Labels

**Severity:** MEDIUM
**File:** `ImageDropZone.tsx`
**Lines:** 42-64, 59-65

**Issue:** Buttons use emoji with titles but **no `aria-label`**

**File:** `ErrorNotification.tsx`
**Line:** 63

**Issue:** Close button has no `aria-label`

**Recommendation:**
```typescript
// Add aria-label to all buttons
<button
  onClick={handleClose}
  aria-label="Close notification"
  title="Close"
>
  ✕
</button>

// Use lucide-react icons with accessible labels
import { X } from 'lucide-react';

<button
  onClick={handleClose}
  aria-label="Close notification"
>
  <X size={16} aria-hidden="true" />
  <span className="sr-only">Close</span>
</button>
```

---

### 3.4 Focus Management

**Severity:** MEDIUM
**File:** `StoryboardUI.tsx`
**Lines:** 71-78

**Issue:** Image viewer focuses on open (good), but **focus isn't restored** on close

**Recommendation:**
```typescript
// Restore focus on close
const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);

const openModal = () => {
  previouslyFocusedElementRef.current = document.activeElement as HTMLElement;
  // Open modal and focus
};

const closeModal = () => {
  // Close modal
  previouslyFocusedElementRef.current?.focus();
};
```

---

## 4. ERROR HANDLING

### 4.1 Missing Error Boundaries

**Severity:** HIGH

**Issue:** No React error boundary detected in `App.tsx` or entry point

**Impact:** Runtime errors crash entire UI

**Recommendation:**
```typescript
import { Component, ReactNode } from 'react';

class ErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; error: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: any) {
    console.error('Error caught by boundary:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-fallback">
          <h1>Something went wrong</h1>
          <details>
            <summary>Error details</summary>
            <pre>{this.state.error?.toString()}</pre>
          </details>
          <button onClick={() => window.location.reload()}>
            Reload Page
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

// Wrap app
export function App() {
  return (
    <ErrorBoundary>
      <MainContent />
    </ErrorBoundary>
  );
}
```

---

### 4.2 Async Errors Silently Logged

**Severity:** MEDIUM
**File:** `ImageDropZone.tsx`
**Lines:** 92-108, 293-307

**Issue:** Network errors are `console.warn` only; no user feedback

**File:** `StoryboardUI.tsx`

**Issue:** PNG metadata errors logged only; no UI indication

**Recommendation:**
```typescript
// Surface errors via existing error notifications
import { useErrorNotifications } from './hooks/useErrorNotifications';

export function ImageDropZone() {
  const { showError } = useErrorNotifications();

  const handleError = (error: Error, context: string) => {
    console.error(`[${context}]`, error);
    showError(`Failed to load image: ${error.message}`);
  };

  const handleFileDrop = async (file: File) => {
    try {
      // ... process file
    } catch (error) {
      handleError(error as Error, 'ImageDropZone');
    }
  };
}
```

---

### 4.3 Loading States

**Status:** ✅ You do use some loading flags (e.g., in Settings, StoryboardUI). Good, but inconsistent across components

**Recommendation:** Standardize loading state patterns

```typescript
// Create a loading spinner component
export function LoadingSpinner({ message = 'Loading...' }: Props) {
  return (
    <div className="loading-container" role="status" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <span className="loading-message">{message}</span>
    </div>
  );
}

// Use consistently across components
{isLoading && <LoadingSpinner message="Generating images..." />}
```

---

## 5. TYPESCRIPT BEST PRACTICES

### 5.1 Excessive `any` / Untyped State

**Severity:** HIGH
**File:** `StoryboardUI.tsx`
- **Line 303:** `systemStats: any`
- **Line 261:** `parameterValues: Record<string, any>`

**File:** `ParameterWidgets.tsx`
- `value: any`, `onChange: (name: string, value: any)` (Lines 18-23)

**File:** `WorkflowEditor.tsx`
- `default: any`, `value: any` (Lines 42, 112)

**Impact:** Loses type safety; easier to regress

**Recommendation:**
```typescript
// Create shared types for parameters/values
interface ParameterValue {
  string?: string;
  number?: number;
  boolean?: boolean;
  select?: string;
  array?: string[];
}

interface ParameterState {
  [paramName: string]: ParameterValue;
}

// Use in components
const [parameterValues, setParameterValues] = useState<ParameterState>({});

const handleChange = (name: string, value: unknown) => {
  // Type guard
  if (typeof value === 'string' || typeof value === 'number') {
    setParameterValues(prev => ({
      ...prev,
      [name]: value
    }));
  }
};
```

---

### 5.2 Unsafe Casting / `as any`

**Severity:** MEDIUM
**File:** `WorkflowEditor.tsx`
**Lines:** 74-75, 333, 820+

**Issue:** Multiple `as any` casts

**Recommendation:**
```typescript
// Define types for ComfyUIWorkflow nodes
interface ComfyUINode {
  id: string;
  type: string;
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  class_type?: string;
  color?: string;
}

interface ComfyUIWorkflow {
  nodes: Record<string, ComfyUINode>;
  links: Array<{
    from: string;
    from_node: string;
    from_socket: string;
    to: string;
    to_node: string;
    to_socket: string;
  }>;
}

// Use instead of as any
const node = (data as any).node as ComfyUINode;
```

---

## 6. CSS / STYLING

### 6.1 Mixed Styling Paradigms

**Severity:** MEDIUM
**File:** `Settings.tsx`
**Lines:** 190-395+

**Issue:** Heavy inline styles object. Elsewhere uses CSS files

**Impact:** Inconsistent styling strategy, harder to theme or override

**Recommendation:**
```typescript
// Move to CSS modules or consistent CSS-in-JS
// styles/Settings.module.css
.container {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.title {
  font-size: 1.5rem;
  font-weight: bold;
}

// Settings.tsx
import styles from './Settings.module.css';

export function Settings() {
  return (
    <div className={styles.container}>
      <h2 className={styles.title}>Settings</h2>
    </div>
  );
}
```

---

### 6.2 Dark Mode / Color Contrast

**Status:** ✅ UI relies on CSS variables (`--bg-*`, `--text-*`). That's good

**Recommendation:**
- Run contrast checks, especially for muted text on dark backgrounds
- Use automated contrast checker (e.g., axe DevTools)

---

### 6.3 Animation Performance

**Recommendation:**
- Ensure animations use `transform` rather than `left/top`
- Use `will-change` sparingly
- Prefer CSS animations over JS animations where possible

---

## 7. SECURITY CONSIDERATIONS (Frontend)

**File:** `ImageDropZone.tsx`
**Lines:** 83-90

**Issue:** `/api/read-image?path=...` uses raw filePath. This depends entirely on backend path-validation.

**Risk:** If backend doesn't validate, could be path traversal

**Recommendation:**
- Ensure server strictly validates file paths (allowlist)
- Consider signing or mapping file IDs rather than full paths

---

## QUICK WINS (High Impact, Low Effort)

1. **Add missing deps** in `StoryboardUI` effects (workflow reset, endpoint check) - 5 minutes
2. **Add a basic Error Boundary** in `App.tsx` or main layout - 10 minutes
3. **Add `aria-label` to icon buttons** (close buttons, crop/mask, etc.) - 15 minutes
4. **Add `Space` key handling** for `role="button"` elements - 20 minutes
5. **Lazy-load StoryboardUI/CinemaPromptEngineering** to reduce initial bundle and background effects - 30 minutes
6. **Memoize JobCard** - 5 minutes
7. **Fix focus restoration** - 15 minutes

---

## NEXT STEPS

1. Implement all quick wins within 1 week
2. Run accessibility audit (axe, WAVE)
3. Add keyboard navigation tests
4. Create a11y component library with focus traps, accessible buttons
5. Add React Strict Mode to catch issues early
6. Implement proper error boundaries for each major section
7. Standardize error display patterns
