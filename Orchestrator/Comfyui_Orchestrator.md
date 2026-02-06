Build a desktop Python application that:

* Orchestrates ComfyUI workflows across 3–10 servers (nodes).  
* Provides a high-level canvas to connect “workflow nodes” (each backed by a ComfyUI workflow JSON).  
* Embeds each server’s **real ComfyUI web UI** for inline editing/debugging in a webview.  
* Can read/save workflows from the inline editor back into the orchestrator.  
* Parses workflow JSON, exposes selected parameters to the outer canvas (e.g. prompts, seeds, CFG, image inputs).  
* Streams **per-server performance & progress** (jobs, VRAM/CPU usage if available, queue status).  
* Displays previews (image/mask/video) from preview/save nodes inside the canvas.

Primary tech stack is Python \+ PyQt/PySide for a native app.-----1. Tech Stack and Key Libraries1.1 Core stack

* **Language:** Python 3.11+  
* **GUI:** PyQt6 or PySide6 with:  
  * **Node Editor:** Consider using a specialized Node Editor library, such as **Ryven**, as an alternative to `QGraphicsView/QGraphicsScene` for the canvas, for faster development.  
  * **Web View:** **QWebEngineView** for embedded ComfyUI web UIs.\[3\]\[4\]  
* **Backend / orchestration:**  
  * **Core:** `asyncio` \+ `httpx` for async HTTP to ComfyUI.  
  * **Inter-Thread/Internal Comms:** Use **Qt Signals & Slots** and **asyncio/QThread bridging** for communication within the native application, instead of an internal FastAPI, unless deemed necessary for external monitoring.  
* **Data / config:**  
  * **Models:** **pydantic** or **pydantic-core** for config and schema validation (particularly critical for Workflow JSON Patching).  
  * **Schema:** **jsonschema** (optional) to validate workflow JSON.\[2\]\[1\]

1.2 Optional / supporting

* **Node editor helpers:** Ryven or similar ready-made Qt-based node editor library.  
* **Charts for monitoring:** **pyqtgraph** or **matplotlib** embedded in a Qt widget (`FigureCanvas`) for a lighter, more native feel than embedding a full web chart engine.

\-----2. High-Level TODO List

1. **Project scaffolding & configuration**  
2. **System architecture and data models**  
3. **ComfyUI backend integration layer**  
4. **Monitoring & progress tracking (3–5 nodes)**  
5. **Main canvas UI (outer workflow-of-workflows)**  
6. **Embedded ComfyUI editor (per backend)**  
7. **Workflow JSON parsing and parameter exposure**  
8. **Preview node execution & display in canvas**  
9. **Persistence (projects, nodes, layouts)**  
10. **Testing, profiling, and hardening**

Each item has low-level tasks below.-----3. System Architecture (3–5 Nodes)3.1 Logical components

* **Orchestrator Core**  
  * Manages the outer graph (workflow-of-workflows).  
  * **Schedules nodes to specific ComfyUI backends based on load/capability (Load Balancing/Scheduling Logic).**  
  * Maintains job states, parameter bindings, and **handles execution failures/retries**.  
* **Backend Manager**  
  * Holds registered ComfyUI servers (3–10 nodes).  
  * Talks to each via HTTP/WebSocket.  
  * **Collects real-time metrics and job progress (prioritizing ComfyUI’s native reporting).**  
* **UI Layer**  
  * **Main window**: node canvas \+ node list \+ logs.  
  * **Server monitor**: per-node performance and queue graphs.  
  * **Inline editor window/panel**: embedded ComfyUI via webview.  
  * **Parameter panel**: exposed parameters per outer node.  
* **Persistence Layer**  
  * Saves/loads orchestrator projects.

3.2 Node architecture diagram (conceptual)

For 3–5 ComfyUI servers:

* `OrchestratorApp` (on one machine)  
  * `BackendManager`  
    * `Backend(pc1: http://192.168.0.10:8188)`  
    * `Backend(pc2: http://192.168.0.11:8188)`  
    * `Backend(pc3: http://192.168.0.12:8188)`  
    * Optional pc4/pc5.  
  * `ExecutionEngine` (runs outer graph)  
  * `MetricsEngine` (pulls metrics from backends)  
* Each `Backend` object maintains:  
  * HTTP client  
  * Optional WebSocket connection to `/ws` for progress updates.  
  * Metrics state: current jobs, last ping time, queue size; plus CPU/GPU metrics if exposed via a small agent on each node.

\-----4. Detailed Tasks per Major TODO4.1 Project scaffolding & configuration

Low-level tasks:

