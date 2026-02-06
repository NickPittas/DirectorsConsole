# Code Quality Review

**Report Date:** February 4, 2026
**Analyzer:** AI Code Review
**Overall Quality Rating:** MEDIUM

## Executive Summary

The Director's Console codebase demonstrates mixed code quality across Python and TypeScript/React components. Key issues include extensive use of `any` types, bare exception handlers, large monolithic files, and inconsistent error handling patterns.

## Verification Status (Feb 4, 2026)

**Verified:**
- `start.py` contains bare `except:` and `except: pass` blocks that swallow errors.
- `api/main.py` wraps broad exceptions as 422 in `/validate` and `/generate-prompt`.
- `ParameterWidgets.tsx` uses `any` for values and change handlers.
- `list_projects` in Orchestrator swallows JSON parsing errors inside a loop (`except Exception: pass`).

**Needs Recheck:**
- None noted.

---

## 1. PYTHON CODE QUALITY

### 1.1 Error Handling Patterns

**Issue:** Multiple bare `except:` blocks and exceptions swallowed with `pass`, which can mask real errors.

**File: `start.py`**

**Lines 197-205:**
```python
try: ...
except:
    return True
```
*Bare except without logging.* This can hide unexpected runtime failures (e.g., OS-level issues) and silently changes behavior.

**Lines 582-585:**
```python
except:
    pass
```
*Swallows exceptions during cleanup.* This hides cleanup failures (e.g., killed process still alive), and can cause lingering processes.

**Lines 631-632, 633-634:**
```python
except:
    pass
```
*Similar silent `except: pass` patterns.*

**File: `Orchestrator/orchestrator/api/server.py`**

**Lines 1390-1399:**
```python
try:
    data = json.loads(...)
    ...
except Exception:
    pass
```
*Swallows JSON parsing errors entirely.* This silently drops project entries, which can lead to confusing "missing project" behavior.

**Recommendation:**
```python
# Replace bare excepts with targeted exceptions + structured logging
import logging

logger = logging.getLogger(__name__)

try:
    # ... operation
except ValueError as e:
    logger.warning(f"Validation failed: {e}")
    return True
except IOError as e:
    logger.error(f"I/O error: {e}")
    raise
except Exception as e:
    logger.error(f"Unexpected error: {e}", exc_info=True)
    raise
```

---

### 1.2 Type Hints & Docstrings

**Good Examples:**
- `server.py` has docstrings and type hints for most functions
- Pydantic models have comprehensive Field descriptions
- Some files have excellent documentation

**Weak Spots:**

**File: `start.py`**
- Minimal typing and thin docstrings in helper methods and utilities
- Example: `def _windows_cleanup_orphans(self) -> None:` has a docstring, but multiple internal utility functions lack full error surface documentation

**File: `CinemaPromptEngineering/api/main.py`**
- Many endpoints have docstrings, but exception handling is broad
- **Wraps all exceptions into HTTP 422**, which can obscure system bugs

**Recommendation:**
```python
# Add explicit return types and docstrings for helper utilities
from typing import Optional, Dict, Any

def validate_config(
    config: Dict[str, Any],
    project_type: str
) -> ValidationResult:
    """Validate a configuration and return violations.

    Args:
        config: Configuration dictionary to validate
        project_type: Type of project (live_action/animation)

    Returns:
        ValidationResult with validation results

    Raises:
        ValueError: If config structure is invalid
        ValidationError: If configuration violates rules
    """
    try:
        if project_type == "live_action":
            parsed_config = LiveActionConfig(**config)
            return engine.validate_live_action(parsed_config)
        else:
            parsed_config = AnimationConfig(**config)
            return engine.validate_animation(parsed_config)
    except ValidationError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected validation error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
```

---

### 1.3 PEP 8 & Readability

**Long Functions / Complexity:**
- `start.py` appears to contain multiple long procedures in one file (process management, venv, port kill)
- `server.py` is large; deep `try/except` nesting increases complexity

