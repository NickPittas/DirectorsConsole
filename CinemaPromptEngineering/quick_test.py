#!/usr/bin/env python3
"""
Quick test script for provider connectivity via API.

Usage:
    python quick_test.py <provider> <oauth_token>
    
Examples:
    python quick_test.py github_copilot "eyJ..."
    python quick_test.py antigravity "ya29..."
    python quick_test.py openai_codex "eyJ..."
"""

import sys
import json
import urllib.request
import urllib.error

API_URL = "http://localhost:9800"

def test_provider(provider: str, oauth_token: str, test_prompt: str | None = None):
    """Test a provider via the API."""
    
    payload = {
        "provider": provider,
        "credentials": {
            "oauth_token": oauth_token
        },
        "test_prompt": test_prompt
    }
    
    data = json.dumps(payload).encode('utf-8')
    
    req = urllib.request.Request(
        f"{API_URL}/test-provider",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST"
    )
    
    try:
        with urllib.request.urlopen(req, timeout=60) as response:
            result = json.loads(response.read().decode('utf-8'))
            return result
    except urllib.error.HTTPError as e:
        error_body = e.read().decode('utf-8')
        return {"success": False, "error": f"HTTP {e.code}: {error_body}"}
    except urllib.error.URLError as e:
        return {"success": False, "error": f"Connection failed: {e.reason}"}
    except Exception as e:
        return {"success": False, "error": str(e)}


def main():
    if len(sys.argv) < 3:
        print(__doc__)
        print("\nAvailable providers: github_copilot, antigravity, openai_codex")
        sys.exit(1)
    
    provider = sys.argv[1]
    token = sys.argv[2]
    test_prompt = sys.argv[3] if len(sys.argv) > 3 else None
    
    print(f"🧪 Testing {provider}...")
    print(f"   Token: {token[:15]}...")
    
    result = test_provider(provider, token, test_prompt)
    
    if result.get("success"):
        print(f"\n✅ SUCCESS!")
        print(f"   Models found: {result.get('models_fetched', 0)}")
        print(f"   Sample models: {', '.join(result.get('models_sample', []))}")
        
        token_info = result.get("token_info", {})
        if token_info:
            print(f"\n   Token info:")
            print(f"      Length: {token_info.get('length', 'N/A')}")
            print(f"      Is JWT: {token_info.get('is_jwt', 'N/A')}")
            if token_info.get("warning"):
                print(f"      ⚠️ WARNING: {token_info['warning']}")
        
        if result.get("enhancement_result"):
            print(f"\n   Enhancement result (preview):")
            print(f"   {result['enhancement_result'][:200]}...")
    else:
        print(f"\n❌ FAILED: {result.get('error', 'Unknown error')}")
    
    return 0 if result.get("success") else 1


if __name__ == "__main__":
    sys.exit(main())
