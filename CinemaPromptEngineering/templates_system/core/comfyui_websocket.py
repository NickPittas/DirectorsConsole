"""WebSocket client for real-time ComfyUI communication.

Connects to ComfyUI's WebSocket endpoint to receive real-time updates
about execution progress, node status, and queue changes.
"""

import json
import logging
import struct
import threading
import time
from typing import Callable, Optional, Any
from dataclasses import dataclass
import uuid

logger = logging.getLogger(__name__)

# Try to import websocket-client
try:
    import websocket
    WEBSOCKET_AVAILABLE = True
except ImportError:
    WEBSOCKET_AVAILABLE = False
    logger.warning("websocket-client not installed. Install with: pip install websocket-client")


# Binary event types from ComfyUI protocol.py
class BinaryEventTypes:
    PREVIEW_IMAGE = 1
    UNENCODED_PREVIEW_IMAGE = 2
    TEXT = 3  # Console/log text messages
    PREVIEW_IMAGE_WITH_METADATA = 4


@dataclass
class ComfyUIMessage:
    """A message received from ComfyUI WebSocket."""
    event_type: str
    data: dict
    timestamp: float


class ComfyUIWebSocket:
    """WebSocket client for ComfyUI real-time updates.
    
    Connects to ComfyUI's /ws endpoint to receive:
    - status: Queue status updates
    - executing: Currently executing node
    - executed: Node execution completed with output
    - progress: Execution progress (steps, etc.)
    - execution_start: Prompt execution started
    - execution_success: Prompt completed successfully
    - execution_error: Prompt failed with error
    - execution_interrupted: Prompt was interrupted
    - execution_cached: Nodes that were cached
    
    Attributes:
        server_url: Base ComfyUI server URL (http://host:port)
        on_message: Callback for received messages
        on_progress: Callback for progress updates
        on_status: Callback for status updates
        on_error: Callback for errors
        on_connected: Callback when connected
        on_disconnected: Callback when disconnected
    """
    
    def __init__(
        self,
        server_url: str = "http://127.0.0.1:8188",
        client_id: Optional[str] = None,
        username: Optional[str] = None,
        password: Optional[str] = None,
    ) -> None:
        """Initialize the WebSocket client.
        
        Args:
            server_url: ComfyUI server URL (http://host:port)
            client_id: Optional client ID for session tracking
            username: Optional username for authentication
            password: Optional password for authentication
        """
        self.server_url = server_url.strip().rstrip("/")
        self.client_id = client_id or str(uuid.uuid4())
        self.username = username or ""
        self.password = password or ""
        
        # Convert http to ws - handle both http:// and bare URLs
        if self.server_url.startswith("https://"):
            ws_url = self.server_url.replace("https://", "wss://")
        elif self.server_url.startswith("http://"):
            ws_url = self.server_url.replace("http://", "ws://")
        else:
            # Assume ws:// for bare URLs
            ws_url = f"ws://{self.server_url}"
        
        self.ws_url = f"{ws_url}/ws?clientId={self.client_id}"
        logger.info(f"WebSocket URL: {self.ws_url}")
        
        self._ws: Optional[websocket.WebSocketApp] = None
        self._ws_thread: Optional[threading.Thread] = None
        self._running = False
        self._connected = False
        self._reconnect_delay = 1.0
        self._max_reconnect_delay = 30.0
        
        # Callbacks
        self.on_message: Optional[Callable[[ComfyUIMessage], None]] = None
        self.on_progress: Optional[Callable[[str, int, int, Optional[str]], None]] = None
        self.on_status: Optional[Callable[[dict], None]] = None
        self.on_executing: Optional[Callable[[str, str, str], None]] = None  # node_id, display_node, prompt_id
        self.on_executed: Optional[Callable[[str, str, dict, str], None]] = None  # node_id, display_node, output, prompt_id
        self.on_error: Optional[Callable[[str, dict], None]] = None
        self.on_connected: Optional[Callable[[], None]] = None
        self.on_disconnected: Optional[Callable[[], None]] = None
        self.on_log: Optional[Callable[[str, str], None]] = None  # level, message
        self.on_system_stats: Optional[Callable[[dict], None]] = None  # System monitoring data
        self.on_progress_update: Optional[Callable[[int, int, float], None]] = None  # value, max, elapsed
        
        # Execution tracking for console output
        self._execution_start_time: Optional[float] = None
        self._current_prompt_id: Optional[str] = None
        self._last_progress_value = 0
        self._last_progress_max = 0
    
    @property
    def is_connected(self) -> bool:
        """Check if WebSocket is connected."""
        return self._connected
    
    def connect(self) -> bool:
        """Connect to ComfyUI WebSocket.
        
        Returns:
            True if connection initiated successfully.
        """
        if not WEBSOCKET_AVAILABLE:
            logger.error("websocket-client not available")
            return False
        
        if self._running:
            logger.warning("WebSocket already running")
            return True
        
        self._running = True
        self._ws_thread = threading.Thread(target=self._run_websocket, daemon=True)
        self._ws_thread.start()
        
        return True
    
    def disconnect(self) -> None:
        """Disconnect from ComfyUI WebSocket."""
        self._running = False
        if self._ws:
            try:
                self._ws.close()
            except Exception:
                pass
        self._ws = None
        self._connected = False
    
    def _run_websocket(self) -> None:
        """WebSocket connection thread."""
        import base64
        
        while self._running:
            try:
                # Build headers for authentication if credentials provided
                header = []
                if self.username and self.password:
                    credentials = f"{self.username}:{self.password}"
                    encoded = base64.b64encode(credentials.encode()).decode()
                    header.append(f"Authorization: Basic {encoded}")
                
                self._ws = websocket.WebSocketApp(
                    self.ws_url,
                    on_open=self._on_open,
                    on_message=self._on_message,
                    on_error=self._on_error,
                    on_close=self._on_close,
                    header=header if header else None,
                )
                
                # Run with automatic reconnection handling
                # skip_utf8_validation=True is needed to receive binary messages properly
                self._ws.run_forever(
                    ping_interval=30,
                    ping_timeout=10,
                    skip_utf8_validation=True,
                )
                
            except Exception as e:
                self._log("comfyui", f"WebSocket error: {e}")
            
            if self._running:
                # Wait before reconnecting
                self._log("comfyui", f"Reconnecting in {self._reconnect_delay}s...")
                time.sleep(self._reconnect_delay)
                self._reconnect_delay = min(self._reconnect_delay * 2, self._max_reconnect_delay)
    
    def _on_open(self, ws) -> None:
        """Handle WebSocket connection opened."""
        self._connected = True
        self._reconnect_delay = 1.0  # Reset reconnect delay
        self._log("comfyui", "Connected to ComfyUI")
        
        if self.on_connected:
            try:
                self.on_connected()
            except Exception as e:
                logger.error(f"Error in on_connected callback: {e}")
    
    def _on_message(self, ws, message: str) -> None:
        """Handle received WebSocket message."""
        try:
            # Check if it's binary data
            if isinstance(message, bytes):
                # Check if it's actually JSON (starts with '{')
                if message and message[0:1] == b'{':
                    # It's JSON delivered as bytes, decode and process as JSON
                    message = message.decode('utf-8')
                else:
                    # It's actual binary data
                    self._handle_binary_message(message)
                    return
            
            data = json.loads(message)
            event_type = data.get("type", "unknown")
            event_data = data.get("data", {})
            
            # Debug: Dump full message for unknown events
            if event_type not in ("crystools.monitor", "kaytool.resources", "status", 
                                  "progress_state", "execution_start", "executing", 
                                  "executed", "progress", "execution_success", 
                                  "execution_cached", "execution_error", "execution_interrupted"):
                logger.info(f"UNKNOWN event type: {event_type}")
                logger.info(f"  Full message: {message[:1000]}")
            
            msg = ComfyUIMessage(
                event_type=event_type,
                data=event_data,
                timestamp=time.time(),
            )
            
            # Call specific handlers based on event type
            self._handle_event(msg)
            
            # Call general message callback
            if self.on_message:
                try:
                    self.on_message(msg)
                except Exception as e:
                    logger.error(f"Error in on_message callback: {e}")
                    
        except json.JSONDecodeError:
            logger.warning(f"Invalid JSON received: {message[:100]}")
        except Exception as e:
            logger.error(f"Error processing message: {e}")
    
    def _handle_binary_message(self, message: bytes) -> None:
        """Handle binary WebSocket messages.
        
        Binary messages have a 4-byte header indicating the event type:
        - 1: PREVIEW_IMAGE
        - 2: UNENCODED_PREVIEW_IMAGE  
        - 3: TEXT (console/log messages)
        - 4: PREVIEW_IMAGE_WITH_METADATA
        """
        if len(message) < 4:
            logger.debug(f"Binary message too short: {len(message)} bytes")
            return
        
        # Unpack the event type from the first 4 bytes
        event_type = struct.unpack(">I", message[:4])[0]
        
        # Log ALL binary message types for debugging
        logger.info(f"Binary message: type={event_type}, length={len(message)} bytes")
        
        if event_type == BinaryEventTypes.TEXT:
            # TEXT message - contains console output from nodes
            try:
                if len(message) < 8:
                    return
                
                node_id_len = struct.unpack(">I", message[4:8])[0]
                logger.info(f"  TEXT message: node_id_len={node_id_len}")
                
                if len(message) < 8 + node_id_len:
                    return
                
                text = message[8 + node_id_len:].decode("utf-8")
                logger.info(f"  TEXT content: {text[:200]}")
                
                # Log each line of the console output
                for line in text.splitlines():
                    line = line.rstrip()
                    if line:
                        self._log("comfyui", line)
                    
            except Exception as e:
                logger.error(f"Error parsing TEXT binary message: {e}")
        
        # Try to decode any binary message as text to see what it contains
        elif event_type != BinaryEventTypes.PREVIEW_IMAGE and event_type != BinaryEventTypes.UNENCODED_PREVIEW_IMAGE:
            try:
                # Try UTF-8 decode on the rest
                text_attempt = message[4:min(len(message), 500)].decode('utf-8', errors='replace')
                logger.info(f"  Binary content preview: {text_attempt[:200]}")
            except Exception as e:
                logger.debug(f"Could not decode binary content: {e}")
        
        # Preview images are ignored (we get the final images via history API)
    
    def _handle_event(self, msg: ComfyUIMessage) -> None:
        """Handle specific event types and produce console-like output."""
        event_type = msg.event_type
        data = msg.data
        
        # Handle system monitoring events (crystools.monitor, kaytool.resources)
        if event_type in ("crystools.monitor", "kaytool.resources"):
            # Check for logs/console output in the data
            logs = data.get("logs", [])
            if logs:
                for log_entry in logs:
                    if isinstance(log_entry, str):
                        self._log("comfyui", log_entry)
                    elif isinstance(log_entry, dict):
                        msg_text = log_entry.get("message", log_entry.get("msg", log_entry.get("t", "")))
                        if msg_text:
                            self._log("comfyui", msg_text)
            
            # Also check for 'log' singular
            log_msg = data.get("log", "")
            if log_msg:
                self._log("comfyui", log_msg)
            
            # Debug: log all keys in these events periodically (first time only)
            if not hasattr(self, '_logged_monitor_keys'):
                self._logged_monitor_keys = True
                logger.info(f"Monitor event keys: {list(data.keys())}")
                # Log any key that might contain logs
                for key in data.keys():
                    if 'log' in key.lower() or 'msg' in key.lower() or 'console' in key.lower():
                        logger.info(f"  {key}: {str(data[key])[:200]}")
            
            if self.on_system_stats:
                try:
                    self.on_system_stats(data)
                except Exception as e:
                    logger.error(f"Error in on_system_stats callback: {e}")
            return  # Don't log stats - too noisy
        
        # Skip progress_state events (we use 'progress' instead)
        if event_type == "progress_state":
            return
        
        if event_type == "status":
            # Queue status - only log if queue is non-empty or just cleared
            status = data.get("status", {})
            exec_info = status.get("exec_info", {})
            queue_remaining = exec_info.get("queue_remaining", 0)
            
            if self.on_status:
                try:
                    self.on_status(status)
                except Exception as e:
                    logger.error(f"Error in on_status callback: {e}")
        
        elif event_type == "execution_start":
            prompt_id = data.get("prompt_id", "")
            self._execution_start_time = time.time()
            self._current_prompt_id = prompt_id
            self._last_progress_value = 0
            self._last_progress_max = 0
            self._log("comfyui", "got prompt")
        
        elif event_type == "executing":
            # Node is being executed
            node_id = data.get("node")
            display_node = data.get("display_node", node_id)
            prompt_id = data.get("prompt_id", "")
            
            if self.on_executing:
                try:
                    self.on_executing(node_id, display_node, prompt_id)
                except Exception as e:
                    logger.error(f"Error in on_executing callback: {e}")
        
        elif event_type == "executed":
            # Node execution completed
            node_id = data.get("node")
            display_node = data.get("display_node", node_id)
            output = data.get("output", {})
            prompt_id = data.get("prompt_id", "")
            
            if self.on_executed:
                try:
                    self.on_executed(node_id, display_node, output, prompt_id)
                except Exception as e:
                    logger.error(f"Error in on_executed callback: {e}")
        
        elif event_type == "progress":
            # Progress update - create tqdm-style progress bar
            value = data.get("value", 0)
            max_value = data.get("max", 100)
            prompt_id = data.get("prompt_id", "")
            node_id = data.get("node", "")
            
            self._last_progress_value = value
            self._last_progress_max = max_value
            
            # Calculate timing
            elapsed = 0.0
            it_per_s = 0.0
            if self._execution_start_time and value > 0:
                elapsed = time.time() - self._execution_start_time
                it_per_s = value / elapsed if elapsed > 0 else 0
            
            # Create tqdm-style progress bar
            percent = int((value / max_value) * 100) if max_value > 0 else 0
            bar_length = 50
            filled = int(bar_length * value / max_value) if max_value > 0 else 0
            bar = "█" * filled + " " * (bar_length - filled)
            
            # Format: 100%|████████████████████████████████████████████████| 9/9 [00:02<00:00,  4.49it/s]
            if it_per_s > 0:
                remaining = (max_value - value) / it_per_s if it_per_s > 0 else 0
                progress_line = f"{percent:3d}%|{bar}| {value}/{max_value} [{elapsed:05.2f}s<{remaining:05.2f}s, {it_per_s:.2f}it/s]"
            else:
                progress_line = f"{percent:3d}%|{bar}| {value}/{max_value}"
            
            # Use special "progress_update" level to update in-place
            self._log("progress_update", progress_line)
            
            # Call progress callbacks for UI progress bars
            if self.on_progress:
                try:
                    self.on_progress(prompt_id, value, max_value, node_id)
                except Exception as e:
                    logger.error(f"Error in on_progress callback: {e}")
            
            if self.on_progress_update:
                try:
                    self.on_progress_update(value, max_value, elapsed)
                except Exception as e:
                    logger.error(f"Error in on_progress_update callback: {e}")
        
        elif event_type == "execution_success":
            prompt_id = data.get("prompt_id", "")
            
            # Calculate total execution time
            if self._execution_start_time:
                elapsed = time.time() - self._execution_start_time
                self._log("comfyui", f"Prompt executed in {elapsed:.2f} seconds")
            
            self._execution_start_time = None
            self._current_prompt_id = None
        
        elif event_type == "execution_cached":
            cached_nodes = data.get("nodes", [])
            if cached_nodes:
                self._log("comfyui", f"Using cached nodes: {len(cached_nodes)}")
        
        elif event_type == "execution_error":
            prompt_id = data.get("prompt_id", "")
            node_id = data.get("node_id", "")
            node_type = data.get("node_type", "")
            exception_message = data.get("exception_message", "Unknown error")
            
            self._log("comfyui", f"ERROR in {node_type} ({node_id}): {exception_message}")
            
            if self.on_error:
                try:
                    self.on_error(prompt_id, data)
                except Exception as e:
                    logger.error(f"Error in on_error callback: {e}")
            
            self._execution_start_time = None
            self._current_prompt_id = None
        
        elif event_type == "execution_interrupted":
            prompt_id = data.get("prompt_id", "")
            self._log("comfyui", "Execution interrupted")
            self._execution_start_time = None
            self._current_prompt_id = None
        
        elif event_type == "logs":
            # Log messages from ComfyUI (newer versions)
            logs = data.get("logs", [])
            if isinstance(logs, list):
                for log_entry in logs:
                    if isinstance(log_entry, str):
                        self._log("comfyui", log_entry)
                    elif isinstance(log_entry, dict):
                        msg = log_entry.get("message", log_entry.get("msg", ""))
                        if msg:
                            self._log("comfyui", msg)
            elif isinstance(logs, str):
                self._log("comfyui", logs)
        
        elif event_type == "log":
            # Single log message
            message = data.get("message", data.get("msg", ""))
            if message:
                self._log("comfyui", message)
    
    def _on_error(self, ws, error) -> None:
        """Handle WebSocket error."""
        self._log("comfyui", f"WebSocket error: {error}")
    
    def _on_close(self, ws, close_status_code, close_msg) -> None:
        """Handle WebSocket connection closed."""
        self._connected = False
        self._log("comfyui", "Disconnected from ComfyUI")
        
        if self.on_disconnected:
            try:
                self.on_disconnected()
            except Exception as e:
                logger.error(f"Error in on_disconnected callback: {e}")
    
    def _log(self, level: str, message: str) -> None:
        """Log a message both to Python logger and callback.
        
        Args:
            level: Log level ('info', 'warning', 'error', 'comfyui', 'progress_update')
            message: Message to log.
        """
        # Log to Python logger
        if level == "error":
            logger.error(message)
        elif level == "warning":
            logger.warning(message)
        elif level == "progress_update":
            # Progress updates - log without prefix (they update in-place in UI)
            logger.info(message)
        elif level == "comfyui":
            # ComfyUI console output - log at info level
            logger.info(f"[ComfyUI] {message}")
        else:
            logger.info(message)
        
        # Send to UI callback
        if self.on_log:
            try:
                self.on_log(level, message)
            except Exception as e:
                logger.error(f"Error in on_log callback: {e}")


# Singleton instance for easy access
_default_websocket: Optional[ComfyUIWebSocket] = None


def get_websocket(server_url: str = "http://127.0.0.1:8188") -> ComfyUIWebSocket:
    """Get or create the default WebSocket instance.
    
    Args:
        server_url: ComfyUI server URL
        
    Returns:
        ComfyUIWebSocket instance
    """
    global _default_websocket
    
    if _default_websocket is None or _default_websocket.server_url != server_url:
        if _default_websocket:
            _default_websocket.disconnect()
        _default_websocket = ComfyUIWebSocket(server_url)
    
    return _default_websocket
