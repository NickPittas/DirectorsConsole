"""
Comprehensive test for all 25+ newly added node types.
This test creates a mock workflow with ALL supported node types and verifies parsing.
"""

import json


def create_comprehensive_workflow():
    """Create a workflow with all supported node types."""
    workflow = {
        # Sampler nodes
        "1": {
            "class_type": "KSampler",
            "inputs": {
                "seed": 12345,
                "steps": 20,
                "cfg": 7.5,
                "sampler_name": "euler",
                "scheduler": "normal",
                "denoise": 1.0
            }
        },
        "2": {
            "class_type": "KSamplerAdvanced",
            "inputs": {
                "seed": 67890,
                "steps": 30,
                "cfg": 8.0,
                "sampler_name": "dpmpp_2m",
                "scheduler": "karras",
                "add_noise": "enable",
                "start_at_step": 0,
                "end_at_step": 30,
                "return_with_leftover_noise": "disable"
            }
        },
        "3": {
            "class_type": "SamplerCustom",
            "inputs": {
                "cfg": 7.0
            }
        },
        "4": {
            "class_type": "RandomNoise",
            "inputs": {
                "noise_seed": 42
            }
        },
        
        # Text encoding nodes
        "5": {
            "class_type": "CLIPTextEncode",
            "_meta": {"title": "Positive Prompt"},
            "inputs": {
                "text": "beautiful landscape, highly detailed"
            }
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "_meta": {"title": "Negative Prompt"},
            "inputs": {
                "text": "blurry, low quality, worst quality"
            }
        },
        "7": {
            "class_type": "CLIPTextEncodeSDXL",
            "_meta": {"title": "SDXL Positive"},
            "inputs": {
                "text_g": "cinematic photo of a hero",
                "text_l": "dramatic lighting"
            }
        },
        "8": {
            "class_type": "CLIPTextEncodeFlux",
            "inputs": {
                "t5xxl": "a stunning photograph",
                "clip_l": "artistic composition",
                "guidance": 3.5
            }
        },
        "9": {
            "class_type": "TextEncodeQwen",
            "inputs": {
                "text": "modern architecture"
            }
        },
        "10": {
            "class_type": "TextEncodeQwenImageEdit",
            "inputs": {
                "text": "enhance details"
            }
        },
        "11": {
            "class_type": "TextEncodeQwenImageEditPlus",
            "inputs": {
                "text": "upscale and sharpen"
            }
        },
        "12": {
            "class_type": "PromptStyler",
            "inputs": {
                "text_positive": "vibrant colors",
                "text_negative": "dull, washed out"
            }
        },
        "13": {
            "class_type": "ShowText",
            "inputs": {
                "text": "Debug output"
            }
        },
        "14": {
            "class_type": "StringFunction",
            "inputs": {
                "text": "concatenated string"
            }
        },
        
        # Model loading nodes
        "15": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": "sd_xl_base_1.0.safetensors"
            }
        },
        "16": {
            "class_type": "LoraLoader",
            "inputs": {
                "lora_name": "detail_tweaker.safetensors",
                "strength_model": 0.8,
                "strength_clip": 0.6
            }
        },
        "17": {
            "class_type": "LoraLoaderModelOnly",
            "inputs": {
                "lora_name": "style_lora.safetensors",
                "strength_model": 1.0
            }
        },
        
        # Latent/resolution nodes
        "18": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": 1024,
                "height": 1024,
                "batch_size": 2
            }
        },
        "19": {
            "class_type": "EmptySD3LatentImage",
            "inputs": {
                "width": 1536,
                "height": 1536,
                "batch_size": 1
            }
        },
        "20": {
            "class_type": "SD3EmptyLatentImage",
            "inputs": {
                "width": 2048,
                "height": 2048,
                "batch_size": 1
            }
        },
        "21": {
            "class_type": "EmptyLTXVLatentVideo",
            "inputs": {
                "width": 512,
                "height": 512,
                "length": 30,
                "batch_size": 1
            }
        },
        
        # Flux-specific nodes
        "22": {
            "class_type": "FluxGuidance",
            "inputs": {
                "guidance": 4.0
            }
        },
        
        # Image input nodes
        "23": {
            "class_type": "LoadImage",
            "inputs": {
                "image": "input_image.png"
            }
        },
        "24": {
            "class_type": "LoadImageMask",
            "inputs": {
                "image": "mask_image.png",
                "channel": "alpha"
            }
        },
        
        # Save nodes
        "25": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": "output/final"
            }
        },
        "26": {
            "class_type": "SaveImageWebsocket",
            "inputs": {
                "filename_prefix": "preview"
            }
        },
        "27": {
            "class_type": "SaveAnimatedWEBP",
            "inputs": {
                "filename_prefix": "animation"
            }
        },
        "28": {
            "class_type": "SaveAnimatedPNG",
            "inputs": {
                "filename_prefix": "frames"
            }
        },
        "29": {
            "class_type": "VHS_VideoCombine",
            "inputs": {
                "filename_prefix": "video/output"
            }
        },
        
        # Inpainting nodes
        "30": {
            "class_type": "VAEEncodeForInpaint",
            "inputs": {
                "grow_mask_by": 6
            }
        },
        "31": {
            "class_type": "InpaintModelConditioning",
            "inputs": {}
        },
        "32": {
            "class_type": "Inpaint",
            "inputs": {}
        },
        
        # Other specialized nodes
        "33": {
            "class_type": "ModelSamplingAuraFlow",
            "inputs": {
                "shift": 1.73
            }
        },
        "34": {
            "class_type": "CFGGuider",
            "inputs": {
                "cfg": 8.5
            }
        }
    }
    return workflow


