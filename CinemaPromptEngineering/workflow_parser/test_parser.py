"""
Test suite for WorkflowParser module.

This file demonstrates the full functionality of the parser with real workflow data.
"""

import json
import logging
from pathlib import Path

from workflow_parser import WorkflowParser, WorkflowManifest

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(levelname)s - %(name)s - %(message)s'
)


# Sample ComfyUI workflow (API format) for testing
SAMPLE_WORKFLOW = {
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 156698208700286,
            "steps": 20,
            "cfg": 7.0,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1.0,
            "model": ["4", 0],
            "positive": ["6", 0],
            "negative": ["7", 0],
            "latent_image": ["5", 0]
        },
        "_meta": {
            "title": "Main Sampling"
        }
    },
    "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
            "ckpt_name": "realisticVision_v51.safetensors"
        },
        "_meta": {
            "title": "Primary Checkpoint"
        }
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "masterpiece, best quality, cinematic lighting, epic hero standing on mountain peak, dramatic clouds, golden hour, highly detailed, professional photography, 8k",
            "clip": ["4", 1]
        },
        "_meta": {
            "title": "Positive Prompt"
        }
    },
    "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "worst quality, low quality, blurry, bad anatomy, watermark, text, signature, ugly, deformed",
            "clip": ["4", 1]
        },
        "_meta": {
            "title": "Negative Prompt"
        }
    },
    "10": {
        "class_type": "LoraLoader",
        "inputs": {
            "lora_name": "add_detail.safetensors",
            "strength_model": 0.8,
            "strength_clip": 0.6,
            "model": ["4", 0],
            "clip": ["4", 1]
        },
        "_meta": {
            "title": "Detail Enhancement"
        }
    },
    "11": {
        "class_type": "LoraLoader",
        "inputs": {
            "lora_name": "cinematic_look.safetensors",
            "strength_model": 1.0,
            "strength_clip": 1.0,
            "model": ["10", 0],
            "clip": ["10", 1]
        },
        "_meta": {
            "title": "Cinematic Style"
        }
    },
    "5": {
        "class_type": "EmptyLatentImage",
        "inputs": {
            "width": 512,
            "height": 768,
            "batch_size": 1
        }
    },
    "8": {
        "class_type": "VAEDecode",
        "inputs": {
            "samples": ["3", 0],
            "vae": ["4", 2]
        }
    },
    "9": {
        "class_type": "SaveImage",
        "inputs": {
            "filename_prefix": "ComfyUI",
            "images": ["8", 0]
        }
    }
}


def test_basic_parsing():
    """Test basic workflow parsing functionality."""
    print("\n" + "="*80)
    print("TEST: Basic Workflow Parsing")
    print("="*80)
    
    parser = WorkflowParser(SAMPLE_WORKFLOW)
    manifest = parser.parse()
    
    # Print summary
    summary = manifest.summary()
    print(f"\nWorkflow Summary:")
    print(f"  KSamplers: {summary['ksamplers']}")
    print(f"  Text Encoders: {summary['text_encoders']}")
    print(f"  Checkpoints: {summary['checkpoints']}")
    print(f"  LoRAs: {summary['loras']}")
    print(f"  Total Editable Nodes: {summary['total_nodes']}")
    
    # Verify counts
    assert len(manifest.ksamplers) == 1, "Should find 1 KSampler"
    assert len(manifest.text_encoders) == 2, "Should find 2 text encoders"
    assert len(manifest.checkpoints) == 1, "Should find 1 checkpoint"
    assert len(manifest.loras) == 2, "Should find 2 LoRAs"
    
    print("\n✅ Basic parsing test passed!")


def test_ksampler_extraction():
    """Test KSampler parameter extraction."""
    print("\n" + "="*80)
    print("TEST: KSampler Extraction")
    print("="*80)
    
    parser = WorkflowParser(SAMPLE_WORKFLOW)
    manifest = parser.parse()
    
    ksampler = manifest.ksamplers[0]
    
    print(f"\nKSampler Details:")
    print(f"  Node ID: {ksampler.node_id}")
    print(f"  Title: {ksampler.title}")
    print(f"  Seed: {ksampler.seed}")
    print(f"  Steps: {ksampler.steps}")
    print(f"  CFG: {ksampler.cfg}")
    print(f"  Sampler: {ksampler.sampler_name}")
    print(f"  Scheduler: {ksampler.scheduler}")
    print(f"  Denoise: {ksampler.denoise}")
    
    # Verify values
    assert ksampler.node_id == "3"
    assert ksampler.seed == 156698208700286
    assert ksampler.steps == 20
    assert ksampler.cfg == 7.0
    assert ksampler.sampler_name == "euler"
    assert ksampler.scheduler == "normal"
    assert ksampler.denoise == 1.0
    
    print("\n✅ KSampler extraction test passed!")


