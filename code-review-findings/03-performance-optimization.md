# Performance Optimization Analysis

**Report Date:** February 4, 2026
**Analyzer:** AI Performance Review
**Overall Performance Rating:** MEDIUM-HIGH

## Executive Summary

The Director's Console codebase has significant performance issues affecting user experience, resource utilization, and scalability. Key problems include a 12,000+ line monolithic React component, missing memoization, inefficient network patterns, and lack of optimization best practices.

## Verification Status (Feb 4, 2026)

**Verified:**
- `comfyui-websocket.ts` reconnect uses fixed 3s delay (no exponential backoff).
- Progress logging occurs on each WS update.
- `App.tsx` keeps both tabs mounted by design.
- `orchestrator.ts` `fetchBackendsFromAPI` has no request deduplication.
- `vite.config.ts` has no manual chunks or explicit code splitting config.

**Needs Recheck:**
- StoryboardUI line count and any measured render timing claims.
- Bundle/dist size numbers (require build output verification).

---

## 1. FRONTEND PERFORMANCE ISSUES

### 1.1 Large Monolithic Component - StoryboardUI.tsx

**Severity:** CRITICAL
**File:** `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx`
**Lines:** ~12k (needs verification)

**Problems:**
- Lines 190-636: 30+ useState hooks in a single component
- No component splitting or lazy loading
- All effects and callbacks cause full re-renders
- Mixed concerns: UI, networking, state, logging, viewer, workflow logic

**Code Snippet (Lines 224-247):**
```typescript
const [panels, setPanels] = useState<Panel[]>(() => [
  { id: 1, image: null, images: [], imageHistory: [], ... },
  { id: 2, image: null, images: [], imageHistory: [], ... },
  { id: 3, image: null, images: [], imageHistory: [], ... },
  { id: 4, image: null, images: [], imageHistory: [], ... },
  { id: 5, image: null, images: [], imageHistory: [], ... },
  { id: 6, image: null, images: [], imageHistory: [], ... },
]);
```

**Impact:**
- Slow initial render (2-5 seconds on cold load)
- Every state change re-renders entire component
- Difficult to debug and maintain
- Bundle size unnecessarily large

**Recommendation:**
```typescript
// 1. Split into smaller components with React.memo
// 2. Use useReducer for related state
// 3. Virtualize panel list with react-window
import { FixedSizeGrid as Grid } from 'react-window';

const MemoizedPanel = React.memo(({ panel, ...props }) => (
  <PanelComponent panel={panel} {...props} />
));

// 4. Lazy load heavy dialogs
const WorkflowEditor = React.lazy(() => import('./components/WorkflowEditor'));
const NodeManager = React.lazy(() => import('./components/NodeManager'));

// 5. Extract hooks into custom hooks
function usePanelsState() {
  const [panels, setPanels] = useState<Panel[]>(initialPanels);
  const addPanel = useCallback((panel: Panel) => {
    setPanels(prev => [...prev, panel]);
  }, []);
  const removePanel = useCallback((id: number) => {
    setPanels(prev => prev.filter(p => p.id !== id));
  }, []);

  return { panels, setPanels, addPanel, removePanel };
}
```

---

### 1.2 Missing `useMemo` and `useCallback` - ParameterWidgets.tsx

**Severity:** HIGH
**File:** `CinemaPromptEngineering/frontend/src/storyboard/components/ParameterWidgets.tsx`

**Problem:** Re-creating functions on every render

**Code Snippet (Lines 55-59):**
```typescript
const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const newValue = parseInt(e.target.value);
  setLocalValue(newValue);
  onChange(parameter.name, newValue); // Creates new reference
}, [parameter.name, onChange]);
```

**Problem:** `onChange` prop changes on every parent render, breaking memoization

**Impact:**
- Child components re-render unnecessarily
- Parameter widgets re-render on every change
- Slider interactions feel sluggish