def test_all_node_types():
    """Test that all node types are parsed correctly."""
    print("🧪 Testing WorkflowParser with ALL node types...\n")
    
    # Import here to test actual imports
    try:
        import sys
        import os
        sys.path.insert(0, os.path.dirname(__file__))
        from parser import WorkflowParser
        from models import WorkflowManifest
        print("✅ Imports successful")
    except ImportError as e:
        print(f"❌ Import failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Create comprehensive workflow
    workflow = create_comprehensive_workflow()
    print(f"✅ Created test workflow with {len(workflow)} nodes")
    
    # Parse workflow
    try:
        parser = WorkflowParser(workflow)
        manifest = parser.parse()
        print("✅ Parsing completed successfully")
    except Exception as e:
        print(f"❌ Parsing failed: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    # Get summary
    summary = manifest.summary()
    print(f"\n📊 Parsing Summary:")
    print(f"   Total nodes parsed: {summary['total_nodes']}")
    
    # Check each category
    expected_counts = {
        "ksamplers": 1,
        "ksamplers_advanced": 1,
        "samplers_custom": 1,
        "random_noise": 1,
        "text_encoders": 2,  # 2 CLIPTextEncode nodes
        "text_encoders_sdxl": 1,
        "text_encoders_flux": 1,
        "text_encoders_qwen": 3,  # 3 Qwen variants
        "prompt_stylers": 1,
        "show_text": 1,
        "string_functions": 1,
        "checkpoints": 1,
        "loras": 1,
        "loras_model_only": 1,
        "empty_latents": 1,
        "empty_sd3_latents": 1,
        "sd3_empty_latents": 1,
        "empty_ltxv_latent_videos": 1,
        "flux_guidance": 1,
        "load_images": 1,
        "load_image_masks": 1,
        "save_images": 1,
        "save_images_websocket": 1,
        "save_animated_webp": 1,
        "save_animated_png": 1,
        "vhs_video_combine": 1,
        "vae_encode_inpaint": 1,
        "inpaint_model_conditioning": 1,
        "inpaint": 1,
        "model_sampling_auraflow": 1,
        "cfg_guider": 1,
    }
    
    all_passed = True
    print("\n🔍 Detailed Node Type Verification:")
    
    for node_type, expected in expected_counts.items():
        actual = summary.get(node_type, 0)
        status = "✅" if actual == expected else "❌"
        if actual != expected:
            all_passed = False
        print(f"   {status} {node_type}: {actual}/{expected}")
    
    # Verify specific values
    print("\n🔬 Sample Value Verification:")
    
    tests = [
        (len(manifest.ksamplers) > 0 and manifest.ksamplers[0].seed == 12345, 
         "KSampler seed"),
        (len(manifest.empty_latents) > 0 and manifest.empty_latents[0].width == 1024, 
         "EmptyLatentImage width"),
        (len(manifest.text_encoders_sdxl) > 0 and "hero" in manifest.text_encoders_sdxl[0].text_g, 
         "CLIPTextEncodeSDXL text_g"),
        (len(manifest.text_encoders_flux) > 0 and manifest.text_encoders_flux[0].guidance == 3.5, 
         "CLIPTextEncodeFlux guidance"),
        (len(manifest.save_images) > 0 and manifest.save_images[0].filename_prefix == "output/final", 
         "SaveImage filename_prefix"),
        (len(manifest.empty_ltxv_latent_videos) > 0 and manifest.empty_ltxv_latent_videos[0].length == 30, 
         "EmptyLTXVLatentVideo length"),
        (len(manifest.model_sampling_auraflow) > 0 and manifest.model_sampling_auraflow[0].shift == 1.73, 
         "ModelSamplingAuraFlow shift"),
    ]
    
    for test_result, test_name in tests:
        status = "✅" if test_result else "❌"
        if not test_result:
            all_passed = False
        print(f"   {status} {test_name}")
    
    # Final result
    print("\n" + "="*60)
    if all_passed:
        print("🎉 ALL TESTS PASSED! All 25+ node types implemented correctly.")
        return True
    else:
        print("⚠️  Some tests failed. Review the output above.")
        return False


if __name__ == "__main__":
    success = test_all_node_types()
    exit(0 if success else 1)