* Initialize a Python project structure:  
  * `orchestrator/`  
    * `__init__.py`  
    * `main.py` (entry point)  
    * `ui/` (Qt UI, widgets)  
    * `core/` (orchestration logic)  
    * `backends/` (ComfyUI integration)  
    * `models/` (pydantic data models)  
    * `storage/` (persistence)  
* Add a config system:  
  * `config.yaml` or `config.json` listing known servers, ports, auth tokens, etc.  
* Basic logging setup with rotating log files.

4.2 System architecture and data models

Low-level tasks:

* Define **BackendConfig** (pydantic):  
  * `id`, `name`, `url`, `tags`, `auth`, `enabled`.  
* Define **WorkflowNodeDefinition** (outer node):  
  * `id`, `name`, `backend_id`  
  * `workflow_json` (raw ComfyUI JSON)  
  * `exposed_parameters` (list of parameter descriptors)  
  * `inputs` / `outputs` (outer graph ports).  
* Define **ExposedParameter**:  
  * `id`, `label`, `node_id`, `widget_index` or property name, `type`, default value, constraints.  
* Define **Project**:  
  * List of workflow nodes.  
  * Connection graph between outer nodes.  
  * Layout (positions of outer nodes on canvas).

4.3 ComfyUI backend integration layer

Low-level tasks:

* Implement `ComfyBackend` class with:  
  * `submit_prompt(prompt: dict, extra_ dict) -> prompt_id`  
  * `get_history(prompt_id) -> dict` (poll results).\[8\]\[9\]  
  * `stream_progress(prompt_id)` using WebSocket to `/ws` (handle status messages).\[5\]  
  * `fetch_image(filename, subfolder, type="output") -> bytes`.\[8\]  
* Design a helper to **patch dynamic parameters** into workflow JSON:  
  * Take base `workflow_json` \+ dict of parameter values.  
  * **Locate nodes/fields by id or other substantive information rather than relying solely on widgets\_values index, for robustness.**  
* Design error handling:  
  * Map backend HTTP errors or JSON failures into UI notifications.  
  * **Implement an Execution Retry Policy (e.g., attempt 3 times on the same or different backend).**

4.4 Monitoring & progress tracking

Low-level tasks:

* Per backend, maintain: `current_jobs`, `completed_jobs`, `failed_jobs`, `last_latency_ms`, `last_heartbeat`.  
* Implement periodic “health check”:  
  * Ping `/prompt` with a tiny no-op workflow, or call a lightweight endpoint if available.  
* **For resource monitoring:**  
  * **Priority 1: Utilize ComfyUI's native WebSocket (`/ws`) progress messages and API (`/history/{prompt\_id}`) to track queue status, running node, and step progress.**  
  * Optional: Run a small agent on each node exposing CPU/GPU via HTTP.  
* Implement a **MonitoringPanel**:  
  * For each server, show progress chart of:  
    * Jobs in last X minutes.  
    * Average latency.  
  * **In UI: Use native Qt charting (e.g., pyqtgraph or matplotlib with Qt embedding) for charts.**

4.5 Main canvas UI (outer workflow-of-workflows)

Low-level tasks:

* Build a **NodeCanvas** widget using `QGraphicsScene`:  
  * Node items representing outer workflow nodes.  
  * Edge items representing links.  
* Implement node add/remove:  
  * Add node: choose backend, name, and attach an initial workflow JSON (empty or template).  
* Implement connection handling:  
  * Connect output ports of one node to input ports of another.  
* Handle selection:  
  * When a node is selected, display its exposed parameters in a side panel.  
  * Show backend id and status (e.g., icon colored by server load/health).

4.6 Embedded ComfyUI editor (per backend)

Low-level tasks:

* Add an **“Edit Internals”** button to each outer node.  
* On click:  
  * Open a **ComfyEditorWindow** with a `QWebEngineView`.\[4\]\[3\]  
  * Set URL to backend’s ComfyUI UI (e.g. `http://192.168.0.10:8188`).  
* To load a specific workflow into the embedded UI:  
  * MVP: let user import your JSON into ComfyUI manually (drag/drop into the UI).  
  * Advanced: **Before creating a custom extension, research if the official ComfyUI API or a popular extension already provides endpoints (POST /load\_workflow) for programmatic loading of the current graph JSON into the UI.**  
* To read back the edited workflow:  
  * MVP: user clicks “Save workflow” in ComfyUI UI and then “Import from file” in orchestrator.  
  * Advanced:  
    * **(Assuming custom extension is needed) Extension exposes GET /current\_workflow which returns current graph JSON.**  
    * Add a “Sync from server” button in your node panel to pull that JSON and update `workflow_json`.

