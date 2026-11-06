# Director's Console agent gateway

The gateway is a local Node HTTP service around the Pi and native Codex adapters. Importing
the library has no side effects; only `dist/server.js` starts a listener. The
launcher starts it only when the frontend is ready and its optional dependencies
and build output are present. Missing dependencies, an unsupported Node version,
or a port already owned by another process disables the gateway while the
application continues. `--no-frontend` never starts it.

## Runtime and setup

Codex integration uses the installed native CLI pinned to `0.166.0`. The launcher
preserves `DC_CODEX_EXECUTABLE`, or discovers a native executable without running
shell wrappers. `DC_CODEX_HOME` is preserved when supplied; otherwise it uses
`CODEX_HOME` or `~/.codex`, allowing Codex itself to load its existing login. No
credentials are copied into the application. Startup policy is passed as process
overrides, without rewriting the user's Codex configuration. Existing-login account
discovery now succeeds with the installed profile (eight reported models in the live
check); authenticated application turns remain unverified. Inherited MCP servers are
disabled using per-server child-process overrides. Names outside the supported bare-key
syntax are rejected rather than enabling an inherited server.

- Node.js: `^22.19.0 || >=24.0.0`. The frontend's separate Node requirement is
  unchanged.
- Pi SDK: `@earendil-works/pi-coding-agent@1.5.0`, pinned exactly in the lockfile.
- No WebSocket dependency is needed for this HTTP tranche.

Pinned Klein, LTX 2.5, MiniMax H3 base T2V/I2V and FastH3 T2V preparation uses the trusted process environment variable
`DC_COMFY_PYTHON`, set to an absolute Python executable containing `comfy-cli`
1.22.0. The gateway does not discover, install, or fall back to another
executable; this enables only the five exact pinned preparation routes and does not
claim backend readiness.

The adapter uses Pi's bundled provider catalog and the user's existing Pi
credentials read-only. It does not load custom global `models.json`, copy CPE
credentials, log in, or write/delete credentials. Unknown or unauthenticated
model selections fail explicitly; no provider or model fallback is used.

Run `python start.py --setup` to resolve the pinned gateway lockfile with
`npm ci --ignore-scripts`, then build the TypeScript entry points. The regular
launcher never installs gateway dependencies. For manual setup, use:

```sh
cd CinemaPromptEngineering/agent_gateway
npm ci --ignore-scripts
npm run build
```

The gateway requires launcher-created private pairing material, so start it
through `start.py`; `npm start` is the packaged entry point, not a supported
standalone bootstrap flow.

## Trusted browser pairing

The launcher binds the service to `127.0.0.1` and passes the exact frontend
origin, normally `http://localhost:5173`. The gateway checks the literal loopback
socket peer and `Host`, plus exact `Origin` on pairing and authenticated routes.
It uses exact-origin CORS for the app's cross-origin loopback fetches; it never
uses a wildcard or reflects untrusted origins. IPv6 loopback is supported when
configured as the literal `[::1]` host.

The launcher creates a random pairing token and a private `0600` credential file
in the per-user Director's Console app-data directory (Windows uses the user's
local app-data ACL). The gateway reads and removes that file at startup. The
launcher also creates a private, temporary local HTML redirect. The browser is
opened with that file path, which contains no token in its URL or process
arguments; it redirects to the configured app origin with the token only in the
fragment. Neither URL fragment values nor request bodies are logged. The token
expires after five minutes and can be exchanged once at `POST /pair`.

For manual startup, run `python start.py --no-browser` and open the printed local
pairing file in a browser within five minutes. The launcher removes bootstrap
files on shutdown. The frontend consumes `dc_agent_pair` and `dc_agent_gateway`
from the fragment, removes them immediately, and keeps the eight-hour bearer
credential in memory only. The launcher supplies one single-use pairing token
per gateway launch; pairing another tab requires a new launcher launch.

Pairing request:

```json
{
  "token": "<one-use launcher token>",
  "bridgeId": "<random 256-bit base64url tab identity>",
  "surface": "prompt-engineer",
  "projectIdentity": "<optional stable project identity>"
}
```

The returned bearer credential belongs to the paired browser bridge. The visible
chat uses one project-free `workspace` session across Prompt Engineer, Console and
Gallery. Explicit cinematic enhancement uses a separate, tool-free
`prompt-engineer` session. Legacy project-bound `console` sessions remain in the
transport for compatibility; changing the active Console project no longer
rebinds the workspace connection or disposes the shared chat.

`POST /pair/renew` rotates an unexpired bearer without transferring session
ownership. Workspace resume requires a ref already owned by this paired bridge;
a session ID alone cannot adopt another tab's session. Explicit legacy
`POST /pair/rebind` changes only legacy Console scope. Bridge scopes expire after
24 hours without authenticated activity; credentials expire separately.

The App root opens authenticated fetch/SSE at `POST /workspace-bridge/commands`
with `{}`. Results go to `POST /workspace-bridge/results` with the original
`sessionId` and result. Wire commands do not carry the private Console project
identity. Console actions require an observed opaque activation binding plus
existing project/panel/workflow revisions; independent Gallery, media, model
guidance and Prompt Engineer actions require no Console binding. An unavailable
application does not block the other adapters. Registration cleanup is scoped to
the exact adapter generation.

