"""
Test Storyboard Integration API (Phase 2)

Tests the new storyboard integration endpoints that allow CPE
to push prompts to the storyboard and query storyboard state.
"""

import asyncio
import json
from pathlib import Path

# Test the API endpoints directly
from api.main import (
    app,
    push_prompt_to_storyboard,
    get_storyboard_state,
    get_storyboard_frame,
    delete_storyboard_frame,
    clear_storyboard,
    import_workflow_to_storyboard,
    StoryboardFrameRequest,
    _storyboard_frames,
)


async def test_push_prompt():
    """Test pushing a prompt to the storyboard."""
    print("\n=== TEST 1: Push Prompt to Storyboard ===")
    
    # Clear any existing state
    await clear_storyboard()
    
    # Push a prompt
    request = StoryboardFrameRequest(
        prompt="a cinematic photograph of a hero standing dramatically",
        negative_prompt="low quality, blurry",
        metadata={
            "camera_angle": "<sks> front elevated shot medium shot",
            "cfg": 7.5,
            "steps": 20
        }
    )
    
    response = await push_prompt_to_storyboard(request)
    
    assert response.success is True
    assert response.frame_index == 0
    assert response.frame_id == "frame_0000"
    assert "Created" in response.message
    
    print(f"✓ Created frame: {response.frame_id}")
    print(f"  Index: {response.frame_index}")
    print(f"  Message: {response.message}")
    
    print("\n✅ Push Prompt: PASS")


async def test_get_state():
    """Test getting storyboard state."""
    print("\n=== TEST 2: Get Storyboard State ===")
    
    # Push multiple prompts
    for i in range(3):
        request = StoryboardFrameRequest(
            prompt=f"Frame {i} prompt",
            negative_prompt="low quality",
            metadata={"frame_number": i}
        )
        await push_prompt_to_storyboard(request)
    
    # Get state
    state = await get_storyboard_state()
    
    assert state.total_frames == 4  # 1 from previous test + 3 new
    assert len(state.frames) == 4
    assert state.current_frame_index == 3
    
    print(f"✓ Total frames: {state.total_frames}")
    print(f"✓ Current frame index: {state.current_frame_index}")
    print(f"✓ Metadata: {state.metadata}")
    
    # Check frame data
    for i, frame in enumerate(state.frames):
        print(f"\n  Frame {i}:")
        print(f"    ID: {frame['id']}")
        print(f"    Prompt: {frame['prompt'][:50]}...")
    
    print("\n✅ Get State: PASS")


async def test_get_specific_frame():
    """Test getting a specific frame."""
    print("\n=== TEST 3: Get Specific Frame ===")
    
    # Get frame 1
    frame = await get_storyboard_frame(1)
    
    assert frame is not None
    assert frame["index"] == 1
    assert frame["id"] == "frame_0001"
    assert "Frame 0 prompt" in frame["prompt"]
    
    print(f"✓ Retrieved frame {frame['index']}")
    print(f"  ID: {frame['id']}")
    print(f"  Prompt: {frame['prompt']}")
    print(f"  Metadata: {frame['metadata']}")
    
    print("\n✅ Get Specific Frame: PASS")


async def test_update_frame():
    """Test updating an existing frame."""
    print("\n=== TEST 4: Update Existing Frame ===")
    
    # Update frame 1
    request = StoryboardFrameRequest(
        prompt="UPDATED: a different cinematic shot",
        negative_prompt="updated negative",
        frame_index=1,
        metadata={"updated": True}
    )
    
    response = await push_prompt_to_storyboard(request)
    
    assert response.success is True
    assert response.frame_index == 1
    assert "Updated" in response.message
    
    # Verify update
    frame = await get_storyboard_frame(1)
    assert "UPDATED" in frame["prompt"]
    assert frame["metadata"]["updated"] is True
    
    print(f"✓ Updated frame: {response.frame_id}")
    print(f"  New prompt: {frame['prompt']}")
    
    print("\n✅ Update Frame: PASS")


async def test_delete_frame():
    """Test deleting a frame."""
    print("\n=== TEST 5: Delete Frame ===")
    
    # Get initial count
    state = await get_storyboard_state()
    initial_count = state.total_frames
    
    # Delete frame 2
    result = await delete_storyboard_frame(2)
    
    assert result["success"] is True
    assert "Deleted" in result["message"]
    
    # Verify deletion
    state = await get_storyboard_state()
    assert state.total_frames == initial_count - 1
    
    print(f"✓ Deleted frame 2")
    print(f"  Frames remaining: {state.total_frames}")
    
    print("\n✅ Delete Frame: PASS")


