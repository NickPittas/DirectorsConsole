#!/usr/bin/env python3
"""
Test script for LLM provider connectivity.

This script tests connectivity to GitHub Copilot, Antigravity (Google), and OpenAI Codex
using credentials stored in the frontend's localStorage (exported to a JSON file).

Usage:
    1. Export credentials from browser:
       - Open browser devtools console
       - Run: copy(localStorage.getItem('cinema-ai-provider-settings'))
       - Paste into credentials.json file
    
    2. Run this script:
       python test_providers.py
       
       Or test specific providers:
       python test_providers.py --provider github_copilot
       python test_providers.py --provider antigravity
       python test_providers.py --provider openai_codex
"""

import asyncio
import json
import argparse
import sys
import os
from pathlib import Path

# Fix Windows console encoding for emojis
if sys.platform == 'win32':
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')  # type: ignore
    except AttributeError:
        pass  # Older Python versions

# Add the project root to path
sys.path.insert(0, str(Path(__file__).parent))

from api.providers.llm_service import llm_service, LLMCredentials


# =============================================================================
# Test Configuration
# =============================================================================

TEST_PROMPT = """A woman stands at the edge of a moonlit pier, her silhouette framed 
against the vast ocean. The wind gently moves her hair as she gazes at the horizon."""

TEST_CONFIG = {
    "camera": {
        "manufacturer": "ARRI",
        "body": "Alexa_35"
    },
    "lens": {
        "focal_length_mm": 50
    },
    "movement": {
        "equipment": "Crane",
        "movement_type": "Crane_Up",
        "timing": "Slow"
    },
    "lighting": {
        "time_of_day": "Night",
        "source": "Natural",
        "style": "Low_Key"
    },
    "visual_grammar": {
        "shot_size": "WS",
        "composition": "Rule_of_Thirds",
        "mood": "Melancholic",
        "color_tone": "Cool_Desaturated"
    }
}

CREDENTIALS_FILE = Path(__file__).parent / "credentials.json"

# Environment variable names for each provider
ENV_VAR_MAP = {
    'github_copilot': 'GITHUB_COPILOT_TOKEN',
    'antigravity': 'ANTIGRAVITY_TOKEN',
    'openai_codex': 'OPENAI_CODEX_TOKEN',
}


# =============================================================================
# Credential Loading
# =============================================================================

def load_credentials(provider_id: str) -> LLMCredentials | None:
    """Load credentials for a specific provider.
    
    Tries in order:
    1. Environment variable (e.g., GITHUB_COPILOT_TOKEN)
    2. credentials.json file
    """
    import os
    
    # Try environment variable first
    env_var = ENV_VAR_MAP.get(provider_id)
    if env_var:
        token = os.environ.get(env_var)
        if token:
            print(f"   ✅ Using token from ${env_var}")
            return LLMCredentials(oauth_token=token)
    
    # Try credentials file
    if not CREDENTIALS_FILE.exists():
        print(f"❌ No credentials found for {provider_id}")
        print(f"\n📋 Option 1 - Set environment variable:")
        print(f"   export {env_var}='your_token_here'")
        print(f"\n📋 Option 2 - Create credentials.json:")
        print("   1. Open browser devtools (F12)")
        print("   2. Go to Console tab")
        print("   3. Run: copy(localStorage.getItem('cinema-ai-provider-settings'))")
        print("   4. Create credentials.json and paste the content")
        return None
    
    try:
        with open(CREDENTIALS_FILE, 'r') as f:
            data = json.load(f)
        
        if isinstance(data, str):
            # If it was pasted as a string, parse it again
            data = json.loads(data)
        
        providers = data.get('providers', {})
        creds_data = providers.get(provider_id, {})
        
        if not creds_data:
            print(f"❌ No credentials found for provider: {provider_id}")
            print(f"   Available providers: {list(providers.keys())}")
            return None
        
        return LLMCredentials(
            api_key=creds_data.get('apiKey'),
            endpoint=creds_data.get('endpoint'),
            oauth_token=creds_data.get('oauthToken'),
        )
    except json.JSONDecodeError as e:
        print(f"❌ Failed to parse credentials.json: {e}")
        return None
    except Exception as e:
        print(f"❌ Error loading credentials: {e}")
        return None


# =============================================================================
# Test Functions
# =============================================================================