def test_prompt_extraction():
    """Test prompt extraction and role inference."""
    print("\n" + "="*80)
    print("TEST: Prompt Extraction & Role Inference")
    print("="*80)
    
    parser = WorkflowParser(SAMPLE_WORKFLOW)
    manifest = parser.parse()
    
    print(f"\nFound {len(manifest.text_encoders)} prompts:")
    
    for encoder in manifest.text_encoders:
        print(f"\n  Node {encoder.node_id} ({encoder.title}):")
        print(f"    Role: {encoder.role}")
        print(f"    Text: {encoder.text[:80]}...")
    
    # Test role-based getters
    positive = manifest.get_positive_prompts()
    negative = manifest.get_negative_prompts()
    
    print(f"\nRole Analysis:")
    print(f"  Positive prompts: {len(positive)}")
    print(f"  Negative prompts: {len(negative)}")
    
    assert len(positive) == 1, "Should identify 1 positive prompt"
    assert len(negative) == 1, "Should identify 1 negative prompt"
    assert "masterpiece" in positive[0].text.lower()
    assert "worst quality" in negative[0].text.lower()
    
    print("\n✅ Prompt extraction test passed!")


def test_checkpoint_extraction():
    """Test checkpoint loader extraction."""
    print("\n" + "="*80)
    print("TEST: Checkpoint Extraction")
    print("="*80)
    
    parser = WorkflowParser(SAMPLE_WORKFLOW)
    manifest = parser.parse()
    
    checkpoint = manifest.checkpoints[0]
    
    print(f"\nCheckpoint Details:")
    print(f"  Node ID: {checkpoint.node_id}")
    print(f"  Title: {checkpoint.title}")
    print(f"  Model: {checkpoint.ckpt_name}")
    
    assert checkpoint.node_id == "4"
    assert checkpoint.ckpt_name == "realisticVision_v51.safetensors"
    
    print("\n✅ Checkpoint extraction test passed!")


def test_lora_extraction():
    """Test LoRA loader extraction."""
    print("\n" + "="*80)
    print("TEST: LoRA Extraction")
    print("="*80)
    
    parser = WorkflowParser(SAMPLE_WORKFLOW)
    manifest = parser.parse()
    
    print(f"\nFound {len(manifest.loras)} LoRAs:")
    
    for lora in manifest.loras:
        print(f"\n  Node {lora.node_id} ({lora.title}):")
        print(f"    LoRA: {lora.lora_name}")
        print(f"    Model Strength: {lora.strength_model}")
        print(f"    CLIP Strength: {lora.strength_clip}")
    
    assert len(manifest.loras) == 2
    assert manifest.loras[0].lora_name == "add_detail.safetensors"
    assert manifest.loras[1].lora_name == "cinematic_look.safetensors"
    assert manifest.loras[0].strength_model == 0.8
    
    print("\n✅ LoRA extraction test passed!")


def test_node_lookup():
    """Test node lookup by ID."""
    print("\n" + "="*80)
    print("TEST: Node Lookup by ID")
    print("="*80)
    
    parser = WorkflowParser(SAMPLE_WORKFLOW)
    manifest = parser.parse()
    
    # Test lookup for different node types
    ksampler = manifest.get_node_by_id("3")
    prompt = manifest.get_node_by_id("6")
    checkpoint = manifest.get_node_by_id("4")
    lora = manifest.get_node_by_id("10")
    nonexistent = manifest.get_node_by_id("999")
    
    print(f"\nLookup Results:")
    print(f"  Node 3 (KSampler): {type(ksampler).__name__}")
    print(f"  Node 6 (Prompt): {type(prompt).__name__}")
    print(f"  Node 4 (Checkpoint): {type(checkpoint).__name__}")
    print(f"  Node 10 (LoRA): {type(lora).__name__}")
    print(f"  Node 999 (Nonexistent): {nonexistent}")
    
    assert ksampler is not None
    assert prompt is not None
    assert checkpoint is not None
    assert lora is not None
    assert nonexistent is None
    
    print("\n✅ Node lookup test passed!")


