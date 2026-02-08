"""
FastAPI Integration Example for WorkflowParser

This file shows how to integrate the WorkflowParser into the existing
CinemaPromptEngineering FastAPI backend.

Add these endpoints to api/main.py to expose workflow parsing functionality.
"""

from typing import Any, Optional
from fastapi import APIRouter, HTTPException, UploadFile, File
from pydantic import BaseModel
import json

# Import the workflow parser
try:
    from workflow_parser import WorkflowParser, WorkflowManifest
except ImportError:
    # Fallback if not yet installed
    WorkflowParser = None
    WorkflowManifest = None


# =============================================================================
# API MODELS
# =============================================================================

class ParseWorkflowRequest(BaseModel):
    """Request to parse a workflow from JSON data."""
    workflow: dict[str, Any]
    include_raw: bool = False


class ParseWorkflowResponse(BaseModel):
    """Response containing parsed workflow manifest."""
    success: bool
    summary: dict[str, int]
    manifest: dict[str, Any]
    errors: list[str] = []


class ModifyParametersRequest(BaseModel):
    """Request to modify workflow parameters."""
    workflow: dict[str, Any]
    modifications: dict[str, Any]


class ModifyParametersResponse(BaseModel):
    """Response with modified workflow."""
    success: bool
    workflow: dict[str, Any]
    changes_applied: list[str]


# =============================================================================
# ROUTER
# =============================================================================

# Create a router for workflow operations
workflow_router = APIRouter(prefix="/api/workflow", tags=["workflow"])


@workflow_router.post("/parse", response_model=ParseWorkflowResponse)
async def parse_workflow(request: ParseWorkflowRequest):
    """
    Parse a ComfyUI workflow and extract editable parameters.
    
    This endpoint accepts a ComfyUI workflow (API format) and returns
    a structured manifest of all editable parameters.
    
    **Example Request:**
    ```json
    {
      "workflow": { /* ComfyUI workflow JSON */ },
      "include_raw": false
    }
    ```
    
    **Example Response:**
    ```json
    {
      "success": true,
      "summary": {
        "ksamplers": 1,
        "text_encoders": 2,
        "checkpoints": 1,
        "loras": 1,
        "total_nodes": 5
      },
      "manifest": { /* Parsed parameters */ }
    }
    ```
    """
    if WorkflowParser is None:
        raise HTTPException(
            status_code=500,
            detail="WorkflowParser not available. Install pydantic>=2.5.0"
        )
    
    try:
        # Parse the workflow
        parser = WorkflowParser(request.workflow)
        manifest = parser.parse(include_raw_workflow=request.include_raw)
        
        # Convert to dict for JSON response
        manifest_dict = manifest.model_dump()
        
        return ParseWorkflowResponse(
            success=True,
            summary=manifest.summary(),
            manifest=manifest_dict,
        )
    
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid workflow format: {str(e)}"
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse workflow: {str(e)}"
        )


@workflow_router.post("/upload-parse")
async def parse_uploaded_workflow(file: UploadFile = File(...)):
    """
    Parse a ComfyUI workflow from an uploaded JSON file.
    
    Upload a workflow JSON file and receive the parsed manifest.
    """
    if WorkflowParser is None:
        raise HTTPException(
            status_code=500,
            detail="WorkflowParser not available. Install pydantic>=2.5.0"
        )
    
    try:
        # Read and parse JSON file
        content = await file.read()
        workflow = json.loads(content)
        
        # Parse the workflow
        parser = WorkflowParser(workflow)
        manifest = parser.parse()
        
        return ParseWorkflowResponse(
            success=True,
            summary=manifest.summary(),
            manifest=manifest.model_dump(),
        )
    
    except json.JSONDecodeError:
        raise HTTPException(
            status_code=400,
            detail="Invalid JSON file"
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to parse workflow: {str(e)}"
        )


