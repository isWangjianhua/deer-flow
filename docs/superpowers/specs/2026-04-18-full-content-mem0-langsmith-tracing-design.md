# Full-Content Mem0 LangSmith Tracing Design

Date: 2026-04-18

## Summary

Define a full-content tracing design for DeerFlow's `memory.provider=mem0` runtime path so that LangSmith captures the same level of prompt/payload detail as the existing model-call traces, while also exposing Mem0-specific retrieval, injection, and write-back behavior.

This slice defines:

- how to record full prompt and memory content in LangSmith
- how to align new Mem0 tracing with the project's existing model trace style
- which runtime boundaries should capture complete inputs and outputs
- how final provider payloads should be recorded
- how memory write-back and extracted memory results should be captured

This slice intentionally does not include:

- changing the memory retrieval policy itself
- changing memory injection order
- introducing environment-specific redaction, truncation, or filtering
- vendor migration away from LangSmith
- browser/UI-facing observability changes

## Problem

The current project already records near-full model call content through LangSmith's automatic LangChain integration. In practice, this means developers can inspect detailed model inputs and outputs during debugging.

However, the newly added Mem0-specific tracing currently behaves differently:

- memory spans are visible
- retrieval, injection, queueing, and write-back are traceable
- but those spans mostly contain structured counters and metadata, not the complete content

This creates a mismatch in observability style:

- the main model trace feels content-rich
- the Mem0 spans feel metadata-only
- debugging full prompt/payload shape across the Mem0 boundary is still difficult

The gap is especially visible when debugging questions such as:

- what exact `<memory>...</memory>` block was injected
- whether the final provider payload truly contained the memory block
- what exact messages were submitted to Mem0 for write-back
- what exact memory content was extracted or returned by the memory backend

## Goals

- Record full Mem0-related content in LangSmith.
- Keep all environments consistent: development and production should record the same tracing content.
- Align Mem0 tracing style with the project's existing full model-input tracing style.
- Make final prompt and final provider payload inspection possible from LangSmith.
- Make memory extraction and memory insertion equally inspectable.
- Preserve the current runtime behavior of the memory system.

## Non-Goals

- Do not redact or truncate memory content.
- Do not add development-only tracing behavior.
- Do not add production-only suppression or filtering.
- Do not redesign the prompt architecture.
- Do not modify message ordering for Mem0 injection in this slice.

## Explicit User-Approved Policy

The user explicitly approved the following policy for this slice:

- full-content tracing is required
- all environments should behave the same
- no redacted version
- no preview-only version
- no development special case
- no production tightening
- tracing is treated as a complete audit record

This policy overrides the more conservative default recommendation that would normally favor previews or bounded payloads.

## Current Context

Relevant implementation details today:

- `SYSTEM_PROMPT_TEMPLATE` in `backend/packages/harness/deerflow/agents/lead_agent/prompt.py` produces the base system prompt
- in Mem0 mode, static `memory_context` is disabled in the prompt template path
- `Mem0InjectionMiddleware` injects a separate `SystemMessage` containing `<memory>...</memory>` at model-call time
- `PatchedChatDeepSeek` customizes request payload construction at the provider boundary
- `MemoryMiddleware` decides whether a conversation should be queued for memory write-back
- `MemoryUpdater` delegates to `Mem0Service.add_conversation(...)` in Mem0 mode
- `Mem0Service` is the Mem0 SDK boundary
- the recently added memory tracing helper (`deerflow.tracing.memory`) currently records metadata-rich but not content-rich spans

This means the core missing capability is not trace presence, but trace completeness.

## Chosen Approach

Extend the current LangSmith memory instrumentation to record full content at the following layers:

1. prompt rendering
2. memory injection
3. final provider payload
4. memory write-back input
5. memory extraction / resulting memory content

The design keeps the existing span names and structure where possible, but upgrades those spans to include complete inputs/outputs.

## Why This Is the Right Fit for the Current Project

The existing DeerFlow project already treats LangSmith model traces as highly detailed debugging artifacts. The new Mem0 tracing should follow the same operational philosophy rather than creating a second-class, metadata-only observability layer.