4.7 Workflow JSON parsing and parameter exposure

Low-level tasks:

* Implement a **WorkflowParser**:  
  * Parse `workflow_json` according to ComfyUI’s schema:  
    * `nodes` array with ids, types, inputs, outputs, `widgets_values`.\[1\]\[2\]  
    * Links (for internal graph).  
* Build a **ParameterInspector** UI:  
  * Given a workflow JSON:  
    * List nodes and their editable fields (e.g. `widgets_values`, text, sliders, seeds).  
    * Allow user to choose which fields are “exposed” to outer canvas.  
* Map an exposed parameter:  
  * When user selects e.g. “Prompt” field in a `CLIPTextEncode` node:  
    * Create an `ExposedParameter` entry with mapping to `node_id` and `widgets_values` index.\[10\]  
* Parameter editing in main UI:  
  * For each node’s exposed parameters:  
    * Render appropriate control (text field, numeric input, dropdown).  
    * On change, update the per-node `parameter_values`.  
  * Before execution:  
    * Apply these `parameter_values` to the node’s `workflow_json` via your patching helper.

4.8 Preview node execution & display

Low-level tasks:

* Define what “preview nodes” mean:  
  * E.g. any node whose output is an image/video that is:  
    * Saved to disk via a Save node, or  
    * Already existing preview pattern in your templates.  
* In the ComfyUI workflow:  
  * Identify output nodes that store images or intermediate results.  
  * Use history returned by `/history/{prompt\_id}` to locate file names and types.\[9\]\[8\]  
* In orchestrator:  
  * For a given outer node, let user click “Run preview” for a specific internal node:  
    * You can:  
      * Execute entire workflow but only display outputs of selected internal nodes.  
      * Or build a mini-wf that truncates after that node (advanced).  
  * After execution:  
    * Fetch images via `/view?filename=...\&subfolder=...\&type=...` and display as thumbnails in a **PreviewPanel** tied to that outer node.\[8\]  
* Support image/mask/video:  
  * For masks, display grayscale or overlay.  
  * For video (if your workflows output video), embed a simple video player widget or rely on an external viewer.

4.9 Persistence (projects, nodes, layouts)

Low-level tasks:

* Define a `Project` JSON schema:  
  * Meta name, created\_at, etc.  
  * List of nodes with:  
    * `id`, `name`, `backend_id`.  
    * `workflow_json`.  
    * `exposed_parameters`.  
    * `parameter_values`.  
    * UI position.  
  * Edges between nodes (outer graph connections).  
* Implement save/load:  
  * `Save Project` to a `.orchestrator.json` file.  
  * `Load Project` to restore full state & layouts.  
* Optional: auto-save and project-versioning.

4.10 Testing, profiling, hardening

Low-level tasks:

* Unit tests for:  
  * Workflow parameter patching.  
  * JSON parsing and exposed parameter mapping.  
  * Backend API interaction (use mock ComfyUI endpoint).  
* Integration tests:  
  * Spin up a local ComfyUI instance in CI/lab, run a small workflow via the orchestrator.  
* Profiling:  
  * Measure roundtrip latency for job submission and progress updates.  
  * Ensure the UI remains responsive while multiple jobs run (heavy use of `asyncio` and `QThread` or `QTimer` bridging).

\-----5. Performance & Progress Graphs per Node

Design elements:

* **Per-server panel** in the main UI:  
  * Node list with status:  
    * Green/yellow/red indicator.  
    * Current queue size and ongoing jobs.  
  * Mini charts:  
    * Jobs per minute (line/bar).  
    * Mean processing time per job.  
* Implementation steps:

Low-level tasks:

* Add a `MetricsCollector` in `BackendManager`:  
  * Periodically (e.g. every 5–10s) poll:  
    * Queue length (can approximate from number of submitted vs. finished jobs).  
    * Optional CPU/GPU metrics from node agent.  
* In UI:  
  * Use `QTimer` to refresh charts from an in-memory ring buffer of metrics for each server.  
  * For initial version, simple line graph using QtCharts or render a small HTML chart in an embedded `QWebEngineView`.

\-----6. Execution Flow Summary

When the user clicks “Run Outer Graph”:

