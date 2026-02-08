
import os
import json
import logging
import aiohttp
import base64
import tempfile
import shutil
from pathlib import Path
from aiohttp import web
try:
    from server import PromptServer
except ImportError:
    # Fallback for linting/testing outside ComfyUI
    class PromptServer:
        class instance:
            app = web.Application()

# Import core logic
from cinema_rules import RuleEngine, LiveActionConfig, AnimationConfig
from cinema_rules.prompts import PromptGenerator
from cinema_rules.presets.live_action import LIVE_ACTION_PRESETS
from cinema_rules.presets.animation import ANIMATION_PRESETS
from cinema_rules.presets.cinematography_styles import CINEMATOGRAPHY_STYLES

# Initialize engine
engine = RuleEngine()

# Backend server configuration
BACKEND_URL = os.environ.get("CINEMA_BACKEND_URL", "http://localhost:9800")
logger = logging.getLogger(__name__)

# Helper for JSON response
def json_response(data):
    return web.json_response(data)

# Helper to parse body
async def get_json(request):
    try:
        return await request.json()
    except (json.JSONDecodeError, ValueError):
        return {}

# --- Route Handlers ---

async def handle_validate(request):
    data = await get_json(request)
    project_type = data.get("project_type")
    config_dict = data.get("config", {})
    
    try:
        if project_type == "live_action":
            config = LiveActionConfig(**config_dict)
            result = engine.validate_live_action(config)
        elif project_type == "animation":
            config = AnimationConfig(**config_dict)
            result = engine.validate_animation(config)
        else:
            return web.Response(status=400, text="Invalid project_type")
            
        return json_response(result.dict())
    except Exception as e:
        return web.Response(status=400, text=str(e))

async def handle_generate_prompt(request):
    data = await get_json(request)
    project_type = data.get("project_type")
    config_dict = data.get("config", {})
    target_model = data.get("target_model", "generic")
    
    try:
        generator = PromptGenerator(target_model=target_model)
        
        if project_type == "live_action":
            config = LiveActionConfig(**config_dict)
            prompt = generator.generate_live_action_prompt(config)
        elif project_type == "animation":
            config = AnimationConfig(**config_dict)
            prompt = generator.generate_animation_prompt(config)
        else:
            return web.Response(status=400, text="Invalid project_type")
            
        return json_response({
            "prompt": prompt,
            "negative_prompt": generator.get_negative_prompt(),
            "model_notes": ""
        })
    except Exception as e:
        return web.Response(status=400, text=str(e))

async def handle_get_live_action_presets(request):
    # Convert presets to list
    presets = [p.dict() for p in LIVE_ACTION_PRESETS.values()]
    return json_response({"presets": presets})

async def handle_get_animation_presets(request):
    presets = [p.dict() for p in ANIMATION_PRESETS.values()]
    return json_response({"presets": presets})

async def handle_get_live_action_preset(request):
    preset_id = request.match_info.get("id")
    preset = LIVE_ACTION_PRESETS.get(preset_id)
    if not preset:
        return web.Response(status=404)
    return json_response(preset.dict())

async def handle_get_animation_preset(request):
    preset_id = request.match_info.get("id")
    preset = ANIMATION_PRESETS.get(preset_id)
    if not preset:
        return web.Response(status=404)
    return json_response(preset.dict())

async def handle_get_cinematography_style(request):
    preset_id = request.match_info.get("id")
    style = CINEMATOGRAPHY_STYLES.get(preset_id)
    if not style:
        # Return empty if not found, or 404
        return web.Response(status=404)
    return json_response(style.dict())

async def handle_apply_live_action_preset(request):
    data = await get_json(request)
    preset_id = data.get("preset_id")
    overrides = data.get("overrides")
    
    # Check if preset exists in dictionary
    if preset_id not in LIVE_ACTION_PRESETS:
        return web.Response(status=404)
        
    config, validation = engine.apply_live_action_preset(preset_id, overrides)
    preset = LIVE_ACTION_PRESETS.get(preset_id)
    return json_response({
        "config": config.dict(),
        "validation": validation.dict(),
        "preset": preset.dict() if preset else None,
    })

async def handle_apply_animation_preset(request):
    data = await get_json(request)
    preset_id = data.get("preset_id")
    overrides = data.get("overrides")
    
    if preset_id not in ANIMATION_PRESETS:
        return web.Response(status=404)
        
    config, validation = engine.apply_animation_preset(preset_id, overrides)
    preset = ANIMATION_PRESETS.get(preset_id)
    return json_response({
        "config": config.dict(),
        "validation": validation.dict(),
        "preset": preset.dict() if preset else None,
    })