**Recommendation:**
```python
# Break start.py into separate modules
# Structure:
start/
├── __init__.py
├── main.py              # Entry point
├── process_manager.py    # Process control
├── venv_manager.py       # Virtual environment setup
├── port_manager.py       # Port cleanup
└── utils.py             # Utilities
```

---

### 1.4 Magic Numbers / Hardcoded Values

**File: `start.py`**
- **Lines 199-202:** timeout = `10` (pip check), `120` (venv), `600` (pip install), `5` (wmic query). These are meaningful but not named constants.

**File: `CinemaPromptEngineering/api/main.py`**
- Hardcoded manufacturer lists in camera endpoints (e.g., `"ARRI", "RED", ...`)

**File: `StoryboardUI.tsx`**
- **Lines 282-285:** `isNarrowViewport(768)` — magic breakpoint
- **Line 334:** keep last `500` logs

**Recommendation:**
```python
# Define constants at module level
# start.py
CHECK_TIMEOUT_SECONDS = 10
VENV_CREATE_TIMEOUT_SECONDS = 120
PIP_INSTALL_TIMEOUT_SECONDS = 600
WMIC_QUERY_TIMEOUT_SECONDS = 5

# StoryboardUI.tsx
const BREAKPOINT_MD = 768;
const MAX_LOG_ENTRIES = 500;
```

---

### 1.5 Error Handling Patterns (Generic Exceptions)

**File: `CinemaPromptEngineering/api/main.py`**

**Lines 201-210, 213-235:**
```python
except Exception as e:
    raise HTTPException(status_code=422, detail=str(e))
```

*All errors return 422.* This converts internal errors into "validation errors," masking server bugs and complicating monitoring.

**Recommendation:**
```python
# Distinguish between validation errors (422) and server errors (500)
from pydantic import ValidationError

@app.post("/validate", response_model=ValidationResult)
async def validate_config(request: ValidateRequest):
    try:
        if request.project_type == ProjectType.LIVE_ACTION:
            config = LiveActionConfig(**request.config)
            return engine.validate_live_action(config)
        else:
            config = AnimationConfig(**request.config)
            return engine.validate_animation(config)
    except ValidationError as e:
        # Validation error - return 422
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        # Unexpected error - return 500
        logger.error(f"Validation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")
```

---

## 2. TYPESCRIPT / REACT CODE QUALITY

### 2.1 Type Safety ("any" Usage)

**Multiple `any` occurrences** in critical workflow & UI logic.

**File: `StoryboardUI.tsx`**
- **Line 261:** `useState<Record<string, any>>({})`
- **Line 303:** `useState<any>(null)`
- **Line 1518:** `catch (error: any)`
- **Lines 1957, 2043:** `any` in mapping workflow responses

**File: `WorkflowEditor.tsx`**
- **Line 42:** `default: any;`
- **Line 72:** `value: any;`
- **Line 112:** `inferParameterType(inputName: string, value: any)`
- **Line 136:** `getDefaultConstraints(type: string, _value: any): any`

**Risk:** Any usage hides type errors in workflow parsing and generation (high-risk areas).

**Recommendation:**
```typescript
// Introduce explicit types for workflow inputs and response shapes
interface WorkflowInput {
  name: string;
  type: 'text' | 'number' | 'boolean' | 'select';
  default: unknown;
  constraints?: Record<string, unknown>;
}

interface WorkflowNode {
  id: string;
  type: string;
  inputs: Record<string, WorkflowInput>;
  outputs: Record<string, WorkflowInput>;
}

interface WorkflowExecution {
  prompt_id: string;
  status: 'pending' | 'executing' | 'completed' | 'failed';
  nodes: Record<string, WorkflowNodeExecution>;
}

// Use unknown + type guards instead of any
function parseWorkflowResponse(response: unknown): WorkflowExecution {
  if (typeof response !== 'object' || response === null) {
    throw new Error('Invalid workflow response');
  }

  // Type guard
  if ('prompt_id' in response && typeof response.prompt_id === 'string') {
    return response as WorkflowExecution;
  }

  throw new Error('Missing prompt_id in response');
}
```

