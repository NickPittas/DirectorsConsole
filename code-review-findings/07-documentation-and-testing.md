# Documentation and Testing Coverage

**Report Date:** February 4, 2026
**Analyzer:** AI Code Review
**Overall Rating:** MEDIUM

## Executive Summary

Documentation coverage is incomplete, with several major features undocumented. Testing coverage is minimal, with critical API endpoints having zero tests. Both areas need significant improvement before the project can be considered production-ready.

## Verification Status (Feb 4, 2026)

**Verified:**
- `Orchestrator/docs/API.md` is outdated (port 8000, Phase 1 mock behavior).
- No frontend `*.test.ts`/`*.test.tsx` files are present.
- Orchestrator tests do not reference project-management endpoints (no tests for scan/serve/delete/create/browse/scan-versions/save/load/png-metadata).

**Stale:**
- AGENTS.md issues listed here were addressed in a later update and should be revalidated before acting on them.

**Needs Recheck:**
- Test coverage for non-project-management endpoints (templates, OAuth, provider settings).

---

## 1. DOCUMENTATION QUALITY ISSUES

### 1.1 Outdated AGENTS.md Documentation

**Severity:** HIGH
**File:** `AGENTS.md`

| Issue | Line | Problem |
|--------|-------|---------|
| Orchestrator API entry point | Various | References `orchestrator/api.py` but actual file is `orchestrator/api/server.py` |
| Orchestrator startup command | ~Line 43 | Shows `python -m orchestrator.server` but actual startup uses `python -m uvicorn orchestrator.api:app` |
| API Endpoints Reference | ~Line 129-135 | Lists simplified endpoints missing many that are actually implemented |

**Impact:** Users get confused by incorrect information

---

### 1.2 Outdated Orchestrator API Documentation

**Severity:** CRITICAL
**File:** `Orchestrator/docs/API.md`

| Issue | Lines | Problem |
|--------|--------|---------|
| Phase 1 mock behavior | 116-120 | Claims "Does NOT execute" but API now fully executes jobs |
| Port inconsistency | 66, 69 | Examples use port 8000, but actual default is 8020 |
| Missing endpoints | - | No documentation for project management endpoints added in Phase 2+ |

**Missing Endpoints from Documentation:**
```
/api/scan-project-images      - Lines 1678-1754 in server.py
/api/serve-image             - Lines 1517-1565 in server.py
/api/delete-image            - Lines 1860-1911 in server.py
/api/create-folder           - Lines 1472-1510 in server.py
/api/scan-versions           - Lines 1078-1198 in server.py
/api/project                 - Lines 1254-1295 in server.py
/api/save-project           - Lines 1302-1377 in server.py
/api/load-project           - Lines 1382-1416 in server.py
/api/png-metadata           - Lines 1578-1648 in server.py
/api/browse-folders         - Lines 1379-1417 in server.py
```

**Impact:** Users can't discover or use implemented features

**Recommendation:**
```markdown
## Orchestrator API v1

### Project Management

#### Scan Project Images
```bash
POST /api/v1/scan-project-images
Content-Type: application/json

{
  "project_path": "//NAS_HOST/Projects/Eliot/MyProject"
}
```

#### Serve Project Image
```bash
GET /api/v1/serve-image?image_path=...
```

#### Delete Project Image
```bash
DELETE /api/v1/delete-image?image_path=...
```

#### Create Folder
```bash
POST /api/v1/create-folder
Content-Type: application/json

{
  "parent_path": "//NAS_HOST/Projects/Eliot/MyProject",
  "folder_name": "NewFolder"
}
```

# ... document all other endpoints
```

---

### 1.3 CPE API Documentation Gaps

**Severity:** HIGH
**File:** `CinemaPromptEngineering/README.md`

| Missing Documentation | Implementation Status |
|---------------------|----------------------|
| Templates API endpoints | Implemented in `api/templates.py`, included in `api/main.py` line 49 |
| `/api/enhance-prompt` endpoint | Lines 2007-2026 in main.py |
| `/api/read-image` endpoint | Referenced in frontend/ImageDropZone.tsx line 329 |
| OAuth flow endpoints | Lines 1078-1446 in main.py (6 endpoints) |
| Provider settings endpoints | Lines 964-661 in main.py (30+ endpoints) |
| LLM models | Lines 1886-1987 in main.py |

**Impact:** Users don't know about major features

---

### 1.4 Inline Documentation Quality

**CPE API (`api/main.py`):**
- **Good:** 100+ docstrings covering all endpoints
- **Good:** Pydantic models have detailed descriptions
- **Issue:** Some docstrings are minimal (e.g., lines 761, 771)

**Orchestrator API (`orchestrator/api/server.py`):**
- **Good:** 87 docstrings covering all major endpoints
- **Good:** Request/Response models have comprehensive Field descriptions
- **Issue:** New project management endpoints have minimal inline docs