@workflow_router.post("/modify-parameters", response_model=ModifyParametersResponse)
async def modify_workflow_parameters(request: ModifyParametersRequest):
    """
    Modify workflow parameters based on provided changes.
    
    This endpoint allows modifying KSampler parameters, prompts, and other
    editable values in a workflow.
    
    **Example Request:**
    ```json
    {
      "workflow": { /* ComfyUI workflow JSON */ },
      "modifications": {
        "ksamplers": {
          "3": {  // Node ID
            "steps": 30,
            "cfg": 8.5,
            "seed": 42
          }
        },
        "prompts": {
          "6": {  // Node ID
            "text": "Updated prompt text"
          }
        }
      }
    }
    ```
    """
    if WorkflowParser is None:
        raise HTTPException(
            status_code=500,
            detail="WorkflowParser not available. Install pydantic>=2.5.0"
        )
    
    try:
        # Parse the workflow
        parser = WorkflowParser(request.workflow)
        manifest = parser.parse(include_raw_workflow=True)
        
        changes_applied = []
        
        # Apply KSampler modifications
        if "ksamplers" in request.modifications:
            for node_id, params in request.modifications["ksamplers"].items():
                if node_id in manifest.raw_workflow:
                    node = manifest.raw_workflow[node_id]
                    for param, value in params.items():
                        if param in node["inputs"]:
                            old_value = node["inputs"][param]
                            node["inputs"][param] = value
                            changes_applied.append(
                                f"KSampler {node_id}: {param} {old_value} → {value}"
                            )
        
        # Apply prompt modifications
        if "prompts" in request.modifications:
            for node_id, params in request.modifications["prompts"].items():
                if node_id in manifest.raw_workflow:
                    node = manifest.raw_workflow[node_id]
                    if "text" in params and "text" in node["inputs"]:
                        old_text = node["inputs"]["text"][:50]
                        node["inputs"]["text"] = params["text"]
                        changes_applied.append(
                            f"Prompt {node_id}: Updated text"
                        )
        
        # Apply checkpoint modifications
        if "checkpoints" in request.modifications:
            for node_id, params in request.modifications["checkpoints"].items():
                if node_id in manifest.raw_workflow:
                    node = manifest.raw_workflow[node_id]
                    if "ckpt_name" in params:
                        old_name = node["inputs"]["ckpt_name"]
                        node["inputs"]["ckpt_name"] = params["ckpt_name"]
                        changes_applied.append(
                            f"Checkpoint {node_id}: {old_name} → {params['ckpt_name']}"
                        )
        
        # Apply LoRA modifications
        if "loras" in request.modifications:
            for node_id, params in request.modifications["loras"].items():
                if node_id in manifest.raw_workflow:
                    node = manifest.raw_workflow[node_id]
                    for param in ["strength_model", "strength_clip", "lora_name"]:
                        if param in params and param in node["inputs"]:
                            old_value = node["inputs"][param]
                            node["inputs"][param] = params[param]
                            changes_applied.append(
                                f"LoRA {node_id}: {param} {old_value} → {params[param]}"
                            )
        
        return ModifyParametersResponse(
            success=True,
            workflow=manifest.raw_workflow,
            changes_applied=changes_applied,
        )
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to modify workflow: {str(e)}"
        )


@workflow_router.get("/validate/{workflow_id}")
async def validate_workflow_by_id(workflow_id: str):
    """
    Validate a workflow and check for common issues.
    
    This is a placeholder - you would load the workflow from storage
    and then validate it.
    """
    # TODO: Load workflow from database/storage
    raise HTTPException(
        status_code=501,
        detail="Workflow validation by ID not yet implemented"
    )


# =============================================================================
# HOW TO INTEGRATE
# =============================================================================

"""
To integrate these endpoints into your existing FastAPI app:

1. Add this to api/main.py:

    from api.workflow_endpoints import workflow_router
    
    app.include_router(workflow_router)

2. Or copy the endpoints directly into api/main.py

3. Install pydantic if not already installed:

    pip install pydantic>=2.5.0

4. Test the endpoints:

    # Parse a workflow
    curl -X POST "http://localhost:9800/api/workflow/parse" \
      -H "Content-Type: application/json" \
      -d '{"workflow": {...}}'
    
    # Upload and parse
    curl -X POST "http://localhost:9800/api/workflow/upload-parse" \
      -F "file=@my_workflow.json"
    
    # Modify parameters
    curl -X POST "http://localhost:9800/api/workflow/modify-parameters" \
      -H "Content-Type: application/json" \
      -d '{"workflow": {...}, "modifications": {...}}'

5. Frontend integration:

    // Parse workflow
    const response = await fetch('/api/workflow/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflow: workflowData })
    });
    const { manifest, summary } = await response.json();
    
    // Display extracted parameters
    console.log('KSamplers:', manifest.ksamplers);
    console.log('Prompts:', manifest.text_encoders);
"""


# =============================================================================
# EXAMPLE: CINEMATIC RULES INTEGRATION
# =============================================================================

async def apply_cinematic_rules_to_workflow(
    workflow: dict[str, Any],
    cinematic_config: dict[str, Any]
) -> dict[str, Any]:
    """
    Example function showing how to integrate with cinema rules.
    
    This would:
    1. Parse the workflow
    2. Extract current prompts
    3. Apply cinematic rules to enhance prompts
    4. Update workflow with enhanced prompts
    5. Return modified workflow
    """
    if WorkflowParser is None:
        raise ValueError("WorkflowParser not available")
    
    # Parse workflow
    parser = WorkflowParser(workflow)
    manifest = parser.parse(include_raw_workflow=True)
    
    # Get positive prompts
    positive_prompts = manifest.get_positive_prompts()
    
    # Example: Apply cinematic enhancement
    # (This is where you'd integrate with PromptGenerator from cinema_rules)
    for prompt_node in positive_prompts:
        node_id = prompt_node.node_id
        original_text = prompt_node.text
        
        # Enhance with cinematic rules
        # enhanced_text = your_cinema_rules_function(original_text, cinematic_config)
        enhanced_text = f"cinematic lighting, dramatic composition, {original_text}, masterpiece"
        
        # Update in workflow
        manifest.raw_workflow[node_id]["inputs"]["text"] = enhanced_text
    
    return manifest.raw_workflow


# Example endpoint using the above function
@workflow_router.post("/apply-cinematic-rules")
async def apply_cinematic_rules(
    workflow: dict[str, Any],
    cinematic_config: dict[str, Any]
):
    """
    Apply cinematic rules to a workflow's prompts.
    
    This endpoint demonstrates integration between WorkflowParser
    and the cinema rules engine.
    """
    try:
        modified_workflow = await apply_cinematic_rules_to_workflow(
            workflow,
            cinematic_config
        )
        
        return {
            "success": True,
            "workflow": modified_workflow,
            "message": "Cinematic rules applied"
        }
    
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to apply cinematic rules: {str(e)}"
        )
