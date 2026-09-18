# Prompt-enhancement profiles

The backend exposes `GET /prompt-enhancement/profiles` as the authoritative target/task/dialect catalog. It returns verified video targets, supported tasks, default dialects, reference style, order-confirmation requirements, and source URLs. Clients should render this metadata rather than duplicating a profile table.

`POST /enhance-prompt` accepts optional `enhancement_context`:

```json
{
  "task": "i2v",
  "reference_dialect": "local_h3",
  "duration_seconds": 8.0,
  "assets": [{
    "binding_id": "panel-1-first",
    "kind": "image",
    "role": "first_frame",
    "ordinal": 1,
    "label": "opening frame"
  }],
  "reference_order_confirmed": true
}
```

The server validates shape, target/task/dialect capabilities, kind/role combinations, unique opaque binding IDs, and per-kind ordinal uniqueness. It cannot inspect media or a workflow graph and therefore does not claim that a binding exists. Ordinals are preserved, including gaps from excluded inputs. Invalid Pydantic fields return 422; semantic context errors return 400. Omitting context preserves legacy image requests. Video targets without context are treated as T2V with the profile default dialect.

Local H3 uses the MiniMax-authored named-section formats and exact source tags; local last-frame alignment requires a supplied effective duration. Structured output is plain text, not JSON. The enhancer checks required section order, confirmed source-token set, and keyframe alignment only; provider output remains responsible for aesthetic and semantic quality.

## Sources and limitations

- https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md
- https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md
- https://platform.minimax.io/docs/api-reference/video-generation-v2-create
- https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide
- https://docs.byteplus.com/en/docs/ModelArk/2222480
- https://docs.byteplus.com/en/docs/ModelArk/2607689
- https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt
- https://kling.ai/document-api/api/video/3-0-omni/video-omni.md

These sources guide prompt text only. They do not establish local weights, provider credentials, account or region access, graph connections, media contents, or a video submission API in this backend.