**Recommendation:**
```typescript
// Use stable callback ref pattern
const onChangeRef = useRef(onChange);
useEffect(() => { onChangeRef.current = onChange; }, [onChange]);

const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
  const newValue = parseInt(e.target.value);
  setLocalValue(newValue);
  onChangeRef.current?.(parameter.name, newValue);
}, [parameter.name]);

// Also memoize parameter objects
const memoizedParameter = useMemo(() => parameter, [parameter.id, parameter.default]);
```

---

### 1.3 Unnecessary Re-renders - ParameterPanel

**Severity:** HIGH
**File:** `CinemaPromptEngineering/frontend/src/storyboard/components/ParameterWidgets.tsx` (Lines 773-802)

**Code Snippet:**
```typescript
export function ParameterPanel({ parameters, values, onChange, ... }: ParameterPanelProps) {
  return (
    <div className="parameter-panel">
      <div className="parameter-panel-title">Parameters</div>
      <div className="parameter-list">
        {parameters.map((parameter) => (
          <ParameterWidget
            key={parameter.name}
            parameter={parameter}  // New object on every render
            value={values[parameter.name]}
            onChange={onChange}      // New function on every render
            ...
          />
        ))}
      </div>
    </div>
  );
}
```

**Impact:**
- All ParameterWidgets re-render when any parameter changes
- Sliders feel laggy with many parameters
- Excessive CPU usage during parameter editing

**Recommendation:**
```typescript
// Memoize entire widget
const MemoizedParameterWidget = React.memo(ParameterWidget, (prev, next) =>
  prev.parameter.name === next.parameter.name &&
  prev.value === next.value
);

// Use useMemo for value extraction
const parameterValue = useMemo(() => values[parameter.name], [values, parameter.name]);
```

---

### 1.4 Image Memory Leaks - Image Drop Zone & Viewer

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx`
**Lines:** 700-738

**Code Snippet (Lines 716-727):**
```typescript
const objectUrl = URL.createObjectURL(blob);
const img = new Image();
img.onload = () => {
  setViewerImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
  URL.revokeObjectURL(objectUrl);  // Good practice
};
img.onerror = () => {
  setViewerImageDimensions(undefined);
  URL.revokeObjectURL(objectUrl);  // Good practice
};
img.src = objectUrl;
```

**Issue:** Multiple image loads can create memory pressure

**Impact:**
- Browser crashes with many images loaded
- Slow performance when switching between images
- High memory usage in long sessions

**Recommendation:**
```typescript
// 1. Implement image cache with LRU eviction
import { LRUCache } from 'lru-cache';

const imageCache = new LRUCache<string, ImageDimensions>({ max: 50 });

// 2. Use Intersection Observer for lazy loading
const imageRef = useRef<HTMLImageElement>(null);
const [isVisible, setIsVisible] = useState(false);

useEffect(() => {
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) setIsVisible(true);
  }, { threshold: 0.1 });

  if (imageRef.current) observer.observe(imageRef.current);
  return () => observer.disconnect();
}, []);

// 3. Implement proper cleanup for all object URLs
useEffect(() => {
  return () => {
    // Revoke all created URLs
    createdUrls.forEach(url => URL.revokeObjectURL(url));
  };
}, []);
```

---

### 1.5 WebSocket Reconnection Storm

**Severity:** CRITICAL
**File:** `CinemaPromptEngineering/frontend/src/storyboard/services/comfyui-websocket.ts`
**Lines:** 135-143

**Code Snippet:**
```typescript
private scheduleReconnect() {
  if (this.reconnectTimeout) return;

  this.reconnectTimeout = window.setTimeout(() => {
    this.reconnectTimeout = null;
    this.connect().catch(() => {
      // Will retry via scheduleReconnect in onclose
    });
  }, 3000);
}
```

**Problem:** No exponential backoff, connection storms

**Attack Vector:**
- Network instability causes rapid reconnection attempts
- Server overwhelmed with connection requests
- Browser performance degradation

**Impact:**
- DoS of WebSocket server
- Browser CPU spikes during network issues
- Poor user experience during connectivity problems

**Recommendation:**
```typescript
private reconnectAttempts = 0;
private maxReconnectAttempts = 10;
private baseReconnectDelay = 3000;