async def test_import_workflow():
    """Test importing a ComfyUI workflow."""
    print("\n=== TEST 6: Import Workflow to Storyboard ===")
    
    # Load a sample workflow
    workflow_file = Path(__file__).parent / "templates_system" / "templates" / "flux_schnell.json"
    
    if not workflow_file.exists():
        print("⚠️  Skipping workflow import test (no sample workflow found)")
        return
    
    with open(workflow_file, "r") as f:
        template_data = json.load(f)
    
    workflow = template_data.get("workflow", {})
    
    # Import the workflow
    result = await import_workflow_to_storyboard(
        workflow=workflow,
        extract_prompts=True
    )
    
    assert result["success"] is True
    assert "frame" in result
    assert "extracted" in result
    
    print(f"✓ Imported workflow")
    print(f"  Frame ID: {result['frame'].frame_id}")
    print(f"  Extracted positive prompt: {result['extracted']['positive_prompt'][:50]}...")
    print(f"  Metadata: {result['extracted']['metadata']}")
    
    print("\n✅ Import Workflow: PASS")


async def test_clear_storyboard():
    """Test clearing the storyboard."""
    print("\n=== TEST 7: Clear Storyboard ===")
    
    # Get initial count
    state = await get_storyboard_state()
    initial_count = state.total_frames
    
    # Clear
    result = await clear_storyboard()
    
    assert result["success"] is True
    assert result["total_frames"] == 0
    assert initial_count > 0  # We had frames before
    
    # Verify empty
    state = await get_storyboard_state()
    assert state.total_frames == 0
    assert len(state.frames) == 0
    
    print(f"✓ Cleared {result['message'].split()[-2]} frames")
    print(f"  Current frame count: {state.total_frames}")
    
    print("\n✅ Clear Storyboard: PASS")


async def test_workflow_with_parameters():
    """Test importing a workflow and extracting all parameters."""
    print("\n=== TEST 8: Workflow Parameter Extraction ===")
    
    # Create a test workflow with known parameters
    test_workflow = {
        "1": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 12345,
                "steps": 30,
                "cfg": 8.5,
                "sampler_name": "euler_ancestral",
                "scheduler": "normal"
            }
        },
        "2": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "a beautiful sunset over mountains"
            },
            "_meta": {
                "title": "Positive Prompt"
            }
        },
        "3": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": "low quality, blurry, bad"
            },
            "_meta": {
                "title": "Negative Prompt"
            }
        },
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": "flux_schnell.safetensors"
            }
        }
    }
    
    # Import with parameter extraction
    result = await import_workflow_to_storyboard(
        workflow=test_workflow,
        extract_prompts=True
    )
    
    assert result["success"] is True
    
    extracted = result["extracted"]
    assert extracted["positive_prompt"] == "a beautiful sunset over mountains"
    assert extracted["negative_prompt"] == "low quality, blurry, bad"
    assert extracted["metadata"]["seed"] == 12345
    assert extracted["metadata"]["steps"] == 30
    assert extracted["metadata"]["cfg"] == 8.5
    assert extracted["metadata"]["sampler"] == "euler_ancestral"
    
    print(f"✓ Extracted parameters:")
    print(f"  Seed: {extracted['metadata']['seed']}")
    print(f"  Steps: {extracted['metadata']['steps']}")
    print(f"  CFG: {extracted['metadata']['cfg']}")
    print(f"  Sampler: {extracted['metadata']['sampler']}")
    print(f"  Positive: {extracted['positive_prompt'][:40]}...")
    print(f"  Negative: {extracted['negative_prompt'][:40]}...")
    
    print("\n✅ Workflow Parameter Extraction: PASS")


async def main():
    """Run all storyboard integration tests."""
    print("=" * 70)
    print("PHASE 2: STORYBOARD INTEGRATION API TEST")
    print("=" * 70)
    
    try:
        await test_push_prompt()
        await test_get_state()
        await test_get_specific_frame()
        await test_update_frame()
        await test_delete_frame()
        await test_import_workflow()
        await test_clear_storyboard()
        await test_workflow_with_parameters()
        
        print("\n" + "=" * 70)
        print("✅ ALL STORYBOARD API TESTS PASSED")
        print("=" * 70)
        print("\nStoryboard Integration:")
        print("  ✅ Push prompts to storyboard")
        print("  ✅ Query storyboard state")
        print("  ✅ Get specific frames")
        print("  ✅ Update frames")
        print("  ✅ Delete frames")
        print("  ✅ Import workflows")
        print("  ✅ Extract parameters")
        print("  ✅ Clear storyboard")
        print("\nPhase 2 Complete: Backend ready for Phase 3!")
        
        return 0
    
    except AssertionError as e:
        print(f"\n❌ TEST FAILED: {e}")
        return 1
    except Exception as e:
        print(f"\n❌ ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    import sys
    sys.exit(asyncio.run(main()))