---

### 2.2 ESLint Violations / Console.log Usage

**Extensive logging**, likely violating `no-console` in production builds.

**File: `ImageDropZone.tsx`**
- **Lines 200-257:** many `console.log` calls

**File: `StoryboardUI.tsx`**
- Many `console.log` statements (see grep output, e.g., lines 1095, 1119, 1316, 1634, etc.)

**File: `project-manager.ts`**
- **Lines 529-561:** explicit debug banner logs (🚨 DEBUG CODE RUNNING)

**Recommendation:**
```typescript
// Create centralized logger that can be disabled in production
const isDevelopment = import.meta.env.DEV;

const logger = {
  debug: (...args: unknown[]) => {
    if (isDevelopment) {
      console.debug('[DEBUG]', ...args);
    }
  },
  info: (...args: unknown[]) => {
    if (isDevelopment) {
      console.info('[INFO]', ...args);
    }
  },
  warn: (...args: unknown[]) => {
    console.warn('[WARN]', ...args);
  },
  error: (...args: unknown[]) => {
    console.error('[ERROR]', ...args);
  },
};

// Use in code
logger.debug('Image loaded', { width, height });
logger.error('Failed to fetch backends', error);

// Configure ESLint to enforce no-console in production
// .eslintrc.js
module.exports = {
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
  },
};
```

---

### 2.3 Component Size / Complexity

**File: `StoryboardUI.tsx`**
- Very large with dozens of state hooks and mixed concerns
- Example: **Lines 241-359** already shows large local state surface

**Recommendation:**
```typescript
// Split StoryboardUI into:
// 1. State hooks in custom hooks
function usePanelsState(initialPanels: Panel[]) {
  const [panels, setPanels] = useState<Panel[]>(initialPanels);

  const addPanel = useCallback((panel: Panel) => {
    setPanels(prev => [...prev, panel]);
  }, []);

  const removePanel = useCallback((id: number) => {
    setPanels(prev => prev.filter(p => p.id !== id));
  }, []);

  const updatePanel = useCallback((id: number, updates: Partial<Panel>) => {
    setPanels(prev => prev.map(p =>
      p.id === id ? { ...p, ...updates } : p
    ));
  }, []);

  return { panels, addPanel, removePanel, updatePanel };
}

// 2. Separate components
// Canvas.tsx - Canvas rendering
// WorkflowPanel.tsx - Workflow editing
// ImageViewer.tsx - Image viewing
// LogViewer.tsx - Log display

// Main StoryboardUI becomes orchestration
export function StoryboardUI() {
  const { panels, addPanel, removePanel, updatePanel } = usePanelsState(initialPanels);

  return (
    <div className="storyboard-ui">
      <Canvas panels={panels} />
      <WorkflowPanel />
      <ImageViewer />
      <LogViewer />
    </div>
  );
}
```

---

### 2.4 Naming Conventions

**Generally consistent.** One notable issue:
- `ImageDropZone` accepts `acceptType?: MediaType` but there's no clear contract for "any" handling and file validation.

---

### 2.5 State Management Patterns

**Local state explosion** in `StoryboardUI` may lead to unintentional rerenders and hard-to-trace dependencies.