async def handle_list_enums(request):
    # This is complex to implement fully dynamically, 
    # but we can return the structure expected by the frontend
    # For now, let's just return success and let the frontend use defaults if needed
    # Or import all enums and dump them
    from cinema_rules.schemas.live_action import CameraManufacturer, CameraBody
    # ... import others ...
    # Easier to mock or implement on demand
    return json_response({}) 

async def handle_get_target_models(request):
    models = [
        {"id": "generic", "name": "Generic / SD1.5", "category": "Standard"},
        {"id": "midjourney", "name": "Midjourney v6", "category": "Premium"},
        {"id": "flux", "name": "FLUX.1", "category": "Premium"},
        {"id": "sdxl", "name": "SDXL", "category": "Standard"},
        {"id": "wan2.2", "name": "Wan 2.2", "category": "Video"},
        {"id": "runway", "name": "Runway Gen-3", "category": "Video"},
        {"id": "pika", "name": "Pika Art", "category": "Video"},
        {"id": "cogvideo", "name": "CogVideoX", "category": "Video"},
        {"id": "hunyuan", "name": "Hunyuan Video", "category": "Video"},
    ]
    return json_response(models)

# Register routes
def register_routes():
    app = PromptServer.instance.app
    routes = web.RouteTableDef()
    
    # Prefix: /cinema-prompt/api
    base = "/cinema_prompt/api"
    
    app.router.add_post(f"{base}/validate", handle_validate)
    app.router.add_post(f"{base}/generate-prompt", handle_generate_prompt)
    
    app.router.add_get(f"{base}/presets/live-action", handle_get_live_action_presets)
    app.router.add_get(f"{base}/presets/animation", handle_get_animation_presets)
    
    app.router.add_get(f"{base}/presets/live-action/{{id}}", handle_get_live_action_preset)
    app.router.add_get(f"{base}/presets/animation/{{id}}", handle_get_animation_preset)
    app.router.add_get(f"{base}/presets/live-action/{{id}}/cinematography-style", handle_get_cinematography_style)
    
    app.router.add_post(f"{base}/apply-preset/live-action", handle_apply_live_action_preset)
    app.router.add_post(f"{base}/apply-preset/animation", handle_apply_animation_preset)
    
    app.router.add_get(f"{base}/target-models", handle_get_target_models)
    
    # Proxy endpoints to backend server
    app.router.add_get(f"{base}/settings", handle_get_settings)
    app.router.add_get(f"{base}/credentials", handle_get_all_credentials)
    app.router.add_get(f"{base}/credentials/{{provider_id}}", handle_get_credentials)
    app.router.add_post(f"{base}/enhance-prompt", handle_enhance_prompt)
    app.router.add_get(f"{base}/backend-status", handle_backend_status)
    app.router.add_get(f"{base}/enums", handle_list_enums)
    
    # Project file save endpoints
    app.router.add_post(f"{base}/project/save-file", handle_save_project_file)
    app.router.add_post(f"{base}/project/save-from-url", handle_save_from_url)
    app.router.add_options(f"{base}/project/save-file", handle_save_options)
    app.router.add_options(f"{base}/project/save-from-url", handle_save_options)


# =============================================================================
# BACKEND PROXY HANDLERS
# =============================================================================

async def _proxy_get(path: str) -> dict:
    """Make a GET request to the backend server."""
    url = f"{BACKEND_URL}{path}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
                if resp.status == 200:
                    return await resp.json()
                else:
                    text = await resp.text()
                    return {"error": f"Backend returned {resp.status}: {text}", "status": resp.status}
    except aiohttp.ClientConnectorError:
        return {"error": "Backend server not running. Please start the Cinema Prompt Engineering web app.", "status": 503}
    except Exception as e:
        return {"error": f"Backend request failed: {str(e)}", "status": 500}