def test_json_serialization():
    """Test that manifest can be serialized to JSON."""
    print("\n" + "="*80)
    print("TEST: JSON Serialization")
    print("="*80)
    
    parser = WorkflowParser(SAMPLE_WORKFLOW)
    manifest = parser.parse()
    
    # Convert to JSON
    json_str = manifest.model_dump_json(indent=2)
    
    print(f"\nManifest JSON (first 500 chars):")
    print(json_str[:500])
    print("...")
    
    # Verify it can be parsed back
    json_dict = json.loads(json_str)
    
    assert "ksamplers" in json_dict
    assert "text_encoders" in json_dict
    assert "checkpoints" in json_dict
    assert "loras" in json_dict
    
    # Verify we can reconstruct
    reconstructed = WorkflowManifest(**json_dict)
    assert len(reconstructed.ksamplers) == len(manifest.ksamplers)
    
    print("\n✅ JSON serialization test passed!")


def test_error_handling():
    """Test error handling for invalid workflows."""
    print("\n" + "="*80)
    print("TEST: Error Handling")
    print("="*80)
    
    # Test invalid workflow type
    try:
        parser = WorkflowParser("not a dict")
        assert False, "Should raise ValueError"
    except ValueError as e:
        print(f"\n✅ Correctly rejected non-dict workflow: {e}")
    
    # Test workflow with malformed node
    bad_workflow = {
        "1": {
            "class_type": "KSampler",
            "inputs": {
                # Missing required fields
                "seed": "not a number",  # Invalid type
            }
        }
    }
    
    parser = WorkflowParser(bad_workflow)
    manifest = parser.parse()
    
    # Should gracefully skip the bad node
    assert len(manifest.ksamplers) == 0
    print(f"✅ Gracefully handled malformed node (found {len(manifest.ksamplers)} valid nodes)")
    
    print("\n✅ Error handling test passed!")


def create_sample_workflow_file():
    """Create a sample workflow file for file-based testing."""
    filepath = Path("test_workflow.json")
    
    with open(filepath, 'w', encoding='utf-8') as f:
        json.dump(SAMPLE_WORKFLOW, f, indent=2)
    
    print(f"\n✅ Created sample workflow file: {filepath}")
    return filepath


def test_file_parsing():
    """Test parsing from a file."""
    print("\n" + "="*80)
    print("TEST: File-based Parsing")
    print("="*80)
    
    filepath = create_sample_workflow_file()
    
    try:
        parser = WorkflowParser.from_file(str(filepath))
        manifest = parser.parse()
        
        print(f"\nParsed from file: {filepath}")
        print(f"  Found {manifest.summary()['total_nodes']} editable nodes")
        
        assert len(manifest.ksamplers) == 1
        
        print("\n✅ File parsing test passed!")
        
    finally:
        # Cleanup
        if filepath.exists():
            filepath.unlink()
            print(f"✅ Cleaned up test file")


def run_all_tests():
    """Run all tests."""
    print("\n" + "="*80)
    print("WORKFLOW PARSER TEST SUITE")
    print("="*80)
    
    test_functions = [
        test_basic_parsing,
        test_ksampler_extraction,
        test_prompt_extraction,
        test_checkpoint_extraction,
        test_lora_extraction,
        test_node_lookup,
        test_json_serialization,
        test_error_handling,
        test_file_parsing,
    ]
    
    passed = 0
    failed = 0
    
    for test_func in test_functions:
        try:
            test_func()
            passed += 1
        except Exception as e:
            print(f"\n❌ Test {test_func.__name__} failed: {e}")
            import traceback
            traceback.print_exc()
            failed += 1
    
    print("\n" + "="*80)
    print("TEST RESULTS")
    print("="*80)
    print(f"  Passed: {passed}/{len(test_functions)}")
    print(f"  Failed: {failed}/{len(test_functions)}")
    
    if failed == 0:
        print("\n🎉 All tests passed!")
    else:
        print(f"\n⚠️  {failed} test(s) failed")
    
    return failed == 0


if __name__ == "__main__":
    success = run_all_tests()
    exit(0 if success else 1)
