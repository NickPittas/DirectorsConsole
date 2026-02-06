"""Tests for GraphExecutor."""

import pytest
from orchestrator.core.engine.graph_executor import GraphExecutor
from orchestrator.core.models.project import (
    CanvasLayout,
    CanvasNode,
    CanvasConnection,
    NodeType,
    DataType,
)


class TestGraphExecutor:
    """Tests for GraphExecutor class."""

    def test_graph_executor_ready_node_empty(self) -> None:
        """Test that empty canvas returns no ready nodes."""
        executor = GraphExecutor(CanvasLayout(nodes=[], connections=[]))
        assert executor.get_ready_node() is None


class TestStreamIsolation:
    """Tests for stream isolation (connected component analysis)."""

    def test_isolate_streams_empty_canvas(self) -> None:
        """Test that empty canvas returns no streams."""
        executor = GraphExecutor(CanvasLayout(nodes=[], connections=[]))
        streams = executor.isolate_streams()
        assert streams == []

    def test_isolate_streams_single_node(self) -> None:
        """Test single node forms one stream."""
        canvas = CanvasLayout(
            nodes=[
                CanvasNode(id="node1", node_type=NodeType.WORKFLOW, position=(0, 0)),
            ],
            connections=[],
        )
        executor = GraphExecutor(canvas)
        streams = executor.isolate_streams()
        
        assert len(streams) == 1
        assert streams[0] == {"node1"}

    def test_isolate_streams_two_independent_nodes(self) -> None:
        """Test two unconnected nodes form two independent streams."""
        canvas = CanvasLayout(
            nodes=[
                CanvasNode(id="node1", node_type=NodeType.WORKFLOW, position=(0, 0)),
                CanvasNode(id="node2", node_type=NodeType.WORKFLOW, position=(100, 0)),
            ],
            connections=[],  # No connections = independent
        )
        executor = GraphExecutor(canvas)
        streams = executor.isolate_streams()
        
        assert len(streams) == 2
        # Sorted by min node ID
        assert {"node1"} in streams
        assert {"node2"} in streams

    def test_isolate_streams_connected_chain(self) -> None:
        """Test connected nodes form one stream."""
        canvas = CanvasLayout(
            nodes=[
                CanvasNode(id="node1", node_type=NodeType.WORKFLOW, position=(0, 0)),
                CanvasNode(id="node2", node_type=NodeType.WORKFLOW, position=(100, 0)),
                CanvasNode(id="node3", node_type=NodeType.WORKFLOW, position=(200, 0)),
            ],
            connections=[
                CanvasConnection(
                    id="conn1",
                    source_node_id="node1",
                    source_port="output",
                    target_node_id="node2",
                    target_port="input",
                    data_type=DataType.IMAGE,
                ),
                CanvasConnection(
                    id="conn2",
                    source_node_id="node2",
                    source_port="output",
                    target_node_id="node3",
                    target_port="input",
                    data_type=DataType.IMAGE,
                ),
            ],
        )
        executor = GraphExecutor(canvas)
        streams = executor.isolate_streams()
        
        assert len(streams) == 1
        assert streams[0] == {"node1", "node2", "node3"}

    def test_isolate_streams_two_separate_chains(self) -> None:
        """Test two separate chains form two streams."""
        canvas = CanvasLayout(
            nodes=[
                # Chain 1: A -> B
                CanvasNode(id="A", node_type=NodeType.WORKFLOW, position=(0, 0)),
                CanvasNode(id="B", node_type=NodeType.WORKFLOW, position=(100, 0)),
                # Chain 2: C -> D
                CanvasNode(id="C", node_type=NodeType.WORKFLOW, position=(0, 100)),
                CanvasNode(id="D", node_type=NodeType.WORKFLOW, position=(100, 100)),
            ],
            connections=[
                CanvasConnection(
                    id="conn1",
                    source_node_id="A",
                    source_port="output",
                    target_node_id="B",
                    target_port="input",
                    data_type=DataType.IMAGE,
                ),
                CanvasConnection(
                    id="conn2",
                    source_node_id="C",
                    source_port="output",
                    target_node_id="D",
                    target_port="input",
                    data_type=DataType.IMAGE,
                ),
            ],
        )
        executor = GraphExecutor(canvas)
        streams = executor.isolate_streams()
        
        assert len(streams) == 2
        assert {"A", "B"} in streams
        assert {"C", "D"} in streams

    def test_isolate_streams_mixed_connected_and_independent(self) -> None:
        """Test mix of connected and independent nodes."""
        canvas = CanvasLayout(
            nodes=[
                # Connected pair
                CanvasNode(id="connected1", node_type=NodeType.WORKFLOW, position=(0, 0)),
                CanvasNode(id="connected2", node_type=NodeType.WORKFLOW, position=(100, 0)),
                # Independent node
                CanvasNode(id="independent", node_type=NodeType.WORKFLOW, position=(0, 100)),
            ],
            connections=[
                CanvasConnection(
                    id="conn1",
                    source_node_id="connected1",
                    source_port="output",
                    target_node_id="connected2",
                    target_port="input",
                    data_type=DataType.IMAGE,
                ),
            ],
        )
        executor = GraphExecutor(canvas)
        streams = executor.isolate_streams()
        
        assert len(streams) == 2
        assert {"connected1", "connected2"} in streams
        assert {"independent"} in streams

    def test_get_executable_streams_with_execute_nodes(self) -> None:
        """Test that only streams with Execute nodes are returned."""
        canvas = CanvasLayout(
            nodes=[
                # Stream 1: workflow -> execute (should run)
                CanvasNode(id="workflow1", node_type=NodeType.WORKFLOW, position=(0, 0)),
                CanvasNode(id="execute1", node_type=NodeType.EXECUTE, position=(100, 0)),
                # Stream 2: workflow only (should NOT run)
                CanvasNode(id="workflow2", node_type=NodeType.WORKFLOW, position=(0, 100)),
            ],
            connections=[
                CanvasConnection(
                    id="conn1",
                    source_node_id="workflow1",
                    source_port="trigger",
                    target_node_id="execute1",
                    target_port="trigger",
                    data_type=DataType.TRIGGER,
                ),
            ],
        )
        executor = GraphExecutor(canvas)
        executable = executor.get_executable_streams()
        
        # Only stream 1 should be executable
        assert len(executable) == 1
        assert {"workflow1", "execute1"} in executable

    def test_get_executable_streams_no_execute_nodes(self) -> None:
        """Test backwards compat: all streams run if no Execute nodes."""
        canvas = CanvasLayout(
            nodes=[
                CanvasNode(id="workflow1", node_type=NodeType.WORKFLOW, position=(0, 0)),
                CanvasNode(id="workflow2", node_type=NodeType.WORKFLOW, position=(100, 0)),
            ],
            connections=[],
        )
        executor = GraphExecutor(canvas)
        executable = executor.get_executable_streams()
        
        # Both streams should be executable (backwards compat)
        assert len(executable) == 2

    def test_get_stream_for_node(self) -> None:
        """Test finding which stream a node belongs to."""
        canvas = CanvasLayout(
            nodes=[
                CanvasNode(id="A", node_type=NodeType.WORKFLOW, position=(0, 0)),
                CanvasNode(id="B", node_type=NodeType.WORKFLOW, position=(100, 0)),
                CanvasNode(id="C", node_type=NodeType.WORKFLOW, position=(0, 100)),
            ],
            connections=[
                CanvasConnection(
                    id="conn1",
                    source_node_id="A",
                    source_port="output",
                    target_node_id="B",
                    target_port="input",
                    data_type=DataType.IMAGE,
                ),
            ],
        )
        executor = GraphExecutor(canvas)
        
        # A and B are in the same stream
        assert executor.get_stream_for_node("A") == {"A", "B"}
        assert executor.get_stream_for_node("B") == {"A", "B"}
        
        # C is in its own stream
        assert executor.get_stream_for_node("C") == {"C"}
        
        # Unknown node returns None
        assert executor.get_stream_for_node("unknown") is None
