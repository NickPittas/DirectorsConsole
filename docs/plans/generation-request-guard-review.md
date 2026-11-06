# Generation request guard review

**Verdict: the predicate does not reliably distinguish render intent from questions, quoted text, or scoped negatives.** The handler takes only the active typed Console message returned by `getActiveConsoleUserRequest`; it does not authorize from selected handoff text, and it rechecks the same turn and text around awaits. Those checks prevent stale-turn authorization, but do not resolve ambiguous wording (`CinemaPromptEngineering/frontend/src/services/agent-conversations.ts:204-218`, `CinemaPromptEngineering/frontend/src/storyboard/StoryboardUI.tsx:6834-6844,6846-6900`).

The seven supplied phrases evaluate as follows: “Please generate a video” allows; “Can you generate a video?” allows; “Do not generate; explain how it works” denies; the workflow-description quote allows; “Generate a video, but do not run it yet” allows; “Use this workflow and go ahead” denies; and “Generate a video with a character who cannot make images” denies.

## Concrete behavior problems

1. **Questions and quoted mentions can authorize a render.** “Can you generate a video?” passes because the question exclusion looks for `can ... I/we`, not `can you`. The quoted workflow description also passes because any clause containing `generate` qualifies, even when the user is explaining quoted artifact text (`agent-conversations.ts:215-218`).
2. **A later stop instruction does not veto an earlier action clause.** “Generate a video, but do not run it yet” passes: splitting on commas tests “Generate a video” separately, and “do not run it yet” contains no recognized action phrase (`agent-conversations.ts:215-218`).
3. **The same lexical rules can reject valid intent.** “...character who cannot make images” is denied because `cannot ... make` matches the negative-word scan, although it describes the character. “Use this workflow and go ahead” is denied because it has no recognized generation verb (`agent-conversations.ts:215-218`).

**Decision:** A small predicate edit cannot reliably handle these distinctions in free text. The caller needs an explicit user-intent field supplied outside artifact/handoff text, tied to the active Console turn and rechecked at the existing checkpoints. No such field is visible in the permitted code; whether the Console request contract already provides one is missing context.

**Minimal next coding task:** Update `getActiveConsoleUserRequest` in `agent-conversations.ts` and the `start_generation` handler in `StoryboardUI.tsx` to carry and require the existing out-of-band Console intent value (`generate`) for the same active turn. Input: active turn identity plus explicit intent; output: permit generation only when that intent is `generate`, preserving the current stale-turn checks.

Static source review only; no runtime verification was performed.