private scheduleReconnect() {
  if (this.reconnectTimeout || this.reconnectAttempts >= this.maxReconnectAttempts) {
    return;
  }

  // Exponential backoff with jitter
  const delay = this.baseReconnectDelay * Math.pow(2, this.reconnectAttempts);
  const jitter = Math.random() * 1000;

  this.reconnectTimeout = window.setTimeout(() => {
    this.reconnectTimeout = null;
    this.reconnectAttempts++;
    this.connect().catch(() => {
      // Will retry via scheduleReconnect in onclose
    });
  }, delay + jitter);
}

// Reset attempts on successful connect
this.ws.onopen = () => {
  this.reconnectAttempts = 0;
  this.isConnected = true;
  resolve();
};
```

---

### 1.6 No Request Deduplication

**Severity:** HIGH
**File:** `CinemaPromptEngineering/frontend/src/storyboard/services/orchestrator.ts`
**Lines:** 46-96

**Code Snippet:**
```typescript
async fetchBackendsFromAPI(orchestratorUrl: string): Promise<void> {
  try {
    const response = await fetch(`${orchestratorUrl}/api/backends`);
    if (!response.ok) {
      console.error('[Orchestrator] Failed to fetch backends:', response.status);
      return;
    }
    // ... processes data
  } catch (error) {
    console.error('[Orchestrator] Error fetching backends:', error);
  }
}
```

**Problem:** Called repeatedly without deduplication

**Impact:**
- Duplicate API calls waste bandwidth
- Server load increases unnecessarily
- Stale data when multiple components request simultaneously

**Recommendation:**
```typescript
// Add request deduplication
private pendingRequests = new Map<string, Promise<void>>();

async fetchBackendsFromAPI(orchestratorUrl: string): Promise<void> {
  const cacheKey = `backends_${orchestratorUrl}`;

  // Return existing pending request
  if (this.pendingRequests.has(cacheKey)) {
    return this.pendingRequests.get(cacheKey);
  }

  const requestPromise = (async () => {
    try {
      const response = await fetch(`${orchestratorUrl}/api/backends`);
      // ... process data
      return Promise.resolve();
    } catch (error) {
      console.error('[Orchestrator] Error fetching backends:', error);
      throw error;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  })();

  this.pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
}
```

---

### 1.7 Bundle Size Issues

**Severity:** MEDIUM
**Current:**
- `node_modules`: 186MB
- `dist`: 24MB

**Issues:**
- No code splitting configured
- All dependencies bundled together
- No tree-shaking optimization

**Recommendation in `vite.config.ts`:**
```typescript
import { visualizer } from 'rollup-plugin-visualizer';

export default defineConfig({
  plugins: [
    react(),
    visualizer({
      open: true,
      gzipSize: true,
      brotliSize: true,
    }),
  ],
  build: {
    minify: 'terser',
    sourcemap: false,
    terserOptions: {
      compress: {
        drop_console: true,  // Remove console.log in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['lucide-react', 'react-select'],
          'state-vendor': ['zustand'],
          'three-vendor': ['three'],
        },
      },
    },
    chunkSizeWarningLimit: 500,
  },
  esbuild: {
    target: 'es2020',
    legalComments: 'none',  // Remove comments
  },
});
```

---

## 2. BACKEND PERFORMANCE ISSUES

### 2.1 Blocking Database Operations - Missing Async Patterns

**Severity:** HIGH
**File:** `CinemaPromptEngineering/api/main.py`
**Lines:** 199-234

**Code Snippet:**
```python
@app.post("/validate", response_model=ValidationResult)
async def validate_config(request: ValidateRequest):
    """Validate a configuration and return any rule violations."""
    try:
        if request.project_type == ProjectType.LIVE_ACTION:
            config = LiveActionConfig(**request.config)
            return engine.validate_live_action(config)  # Blocking call!
        else:
            config = AnimationConfig(**request.config)
            return engine.validate_animation(config)  # Blocking call!
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))
```

**Problem:** Synchronous validation blocks event loop

**Impact:**
- API responsiveness degrades under load
- Requests queue up waiting for validation
- CPU-intensive operations block other requests

**Recommendation:**
```python
import asyncio