**Recommendation:**
```python
# Add comprehensive docstrings to all endpoints
@app.post("/api/v1/templates/build_workflow")
async def build_workflow(
    request: BuildWorkflowRequest
) -> BuildWorkflowResponse:
    """Build a complete ComfyUI workflow from a template.

    This endpoint accepts a template name and optional parameter values,
    then generates a complete ComfyUI workflow JSON that can be
    submitted directly to ComfyUI for execution.

    Args:
        request: BuildWorkflowRequest containing:
            - template_name: Name of the template to use
            - prompt_values: Optional parameter overrides
            - camera_angle: Optional camera angle to prepend
            - enable_next_scene: Enable next scene token

    Returns:
        BuildWorkflowResponse containing:
            - workflow: Complete ComfyUI workflow JSON
            - nodes: List of nodes in workflow
            - links: List of connections between nodes

    Raises:
        HTTPException 404: If template not found
        HTTPException 422: If parameters are invalid
    """
    # ... implementation
```

---

## 2. TESTING COVERAGE GAPS

### 2.1 CPE Testing Issues

**File:** `tests/test_cpe_api.py`

| Missing Test Coverage | Endpoint |
|---------------------|-----------|
| Templates system | `/api/templates/*` |
| Prompt enhancement | `/api/enhance-prompt` |
| OAuth flows | `/api/oauth/*` (6 endpoints) |
| Provider connection testing | `/api/settings/providers/*/test` |
| Provider settings management | `/api/settings/providers/*` (15+ endpoints) |
| Credential management | `/api/credentials/*` (4 endpoints) |
| LLM models | `/api/llm/models`, `/api/target-models` |
| Image reading | `/api/read-image` |

**File:** `tests/test_cinema_rules.py`

- Only tests imports (lines 6-98)
- No validation logic testing
- No rule execution testing
- No edge case coverage

**File:** `tests/test_presets.py`

- Only checks file existence and counts (lines 21-114)
- No validation of preset data structure
- No testing of preset application logic
- No edge cases for invalid presets

**Recommendation:**
```python
# tests/test_cpe_api.py - Add missing tests
import pytest
from fastapi.testclient import TestClient
from CinemaPromptEngineering.api.main import app

class TestTemplatesAPI:
    """Test templates system endpoints."""

    def test_list_templates(self, client: TestClient):
        """Test listing all templates."""
        response = client.get("/api/templates/list")
        assert response.status_code == 200
        data = response.json()
        assert "templates" in data
        assert "categories" in data

    def test_build_workflow(self, client: TestClient):
        """Test building workflow from template."""
        request = {
            "template_name": "test_template",
            "prompt_values": {
                "positive_prompt": "test prompt"
            }
        }
        response = client.post("/api/templates/build_workflow", json=request)
        assert response.status_code == 200
        data = response.json()
        assert "workflow" in data
        assert "nodes" in data

class TestOAuthFlow:
    """Test OAuth authentication flow."""

    def test_oauth_authorize(self, client: TestClient):
        """Test OAuth authorization initiation."""
        response = client.post("/api/oauth/antigravity/authorize")
        assert response.status_code == 200
        data = response.json()
        assert "auth_url" in data

    def test_oauth_callback(self, client: TestClient):
        """Test OAuth callback handling."""
        # Mock callback from provider
        response = client.post("/api/oauth/antigravity/callback", json={
            "code": "test_code",
            "state": "test_state",
            "client_id": "test_client",
            "redirect_uri": "http://localhost:5173/callback"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data

# Add tests for all other missing endpoints...
```

---

### 2.2 Orchestrator Testing Issues

**Files in `Orchestrator/tests/unit/`:**
- Good coverage for: `test_seed_engine.py`, `test_job_groups_api.py`, `test_parallel_job_manager.py`
- **Missing:** No tests for new project management endpoints:
  - `test_scan_project_images.py` - doesn't exist
  - `test_serve_image.py` - doesn't exist
  - `test_delete_image.py` - doesn't exist
  - `test_create_folder.py` - doesn't exist
  - `test_scan_versions.py` - doesn't exist
  - `test_project_save_load.py` - doesn't exist

**Integration Testing:**
- Only `Orchestrator/tests/integration/test_backend_flow.py` exists
- No integration tests for:
  - Full workflow submission → generation → retrieval cycle
  - WebSocket event streaming for job groups
  - Multi-backend concurrent generation
  - Project save/load workflows
  - Image scan/browse workflows

