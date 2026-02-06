# Subagent Instructions

> **CRITICAL**: Every subagent MUST read these files before starting any task.

## Required Reading (In Order)

1. **`docs/CODEMAP.md`** - Living codebase documentation, file status, patterns
2. **`Comfyui_Orchestrator.md`** - Original requirements, tech stack, architecture
3. **`docs/architecture/ui-layout.md`** - Exact UI specifications, colors, layouts
4. **`docs/architecture/data-models.md`** - Pydantic models, database schema

## Reference Code

- **`references/pyqt-node-editor/`** - Node canvas patterns (MUST study before canvas work)
- **`references/ryvencore-qt/`** - Qt node UI reference
- **`references/ComfyUI-Crystools/`** - GPU monitoring patterns

## Key Patterns

### Async Pattern
```python
# All I/O operations must be async
async def fetch_data():
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
        return response.json()
```

### Qt Signal Pattern
```python
# UI updates through signals
class BackendMonitor(QObject):
    status_changed = pyqtSignal(str, str)  # backend_id, status
    
    def on_status_update(self, backend_id: str, status: str):
        self.status_changed.emit(backend_id, status)
```

### Repository Pattern
```python
# Data access through repositories
class WorkflowRepository:
    def __init__(self, db: Database):
        self.db = db
    
    async def get(self, id: str) -> WorkflowDefinition | None:
        ...
```

## Color Scheme (MUST USE)

```python
# From docs/architecture/ui-layout.md
COLORS = {
    "background": "#1e1e1e",
    "panel_bg": "#252526",
    "node_bg": "#2d2d2d",
    "text_primary": "#ffffff",
    "text_secondary": "#888888",
    "accent": "#007acc",
    "success": "#4caf50",
    "warning": "#ff9800",
    "error": "#f44336",
}

# Node header colors
NODE_COLORS = {
    "INPUT": "#4caf50",      # green
    "WORKFLOW": "#2196f3",   # blue
    "CONDITION": "#ffeb3b",  # yellow
    "FANOUT": "#ff9800",     # orange
    "MERGE": "#9c27b0",      # purple
    "OUTPUT": "#f44336",     # red
}

# Connection colors by DataType
CONNECTION_COLORS = {
    "TRIGGER": "#888888",    # gray
    "IMAGE": "#4caf50",      # green
    "VIDEO": "#2196f3",      # blue
    "LATENT": "#ff9800",     # orange
    "ANY": "#ffffff",        # white
}
```

## After Task Completion

1. **Update `docs/CODEMAP.md`** with:
   - New files added
   - Status changes (⏳ → 🔄 → ✅)
   - Key classes/functions added

2. **Run tests** (if applicable):
   ```bash
   uv run pytest tests/ -q --tb=short
   ```

3. **Report any LSP errors** found in modified files

## Task Template

When receiving a task, ensure you have:
- [ ] Read CODEMAP.md
- [ ] Read Comfyui_Orchestrator.md
- [ ] Read relevant architecture doc
- [ ] Checked reference code if applicable
- [ ] Understood the exact requirements
- [ ] Know what files to modify
- [ ] Know how to validate success

## Common Mistakes to Avoid

1. **Don't skip reading docs** - Requirements are detailed and specific
2. **Don't invent your own colors** - Use the defined color scheme
3. **Don't create new patterns** - Follow existing patterns in codebase
4. **Don't forget CODEMAP update** - This is mandatory after any code change
5. **Don't use blocking I/O** - All network calls must be async
