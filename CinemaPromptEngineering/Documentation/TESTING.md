# LLM Provider Testing Guide

This guide explains how to test the LLM provider connectivity for GitHub Copilot, Antigravity, and OpenAI Codex.

## Prerequisites

1. **Backend running**: The FastAPI backend must be running on `http://localhost:8000`
2. **Authenticated in frontend**: You must have connected to the providers in the Settings panel

## Test Methods

### Method 1: Using test_providers.py (Recommended)

This comprehensive test checks model fetching and prompt enhancement.

**Step 1: Export credentials from browser**

1. Open your app in browser
2. Open DevTools (F12) → Console
3. Run this command:
   ```javascript
   copy(localStorage.getItem('cinema-ai-provider-settings'))
   ```
4. Create `credentials.json` in the project root
5. Paste the copied content

**Step 2: Run tests**

```bash
# Test all providers
python test_providers.py

# Test specific provider
python test_providers.py --provider github_copilot
python test_providers.py --provider antigravity
python test_providers.py --provider openai_codex
```

### Method 2: Using Environment Variables

Set the token directly:

```bash
# Windows PowerShell
$env:GITHUB_COPILOT_TOKEN = "eyJ..."
$env:ANTIGRAVITY_TOKEN = "ya29..."
$env:OPENAI_CODEX_TOKEN = "eyJ..."

# Linux/Mac
export GITHUB_COPILOT_TOKEN="eyJ..."
export ANTIGRAVITY_TOKEN="ya29..."
export OPENAI_CODEX_TOKEN="eyJ..."

# Then run
python test_providers.py
```

### Method 3: Using quick_test.py

For quick single-provider tests with token directly:

**Get token from browser:**
```javascript
// In browser console:
JSON.parse(localStorage.getItem('cinema-ai-provider-settings')).providers.github_copilot.oauthToken
```

**Run test:**
```bash
python quick_test.py github_copilot "eyJ..."
python quick_test.py antigravity "ya29..."
python quick_test.py openai_codex "eyJ..."
```

### Method 4: Using curl (API endpoint)

Test via the `/test-provider` API endpoint:

```bash
curl -X POST http://localhost:8000/test-provider \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "github_copilot",
    "credentials": {"oauth_token": "YOUR_TOKEN"},
    "test_prompt": "A woman stands at sunset"
  }'
```

## Expected Results

### GitHub Copilot
- **Token format**: JWT starting with `eyJ...`
- **Warning**: If token starts with `gho_...`, it's a GitHub OAuth token, not Copilot JWT - re-authenticate
- **Models**: gpt-4o, gpt-4-turbo, gpt-4, gpt-3.5-turbo

### Antigravity (Google)
- **Token format**: Google OAuth token
- **Models**: gemini-2.0-flash-exp, claude-3-5-sonnet, etc.

### OpenAI Codex
- **Token format**: JWT from ChatGPT
- **Models**: gpt-4o, gpt-5.2, gpt-5.1-codex-max, etc.

## Troubleshooting

### "Token is GitHub OAuth (gho_...), not Copilot JWT"
The token exchange failed during authentication. Go to Settings → GitHub Copilot → Disconnect → Connect again.

### "OAuth token expired"
Re-authenticate with the provider in Settings.

### "Failed to extract account ID"
For OpenAI Codex, the token may be invalid or expired. Re-authenticate.

### Connection timeout
Ensure the backend is running and the provider's API is accessible.

## Equipment Violation Check

The tests also check that generated prompts don't contain equipment violations:

**OK** (equipment as descriptor):
- "Shot on Arri Alexa 35 with a 50mm lens"
- "The view rises smoothly" (crane)
- "Soft diffused light wraps the scene"

**VIOLATION** (equipment as actor):
- "The camera dollies forward" 
- "A crane rises behind her"
- "An HMI lights from behind"

If violations are detected, the test will report them.