1. Orchestrator topologically sorts outer nodes.  
2. For each outer node in order:  
   * Resolves its inputs (from previous nodes’ outputs or project inputs).  
   * Applies exposed parameter values into the node’s `workflow_json`.  
   * **Chooses target backend based on defined criteria (e.g., Least Busy Queue, Node Affinity Tag).**  
   * Submits prompt to that backend.  
   * Subscribes to progress (WebSocket) and updates UI.  
   * **On execution failure:**  
     * **Apply Retry Policy (e.g., re-submit to a different backend or terminate graph execution).**  
     * **Log the error and update the node status in the UI.**  
   * On completion:  
     * Stores outputs (file references, metadata).  
     * Triggers preview fetching for any configured preview nodes.  
3. UI shows:  
   * Per-node run status.  
   * Per-backend performance charts.  
   * Updated previews along the way.

\-----7. Next Steps for Implementation

1. **Define and implement the core pydantic Data Models (Task 4.2):** BackendConfig, WorkflowNodeDefinition, ExposedParameter, and Project schema. This is the foundation for persistence and parameter handling.  
2. **Implement minimal BackendManager \+ ComfyBackend (Task 4.3)** that can:  
   * Submit workflow JSON to a single local ComfyUI instance.  
   * Poll history and fetch outputs.  
3. Build a barebones outer canvas (Task 4.5) where each node is just:  
   * A name, a backend id, and a workflow JSON path (or use a simple Node Editor library like Ryven).  
4. Add **embedded ComfyUI** in a QWebEngineView and confirm you can:  
   * Edit workflows on that server.  
   * Export JSON and re-import into your app.  
5. Iterate towards: Parameter exposure UI, Multi-backend scheduling, Monitoring charts, In-canvas previews.

This plan should be enough structure to begin coding while still leaving you flexibility for implementation details (e.g., exact node editor toolkit, extension API on ComfyUI side).-----Πηγές

\[1\] [Workflow JSON](https://docs.comfy.org/specs/workflow_json)

\[2\] [Workflow JSON 0.4 \- ComfyUI](https://docs.comfy.org/specs/workflow_json_0.4)

\[3\] [PyQt6 QWebEngineView \- Embedding a Web Browser](https://coderslegacy.com/python/pyqt6-qwebengineview-web-browser/)

\[4\] [Using PyQt/PySide (QWebEngineView) to display HTML/CSS ...](https://note.artchiu.org/2025/02/14/using-pyqt-pyside-qwebengineview-to-display-html-css-javascript-content-as-ui-within-a-python-application/)

\[5\] [Getting Started with FastAPI WebSockets](https://betterstack.com/community/guides/scaling-python/fastapi-websockets/)

\[6\] [A Comprehensive Guide to WebSockets in FastAPI](https://www.linkedin.com/pulse/comprehensive-guide-websockets-fastapi-manikandan-parasuraman-doqlf)

\[7\] [Fast API WebSockets: A Comprehensive Guide](https://www.getorchestra.io/guides/fast-api-websockets-a-comprehensive-guide)

\[8\] [Building a Production-Ready ComfyUI API](https://www.viewcomfy.com/blog/building-a-production-ready-comfyui-api)

\[9\] [Hosting a ComfyUI Workflow via API](https://9elements.com/blog/hosting-a-comfyui-workflow-via-api/)

\[10\] [ComfyUI-EZ-AF-Nodes/examples/workflow.json at main · ez-af/ComfyUI-EZ-AF-Nodes](https://github.com/ez-af/ComfyUI-EZ-AF-Nodes/blob/main/examples/workflow.json)

\[11\] [Workflow Files](https://docs.runcomfy.com/serverless/workflow-files)

\[12\] [ComfyUI-workflows/workflow.json at main · hktalent/ComfyUI-workflows](https://github.com/hktalent/ComfyUI-workflows/blob/main/workflow.json)

\[13\] [Save workflow (disk) Input...](https://www.runcomfy.com/comfyui-nodes/ComfyUI_NetDist/SaveDiskWorkflowJSON)

\[14\] [SaveDiskWorkflowJSON Node Documentation (ComfyUI\_NetDist)](https://comfyai.run/documentation/SaveDiskWorkflowJSON)

\[15\] [FastAPI runs API calls in serial instead of parallel fashion](https://stackoverflow.com/questions/71516140/fastapi-runs-api-calls-in-serial-instead-of-parallel-fashion)

\[16\] [在主窗口中嵌入QWebEngineView \- PyQt](https://cloud.tencent.cn/developer/information/%E5%9C%A8%E4%B8%BB%E7%AA%97%E5%8F%A3%E4%B8%AD%E5%B5%8C%E5%85%A5QWebEngineView%20-%20PyQt)

\[17\] [ComfyUI Workflow Basics Tutorial](https://comfyui-wiki.com/en/interface/workflow)  