**Recommendation:**
```python
# Orchestrator/tests/unit/test_project_management.py
import pytest
from fastapi.testclient import TestClient
from orchestrator.api.server import app

class TestProjectManagement:
    """Test project management endpoints."""

    def test_scan_project_images(self, client: TestClient):
        """Test scanning project images."""
        response = client.post("/api/scan-project-images", json={
            "project_path": "//NAS_HOST/Projects/Eliot/TestProject"
        })
        assert response.status_code == 200
        data = response.json()
        assert "images" in data

    def test_serve_image(self, client: TestClient):
        """Test serving project image."""
        response = client.get(f"/api/serve-image?image_path=//path/to/image.png")
        assert response.status_code == 200
        # Verify image data returned

    def test_delete_image(self, client: TestClient):
        """Test deleting project image."""
        response = client.delete("/api/delete-image?image_path=//path/to/image.png")
        assert response.status_code == 200

    def test_create_folder(self, client: TestClient):
        """Test creating folder."""
        response = client.post("/api/create-folder", json={
            "parent_path": "//NAS_HOST/Projects/Eliot/TestProject",
            "folder_name": "NewFolder"
        })
        assert response.status_code == 200
        # Verify folder created

# Add integration tests...
```

---

## 3. DOCUMENTATION-CODE CONSISTENCY ISSUES

### 3.1 Port Configuration Conflicts

| Source | Port | Actual Default |
|---------|-------|----------------|
| AGENTS.md | 8020 (Orchestrator) | 8020 ✓ |
| AGENTS.md | 8000 (CPE) | 8000 ✓ |
| AGENTS.md | 5173 (Frontend) | 5173 ✓ |
| Orchestrator/docs/API.md | 8000 | 8020 ✗ |
| Orchestrator/docs/API_JOB_GROUPS.md | 8020 | 8020 ✓ |

---

### 3.2 Command Inconsistencies

| Command | AGENTS.md | Actual (start-all.ps1) |
|---------|-------------|------------------------|
| CPE Backend | `python -m uvicorn api.main:app` | `python -m uvicorn api.main:app --host 0.0.0.0 --port $BackendPort --reload` ✓ |
| Orchestrator | `python -m orchestrator.server` | `python -m uvicorn orchestrator.api:app --host 0.0.0.0 --port $OrchestratorPort` ✗ |

---

### 3.3 File Path Inconsistencies

| AGENTS.md Path | Actual Path |
|---------------|-------------|
| `CinemaPromptEngineering/api/main.py` | ✓ Correct |
| `orchestrator/api.py` | ✗ Should be `orchestrator/api/server.py` |
| `CinemaPromptEngineering/frontend/dist` | ✓ Correct |
| `Orchestrator/orchestrator/core/engine/` | ✓ Correct |

---

## 4. CRITICAL GAPS SUMMARY

### High Priority (Blocking Documentation Users)
1. **Orchestrator API documentation** claims Phase 1 mock behavior that no longer exists
2. **Missing all project management endpoint documentation** (8 endpoints undocumented)
3. **Port inconsistency** in Orchestrator docs (8000 vs 8020)

### Medium Priority (Affects Developer Experience)
4. **No tests for project management endpoints** (0% test coverage of 8 critical endpoints)
5. **CPE OAuth endpoints** completely undocumented but fully implemented
6. **Templates system** undocumented but referenced in code

### Low Priority (Nice to Have)
7. **Validation rules** lack comprehensive testing (only import tests exist)
8. **Integration testing** minimal (only 1 integration test file)
9. **Edge case testing** missing across both CPE and Orchestrator

---

## 5. RECOMMENDATIONS

### Week 1 (Critical Documentation)
1. [ ] Update Orchestrator/docs/API.md - Remove Phase 1 mock behavior references
2. [ ] Update Orchestrator/docs/API.md - Document all project management endpoints
3. [ ] Update Orchestrator/docs/API.md - Fix port references to match 8020
4. [ ] Update CPE/README.md - Add OAuth flow documentation
5. [ ] Update CPE/README.md - Add templates system documentation

### Week 2 (Critical Testing)
6. [ ] Create test file for project management endpoints
7. [ ] Create test file for templates API
8. [ ] Create test file for OAuth flow endpoints
9. [ ] Add integration test for full workflow cycle
10. [ ] Add validation logic tests for cinema rules

### Month 1 (Documentation)
11. [ ] Create comprehensive API documentation site (e.g., using MkDocs)
12. [ ] Document architecture and data flow
13. [ ] Create developer onboarding guide
14. [ ] Document all environment variables
15. [ ] Create troubleshooting guide

### Month 1 (Testing)
16. [ ] Set up test coverage reporting (coverage.py)
17. [ ] Add CI/CD job to run tests and report coverage
18. [ ] Set up automated API documentation generation
19. [ ] Add contract testing (verify OpenAPI schema matches implementation)
20. [ ] Add load/performance tests

---

**Next Steps:**
1. Review documentation and testing gaps with team
2. Prioritize critical documentation updates
3. Create test writing plan
4. Set up automated documentation generation
5. Integrate test coverage reporting into CI/CD