This is not introducing a new observability philosophy. It is aligning the new Mem0 path with the existing one.

## Alternatives Considered

### Option 1: Keep Mem0 tracing metadata-only

Pros:

- safer from a privacy perspective
- smaller payloads in LangSmith
- easier to maintain

Cons:

- inconsistent with current model trace richness
- poor fit for current debugging needs
- does not solve the specific visibility problems that motivated this work

### Option 2: Full-content tracing only in development

Pros:

- better privacy posture in production
- easier to justify operationally

Cons:

- directly rejected by the approved policy for this slice
- creates environment drift
- production debugging becomes less trustworthy

### Option 3: Full-content tracing in all environments (chosen)

Pros:

- fully aligned with the approved policy
- consistent debugging experience across environments
- easiest to reason about operationally because nothing changes by environment
- directly matches the current model-trace style already present in the project

Cons:

- records more sensitive content into LangSmith
- larger trace payloads
- requires disciplined implementation so the right boundaries capture the right full content once

Option 3 is the chosen approach.

## What Will Be Recorded in Full

### 1. Base system prompt

Record the complete rendered system prompt generated from `SYSTEM_PROMPT_TEMPLATE`.

This includes:

- `<role>...`
- `{soul}`
- all remaining lead-agent instruction sections
- the final fully rendered string passed to the agent builder

### 2. Injected memory message

Record the complete `<memory>...</memory>` content created by `Mem0InjectionMiddleware`.

This includes:

- the exact formatted memory block
- whether it was injected
- the exact message content that was prepended to the request

### 3. Final provider payload

Record the complete provider payload that is ultimately sent to the model provider at the patched-provider boundary.

For DeepSeek specifically, this means the final `messages` payload after all middleware modifications and message conversions have completed.

### 4. Mem0 write-back input

Record the full messages submitted to `Mem0Service.add_conversation(...)`.

This includes:

- full message content after memory filtering
- roles
- metadata such as `thread_id` and `source`

### 5. Extracted / resulting memory content

Record the full resulting memory content available at the write-back boundary.

Preferred order of recording:

1. if the Mem0 SDK returns structured results from `add(...)`, record those directly
2. otherwise, record the full write payload plus a follow-up representation of the resulting memory view that DeerFlow can observe

This ensures the trace can show what was attempted and what Mem0 actually accepted or produced.

## Trace Correlation Model

### Thread-level correlation

All memory-related spans should continue carrying `thread_id` where available.

This remains the main execution-debugging axis.

### User-level correlation

All Mem0-specific spans should continue carrying `user_scope_key` in metadata.

This remains necessary because Mem0 memory is user-scoped, not thread-scoped.

### Tags vs metadata

Even under the full-content policy, tags should remain low-cardinality.

Use tags for:

- `memory`
- `mem0`
- `retrieval`
- `injection`
- `write`
- `middleware`
- `payload`

Use metadata / inputs / outputs for full content and high-cardinality fields.

## Span Design

### `lead_agent.prompt.render`

Location:

- `backend/packages/harness/deerflow/agents/lead_agent/prompt.py`

Purpose:

- record the final rendered base system prompt in full
- show whether static `memory_context` is empty under Mem0 mode

Inputs:

- agent identity inputs
- prompt-generation mode fields

Outputs:

- `full_system_prompt`
- `memory_provider`
- `memory_context_used`

### `memory.mem0.middleware.injection`

Location:

- `backend/packages/harness/deerflow/agents/middlewares/mem0_injection_middleware.py`

Purpose:

- record the exact injected `<memory>` block in full
- show injection success/failure and skip reasons

Inputs:

- full request message list before injection
- request message count

Outputs:

- `injected`
- `full_memory_message`
- `skip_reason` when applicable
- final injected system message content

### `memory.mem0.profile_retrieval`

Location:

- `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`

Purpose:

- record the full profile candidate set that survived profile selection

Inputs:

- profile retrieval parameters
- full profile candidate result set if available

Outputs:

- complete selected profile memory content

### `memory.mem0.query_retrieval`

Location:

- `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`