**Recommendation:**
```typescript
// Could be improved with a single Zustand store
import { create } from 'zustand';

interface StoryboardStore {
  panels: Panel[];
  selectedPanelId: number | null;
  workflow: Workflow | null;
  addPanel: (panel: Panel) => void;
  removePanel: (id: number) => void;
  updatePanel: (id: number, updates: Partial<Panel>) => void;
  selectPanel: (id: number) => void;
}

const useStoryboardStore = create<StoryboardStore>((set, get) => ({
  panels: initialPanels,
  selectedPanelId: null,
  workflow: null,

  addPanel: (panel) => set((state) => ({
    panels: [...state.panels, panel]
  })),

  removePanel: (id) => set((state) => ({
    panels: state.panels.filter(p => p.id !== id)
  })),

  updatePanel: (id, updates) => set((state) => ({
    panels: state.panels.map(p =>
      p.id === id ? { ...p, ...updates } : p
    ))
  })),

  selectPanel: (id) => set({ selectedPanelId: id }),
}));

// Usage in components
const panels = useStoryboardStore(state => state.panels);
const addPanel = useStoryboardStore(state => state.addPanel);
```

---

## 3. TESTING COVERAGE

### 3.1 Existing Tests

**Tests exist** under `tests/` and `Orchestrator/tests/` with unit + integration tests.

**Potential gaps based on structure:**
- **Frontend logic has no visible unit tests** (no `__tests__` or `*.test.tsx` in frontend)
- **`start.py`** has no explicit tests (automation/launcher logic)

**Recommendation:**
```typescript
// Add frontend tests
// __tests__/StoryboardUI.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';

describe('StoryboardUI', () => {
  it('should render initial panels', () => {
    render(<StoryboardUI />);
    expect(screen.getByTestId('panel-1')).toBeInTheDocument();
  });

  it('should add new panel', () => {
    // Test panel addition
  });

  it('should delete panel', () => {
    // Test panel deletion
  });
});
```

---

## 4. MAINTAINABILITY / ORGANIZATION

### 4.1 Function/Class Lengths

- `StoryboardUI.tsx` is extremely large, likely a **single-file feature hub**
- `start.py` mixes multiple responsibilities (process mgmt, venv mgmt, port kill)

### 4.2 File Organization

- `start.py` should be split into modules (e.g., `env.py`, `process_manager.py`, `ports.py`)

### 4.3 Import Organization

- Some files import inside functions (`main.py` camera endpoints), which is valid but makes static analysis and testing harder

---

## 5. SPECIFIC EXAMPLES

| Area | File | Lines | Issue |
|------|------|-------|-------|
| Bare except | `start.py` | 197–205 | `except:` returns True (hides failures) |
| Silent cleanup | `start.py` | 582–585 | `except: pass` |
| Silent parse | `server.py` | 1390–1399 | JSON parse errors ignored |
| Broad 422 | `api/main.py` | 201–210, 213–235 | converts all errors into 422 |
| `any` usage | `StoryboardUI.tsx` | 261, 303 | untyped state |
| `any` usage | `WorkflowEditor.tsx` | 42, 72, 112, 136 | config + helper types loose |
| Debug logs | `ImageDropZone.tsx` | 200–257 | many console logs |
| Debug logs | `project-manager.ts` | 529–561 | debug banner still active |

---

## RECOMMENDATIONS SUMMARY

### Immediate (Week 1)
1. [ ] Replace all bare `except:` blocks with specific exception types
2. [ ] Add structured logging to all exception handlers
3. [ ] Remove or disable all console.log in production
4. [ ] Add explicit types for workflow inputs/outputs
5. [ ] Create centralized logger utility

### High Priority (Month 1)
6. [ ] Refactor `StoryboardUI.tsx` into smaller components
7. [ ] Extract custom hooks from StoryboardUI
8. [ ] Split `start.py` into separate modules
9. [ ] Add frontend unit tests
10. [ ] Define constants for all magic numbers

### Medium Priority (Ongoing)
11. [ ] Establish single error handling pattern
12. [ ] Add Pylint or Flake8 to CI/CD
13. [ ] Set up mypy for type checking
14. [ ] Add ESLint pre-commit hooks
15. [ ] Document coding standards in AGENTS.md

---

**Next Steps:**
1. Review code quality findings with team
2. Prioritize fixes based on pain points
3. Set up linting and type checking in CI/CD
4. Create coding standards document
5. Schedule regular code review sessions
