# Graph Execution & Orchestration

This document describes how the orchestrator executes workflow graphs across multiple ComfyUI backends.

## Execution Overview

The graph executor processes a visual "workflow-of-workflows" graph, dispatching individual workflows to ComfyUI backends and managing data flow between them.

## Execution Flow Diagram

```
+-------------------------------------------------------------------------+
|                      GRAPH EXECUTION FLOW                               |
+-------------------------------------------------------------------------+

1. PREPARATION PHASE
   +----------------+     +----------------+     +------------------+
   | User clicks    |---->| Validate       |---->| Snapshot State   |
   | "Execute"      |     | Graph          |     | (freeze canvas)  |
   +----------------+     +----------------+     +------------------+
                                                         |
                                                         v
                                               +------------------+
                                               | Topological Sort |
                                               | (execution order)|
                                               +------------------+
                                                         |
2. INITIALIZATION                                        v
   +-------------------------------------------------------------------------+
   |                     Execution State                                     |
   |  +----------------------------------------------------------------+    |
   |  | Node States:                                                    |    |
   |  |   [INPUT: ready] [WF1: waiting(1)] [WF2: waiting(1)]           |    |
   |  |   [MERGE: waiting(2)] [OUTPUT: waiting(1)]                     |    |
   |  |                                                                 |    |
   |  | Ready Queue: [INPUT]                                           |    |
   |  | Running: []                                                    |    |
   |  | Completed: []                                                  |    |
   |  +----------------------------------------------------------------+    |
   +-------------------------------------------------------------------------+
                                                         |
3. EXECUTION LOOP                                        v
   +-------------------------------------------------------------------------+
   |  while ready_queue not empty OR running not empty:                      |
   |                                                                         |
   |    +------------------+                                                 |
   |    | Pop from Ready   |                                                 |
   |    | Queue            |                                                 |
   |    +--------+---------+                                                 |
   |             |                                                           |
   |             v                                                           |
   |    +------------------+     +------------------+     +--------------+   |
   |    | Select Backend   |---->| Build API       |---->| Dispatch to  |   |
   |    | (affinity/auto)  |     | Request         |     | ComfyUI      |   |
   |    +------------------+     +------------------+     +------+-------+   |
   |                                                            |            |
   |                                                            v            |
   |    +------------------+     +------------------+     +--------------+   |
   |    | Update Progress  |<----| Monitor         |<----| Add to       |   |
   |    | UI               |     | WebSocket       |     | Running Set  |   |
   |    +------------------+     +------------------+     +--------------+   |
   |                                                                         |
   +-------------------------------------------------------------------------+
                                                         |
4. NODE COMPLETION                                       v
   +-------------------------------------------------------------------------+
   |    +------------------+                                                 |
   |    | Node Completes   |                                                 |
   |    +--------+---------+                                                 |
   |             |                                                           |
   |             v                                                           |
   |    +------------------+     +------------------+                        |
   |    | Collect Outputs  |---->| Store in        |                        |
   |    | from ComfyUI     |     | NodeExecution   |                        |
   |    +------------------+     +--------+--------+                        |
   |                                      |                                  |
   |                                      v                                  |
   |    +------------------+     +------------------+                        |
   |    | Decrement        |<----| For each child  |                        |
   |    | waiting_count    |     | node            |                        |
   |    +--------+---------+     +------------------+                        |
   |             |                                                           |
   |             v                                                           |
   |    +------------------+                                                 |
   |    | If waiting == 0  |-----> Add to Ready Queue                        |
   |    | node is ready    |                                                 |
   |    +------------------+                                                 |
   |                                                                         |
   +-------------------------------------------------------------------------+
                                                         |
5. COMPLETION                                            v
   +-------------------------------------------------------------------------+
   |    +------------------+     +------------------+     +--------------+   |
   |    | All nodes done   |---->| Collect final   |---->| Mark Job     |   |
   |    |                  |     | outputs         |     | COMPLETED    |   |
   |    +------------------+     +------------------+     +--------------+   |
   +-------------------------------------------------------------------------+
```

## DataFlowOptimized Algorithm

The orchestrator uses a "DataFlowOptimized" execution pattern, adapted from ryvencore, to efficiently handle fan-out/fan-in (diamond) graphs without exponential re-execution.

### Problem: Naive Data Flow

In naive data flow, when a node completes, it immediately triggers all downstream nodes:

```
        [A]
       /   \
     [B]   [C]
       \   /
        [D]

Naive execution:
1. A completes -> triggers B and C
2. B completes -> triggers D
3. C completes -> triggers D again!  <-- D runs TWICE
```

### Solution: Waiting Count

DataFlowOptimized tracks how many inputs each node is waiting for:

