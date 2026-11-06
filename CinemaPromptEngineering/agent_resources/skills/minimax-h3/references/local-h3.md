# MiniMax H3 local dialect

Use only with `minimax_h3` plus the validated `local_h3` dialect. This is the named-section local prompt format; it is not the hosted API format.

For T2V, I2V, and first/last keyframes, use these core sections in order:

```text
integrated_multimodal_description: ...

overall_soundscape: ...

non_diegetic_music: ...
```

Use the model-author first-frame or first/last alignment line only when the corresponding confirmed image roles and caller-supplied duration are present. Shot 1 has no cut timestamp; later cuts use increasing times within that duration. Preserve the bound ordinals; do not silently renumber.

For reference generation, use the six-section structure: `subject_definitions`, `summary`, `retention_analysis`, `detailed_description`, `overall_soundscape`, `non_diegetic_music`. Use `<Picture N>`, `<Video N>`, and `<Audio N>` only for confirmed per-kind ordinals. `<Subject N>` describes generated content, not an asset binding. Preserve exact user dialogue inside the documented `<d>[Language] ...</d>` syntax when present.

For V2V, use reference-video conditioning and the model-author editing/continuation task type. Describe only changes and preserved properties the user requested. Existing local-H3 shape validation is authoritative; do not invent fixed word or sentence counts.