Commands and results are limited to 8 MiB and 1 MiB. `application_command` carries
`{sessionId, command}`; `application_cancel` carries `{sessionId, commandId}` when
a pending command fails, expires or is cancelled. Browser handlers retain a
per-command abort/currentness guard through Console awaits. Disconnection aborts
pending browser commands. These guards prevent subsequent writes; they cannot
undo a write already sent. Partial or unknown outcomes must be inspected and are
never replayed automatically. No WebSocket application bridge is implemented;
HTTP upgrades return `426`. Remote browsers remain unsupported in v1.

## HTTP contract

JSON routes use `Cache-Control: no-store`. Except `GET /health`, browser-facing
routes require the exact configured `Origin`; privileged routes also require
`Authorization: Bearer <credential>`. Credentials are never accepted in query
parameters. The listener rejects non-loopback peers and non-matching literal
`Host` values.

| Method and route | Request / response | Access |
|---|---|---|
| `GET /health` | `{status, configured, adapter}`; no model discovery or secrets | Loopback host only |
| `POST /pair` | `{token, bridgeId, surface, projectIdentity?}` → `{credential, expiresAt, bridgeId, surface, projectIdentity?, sessions}` | Exact origin + one-use launcher token |
| `POST /pair/renew` | Empty JSON body → rotated credential and current bridge session refs | Exact origin + current bearer |
| `POST /pair/rebind` | `{projectIdentity?}` → rotated credential, new project binding and empty session registry | Exact origin + current bearer; explicit application project switch |
| `GET /models` | `{models, availability}` with authenticated Pi model summaries | Exact origin + bearer |
| `POST /sessions` | `{selection, surface, projectIdentity?, reviewedContext?}` → `{session}` | Exact origin + bearer; project must match bridge, surface is validated |
| `POST /sessions/resume` | `{selection, surface, projectIdentity?, session, reviewedContext?}` → `{session}` | Exact origin + bearer; project must match bridge and surface must match ref |
| `POST /sessions/{sessionId}/turn` | `{session, text, images?}` → SSE | Exact origin + bearer + owned ref |
| `POST /sessions/{sessionId}/abort` | No body → `{aborted: true}` | Exact origin + bearer + owned ref |
| `DELETE /sessions/{sessionId}` | No body → `{deleted: true}` | Exact origin + bearer + owned ref |
| `POST /workspace-bridge/commands` | `{}` → SSE commands/cancellations | Exact origin + bearer + paired browser |
| `POST /workspace-bridge/results` | `{sessionId, result}` → `{received: true}` | Exact origin + bearer + owned workspace session + original pending command/binding |
| `POST /application-bridge/commands` | `{projectIdentity}` → SSE `application_command` events with `{sessionId, command}` | Exact origin + bearer + paired project |
| `POST /application-bridge/results` | `{projectIdentity, sessionId, result}` → `{received: true}` | Exact origin + bearer + owned Console session + matching pending command |

Turn SSE event names are `text_delta` (`{delta}`), `turn_settled`
(`{aborted, stopReason?, truncated?}`), and `failure`
(`{error: {code, message}}`). `stopReason` is forwarded from the final Pi
assistant message; `truncated` is true when that reason is `length`. Provider
errors are returned as sanitized failures, including a final assistant error
before settlement. Clients must require `turn_settled`; EOF or partial text
after a failure is not a successful turn. Closing a streaming request aborts
its Pi turn.

Turn text is limited to 64 KiB UTF-8; reviewed context to 64 KiB UTF-8 and 16 entries;
requests to 12 MiB; images to four entries, 6 MiB each and 8 MiB combined.
Images must use canonical base64 and match PNG, JPEG, GIF, or WebP signatures
and MIME types. The Pi adapter also checks that the selected model supports image
input.

Errors use `{error: {code, message}}`. Key admission codes are
`origin_required`, `remote_browser_unsupported`, `local_host_required`,
`pair_token_invalid`, `credential_required`, `credential_expired`,
`bridge_disconnected`, `session_binding_mismatch`, and `session_not_owned`.
Pi selection, authentication, image and provider errors use the adapter's
sanitized codes and messages. Turn, abort and delete require an exact owned ref.
Resume can register a persisted ref only in the paired project's validated
surface directory, and rejects a session owned by another live bridge. A newly
paired tab can therefore resume its project's persisted conversations after a
gateway restart without accepting arbitrary session paths.

Workspace tools are explicitly registered and verified in the Pi adapter. They
cover snapshots, schemas, cached recipes, custom workflow proposals, save/attach,
media binding, panel parameters, generation/run operations, optional cinematic
constraints, independent model prompting guidance and the implemented Gallery
operations. Explicit Prompt Engineer enhancement sessions receive no tools.
Only fixed typed actions are exposed, not arbitrary functions or shell commands.
Generation still uses the frontend's direct ComfyUI path and durable run journal.
Installation and download APIs are not registered as Pi tools.

The pinned Pi 1.5.0 session event contract includes final `agent_end` messages
with `willRetry` and `agent_settled`. The adapter reads `stopReason` only from
the final non-retry assistant message, uses `agent_settled.aborted` for turn
completion, and fails provider-error messages before settlement. See the
[Pi 1.5.0 session source](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/src/core/agent-session.ts)
and [model runtime source](https://github.com/earendil-works/pi/blob/v1.5.0/packages/coding-agent/src/core/model-runtime.ts).
That SDK release exposes no shared `ModelRuntime` disposal method; the adapter
releases its sessions and aborts availability requests, and process exit reclaims
the shared runtime.