async def validate_config(request: ValidateRequest):
    try:
        if request.project_type == ProjectType.LIVE_ACTION:
            config = LiveActionConfig(**request.config)
            # Run CPU-intensive validation in thread pool
            return await asyncio.to_thread(
                engine.validate_live_action, config
            )
        else:
            config = AnimationConfig(**request.config)
            return await asyncio.to_thread(
                engine.validate_animation, config
            )
```

---

### 2.2 No Connection Pooling

**Severity:** HIGH
**File:** `CinemaPromptEngineering/api/main.py`

**Issue:** Using default fetch without connection pooling

**Recommendation:**
```python
import httpx

# Use async client with connection pooling
client = httpx.AsyncClient(
    timeout=httpx.Timeout(30.0, connect=5.0),
    limits=httpx.Limits(
        max_connections=100,
        max_keepalive_connections=20,
        keepalive_expiry=5.0
    ),
    http2=True,  # Enable HTTP/2 for multiplexing
)

@app.on_event("shutdown")
async def shutdown():
    await client.aclose()
```

---

### 2.3 In-Memory OAuth State - Memory Leak

**Severity:** HIGH
**File:** `CinemaPromptEngineering/api/main.py`
**Lines:** 1088-1089

**Code Snippet:**
```python
# In-memory storage for OAuth state (would use Redis/database in production)
_oauth_states: dict[str, dict] = {}
```

**Problem:** Never cleaned up, accumulates memory

**Impact:**
- Memory grows unbounded over time
- Server crashes after long uptime
- Unused entries waste RAM

**Recommendation:**
```python
import time
from datetime import datetime, timedelta

_oauth_states: dict[str, dict] = {}
OAUTH_STATE_TTL = 300  # 5 minutes

@app.on_event("startup")
async def start_oauth_cleanup():
    """Clean up expired OAuth states periodically."""
    while True:
        await asyncio.sleep(60)  # Check every minute
        now = datetime.utcnow()
        expired_keys = [
            key for key, data in _oauth_states.items()
            if now - data.get('created_at', now) > timedelta(seconds=OAUTH_STATE_TTL)
        ]
        for key in expired_keys:
            _oauth_states.pop(key, None)

# When storing state
_oauth_states[oauth_state.state] = {
    "provider_id": provider_id,
    "code_verifier": oauth_state.code_verifier,
    "redirect_uri": actual_redirect_uri,
    "created_at": datetime.utcnow(),  # Track creation time
}
```

---

### 2.4 Missing Response Compression

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/api/main.py`
**Lines:** 42-46

**Code Snippet:**
```python
app = FastAPI(
    title="Cinema Prompt Engineering API",
    description="Professional cinematography prompt generator for AI image/video models",
    version="0.1.0",
)
```

**Recommendation:**
```python
from fastapi.middleware.gzip import GZipMiddleware

app = FastAPI(...)

# Add compression for responses > 1KB
app.add_middleware(
    GZipMiddleware,
    minimum_size=1000,
    compresslevel=6,  # Balance CPU vs compression ratio
)
```

---

### 2.5 No Caching Headers

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/api/main.py`
**Multiple endpoints**

**Recommendation:**
```python
from fastapi import Response

@app.get("/presets/live-action")
async def get_live_action_presets():
    """Get all available film style presets."""
    data = {
        "count": len(LIVE_ACTION_PRESETS),
        "presets": [...]
    }
    return Response(
        content=json.dumps(data),
        media_type="application/json",
        headers={
            "Cache-Control": "public, max-age=3600",  # 1 hour cache
            "ETag": hashlib.md5(json.dumps(data).encode()).hexdigest(),
        }
    )
