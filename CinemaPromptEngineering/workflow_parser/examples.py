"""
Practical Usage Examples for WorkflowParser

This file demonstrates real-world usage patterns for the WorkflowParser module.
"""

import json
from pathlib import Path
from typing import Optional

# These imports will work once pydantic is available
try:
    from workflow_parser import WorkflowParser, WorkflowManifest
    PYDANTIC_AVAILABLE = True
except ImportError:
    PYDANTIC_AVAILABLE = False
    print("⚠️  Pydantic not available. Install with: pip install pydantic>=2.5.0")


# =============================================================================
# EXAMPLE 1: Basic Workflow Analysis
# =============================================================================

def analyze_workflow(workflow_path: str) -> None:
    """
    Analyze a workflow file and print a detailed report.
    
    Args:
        workflow_path: Path to ComfyUI workflow JSON file
    """
    if not PYDANTIC_AVAILABLE:
        return
    
    print(f"\n{'='*80}")
    print(f"ANALYZING WORKFLOW: {workflow_path}")
    print(f"{'='*80}\n")
    
    # Parse the workflow
    parser = WorkflowParser.from_file(workflow_path)
    manifest = parser.parse()
    
    # Print summary
    summary = manifest.summary()
    print(f"📊 Workflow Summary:")
    print(f"   Total Editable Nodes: {summary['total_nodes']}")
    print(f"   ├─ KSamplers: {summary['ksamplers']}")
    print(f"   ├─ Text Encoders: {summary['text_encoders']}")
    print(f"   ├─ Checkpoints: {summary['checkpoints']}")
    print(f"   └─ LoRAs: {summary['loras']}")
    
    # Analyze KSamplers
    if manifest.ksamplers:
        print(f"\n🎲 KSampler Configuration:")
        for i, ks in enumerate(manifest.ksamplers, 1):
            print(f"   KSampler {i} (Node {ks.node_id}):")
            print(f"      Title: {ks.title or 'Untitled'}")
            print(f"      Steps: {ks.steps}")
            print(f"      CFG: {ks.cfg}")
            print(f"      Seed: {ks.seed}")
            print(f"      Sampler: {ks.sampler_name}")
            print(f"      Scheduler: {ks.scheduler}")
            if ks.denoise is not None:
                print(f"      Denoise: {ks.denoise}")
    
    # Analyze Prompts
    positive = manifest.get_positive_prompts()
    negative = manifest.get_negative_prompts()
    
    if positive:
        print(f"\n✨ Positive Prompts ({len(positive)}):")
        for i, p in enumerate(positive, 1):
            print(f"   {i}. Node {p.node_id} ({p.title or 'Untitled'}):")
            print(f"      {p.text[:100]}{'...' if len(p.text) > 100 else ''}")
    
    if negative:
        print(f"\n🚫 Negative Prompts ({len(negative)}):")
        for i, n in enumerate(negative, 1):
            print(f"   {i}. Node {n.node_id} ({n.title or 'Untitled'}):")
            print(f"      {n.text[:100]}{'...' if len(n.text) > 100 else ''}")
    
    # Analyze Models
    if manifest.checkpoints:
        print(f"\n🤖 Checkpoints:")
        for cp in manifest.checkpoints:
            print(f"   • {cp.ckpt_name} (Node {cp.node_id})")
    
    if manifest.loras:
        print(f"\n🎨 LoRAs:")
        for lora in manifest.loras:
            print(f"   • {lora.lora_name}")
            print(f"      Model: {lora.strength_model:.2f} | CLIP: {lora.strength_clip:.2f}")


# =============================================================================
# EXAMPLE 2: Batch Processing - Create Variations
# =============================================================================

def create_seed_variations(workflow_path: str, output_dir: str, seeds: list[int]) -> None:
    """
    Create multiple workflow variations with different seeds.
    
    Args:
        workflow_path: Source workflow file
        output_dir: Directory to save variations
        seeds: List of seeds to use
    """
    if not PYDANTIC_AVAILABLE:
        return
    
    print(f"\n{'='*80}")
    print(f"CREATING SEED VARIATIONS")
    print(f"{'='*80}\n")
    
    output_path = Path(output_dir)
    output_path.mkdir(exist_ok=True)
    
    # Load and parse original workflow
    with open(workflow_path, 'r') as f:
        workflow = json.load(f)
    
    parser = WorkflowParser(workflow)
    
    for i, seed in enumerate(seeds, 1):
        # Parse fresh each time to avoid mutation
        manifest = parser.parse(include_raw_workflow=True)
        
        # Modify all KSamplers
        for ksampler in manifest.ksamplers:
            # Update seed in the raw workflow
            node_id = ksampler.node_id
            manifest.raw_workflow[node_id]["inputs"]["seed"] = seed
        
        # Save modified workflow
        output_file = output_path / f"workflow_seed_{seed}.json"
        with open(output_file, 'w') as f:
            json.dump(manifest.raw_workflow, f, indent=2)
        
        print(f"   ✅ Created variation {i}/{len(seeds)}: {output_file.name}")
    
    print(f"\n🎉 Created {len(seeds)} variations in {output_dir}")