async def _proxy_post(path: str, data: dict) -> dict:
    """Make a POST request to the backend server."""
    url = f"{BACKEND_URL}{path}"
    try:
        async with aiohttp.ClientSession() as session:
            async with session.post(url, json=data, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                result = await resp.json()
                result["_status"] = resp.status
                return result
    except aiohttp.ClientConnectorError:
        return {"error": "Backend server not running. Please start the Cinema Prompt Engineering web app.", "status": 503}
    except Exception as e:
        return {"error": f"Backend request failed: {str(e)}", "status": 500}


async def handle_backend_status(request):
    """Check if the backend server is running and accessible."""
    result = await _proxy_get("/settings")
    if "error" in result:
        return json_response({
            "status": "offline",
            "message": result["error"],
            "backend_url": BACKEND_URL,
            "guidance": "Please start the backend server by running: python -m api.main"
        })
    return json_response({
        "status": "online",
        "backend_url": BACKEND_URL,
        "settings": result
    })


async def handle_get_settings(request):
    """Get settings from backend server (active provider, model, etc)."""
    result = await _proxy_get("/settings")
    if "error" in result:
        return web.json_response(
            {"error": result["error"], "guidance": "Start the backend: python -m api.main"},
            status=result.get("status", 500)
        )
    return json_response(result)


async def handle_get_all_credentials(request):
    """Get all credentials summary from backend."""
    result = await _proxy_get("/credentials")
    if "error" in result:
        return web.json_response(
            {"error": result["error"], "guidance": "Start the backend: python -m api.main"},
            status=result.get("status", 500)
        )
    return json_response(result)


async def handle_get_credentials(request):
    """Get credentials for a specific provider from backend."""
    provider_id = request.match_info.get("provider_id")
    result = await _proxy_get(f"/credentials/{provider_id}")
    if "error" in result:
        return web.json_response(
            {"error": result["error"], "guidance": "Start the backend: python -m api.main"},
            status=result.get("status", 500)
        )
    return json_response(result)


async def handle_enhance_prompt(request):
    """
    Proxy enhance-prompt request to backend server.
    
    This is the main integration point - ComfyUI node sends the prompt
    to be enhanced by the LLM using credentials stored in the backend.
    """
    data = await get_json(request)
    result = await _proxy_post("/enhance-prompt", data)
    
    if "error" in result and result.get("status") == 503:
        # Backend not running
        return web.json_response({
            "success": False,
            "error": result["error"],
            "guidance": "The backend server is not running. Please start it by running: python -m api.main",
            "enhanced_prompt": ""
        }, status=503)
    
    # Check for auth-related errors and provide guidance
    if not result.get("success") and result.get("error"):
        error_lower = result["error"].lower()
        if any(word in error_lower for word in ["token", "auth", "expired", "invalid", "credentials"]):
            result["guidance"] = "Authentication issue detected. Please open the Cinema Prompt Engineering web app (http://localhost:8080) and re-authenticate with your LLM provider."
        elif "not configured" in error_lower or "not found" in error_lower:
            result["guidance"] = "No LLM provider configured. Please open the Cinema Prompt Engineering web app (http://localhost:8080) and set up your preferred LLM provider."
    
    status = result.pop("_status", 200) if "_status" in result else 200
    return web.json_response(result, status=status if not result.get("success") and status != 200 else 200)


# =============================================================================
# PROJECT FILE SAVE HANDLER
# =============================================================================

async def handle_save_project_file(request):
    """
    Save a file to the project folder.
    
    Expects JSON body:
    {
        "folder_path": "Z:\\Projects\\MyProject\\renders",
        "filename": "MyProject_Panel01_v001.png",
        "content_base64": "iVBORw0KGgo...",  // Base64 encoded file content
        "content_type": "image/png"  // or "application/json"
    }
    
    Returns:
    {
        "success": true,
        "saved_path": "Z:\\Projects\\MyProject\\renders\\MyProject_Panel01_v001.png"
    }
    """
    try:
        data = await get_json(request)
        
        folder_path = data.get("folder_path")
        filename = data.get("filename")
        content_base64 = data.get("content_base64")
        content_type = data.get("content_type", "application/octet-stream")
        
        if not folder_path or not filename or not content_base64:
            return web.json_response({
                "success": False,
                "error": "Missing required fields: folder_path, filename, content_base64"
            }, status=400, headers={"Access-Control-Allow-Origin": "*"})
        
        # Ensure the folder exists
        folder = Path(folder_path)
        folder.mkdir(parents=True, exist_ok=True)
        
        # Decode base64 content
        file_content = base64.b64decode(content_base64)
        
        # Save the file
        file_path = folder / filename
        with open(file_path, 'wb') as f:
            f.write(file_content)
        
        logger.info(f"[ProjectSave] Saved file: {file_path}")
        
        return web.json_response({
            "success": True,
            "saved_path": str(file_path)
        }, headers={"Access-Control-Allow-Origin": "*"})
        
    except Exception as e:
        logger.error(f"[ProjectSave] Error saving file: {e}")
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500, headers={"Access-Control-Allow-Origin": "*"})