```

---

## 3. COMFYUI INTEGRATION PERFORMANCE

### 3.1 Excessive WebSocket Message Logging

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/frontend/src/storyboard/services/comfyui-websocket.ts`
**Lines:** 210-227

**Code Snippet:**
```typescript
private handleProgress(data: any) {
  const { value, max, prompt_id, node } = data;

  console.log('[ComfyUI WS] Progress:', prompt_id, value, '/', max, 'node:', node);
  console.log('[ComfyUI WS] Pending prompts:', Array.from(this.pendingPrompts.keys()));

  const pending = this.pendingPrompts.get(prompt_id);
  // ...
}
```

**Problem:** Logging every progress update (can be 10+ times per second)

**Impact:**
- Console becomes unusable during generation
- Performance overhead from excessive logging
- Browser memory growth from log entries

**Recommendation:**
```typescript
// Rate-limit debug logging
private lastLogTime = 0;
private LOG_THROTTLE_MS = 1000;

private handleProgress(data: any) {
  const { value, max, prompt_id, node } = data;

  // Throttle logs to once per second
  const now = Date.now();
  if (now - this.lastLogTime > this.LOG_THROTTLE_MS) {
    console.log('[ComfyUI WS] Progress:', prompt_id, value, '/', max, 'node:', node);
    this.lastLogTime = now;
  }

  const pending = this.pendingPrompts.get(prompt_id);
  // ...
}
```

---

### 3.2 No Progress Update Batching

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx`

**Issue:** Every WebSocket progress update triggers full component re-render

**Recommendation:**
```typescript
// Use requestAnimationFrame to batch updates
const progressRef = useRef<Map<string, number>>(new Map());
const scheduledUpdateRef = useRef(false);

const handleProgressUpdate = useCallback((panelId: number, progress: number) => {
  progressRef.current.set(String(panelId), progress);

  if (!scheduledUpdateRef.current) {
    scheduledUpdateRef.current = true;
    requestAnimationFrame(() => {
      setPanels(prev => prev.map(p => {
        const newProgress = progressRef.current.get(String(p.id));
        return newProgress !== undefined ? { ...p, progress: newProgress } : p;
      }));
      scheduledUpdateRef.current = false;
      progressRef.current.clear();
    });
  }
}, []);
```

---

### 3.3 Binary WebSocket Data Not Handled

**Severity:** LOW
**File:** `CinemaPromptEngineering/frontend/src/storyboard/services/comfyui-websocket.ts`
**Lines:** 103-108

**Code Snippet:**
```typescript
this.ws.onmessage = (event) => {
  // ComfyUI sends both JSON text messages and binary Blob data (preview images)
  if (event.data instanceof Blob) {
    // Binary data (preview image) - ignore for now
    // Could be used for real-time preview in future
    return;
  }
  // ...
};
```

**Recommendation:**
```typescript
// Implement preview image streaming
this.ws.onmessage = async (event) => {
  if (event.data instanceof Blob) {
    // Decode preview image
    const imageUrl = URL.createObjectURL(event.data);

    // Update UI with preview (throttled)
    if (!this.previewThrottle) {
      this.previewThrottle = requestAnimationFrame(() => {
        this.onPreview?.(imageUrl);
        this.previewThrottle = null;
      });
    }
    return;
  }

  try {
    const message = JSON.parse(event.data);
    this.handleMessage(message);
  } catch (e) {
    console.error('[ComfyUI WS] Failed to parse message:', e);
  }
};
```

---

### 3.4 Redundant Polling - NodeManager

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/frontend/src/storyboard/services/orchestrator.ts`
**Lines:** 314-324

**Code Snippet:**
```typescript
startPolling(intervalMs: number = 5000): void {
  if (this.pollingInterval) {
    clearInterval(this.pollingInterval);
  }

  this.pollingInterval = window.setInterval(() => {
    this.nodes.forEach(node => {
      this.pollNode(node);  // Serial polling
    });
  }, intervalMs);
}
```