# =============================================================================
# EXAMPLE 3: Parameter Optimization
# =============================================================================

def optimize_for_quality(workflow_path: str, output_path: str) -> None:
    """
    Optimize workflow parameters for quality over speed.
    
    Args:
        workflow_path: Source workflow file
        output_path: Path for optimized workflow
    """
    if not PYDANTIC_AVAILABLE:
        return
    
    print(f"\n{'='*80}")
    print(f"OPTIMIZING FOR QUALITY")
    print(f"{'='*80}\n")
    
    # Load workflow
    with open(workflow_path, 'r') as f:
        workflow = json.load(f)
    
    parser = WorkflowParser(workflow)
    manifest = parser.parse(include_raw_workflow=True)
    
    changes = []
    
    # Optimize KSamplers
    for ksampler in manifest.ksamplers:
        node_id = ksampler.node_id
        node = manifest.raw_workflow[node_id]
        
        # Increase steps for quality
        old_steps = ksampler.steps
        new_steps = max(30, old_steps)
        if old_steps != new_steps:
            node["inputs"]["steps"] = new_steps
            changes.append(f"KSampler {node_id}: steps {old_steps} → {new_steps}")
        
        # Optimize CFG
        old_cfg = ksampler.cfg
        new_cfg = 7.5 if old_cfg < 7.0 else old_cfg
        if old_cfg != new_cfg:
            node["inputs"]["cfg"] = new_cfg
            changes.append(f"KSampler {node_id}: CFG {old_cfg} → {new_cfg}")
        
        # Use better sampler if using basic one
        if ksampler.sampler_name in ["euler", "euler_a"]:
            node["inputs"]["sampler_name"] = "dpmpp_2m_sde"
            changes.append(f"KSampler {node_id}: sampler → dpmpp_2m_sde")
    
    # Save optimized workflow
    with open(output_path, 'w') as f:
        json.dump(manifest.raw_workflow, f, indent=2)
    
    print(f"📝 Applied {len(changes)} optimizations:")
    for change in changes:
        print(f"   • {change}")
    
    print(f"\n✅ Saved optimized workflow to: {output_path}")


# =============================================================================
# EXAMPLE 4: Prompt Enhancement
# =============================================================================

def enhance_prompts(workflow_path: str, output_path: str, style: str = "cinematic") -> None:
    """
    Enhance prompts with additional quality and style tags.
    
    Args:
        workflow_path: Source workflow file
        output_path: Path for enhanced workflow
        style: Style preset to apply
    """
    if not PYDANTIC_AVAILABLE:
        return
    
    print(f"\n{'='*80}")
    print(f"ENHANCING PROMPTS ({style.upper()} STYLE)")
    print(f"{'='*80}\n")
    
    # Style presets
    STYLE_PRESETS = {
        "cinematic": {
            "positive_prefix": "cinematic lighting, dramatic composition, professional cinematography,",
            "positive_suffix": ", highly detailed, masterpiece, best quality, 8k uhd",
            "negative_suffix": ", amateur, low quality, blurry, distorted"
        },
        "artistic": {
            "positive_prefix": "artistic masterpiece, painterly quality, fine art,",
            "positive_suffix": ", intricate details, museum quality, award winning",
            "negative_suffix": ", crude, amateurish, poorly drawn"
        },
        "photorealistic": {
            "positive_prefix": "photorealistic, ultra realistic, professional photography,",
            "positive_suffix": ", sharp focus, high resolution, DSLR quality, HDR",
            "negative_suffix": ", fake, CGI, rendered, artificial"
        }
    }
    
    preset = STYLE_PRESETS.get(style, STYLE_PRESETS["cinematic"])
    
    # Load workflow
    with open(workflow_path, 'r') as f:
        workflow = json.load(f)
    
    parser = WorkflowParser(workflow)
    manifest = parser.parse(include_raw_workflow=True)
    
    # Enhance prompts
    for encoder in manifest.text_encoders:
        node_id = encoder.node_id
        node = manifest.raw_workflow[node_id]
        old_text = encoder.text
        
        if encoder.role == "positive":
            new_text = f"{preset['positive_prefix']} {old_text} {preset['positive_suffix']}"
            node["inputs"]["text"] = new_text
            print(f"✨ Enhanced positive prompt (Node {node_id}):")
            print(f"   Before: {old_text[:60]}...")
            print(f"   After:  {new_text[:60]}...")
        
        elif encoder.role == "negative":
            new_text = f"{old_text} {preset['negative_suffix']}"
            node["inputs"]["text"] = new_text
            print(f"🚫 Enhanced negative prompt (Node {node_id}):")
            print(f"   Added: {preset['negative_suffix']}")
    
    # Save enhanced workflow
    with open(output_path, 'w') as f:
        json.dump(manifest.raw_workflow, f, indent=2)
    
    print(f"\n✅ Saved enhanced workflow to: {output_path}")


