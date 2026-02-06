"""
Cinema Prompt Engineering - Standalone Application Entry Point

This module serves as the entry point for the PyInstaller-built standalone application.
It starts the FastAPI server and opens a native window using pywebview.
"""

import os
import sys
import threading
import time
from pathlib import Path

# Determine if we're running as a PyInstaller bundle
if getattr(sys, 'frozen', False):
    # Running as compiled executable
    base_path = getattr(sys, '_MEIPASS', None)
    BASE_DIR = Path(base_path) if base_path else Path(__file__).parent
    STATIC_DIR = BASE_DIR / 'static'
else:
    # Running as script
    BASE_DIR = Path(__file__).parent
    STATIC_DIR = BASE_DIR / 'dist' / 'static'


# Add the base directory to Python path for imports
sys.path.insert(0, str(BASE_DIR))

# Global flag to track if server is ready
server_ready = threading.Event()


def create_app():
    """Create the FastAPI application with static file serving."""
    from fastapi import FastAPI, Response
    from fastapi.staticfiles import StaticFiles
    from fastapi.responses import FileResponse, HTMLResponse
    from fastapi.middleware.cors import CORSMiddleware
    
    # Create a NEW app (don't import the existing one)
    app = FastAPI(
        title="Cinema Prompt Engineering",
        description="Professional cinematography prompt generator for AI image/video models",
        version="0.1.0",
    )
    
    # Add CORS middleware
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    
    # Import and mount the API app at /api prefix
    # We need to do this BEFORE adding catch-all routes
    from api.main import app as api_app
    app.mount("/api", api_app)
    
    # Check if static files exist
    has_static = STATIC_DIR.exists() and (STATIC_DIR / 'index.html').exists()
    
    if has_static:
        # Read index.html content once at startup
        index_html_path = STATIC_DIR / 'index.html'
        index_html_content = index_html_path.read_text(encoding='utf-8')
        
        # Mount static assets directory
        if (STATIC_DIR / 'assets').exists():
            app.mount("/assets", StaticFiles(directory=str(STATIC_DIR / 'assets')), name="static_assets")
        
        # Root route - serve index.html
        @app.get("/", response_class=HTMLResponse)
        async def serve_root():
            """Serve the frontend application."""
            return HTMLResponse(content=index_html_content)
        
        # Catch-all for SPA routing and static files
        # This comes AFTER the mounts, so /api and /assets are handled first
        @app.get("/{path:path}")
        async def serve_static_or_spa(path: str):
            """Serve static files or fall back to SPA."""
            # Check if it's a static file
            file_path = STATIC_DIR / path
            if file_path.exists() and file_path.is_file():
                # Determine content type
                suffix = file_path.suffix.lower()
                content_types = {
                    '.html': 'text/html',
                    '.js': 'application/javascript',
                    '.css': 'text/css',
                    '.json': 'application/json',
                    '.png': 'image/png',
                    '.jpg': 'image/jpeg',
                    '.jpeg': 'image/jpeg',
                    '.gif': 'image/gif',
                    '.svg': 'image/svg+xml',
                    '.ico': 'image/x-icon',
                    '.woff': 'font/woff',
                    '.woff2': 'font/woff2',
                    '.ttf': 'font/ttf',
                }
                content_type = content_types.get(suffix, 'application/octet-stream')
                return FileResponse(str(file_path), media_type=content_type)
            
            # Fall back to SPA (serve index.html)
            return HTMLResponse(content=index_html_content)
        
        print(f"\n{'='*50}")
        print("  Cinema Prompt Engineering")
        print(f"{'='*50}")
        print(f"\n  Application running at: http://localhost:8000")
        print(f"  API Documentation: http://localhost:8000/api/docs")
        print(f"\n  Press Ctrl+C to stop the server")
        print(f"{'='*50}\n")
    else:
        # No static files - just redirect root to API
        @app.get("/")
        async def serve_root_api_only():
            return {"message": "Cinema Prompt Engineering API", "docs": "/api/docs"}
        
        print(f"\n{'='*50}")
        print("  Cinema Prompt Engineering - API Only")
        print(f"{'='*50}")
        print(f"\n  Static files not found at: {STATIC_DIR}")
        print(f"  Running API only mode")
        print(f"\n  API running at: http://localhost:8000/api")
        print(f"  API Documentation: http://localhost:8000/api/docs")
        print(f"\n  Press Ctrl+C to stop the server")
        print(f"{'='*50}\n")
    
    return app


def start_server(port: int = 8000):
    """Start the FastAPI server in a background thread."""
    import uvicorn
    
    app = create_app()
    
    # Custom callback to signal when server is ready
    class ServerReadyCallback(uvicorn.Config):
        pass
    
    config = uvicorn.Config(app, host="127.0.0.1", port=port, log_level="warning")
    server = uvicorn.Server(config)
    
    def run_server():
        # Signal ready after a short delay (server startup)
        def signal_ready():
            time.sleep(1.5)
            server_ready.set()
        threading.Thread(target=signal_ready, daemon=True).start()
        server.run()
    
    server_thread = threading.Thread(target=run_server, daemon=True)
    server_thread.start()
    return server_thread


def main():
    """Main entry point for the standalone application."""
    import argparse
    
    parser = argparse.ArgumentParser(description='Cinema Prompt Engineering')
    parser.add_argument('--browser', action='store_true', 
                        help='Open in browser instead of native window')
    parser.add_argument('--port', type=int, default=8000,
                        help='Port to run the server on (default: 8000)')
    args = parser.parse_args()
    
    port = args.port
    
    if args.browser:
        # Browser mode - original behavior
        import webbrowser
        import uvicorn
        
        app = create_app()
        
        def open_browser():
            time.sleep(2)
            webbrowser.open(f'http://localhost:{port}')
        
        threading.Thread(target=open_browser, daemon=True).start()
        uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
    else:
        # Native window mode using pywebview
        try:
            import webview
        except ImportError:
            print("pywebview not installed. Falling back to browser mode.")
            print("Install with: pip install pywebview")
            import webbrowser
            import uvicorn
            
            app = create_app()
            
            def open_browser():
                time.sleep(2)
                webbrowser.open(f'http://localhost:{port}')
            
            threading.Thread(target=open_browser, daemon=True).start()
            uvicorn.run(app, host="0.0.0.0", port=port, log_level="info")
            return
        
        # Configure pywebview settings
        # IMPORTANT: OAuth links with target="_blank" will open in system browser
        webview.settings['OPEN_EXTERNAL_LINKS_IN_BROWSER'] = True
        webview.settings['ALLOW_DOWNLOADS'] = True
        
        # Start the server in background
        start_server(port)
        
        # Wait for server to be ready
        print("Starting Cinema Prompt Engineering...")
        server_ready.wait(timeout=10)
        
        # Expose Python API to JavaScript for environment detection
        class Api:
            def is_pywebview(self):
                """Return True to indicate we're running in pywebview."""
                return True
            
            def open_in_browser(self, url):
                """Open a URL in the system's default browser."""
                import webbrowser
                webbrowser.open(url)
                return True
        
        api = Api()
        
        # Create native window with the API exposed
        window = webview.create_window(
            title='Cinema Prompt Engineering',
            url=f'http://localhost:{port}',
            width=1400,
            height=900,
            min_size=(1024, 768),
            resizable=True,
            text_select=True,
            js_api=api,  # Expose API during window creation
        )
        
        # Start the webview
        webview.start(debug=False)
        
        print("\nApplication closed.")



if __name__ == "__main__":
    main()
