# LLM Provider Testing Guide

This guide explains how to test LLM provider connectivity. For the user-facing Google AI (Gemini) API-key steps and Antigravity private OAuth app configuration, use the [authoritative README provider setup](../../README.md#ai-llm-provider-setup).

Provider checks can make live requests. Use only credentials you are authorized to use on a private workstation; never commit `credentials.json`, API keys, OAuth tokens, or copied browser storage, and never paste them into logs, issues, or documentation. The maintenance validation reported below used mocks and did not make provider, credential, or ComfyUI calls.

## Prerequisites

1. **Backend running**: The FastAPI backend must be running on `http://localhost:9800`
2. **Provider configured locally**: Connect or enter credentials in the Settings panel; Google uses the API-key flow documented in the README, while Antigravity uses its backend OAuth app configuration.

## Test Methods

### Method 1: Using test_providers.py (Recommended)

This comprehensive test checks model fetching and prompt enhancement. The export below is a legacy local-test convenience and copies sensitive browser data; prefer the Settings workflow where possible. Keep the file outside version control and delete it after testing.

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

For a one-off local test, set an already-authorized token directly in the shell. Replace the placeholders locally; do not save them in scripts or documentation:

```bash
# Windows PowerShell
$env:GITHUB_COPILOT_TOKEN = "YOUR_LOCAL_TOKEN"
$env:ANTIGRAVITY_TOKEN = "YOUR_LOCAL_TOKEN"
$env:OPENAI_CODEX_TOKEN = "YOUR_LOCAL_TOKEN"

# Linux/Mac
export GITHUB_COPILOT_TOKEN="YOUR_LOCAL_TOKEN"
export ANTIGRAVITY_TOKEN="YOUR_LOCAL_TOKEN"
export OPENAI_CODEX_TOKEN="YOUR_LOCAL_TOKEN"

# Then run
python test_providers.py
```

### Method 3: Using quick_test.py

For quick single-provider tests with token directly:

**Get a locally authorized token using the existing application workflow.** Do not copy it into a tracked file, shell history, logs, issues, or this guide.

**Run test:**
```bash
python quick_test.py github_copilot "YOUR_LOCAL_TOKEN"
python quick_test.py antigravity "YOUR_LOCAL_TOKEN"
python quick_test.py openai_codex "YOUR_LOCAL_TOKEN"
```

### Method 4: Using curl (API endpoint)

Test via the `/test-provider` API endpoint:

```bash
curl -X POST http://localhost:9800/test-provider \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "github_copilot",
    "credentials": {"oauth_token": "YOUR_TOKEN"},
    "test_prompt": "A woman stands at sunset"
  }'
```

## Expected Results

### GitHub Copilot
- Use the token produced by the existing GitHub Copilot authentication workflow.
- Models are fetched dynamically from the provider.

### Google AI (Gemini)
- Use a Google AI Studio API key through the `google` API-key provider; follow the [README setup](../../README.md#google-ai-gemini-api-key-setup).
- Models, quotas, billing, and eligibility are account/service dependent and fetched dynamically.

### Antigravity (Gemini/Claude)
- Use the existing Antigravity OAuth workflow and authorized app configuration; do not substitute the Google AI Studio API key.
- Models are fetched dynamically from the provider.

### OpenAI Codex
- Use the existing ChatGPT OAuth workflow.
- Models are fetched dynamically from the provider.

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

Live provider/account verification is not implied by this guide or the offline maintenance checks; it remains pending unless separately reported.