# =============================================================================
# EXAMPLE 5: Workflow Validation
# =============================================================================

def validate_workflow(workflow_path: str) -> bool:
    """
    Validate a workflow and check for common issues.
    
    Args:
        workflow_path: Path to workflow file
    
    Returns:
        True if workflow is valid, False otherwise
    """
    if not PYDANTIC_AVAILABLE:
        return False
    
    print(f"\n{'='*80}")
    print(f"VALIDATING WORKFLOW")
    print(f"{'='*80}\n")
    
    issues = []
    warnings = []
    
    try:
        parser = WorkflowParser.from_file(workflow_path)
        manifest = parser.parse()
        
        # Check for KSamplers
        if not manifest.ksamplers:
            issues.append("❌ No KSampler nodes found")
        
        # Check for prompts
        if not manifest.text_encoders:
            issues.append("❌ No prompt nodes found")
        else:
            if not manifest.get_positive_prompts():
                warnings.append("⚠️  No positive prompts detected")
            if not manifest.get_negative_prompts():
                warnings.append("⚠️  No negative prompts detected")
        
        # Check for checkpoints
        if not manifest.checkpoints:
            issues.append("❌ No checkpoint loader found")
        
        # Validate KSampler parameters
        for ks in manifest.ksamplers:
            if ks.steps < 10:
                warnings.append(f"⚠️  KSampler {ks.node_id}: Very low steps ({ks.steps})")
            if ks.steps > 100:
                warnings.append(f"⚠️  KSampler {ks.node_id}: Very high steps ({ks.steps})")
            if ks.cfg < 1.0 or ks.cfg > 20.0:
                warnings.append(f"⚠️  KSampler {ks.node_id}: Unusual CFG value ({ks.cfg})")
        
        # Print results
        if issues:
            print("🔴 CRITICAL ISSUES:")
            for issue in issues:
                print(f"   {issue}")
        
        if warnings:
            print("\n🟡 WARNINGS:")
            for warning in warnings:
                print(f"   {warning}")
        
        if not issues and not warnings:
            print("✅ Workflow is valid! No issues found.")
            return True
        elif not issues:
            print("\n✅ Workflow is valid (with warnings)")
            return True
        else:
            print("\n❌ Workflow has critical issues")
            return False
        
    except Exception as e:
        print(f"❌ Failed to parse workflow: {e}")
        return False


# =============================================================================
# MAIN - Run Examples
# =============================================================================

if __name__ == "__main__":
    if not PYDANTIC_AVAILABLE:
        print("\n" + "="*80)
        print("ERROR: Pydantic not installed")
        print("="*80)
        print("\nPlease install pydantic to run these examples:")
        print("  pip install pydantic>=2.5.0")
        exit(1)
    
    # Example workflow path (adjust as needed)
    EXAMPLE_WORKFLOW = "example_workflow.json"
    
    print("\n" + "="*80)
    print("WORKFLOW PARSER - USAGE EXAMPLES")
    print("="*80)
    print("\nThese examples demonstrate real-world usage of the WorkflowParser module.")
    print(f"\nNote: Looking for example workflow at: {EXAMPLE_WORKFLOW}")
    print("      Create a ComfyUI workflow and export it (API format) to test.")
    
    # Check if example file exists
    if Path(EXAMPLE_WORKFLOW).exists():
        print("\n✅ Example workflow found! Running demos...")
        
        # Run examples
        analyze_workflow(EXAMPLE_WORKFLOW)
        validate_workflow(EXAMPLE_WORKFLOW)
        
        # Create variations
        create_seed_variations(
            EXAMPLE_WORKFLOW,
            "workflow_variations",
            seeds=[42, 123, 456, 789, 999]
        )
        
        # Optimize for quality
        optimize_for_quality(
            EXAMPLE_WORKFLOW,
            "workflow_optimized.json"
        )
        
        # Enhance prompts
        enhance_prompts(
            EXAMPLE_WORKFLOW,
            "workflow_enhanced.json",
            style="cinematic"
        )
    else:
        print(f"\n⚠️  Example workflow not found: {EXAMPLE_WORKFLOW}")
        print("   Create a test workflow in ComfyUI and export it to try these examples.")