Purpose:

- record the full query text and the full query retrieval result set

Inputs:

- full query text
- retrieval parameters

Outputs:

- complete query retrieval results
- complete selected query memory content

### `memory.mem0.merge`

Location:

- `backend/packages/harness/deerflow/agents/memory/memory_retrieval.py`

Purpose:

- show the exact merged memory content that will be formatted for injection

Inputs:

- full profile-selected content
- full query-selected content

Outputs:

- full merged memory content
- deduplication result

### `model.payload.final`

Location:

- `backend/packages/harness/deerflow/models/patched_deepseek.py`
- and optionally equivalent patched provider boundaries in other custom providers later

Purpose:

- capture the final provider payload exactly as sent to the provider

Inputs:

- original LangChain messages before payload conversion

Outputs:

- final payload dictionary including complete `messages`
- whether payload contains `<memory>` content

### `memory.mem0.middleware.after_agent`

Location:

- `backend/packages/harness/deerflow/agents/middlewares/memory_middleware.py`

Purpose:

- show the full filtered conversation chosen for memory write-back
- show skip reasons when no write-back occurs

Inputs:

- original message list
- filtered message list

Outputs:

- `queued`
- `skip_reason` when applicable
- full filtered conversation content when queued

### `memory.mem0.write`

Location:

- `backend/packages/harness/deerflow/agents/memory/updater.py`

Purpose:

- record the full write-back submission that DeerFlow hands to the Mem0 adapter

Inputs:

- full message list being submitted
- full write metadata

Outputs:

- acceptance result
- any observed returned structure

### `memory.mem0.add_conversation`

Location:

- `backend/packages/harness/deerflow/agents/memory/mem0_service.py`

Purpose:

- record the exact SDK-boundary payload and returned result

Inputs:

- full payload messages
- metadata
- run/user scope

Outputs:

- full Mem0 SDK return value
- accepted/rejected summary

## Provider-Specific Notes

### DeepSeek

The current debugging pain point specifically involves `PatchedChatDeepSeek` and the visibility of system messages in LangSmith.

Therefore, provider-boundary payload tracing should start with:

- `backend/packages/harness/deerflow/models/patched_deepseek.py`

The design should verify whether multiple `SystemMessage` entries are preserved distinctly or collapsed/merged before provider submission.

### Other providers

This slice does not require immediate expansion to every provider, but it should be implemented in a way that makes similar provider-boundary tracing easy to add later.

## Data Placement Rules

### Metadata

Metadata should still hold structural fields such as:

- `thread_id`
- `user_scope_key`
- `memory_provider`
- counts / booleans / control flags

### Inputs / Outputs

All full content should go into `inputs` and `outputs`, not into metadata.

This matches the project's existing LangSmith trace style more closely and keeps structural metadata separate from large content payloads.

## Testing Strategy

### Unit tests

Add or extend tests to verify:

- tracing helper supports full `inputs`
- injection spans can emit full outputs
- retrieval spans emit full merged content
- middleware write spans emit full filtered message content
- provider payload tracing records full messages
- Mem0 service tracing records full payload and returned result

### Smoke verification

Use a real LangSmith-enabled run to confirm that:

- `lead_agent.prompt.render` appears with the complete prompt text
- `memory.mem0.middleware.injection` contains the complete `<memory>` block
- `model.payload.final` contains the final provider payload
- write-back spans contain the full extracted / submitted memory content

## Risks

This design intentionally accepts the following risks because the user explicitly approved them:

- long-term memory content will be fully stored in LangSmith
- system prompts will be fully stored in LangSmith
- provider payloads will be fully stored in LangSmith
- sensitive user/business information may therefore become part of the tracing record

This is not accidental behavior. It is the approved policy for this slice.

## Rollout Notes

- No environment-based branching should be introduced.
- No redaction path should be added.
- No preview-only mode should be added.
- Full-content behavior should be the default and only mode for this slice.

## References

This design is based on:

- the project's current LangSmith-driven model trace style
- the current Mem0 runtime integration in DeerFlow
- LangSmith's custom instrumentation model using `trace(...)`