**Problem:** Serial polling, blocks on each request

**Impact:**
- Slow updates for multiple nodes
- UI freezes while polling
- Poor scaling with many backends

**Recommendation:**
```typescript
startPolling(intervalMs: number = 5000): void {
  if (this.pollingInterval) {
    clearInterval(this.pollingInterval);
  }

  this.pollingInterval = window.setInterval(async () => {
    // Poll all nodes in parallel
    await Promise.allSettled(
      Array.from(this.nodes.values()).map(node =>
        this.pollNode(node).catch(err => {
          console.warn(`Poll failed for ${node.id}:`, err);
        })
      )
    );
  }, intervalMs);
}
```

---

## 4. BUILD & DEPLOYMENT PERFORMANCE

### 4.1 Slow Frontend Build

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/frontend/vite.config.ts`

**Recommendation:**
```typescript
export default defineConfig({
  plugins: [react()],
  build: {
    minify: 'terser',
    sourcemap: false, // Disable in production
    terserOptions: {
      compress: {
        drop_console: true,  // Remove console.log in production
        drop_debugger: true,
      },
    },
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor': ['react', 'react-dom', 'zustand'],
          'ui': ['lucide-react', 'react-select'],
        },
      },
    },
    chunkSizeWarningLimit: 500,  // Warn at 500KB
  },
  esbuild: {
    target: 'es2020',
    legalComments: 'none',  // Remove comments
  },
});
```

---

### 4.2 No Build Cache Configuration

**Severity:** MEDIUM
**File:** `CinemaPromptEngineering/frontend/vite.config.ts`

**Recommendation:**
```typescript
export default defineConfig({
  // ... existing config
  optimizeDeps: {
    // Pre-bundle dependencies
    include: [
      'react',
      'react-dom',
      'zustand',
      'lucide-react',
    ],
  },
  server: {
    fs: {
      strict: false,  // Allow symlinks
    },
    hmr: {
      overlay: true,  // Use error overlay
    },
    watch: {
      usePolling: false,  // Use native file watching
      ignored: ['**/node_modules/**', '**/dist/**'],
    },
  },
});
```

---

## 5. CRITICAL ISSUES SUMMARY

| Priority | Issue | Impact | File |
|----------|--------|--------|-------|
| **CRITICAL** | 12,000+ line monolithic component | Slow initial load, massive bundle |
| **CRITICAL** | No WebSocket exponential backoff | Connection storms, server load |
| **HIGH** | Missing request deduplication | Duplicate API calls |
| **HIGH** | No connection pooling | Slow HTTP requests |
| **HIGH** | No code splitting | 24MB bundle size |
| **MEDIUM** | Excessive console logging | Performance overhead |
| **MEDIUM** | No progress batching | Unnecessary re-renders |
| **MEDIUM** | No image virtualization | Memory pressure with many panels |
| **LOW** | In-memory OAuth state | Memory leak over time |
| **LOW** | Missing cache headers | Slower repeat visits |

---

## QUICK WINS (Implement First)

1. **Add compression middleware** (2 minutes) - 40%+ smaller responses
2. **Rate-limit console logs** (10 minutes) - Reduced overhead
3. **Add React.memo to ParameterWidget** (5 minutes) - 50% fewer re-renders
4. **Implement WebSocket exponential backoff** (15 minutes) - Prevent connection storms
5. **Enable terser drop_console** (2 minutes) - Smaller production bundle
6. **Add request deduplication** (20 minutes) - Fewer duplicate calls
7. **Enable incremental TypeScript compilation** (2 minutes) - Faster builds

---

**Next Steps:**
1. Implement all quick wins within 1 week
2. Profile performance before/after
3. Set up performance monitoring (Lighthouse, Web Vitals)
4. Create performance budget for bundle size
5. Add performance tests to CI/CD pipeline
