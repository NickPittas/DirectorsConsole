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

Local H3 uses the MiniMax-authored named-section formats and exact source tags; local last-frame alignment requires a supplied effective duration, which is carried to the LLM and rendered with a two-decimal end time. The official base keyframe contract is fixed: I2VA first-only is Picture 1, L2VA last-only is Picture 1, and FL2VA first/last is Picture 1/Picture 2. Contradictory base ordinals are rejected rather than renumbered; preserved ordinal gaps apply only to ref2v connection mapping, so a confirmed Picture 3 remains Picture 3 there. Structured output is plain text, not JSON. The enhancer requires line-anchored unique nonempty sections, an official I2V prefix only where required, and `[Shot 1]` in the main narrative. It checks confirmed source-token set and keyframe alignment but does not perform semantic word-count or soundscape grammar validation; provider output remains responsible for aesthetic and semantic quality.

## Sources and limitations

- https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_base_en.md
- https://huggingface.co/MiniMaxAI/MiniMax-H3/raw/main/docs/VIDEO_PROMPT_WRITING_GUIDE_ref_en.md
- https://platform.minimax.io/docs/api-reference/video-generation-v2-create
- https://docs.ltx.io/api-documentation/implementation-guides/prompting-guide
- https://docs.byteplus.com/en/docs/ModelArk/2222480
- https://docs.byteplus.com/en/docs/ModelArk/2607689
- https://www.alibabacloud.com/help/en/model-studio/text-to-video-prompt
- https://kling.ai/document-api/api/video/3-0-omni/video-omni.md

These sources guide prompt text only. They do not establish local weights, provider credentials, account or region access, graph connections, media contents, or a video submission API in this backend. The local H3 structural checks likewise cannot inspect media, graph bindings, dialogue semantics, or whether guidance-level sentence ranges were met.
