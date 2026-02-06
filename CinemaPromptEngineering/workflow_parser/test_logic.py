"""
Simple standalone test script (no imports needed).
"""

import json
import sys

# Inline minimal test to verify the logic works
SAMPLE_WORKFLOW = {
    "3": {
        "class_type": "KSampler",
        "inputs": {
            "seed": 156680208700286,
            "steps": 20,
            "cfg": 7.0,
            "sampler_name": "euler",
            "scheduler": "normal",
            "denoise": 1.0,
        },
        "_meta": {"title": "Main Sampling"}
    },
    "4": {
        "class_type": "CheckpointLoaderSimple",
        "inputs": {
            "ckpt_name": "realisticVision_v51.safetensors"
        }
    },
    "6": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "masterpiece, best quality, cinematic",
        },
        "_meta": {"title": "Positive Prompt"}
    },
    "7": {
        "class_type": "CLIPTextEncode",
        "inputs": {
            "text": "worst quality, low quality, blurry",
        },
        "_meta": {"title": "Negative Prompt"}
    },
    "10": {
        "class_type": "LoraLoader",
        "inputs": {
            "lora_name": "add_detail.safetensors",
            "strength_model": 0.8,
            "strength_clip": 0.6,
        }
    }
}

def test_basic_logic():
    """Test the basic parsing logic without pydantic."""
    print("Testing workflow parsing logic...")
    
    # Count nodes by type
    ksamplers = []
    text_encoders = []
    checkpoints = []
    loras = []
    
    for node_id, node_data in SAMPLE_WORKFLOW.items():
        class_type = node_data.get("class_type", "")
        
        if class_type == "KSampler":
            inputs = node_data.get("inputs", {})
            ksamplers.append({
                "node_id": node_id,
                "seed": inputs.get("seed"),
                "steps": inputs.get("steps"),
                "cfg": inputs.get("cfg"),
            })
        
        elif class_type == "CLIPTextEncode":
            inputs = node_data.get("inputs", {})
            text = inputs.get("text", "")
            
            # Infer role
            title = node_data.get("_meta", {}).get("title", "").lower()
            if "negative" in title or "worst quality" in text.lower():
                role = "negative"
            else:
                role = "positive"
            
            text_encoders.append({
                "node_id": node_id,
                "text": text,
                "role": role,
            })
        
        elif class_type == "CheckpointLoaderSimple":
            inputs = node_data.get("inputs", {})
            checkpoints.append({
                "node_id": node_id,
                "ckpt_name": inputs.get("ckpt_name"),
            })
        
        elif class_type == "LoraLoader":
            inputs = node_data.get("inputs", {})
            loras.append({
                "node_id": node_id,
                "lora_name": inputs.get("lora_name"),
                "strength_model": inputs.get("strength_model"),
                "strength_clip": inputs.get("strength_clip"),
            })
    
    # Verify results
    print(f"\n✅ Found {len(ksamplers)} KSampler(s)")
    print(f"✅ Found {len(text_encoders)} CLIPTextEncode(s)")
    print(f"✅ Found {len(checkpoints)} Checkpoint(s)")
    print(f"✅ Found {len(loras)} LoRA(s)")
    
    assert len(ksamplers) == 1, f"Expected 1 KSampler, got {len(ksamplers)}"
    assert len(text_encoders) == 2, f"Expected 2 text encoders, got {len(text_encoders)}"
    assert len(checkpoints) == 1, f"Expected 1 checkpoint, got {len(checkpoints)}"
    assert len(loras) == 1, f"Expected 1 LoRA, got {len(loras)}"
    
    # Check KSampler values
    ks = ksamplers[0]
    assert ks["seed"] == 156680208700286
    assert ks["steps"] == 20
    assert ks["cfg"] == 7.0
    print(f"\n✅ KSampler values correct: seed={ks['seed']}, steps={ks['steps']}, cfg={ks['cfg']}")
    
    # Check prompt roles
    positive = [te for te in text_encoders if te["role"] == "positive"]
    negative = [te for te in text_encoders if te["role"] == "negative"]
    assert len(positive) == 1
    assert len(negative) == 1
    print(f"✅ Prompt role inference correct: {len(positive)} positive, {len(negative)} negative")
    
    # Check checkpoint
    assert checkpoints[0]["ckpt_name"] == "realisticVision_v51.safetensors"
    print(f"✅ Checkpoint correct: {checkpoints[0]['ckpt_name']}")
    
    # Check LoRA
    assert loras[0]["lora_name"] == "add_detail.safetensors"
    assert loras[0]["strength_model"] == 0.8
    print(f"✅ LoRA correct: {loras[0]['lora_name']} @ {loras[0]['strength_model']}")
    
    print("\n🎉 All logic tests passed!")
    return True

if __name__ == "__main__":
    try:
        success = test_basic_logic()
        sys.exit(0 if success else 1)
    except Exception as e:
        print(f"\n❌ Test failed: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