async def handle_save_from_url(request):
    """
    Download an image from ComfyUI's /view endpoint and save it to the project folder.
    
    Flow:
    1. Download image from ComfyUI /view endpoint to temp file
    2. Create project folder if needed
    3. Move/rename temp file to final destination
    4. Save metadata JSON alongside
    
    Expects JSON body:
    {
        "folder_path": "Z:\\Projects\\MyProject\\renders",
        "filename": "MyProject_Panel01_v001.png",
        "image_url": "http://localhost:8188/view?filename=...",
        "metadata": { ... }  // Optional metadata to save as JSON
    }
    """
    cors_headers = {"Access-Control-Allow-Origin": "*"}
    
    try:
        data = await get_json(request)
        
        folder_path = data.get("folder_path")
        filename = data.get("filename")
        image_url = data.get("image_url")
        metadata = data.get("metadata")
        
        if not folder_path or not filename or not image_url:
            return web.json_response({
                "success": False,
                "error": "Missing required fields: folder_path, filename, image_url"
            }, status=400, headers=cors_headers)
        
        logger.info(f"[ProjectSave] Saving image from {image_url} to {folder_path}/{filename}")
        
        # Step 1: Download the image from ComfyUI to a temp file
        temp_file = None
        try:
            async with aiohttp.ClientSession() as session:
                async with session.get(image_url, timeout=aiohttp.ClientTimeout(total=60)) as resp:
                    if resp.status != 200:
                        error_text = await resp.text()
                        logger.error(f"[ProjectSave] Failed to download: HTTP {resp.status} - {error_text}")
                        return web.json_response({
                            "success": False,
                            "error": f"Failed to download image: HTTP {resp.status}"
                        }, status=500, headers=cors_headers)
                    
                    # Create temp file with same extension
                    ext = os.path.splitext(filename)[1] or '.png'
                    temp_fd, temp_file = tempfile.mkstemp(suffix=ext)
                    
                    # Write downloaded content to temp file
                    with os.fdopen(temp_fd, 'wb') as f:
                        while True:
                            chunk = await resp.content.read(8192)
                            if not chunk:
                                break
                            f.write(chunk)
                    
                    logger.info(f"[ProjectSave] Downloaded to temp: {temp_file}")
            
            # Step 2: Ensure the project folder exists
            folder = Path(folder_path)
            folder.mkdir(parents=True, exist_ok=True)
            
            # Step 3: Move temp file to final destination
            final_path = folder / filename
            shutil.move(temp_file, final_path)
            temp_file = None  # Clear so we don't try to delete it in finally
            
            logger.info(f"[ProjectSave] Moved to: {final_path}")
            
            # Step 4: Save metadata if provided
            saved_files = [str(final_path)]
            if metadata:
                meta_filename = os.path.splitext(filename)[0] + '_metadata.json'
                meta_path = folder / meta_filename
                with open(meta_path, 'w', encoding='utf-8') as f:
                    json.dump(metadata, f, indent=2, default=str)
                saved_files.append(str(meta_path))
                logger.info(f"[ProjectSave] Saved metadata: {meta_path}")
            
            return web.json_response({
                "success": True,
                "saved_path": str(final_path),
                "saved_files": saved_files
            }, headers=cors_headers)
            
        finally:
            # Clean up temp file if it still exists (e.g., on error)
            if temp_file and os.path.exists(temp_file):
                try:
                    os.remove(temp_file)
                    logger.info(f"[ProjectSave] Cleaned up temp file: {temp_file}")
                except Exception as e:
                    logger.warning(f"[ProjectSave] Failed to clean up temp file: {e}")
        
    except Exception as e:
        logger.error(f"[ProjectSave] Error saving from URL: {e}", exc_info=True)
        return web.json_response({
            "success": False,
            "error": str(e)
        }, status=500, headers=cors_headers)


async def handle_save_options(request):
    """Handle CORS preflight OPTIONS request"""
    return web.Response(
        status=200,
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        }
    )


# NOTE: Routes are NOT auto-registered anymore.
# The frontend connects directly to the standalone backend at localhost:9800.
# This file is kept for potential future use but is not loaded by default.
# To re-enable, import and call register_routes() from __init__.py