async def test_fetch_models(provider: str, creds: LLMCredentials) -> bool:
    """Test fetching models from a provider."""
    print(f"\n📋 Testing model fetch for {provider}...")
    
    result = await llm_service.fetch_provider_models(provider, creds)
    
    if result.get('success'):
        models = result.get('models', [])
        print(f"   ✅ Success! Found {len(models)} models:")
        for m in models[:5]:  # Show first 5
            name = m.get('name', m.get('id', 'Unknown'))
            rec = " ⭐" if m.get('recommended') else ""
            print(f"      • {name}{rec}")
        if len(models) > 5:
            print(f"      ... and {len(models) - 5} more")
        return True
    else:
        error = result.get('error', 'Unknown error')
        print(f"   ❌ Failed: {error}")
        return False


async def test_prompt_enhancement(provider: str, model: str, creds: LLMCredentials) -> bool:
    """Test prompt enhancement with a provider."""
    print(f"\n🎬 Testing prompt enhancement with {provider}/{model}...")
    
    # Build the system prompt
    from api.providers.system_prompts import get_system_prompt, build_enhancement_prompt
    
    system_prompt = get_system_prompt("sora")  # Use Sora as target
    full_prompt = build_enhancement_prompt(TEST_PROMPT, TEST_CONFIG, "live_action")
    
    print(f"   📝 User prompt: {TEST_PROMPT[:60]}...")
    
    result = await llm_service.enhance_prompt(
        user_prompt=full_prompt,
        system_prompt=system_prompt,
        provider=provider,
        model=model,
        credentials=creds,
    )
    
    if result.success:
        print(f"   ✅ Success!")
        print(f"   📊 Tokens used: {result.tokens_used}")
        print(f"   🤖 Model used: {result.model_used}")
        print(f"\n   Enhanced prompt:")
        print("   " + "-" * 60)
        # Print wrapped content
        content = result.content
        lines = content.split('\n')
        for line in lines[:10]:  # First 10 lines
            print(f"   {line[:80]}")
        if len(lines) > 10:
            print(f"   ... ({len(lines) - 10} more lines)")
        print("   " + "-" * 60)
        
        # Check for equipment violations
        violations = check_equipment_violations(result.content)
        if violations:
            print(f"\n   ⚠️  EQUIPMENT VIOLATIONS DETECTED:")
            for v in violations:
                print(f"      • {v}")
            return False
        else:
            print(f"\n   ✅ No equipment violations detected!")
        
        return True
    else:
        print(f"   ❌ Failed: {result.error}")
        return False


def check_equipment_violations(content: str) -> list[str]:
    """Check for equipment appearing as actors in the generated prompt."""
    violations = []
    content_lower = content.lower()
    
    # Equipment that should NOT appear as actors
    equipment_patterns = [
        # Camera equipment as actors
        ("the camera", "camera mentioned as actor"),
        ("a camera", "camera mentioned as actor"),
        ("camera dollies", "camera as actor"),
        ("camera tracks", "camera as actor"),
        ("camera moves", "camera as actor"),
        ("camera follows", "camera as actor"),
        ("camera pushes", "camera as actor"),
        ("camera pulls", "camera as actor"),
        ("camera pans", "camera as actor"),
        ("camera tilts", "camera as actor"),
        ("camera rises", "camera as actor"),
        ("camera descends", "camera as actor"),
        
        # Movement equipment as visible
        ("a crane", "crane visible in scene"),
        ("the crane", "crane visible in scene"),
        ("crane arm", "crane visible"),
        ("jib arm", "jib visible"),
        ("a dolly", "dolly visible"),
        ("the dolly", "dolly visible"),
        ("dolly tracks", "dolly equipment mentioned"),
        ("steadicam", "steadicam visible"),
        ("gimbal", "gimbal visible"),
        ("technocrane", "technocrane visible"),
        ("drone shot", "drone mentioned as equipment"),
        
        # Lighting equipment as visible
        ("hmi", "HMI fixture visible"),
        ("kinoflo", "Kinoflo fixture visible"),
        ("softbox", "softbox visible"),
        ("light stand", "lighting equipment visible"),
        ("c-stand", "grip equipment visible"),
        ("led panel", "LED panel visible"),
    ]
    
    for pattern, description in equipment_patterns:
        if pattern in content_lower:
            # Skip if it's "shot on camera" type reference
            if pattern == "camera" and ("shot on" in content_lower or "captured with" in content_lower):
                continue
            violations.append(f"'{pattern}' - {description}")
    
    return violations


