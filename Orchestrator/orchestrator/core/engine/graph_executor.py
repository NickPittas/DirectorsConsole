from __future__ import annotations

from collections import deque
from dataclasses import dataclass

from orchestrator.core.models.project import CanvasConnection, CanvasLayout, NodeType


@dataclass(frozen=True)
class GraphEdge:
    source_id: str
    source_port: str
    target_id: str
    target_port: str


class GraphExecutor:
    def __init__(self, canvas: CanvasLayout | None = None) -> None:
        self.canvas = canvas or CanvasLayout()
        self.children: dict[str, list[str]] = {}
        self.parents: dict[str, list[str]] = {}
        self.waiting_count: dict[str, int] = {}
        self.completed: set[str] = set()
        self.ready_queue: deque[str] = deque()
        self._edges_by_target: dict[str, list[GraphEdge]] = {}
        self._executable_nodes: set[str] = set()  # Nodes connected to Execute nodes
        self._build_graph()
        self._find_executable_streams()
        self._initialize_waiting_counts()

    def get_ready_node(self) -> str | None:
        if not self.ready_queue:
            return None
        return self.ready_queue.popleft()

    def on_node_complete(self, node_id: str) -> None:
        if node_id in self.completed:
            return
        self.completed.add(node_id)
        for child_id in self.children.get(node_id, []):
            # Only process children that are part of executable streams
            if child_id not in self._executable_nodes:
                continue
            remaining = self.waiting_count.get(child_id, 0)
            updated = max(remaining - 1, 0)
            self.waiting_count[child_id] = updated
            if updated == 0:
                self.ready_queue.append(child_id)

    def edges_into(self, node_id: str) -> list[GraphEdge]:
        return list(self._edges_by_target.get(node_id, []))

    def reset(self, canvas: CanvasLayout) -> None:
        self.canvas = canvas
        self.children = {}
        self.parents = {}
        self.waiting_count = {}
        self.completed = set()
        self.ready_queue = deque()
        self._edges_by_target = {}
        self._executable_nodes = set()
        self._build_graph()
        self._find_executable_streams()
        self._initialize_waiting_counts()
    
    def get_executable_nodes(self) -> set[str]:
        """Return the set of node IDs that are part of executable streams.
        
        These are nodes that are connected (directly or indirectly) to an Execute node.
        """
        return self._executable_nodes.copy()
    
    def has_execute_nodes(self) -> bool:
        """Check if the canvas has any Execute nodes.
        
        Returns:
            True if there are Execute nodes, False otherwise.
        """
        for node in self.canvas.nodes:
            if node.node_type == NodeType.EXECUTE:
                return True
        return False

    def isolate_streams(self) -> list[set[str]]:
        """Identify independent execution streams on the canvas.
        
        Uses connected component analysis to find groups of nodes that are
        connected to each other. Disconnected subgraphs form independent streams
        that can execute in parallel without waiting for each other.
        
        Execute nodes are included in streams but marked specially - they define
        which streams should run but are not themselves executed.
        
        Returns:
            List of sets, where each set contains node IDs that form a connected
            subgraph. Streams are sorted by the minimum node ID for deterministic
            ordering.
            
        Example:
            Canvas with nodes A-B-C connected and D-E connected separately:
            Returns: [{A, B, C}, {D, E}]
            
            Canvas with single chain A-B-C-D:
            Returns: [{A, B, C, D}]
        """
        if not self.canvas.nodes:
            return []
        
        # Build undirected adjacency for connected component analysis
        # We treat connections as undirected to find connected subgraphs
        adjacency: dict[str, set[str]] = {node.id: set() for node in self.canvas.nodes}
        
        for conn in self.canvas.connections:
            source_id = conn.source_node_id
            target_id = conn.target_node_id
            if source_id in adjacency and target_id in adjacency:
                adjacency[source_id].add(target_id)
                adjacency[target_id].add(source_id)
        
        # Find connected components using BFS
        visited: set[str] = set()
        streams: list[set[str]] = []
        
        for node in self.canvas.nodes:
            if node.id in visited:
                continue
            
            # BFS to find all nodes in this component
            component: set[str] = set()
            queue: deque[str] = deque([node.id])
            
            while queue:
                current = queue.popleft()
                if current in visited:
                    continue
                visited.add(current)
                component.add(current)
                
                # Add unvisited neighbors
                for neighbor in adjacency.get(current, []):
                    if neighbor not in visited:
                        queue.append(neighbor)
            
            if component:
                streams.append(component)
        
        # Sort streams by minimum node ID for deterministic ordering
        streams.sort(key=lambda s: min(s))
        
        return streams

    def get_stream_for_node(self, node_id: str) -> set[str] | None:
        """Get the stream (connected component) containing a specific node.
        
        Args:
            node_id: The node ID to find the stream for.
            
        Returns:
            Set of node IDs in the same stream, or None if node not found.
        """
        streams = self.isolate_streams()
        for stream in streams:
            if node_id in stream:
                return stream
        return None

    def get_executable_streams(self) -> list[set[str]]:
        """Get only the streams that contain Execute nodes.
        
        Filters the isolated streams to return only those that have at least
        one Execute node, meaning they should be executed when Run is clicked.
        
        If no Execute nodes exist on the canvas, returns all streams
        (backwards compatibility).
        
        Returns:
            List of sets containing node IDs for executable streams.
        """
        streams = self.isolate_streams()
        
        # If no Execute nodes, all streams are executable (backwards compat)
        if not self.has_execute_nodes():
            return streams
        
        # Find Execute node IDs
        execute_node_ids = {
            node.id for node in self.canvas.nodes
            if node.node_type == NodeType.EXECUTE
        }
        
        # Filter to streams containing at least one Execute node
        executable_streams = [
            stream for stream in streams
            if stream & execute_node_ids  # Set intersection
        ]
        
        return executable_streams

    def _build_graph(self) -> None:
        for node in self.canvas.nodes:
            self.children.setdefault(node.id, [])
            self.parents.setdefault(node.id, [])

        for connection in self.canvas.connections:
            self._register_connection(connection)

    def _register_connection(self, connection: CanvasConnection) -> None:
        source_id = connection.source_node_id
        target_id = connection.target_node_id
        if target_id not in self.parents:
            self.parents[target_id] = []
        if source_id not in self.children:
            self.children[source_id] = []
        self.parents[target_id].append(source_id)
        self.children[source_id].append(target_id)
        self._edges_by_target.setdefault(target_id, []).append(
            GraphEdge(
                source_id=source_id,
                source_port=connection.source_port,
                target_id=target_id,
                target_port=connection.target_port,
            )
        )
    
    def _find_executable_streams(self) -> None:
        """Find all nodes that are part of executable streams.
        
        Traces backwards from each Execute node to identify all nodes
        in the workflow stream. Only these nodes will be executed when
        the user clicks Run.
        
        If no Execute nodes exist on canvas, ALL nodes are considered executable
        (backwards compatibility).
        """
        # Find all Execute nodes
        execute_nodes: list[str] = []
        for node in self.canvas.nodes:
            if node.node_type == NodeType.EXECUTE:
                execute_nodes.append(node.id)
        
        # If no Execute nodes, all nodes are executable (backwards compatibility)
        if not execute_nodes:
            for node in self.canvas.nodes:
                self._executable_nodes.add(node.id)
            return
        
        # Trace backwards from each Execute node
        for execute_id in execute_nodes:
            self._trace_backwards(execute_id)
    
    def _trace_backwards(self, start_node_id: str) -> None:
        """Trace backwards from a node to find all upstream nodes.
        
        Uses BFS to traverse the graph backwards, marking all visited
        nodes as executable.
        
        Args:
            start_node_id: The node ID to start tracing from (usually an Execute node)
        """
        visited: set[str] = set()
        queue: deque[str] = deque([start_node_id])
        
        while queue:
            node_id = queue.popleft()
            if node_id in visited:
                continue
            visited.add(node_id)
            self._executable_nodes.add(node_id)
            
            # Add all parent nodes to the queue
            for parent_id in self.parents.get(node_id, []):
                if parent_id not in visited:
                    queue.append(parent_id)

    def _initialize_waiting_counts(self) -> None:
        """Initialize waiting counts and ready queue.
        
        Only nodes that are part of executable streams (connected to Execute nodes)
        are added to the ready queue. Execute nodes themselves are never added
        to the ready queue as they are markers, not executable operations.
        """
        for node in self.canvas.nodes:
            # Skip nodes not in executable streams
            if node.id not in self._executable_nodes:
                continue
            
            # Skip Execute nodes - they are markers, not operations
            if node.node_type == NodeType.EXECUTE:
                continue
            
            # Count incoming edges only from executable nodes
            incoming = 0
            for parent_id in self.parents.get(node.id, []):
                if parent_id in self._executable_nodes:
                    # Don't count Execute nodes as parents that block execution
                    parent_node = next((n for n in self.canvas.nodes if n.id == parent_id), None)
                    if parent_node and parent_node.node_type != NodeType.EXECUTE:
                        incoming += 1
            
            self.waiting_count[node.id] = incoming
            if incoming == 0:
                self.ready_queue.append(node.id)