```python
class GraphExecutor:
    def __init__(self, canvas: CanvasLayout):
        self.canvas = canvas
        
        # Build adjacency graphs
        self.children: dict[str, list[str]] = {}  # node_id -> child node IDs
        self.parents: dict[str, list[str]] = {}   # node_id -> parent node IDs
        
        # Track execution state
        self.waiting_count: dict[str, int] = {}   # node_id -> inputs still waiting
        self.completed: set[str] = set()
        self.ready_queue: deque[str] = deque()
        
        self._build_graph()
        self._initialize_waiting_counts()
    
    def _initialize_waiting_counts(self):
        """Set waiting count = number of incoming connections."""
        for node in self.canvas.nodes:
            incoming = len(self.parents.get(node.id, []))
            self.waiting_count[node.id] = incoming
            
            # Nodes with no inputs start ready
            if incoming == 0:
                self.ready_queue.append(node.id)
    
    def on_node_complete(self, node_id: str, output_data: dict):
        """Called when a node finishes execution."""
        self.completed.add(node_id)
        
        # Propagate to children
        for child_id in self.children.get(node_id, []):
            self.waiting_count[child_id] -= 1
            
            # Child becomes ready when ALL parents complete
            if self.waiting_count[child_id] == 0:
                self.ready_queue.append(child_id)
```

### Optimized Diamond Execution

```
        [A]
       /   \
     [B]   [C]    waiting_count: {A:0, B:1, C:1, D:2}
       \   /
        [D]

Optimized execution:
1. A ready (count=0), execute A
2. A completes -> B.count=0, C.count=0 -> both ready
3. B completes -> D.count=1 (still waiting for C)
4. C completes -> D.count=0 -> D ready
5. D executes ONCE
```

## Node Type Execution

### WORKFLOW Node

```python
async def execute_workflow_node(
    node: CanvasNode,
    input_data: dict,
    backend_client: ComfyUIClient
) -> dict:
    """Execute a ComfyUI workflow on assigned backend."""
    
    # 1. Get workflow definition
    workflow = await workflow_repo.get(node.workflow_id)
    
    # 2. Patch parameters from input_data
    patched_api_json = parameter_patcher.patch(
        workflow.api_json,
        workflow.exposed_parameters,
        input_data
    )
    
    # 3. Upload any input images
    for param in workflow.exposed_parameters:
        if param.param_type == ParamType.IMAGE_PATH:
            image_path = input_data.get(param.field_name)
            if image_path:
                await backend_client.upload_image(image_path)
    
    # 4. Queue prompt
    prompt_id = await backend_client.queue_prompt(patched_api_json)
    
    # 5. Monitor progress via WebSocket
    async for progress in backend_client.monitor_progress(prompt_id):
        yield NodeProgress(
            progress=progress.percent,
            current_step=progress.current_node
        )
    
    # 6. Collect outputs
    history = await backend_client.get_history(prompt_id)
    outputs = await backend_client.download_outputs(history)
    
    return {
        "images": outputs.images,
        "prompt_id": prompt_id,
        "execution_time": outputs.execution_time
    }
```

### CONDITION Node

```python
async def execute_condition_node(
    node: CanvasNode,
    input_data: dict
) -> tuple[str, dict]:
    """Evaluate condition and return which port fires."""
    
    expression = node.config["expression"]
    
    # Evaluate expression against input_data
    result = condition_evaluator.evaluate(expression, input_data)
    
    if result:
        return ("true", input_data)
    else:
        return ("false", input_data)
```

Supported expression syntax:
- `output.field > value` - Numeric comparison
- `output.field == "string"` - String comparison
- `output.field.exists` - Check field exists
- `output.images.count > 0` - Array length
- `output.width > 1024 AND output.height > 1024` - Logical AND
- `file_exists(output.image_path)` - Built-in functions

### FANOUT Node

```python
async def execute_fanout_node(
    node: CanvasNode,
    input_data: dict
) -> list[tuple[str, dict]]:
    """Split execution to multiple paths."""
    
    mode = node.config.get("mode", "broadcast")
    output_count = node.config.get("output_count", 2)
    
    if mode == "broadcast":
        # Same data to all outputs
        return [
            (f"output_{i}", input_data.copy())
            for i in range(output_count)
        ]
    
    elif mode == "distribute":
        # Distribute list items across outputs
        items = input_data.get("items", [])
        chunks = split_into_chunks(items, output_count)
        return [
            (f"output_{i}", {"items": chunk})
            for i, chunk in enumerate(chunks)
        ]
```

### MERGE Node

