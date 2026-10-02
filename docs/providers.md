# AI/LLM Provider Setup

[← Back to the README](../README.md)

Cinema writes prompts **for a target generator**; an optional **enhancing provider** refines that text. Select the enhancing LLM provider/model in **Settings** and the generator target separately. Attached images require image-input support in the chosen LLM and transport. Unsupported image requests fail rather than silently switching providers or falling back to text-only enhancement.

![AI provider settings](../Images/CPE%20LLM%20Providers.png)

*Provider configuration selector (earlier Settings layout). The named compatible-endpoint controls are described below.*

![Default enhancing-provider selection](../Images/CPE%20LLM%20Providers%202.png)

*Default enhancing-provider selection, showing configured and unconfigured entries. These are provider choices, not a model catalog.*

## General setup

1. Open **Settings** (the gear icon).
2. Select a provider using its exact UI label.
3. Enter its key, token, endpoint, or OAuth configuration.
4. Click **Test Connection**.
5. Fetch available models, select one, and click **Save Changes**.
6. Run a small enhancement before relying on a provider in production.

The backend has an existing encrypted credential store. Provider configuration can also be cached in browser local storage or the browser profile, so protect both. Do not hardcode credentials or assume a Windows path is universal; use the path and permissions appropriate to the operating system.

## API-key providers

These integrations use a key or token entered in Settings. Obtain credentials only from the provider's official console, then use the provider's model discovery in Settings rather than assuming a model name:

| Settings label | Provider ID | Credentials | Official setup |
|---|---|---|---|
| OpenAI | `openai` | API key | [API keys](https://platform.openai.com/api-keys) |
| Google AI (Gemini) | `google` | Google AI Studio API key | [AI Studio keys](https://aistudio.google.com/apikey) |
| Anthropic | `anthropic` | API key | [Console](https://console.anthropic.com/) |
| OpenRouter | `openrouter` | API key | [Keys](https://openrouter.ai/keys) |
| Replicate | `replicate` | API token | [Account tokens](https://replicate.com/account/api-tokens) |
| Stability AI | `stability` | API key | [Platform](https://platform.stability.ai/) |
| GitHub Models | `github_models` | GitHub PAT with the required model permission | [GitHub Models](https://docs.github.com/en/github-models/quickstart) |

The registry may contain additional provider integrations, but registration alone does not promise that every provider supports every target, image input, model, account, or region. In particular, do not infer vision availability from a provider name or from a successful text-only connection.

## Google AI (Gemini) API key

This is the native Google AI Studio API-key path, not Antigravity OAuth. The provider ID is `google`, the Settings label is **Google AI (Gemini)**, and the native API path is `generativelanguage.googleapis.com/v1beta`.

1. Open **Settings**.
2. Select **Google AI (Gemini)**.
3. Create or copy a key from [Google AI Studio API keys](https://aistudio.google.com/apikey).
4. Paste it into the API-key field.
5. Click **Test Connection**.
6. Fetch models, select one, and click **Save Changes**.

A Google AI Studio API key is not an Antigravity OAuth client secret. Quotas, billing, account eligibility, model availability, and multimodal access are controlled by Google and the account; a connection or model list does not prove access to every Gemini feature. Never put a real key in source, documentation, logs, issues, or frontend `VITE_*` variables.

## Named compatible endpoints

In **Compatible Endpoints**, select the **OpenAI-compatible** or **Anthropic-compatible** protocol, enter a name and base URL, and add the endpoint. Use its named provider entry to test the connection, fetch models, select a model, and save. Provider IDs are generated automatically; the display name is editable.

Use an `http://` or `https://` base URL without credentials, query strings, or fragments. A blank key is allowed only for the corresponding local/compatible endpoint when that service does not require one; it is not a global API-key bypass. The application does not start a server or unconditionally detect arbitrary endpoints for you.

## Local servers

Local integrations still require the server to be running before discovery:

1. Start Ollama or LM Studio yourself.
2. In Settings select **Ollama** (`http://localhost:11434`) or **LM Studio** (`http://localhost:1234/v1`).
3. Click **Test Connection**.
4. Fetch models, select one, and click **Save Changes**.

Ollama model names, including tags such as `llama3:latest`, remain tagged. Embedding-only models are filtered from the chat model list. LM Studio exposes an OpenAI-compatible API, but it still needs its own configured provider entry and running server.

## OAuth providers

OAuth providers are separate from API-key setup:

| Settings label | Provider ID | Flow | Client secret |
|---|---|---|---|
| GitHub Copilot | `github_copilot` | Device authorization | Not required |
| Antigravity (Gemini/Claude) | `antigravity` | Authorization Code + PKCE | Required |
| OpenAI Codex (ChatGPT Plus/Pro) | `openai_codex` | Authorization Code + PKCE | Not required |

Select the provider, click **Connect**, authorize in the browser, then return to Settings and fetch models. Codex model catalog data is a catalog source, warning, and fallback mechanism—not proof that the account is entitled to every listed model. Token refresh uses the existing credential flow.

### Antigravity application configuration

Antigravity PKCE requires an authorized Antigravity client ID and client secret. Do not substitute an arbitrary Google Cloud client or assume a generic cloud client grants Antigravity/Cloud Code access.

The private backend configuration file is `CinemaPromptEngineering/.env`. It is gitignored; on Unix keep it mode `0600`. Copy the tracked `CinemaPromptEngineering/.env.example` **only when `.env` does not exist**—never overwrite an existing file. The example contains placeholders, not real keys. Set the values locally:

```text
ANTIGRAVITY_CLIENT_ID=your-authorized-client-id
ANTIGRAVITY_CLIENT_SECRET=your-authorized-client-secret
```

Restart the CPE backend after changing the file. Never put these values in frontend `.env` files, `VITE_*` variables, Git, logs, or issues. The loader is implemented, but live provider/account verification remains pending. Existing OAuth tokens are not deleted; relogin cannot repair missing or invalid application configuration.

The local callback is exactly `http://localhost:36742/oauth-callback`. If the client registration requires a redirect URI, register that URI and use a client type whose loopback rules permit it. Do not convert it to a web-client flow merely to avoid the desktop callback requirements.

## Choosing the two provider roles

The target generator determines the prompt dialect and output task. The enhancing provider is the LLM service that interprets the request and applies the selected enhancement profile. They do not have to be the same service.

Before testing a target:

- Confirm the target profile and requested media type.
- Confirm the provider is configured and a discovered model is selected.
- Confirm the adapter accepts the required text and image inputs.
- Keep reference-media semantics explicit; metadata-only references are not image pixels.
- Treat a provider rejection as actionable configuration feedback, not as permission to silently switch providers.

The [prompt enhancement profiles](../Documentation/PROMPT_ENHANCEMENT_PROFILES.md) document the supported profile dialects and official sources. The [cinema guide](cinema.md) documents the broader prompt-engineering workflow.

## Provider and credential safety

The backend credential store encrypts credentials, but that does not protect values copied into a browser profile or local storage. Use a private OS account and protect browser data on shared machines. Rotate a key at its provider if it is exposed.

Do not paste keys into a prompt, screenshot, issue, terminal transcript, or commit. Do not add provider secrets to frontend environment variables. Backend environment configuration is appropriate only for the explicitly documented Antigravity app settings.

Endpoint URLs are configuration, not credentials. Keep compatible endpoint URLs free of embedded usernames, passwords, query parameters, and fragments. Use HTTPS for remote services unless the service is intentionally local and protected by the host/network.

## Short verification checklist

After any provider change, verify all of the following:

1. The exact Settings label is selected.
2. The endpoint points to the intended service.
3. The credential is present when that service requires one.
4. **Test Connection** succeeds.
5. Model discovery returns the expected models.
6. The selected model is saved.
7. A small text enhancement works.
8. An image test is run only when the model and adapter support vision.

A model appearing in a catalog is not an entitlement check. OAuth success is not an account-capability check. A provider's registry entry is not a guarantee of vision, generation, quota, or regional availability.

## Related guides and troubleshooting

- [Prompt enhancement profiles](../Documentation/PROMPT_ENHANCEMENT_PROFILES.md)
- [Cinema prompt guide](cinema.md)

A connection failure usually means the server is stopped, the endpoint/base URL is wrong, the key/token is invalid, or the selected model is unavailable. For model discovery, verify the service is running and repeat **Test Connection** before fetching models. For vision errors, verify both the selected model's multimodal capability and the provider adapter; unsupported combinations are rejected. API requests default to **30 seconds**; Enhance requests use **90 seconds**.