# =============================================================================
# Provider-Specific Tests
# =============================================================================

async def test_github_copilot():
    """Test GitHub Copilot provider."""
    print("\n" + "=" * 70)
    print("🐙 TESTING: GitHub Copilot")
    print("=" * 70)
    
    creds = load_credentials('github_copilot')
    if not creds:
        return False
    
    # Check token type
    token = creds.oauth_token or ""
    if token.startswith("gho_"):
        print("   ⚠️  WARNING: Token is GitHub OAuth (gho_...), not Copilot JWT (eyJ...)")
        print("   This means the token exchange failed. Re-authenticate in the app.")
    elif token.startswith("eyJ"):
        print("   ✅ Token is Copilot JWT (correct)")
    else:
        print(f"   ❓ Unknown token format: {token[:10]}...")
    
    # Test model fetch
    models_ok = await test_fetch_models('github_copilot', creds)
    
    # Test prompt enhancement with default model
    if models_ok:
        enhance_ok = await test_prompt_enhancement('github_copilot', 'gpt-4o', creds)
        return enhance_ok
    
    return False


async def test_antigravity():
    """Test Antigravity (Google Cloud AI) provider."""
    print("\n" + "=" * 70)
    print("🚀 TESTING: Antigravity (Google Cloud AI)")
    print("=" * 70)
    
    creds = load_credentials('antigravity')
    if not creds:
        return False
    
    # Check token exists
    if creds.oauth_token:
        print(f"   ✅ OAuth token present ({len(creds.oauth_token)} chars)")
    else:
        print("   ❌ No OAuth token found")
        return False
    
    # Test model fetch
    models_ok = await test_fetch_models('antigravity', creds)
    
    # Test prompt enhancement
    if models_ok:
        # Try with gemini-2.0-flash-exp first (commonly available)
        enhance_ok = await test_prompt_enhancement('antigravity', 'gemini-2.0-flash-exp', creds)
        return enhance_ok
    
    return False


async def test_openai_codex():
    """Test OpenAI Codex (ChatGPT backend) provider."""
    print("\n" + "=" * 70)
    print("🤖 TESTING: OpenAI Codex (ChatGPT Plus/Pro)")
    print("=" * 70)
    
    creds = load_credentials('openai_codex')
    if not creds:
        return False
    
    # Check token exists
    if creds.oauth_token:
        print(f"   ✅ OAuth token present ({len(creds.oauth_token)} chars)")
        # Check if it's a JWT
        if creds.oauth_token.startswith("eyJ"):
            print("   ✅ Token is JWT format (correct)")
        else:
            print(f"   ❓ Token format: {creds.oauth_token[:10]}...")
    else:
        print("   ❌ No OAuth token found")
        return False
    
    # Test model fetch
    models_ok = await test_fetch_models('openai_codex', creds)
    
    # Test prompt enhancement
    if models_ok:
        # Try with gpt-4o first
        enhance_ok = await test_prompt_enhancement('openai_codex', 'gpt-4o', creds)
        return enhance_ok
    
    return False


# =============================================================================
# Main
# =============================================================================

async def main():
    parser = argparse.ArgumentParser(description='Test LLM provider connectivity')
    parser.add_argument('--provider', '-p', 
                       choices=['github_copilot', 'antigravity', 'openai_codex', 'all'],
                       default='all',
                       help='Provider to test (default: all)')
    parser.add_argument('--models-only', '-m', action='store_true',
                       help='Only test model fetching, skip prompt enhancement')
    
    args = parser.parse_args()
    
    print("🎬 Cinema Prompt Engineering - Provider Test Suite")
    print("=" * 70)
    
    results = {}
    
    if args.provider in ('all', 'github_copilot'):
        results['github_copilot'] = await test_github_copilot()
    
    if args.provider in ('all', 'antigravity'):
        results['antigravity'] = await test_antigravity()
    
    if args.provider in ('all', 'openai_codex'):
        results['openai_codex'] = await test_openai_codex()
    
    # Summary
    print("\n" + "=" * 70)
    print("📊 SUMMARY")
    print("=" * 70)
    
    for provider, success in results.items():
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"   {provider}: {status}")
    
    all_passed = all(results.values())
    print("\n" + ("✅ All tests passed!" if all_passed else "❌ Some tests failed"))
    
    return 0 if all_passed else 1


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