```python
async def execute_merge_node(
    node: CanvasNode,
    input_data: dict  # Contains all inputs keyed by port name
) -> dict:
    """Combine inputs from multiple paths."""
    
    mode = node.config.get("mode", "collect")
    
    if mode == "collect":
        # Combine all inputs into a list
        return {
            "merged": list(input_data.values()),
            "count": len(input_data)
        }
    
    elif mode == "concat_images":
        # Concatenate image lists from all inputs
        all_images = []
        for port_data in input_data.values():
            all_images.extend(port_data.get("images", []))
        return {"images": all_images}
```

## Backend Selection

```python
async def select_backend(
    node: CanvasNode,
    workflow: WorkflowDefinition,
    backend_manager: BackendManager
) -> Backend | None:
    """
    Select backend for workflow execution.
    
    Returns:
        Backend if found, None if should prompt user
    
    Raises:
        NoBackendAvailable if NONE strategy and no backend
    """
    
    # 1. Check manual affinity
    if node.backend_affinity:
        backend = backend_manager.get(node.backend_affinity)
        if backend and backend.status.online:
            return backend
        
        # Affinity backend unavailable
        match node.fallback_strategy:
            case FallbackStrategy.NONE:
                raise NoBackendAvailable(
                    f"Backend {node.backend_affinity} is offline"
                )
            case FallbackStrategy.ASK_USER:
                return None  # Signal to prompt user
            case FallbackStrategy.AUTO_SELECT:
                pass  # Fall through to auto-select
    
    # 2. Auto-select best available
    candidates = backend_manager.get_available_backends(
        capabilities=workflow.required_capabilities
    )
    
    if not candidates:
        raise NoBackendAvailable(
            f"No backends with capabilities: {workflow.required_capabilities}"
        )
    
    # Sort by: queue_depth (asc), gpu_memory_free (desc)
    candidates.sort(
        key=lambda b: (b.status.queue_depth, -b.status.gpu_memory_free)
    )
    
    return candidates[0]
```

## Error Handling

### Fail-Fast with User Prompt

```python
async def handle_node_failure(
    job: Job,
    node_execution: NodeExecution,
    error: Exception,
    ui_callback: Callable
):
    """Handle node execution failure."""
    
    # 1. Mark node as failed
    node_execution.status = JobStatus.FAILED
    node_execution.error_message = str(error)
    node_execution.error_traceback = traceback.format_exc()
    
    # 2. Stop entire graph
    job.status = JobStatus.FAILED
    job.error_message = f"Node {node_execution.canvas_node_id} failed: {error}"
    
    # 3. Check if backend went offline
    if isinstance(error, BackendOfflineError):
        # Get available alternatives
        alternatives = backend_manager.get_available_backends()
        
        if alternatives:
            # Prompt user for failover
            user_choice = await ui_callback.prompt_failover(
                failed_backend=error.backend_id,
                alternatives=alternatives,
                node_id=node_execution.canvas_node_id
            )
            
            if user_choice.retry_on:
                # Retry on selected backend
                await retry_node_execution(
                    job, 
                    node_execution, 
                    user_choice.retry_on
                )
                return
    
    # 4. Save and notify
    await job_repo.save(job)
    await ui_callback.notify_job_failed(job)
```

## Progress Monitoring

```python
async def monitor_job_progress(
    job: Job,
    progress_callback: Callable[[JobProgress], None]
):
    """Stream job progress updates to UI."""
    
    while job.status == JobStatus.RUNNING:
        # Calculate overall progress
        total_nodes = len(job.node_executions)
        completed_nodes = sum(
            1 for ne in job.node_executions 
            if ne.status == JobStatus.COMPLETED
        )
        
        # Get current running nodes
        running = [
            ne for ne in job.node_executions 
            if ne.status == JobStatus.RUNNING
        ]
        
        # Build progress report
        progress = JobProgress(
            job_id=job.id,
            overall_percent=(completed_nodes / total_nodes) * 100,
            completed_nodes=completed_nodes,
            total_nodes=total_nodes,
            running_nodes=[
                RunningNodeInfo(
                    node_id=ne.canvas_node_id,
                    backend_id=ne.backend_id,
                    progress=ne.progress,
                    current_step=ne.current_step
                )
                for ne in running
            ]
        )
        
        progress_callback(progress)
        await asyncio.sleep(0.5)  # Update every 500ms
```

## State Diagram

```
                    +----------+
                    | PENDING  |
                    +----+-----+
                         |
                    User clicks Execute
                         |
                         v
    +----------+    +----------+    +----------+
    | CANCELLED|<---| RUNNING  |--->| COMPLETED|
    +----------+    +----+-----+    +----------+
         ^              |
         |              | Error occurs
    User cancels        |
                        v
                   +----------+
                   |  FAILED  |
                   +----+-----+
                        |
                   User retries on
                   different backend
                        |
                        v
                   +----------+
                   | RUNNING  |
                   +----------+
```
