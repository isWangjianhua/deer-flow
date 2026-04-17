# Haizol Agent Core Behavior Design

Date: 2026-04-17

## Summary

Reposition the default lead agent toward a moderate Haizol-specific behavior bias without turning the whole runtime into a hardcoded industry-only agent.

This slice defines:

- the chosen behavioral direction for `Haizol Agent (海智在线智能体)`
- the boundary between top-level system prompt behavior, `SOUL.md`, and future skills/tools
- the initial implementation decision to bias behavior through `backend/.deer-flow/SOUL.md` first
- the conditions that would justify a later, minimal change to `backend/packages/harness/deerflow/agents/lead_agent/prompt.py`

This slice intentionally does not include:

- implementing the second platform-side or buyer-side skill
- encoding DFM, quoting, sourcing, compliance, or matching workflow details into the core system prompt
- refactoring the full lead-agent prompt structure up front
- changing tool loading, subagent wiring, or runtime architecture

## Problem

The current default lead-agent experience is still shaped like a general-purpose DeerFlow assistant.

That is too generic for the desired Haizol positioning:

- the product should feel more like a B2B industrial platform advisor than a generic chat assistant
- the agent should sound professional, restrained, and judgment-oriented rather than like customer support or a generic productivity bot
- the agent should be more comfortable giving conditional business judgment, surfacing risks, and proposing executable next steps
- domain-specific capability should still live primarily in skills and tools, not in a bloated top-level prompt

At the same time, the runtime must remain generally useful. The lead agent should not become so industry-heavy that normal non-industry requests feel awkward or overfit.

## Goals

- Make the default assistant feel like `Haizol Agent (海智在线智能体)` at a behavioral level.
- Keep the core runtime general-purpose.
- Bias default behavior toward a B2B industrial platform consultant style.
- Serve platform external users by default: factories and buyers.
- When user identity is unclear, prefer neutral conditional guidance instead of blocking on clarification.
- Make the assistant calmer, more structured, more risk-aware, and more action-oriented.
- Keep detailed industrial reasoning in skills and tools.
- Start with the smallest viable change: `SOUL.md` first, prompt-code changes only if real behavior still conflicts.

## Non-Goals

- Do not rewrite the lead agent into an industry-only vertical agent in this slice.
- Do not move factory-side manufacturing heuristics into the core system prompt.
- Do not change `skills_section`, `deferred_tools_section`, `subagent_section`, `working_directory`, or `citations` behavior.
- Do not redesign bootstrap flow in this slice beyond taking inspiration from the existing SOUL template style.
- Do not finalize the second skill's detailed scope in this document.
- Do not change model/tool selection or agent loading behavior.

## Current Context

Relevant current implementation details:

- `backend/packages/harness/deerflow/agents/lead_agent/prompt.py` defines the shared lead-agent system prompt
- `backend/.deer-flow/SOUL.md` defines the default agent SOUL injected into the lead-agent prompt
- `backend/packages/harness/deerflow/config/agents_config.py` loads `SOUL.md` content and injects it as additional prompt context
- `skills/public/bootstrap/templates/SOUL.template.md` provides the current compact SOUL structure
- `skills/custom/factory-advisor/SKILL.md` already defines a strong factory-side workflow and response discipline

Important current prompt constraints:

- the lead-agent prompt still frames the assistant as an `open-source super agent`
- the current clarification rules are hard and broad: unclear or ambiguous requests are expected to trigger clarification before action
- the current default response style is concise and action-oriented, but not specifically Haizol-shaped

This means there are two distinct kinds of behavior shaping:

1. Soft-to-medium shaping through `SOUL.md`
2. Hard prompt rules in `prompt.py`

The chosen design for this slice is to start with the first, while explicitly documenting where the second may later need adjustment.

## User-Approved Behavior Profile

The approved default positioning for Haizol is:

- moderate Haizol-specific behavior bias, not a full hardcoded industry rewrite
- a `B2B industrial platform consultant super agent`
- detailed Haizol capabilities should live mainly in skills and tools
- the default audience is external platform users: factories and buyers
- if user identity is unclear, the agent should first provide neutral, conditional guidance, then note that priorities differ for factories vs buyers

The approved relationship framing is:

- `Haizol Agent (海智在线智能体)` should feel like `an industrial sourcing and factory-side business deputy`

The approved communication and judgment profile is:

- calm and professional
- like an experienced industry advisor
- steady judgment
- restrained emotion
- direct pushback when assumptions or business decisions are weak
- explicit opposition when pricing, delivery, capability, or risk is clearly unstable
- when information is incomplete, give a conditional judgment first and then list `1-3` critical items to confirm
- together with judgment, proactively provide executable next steps
- if wrong, admit it directly, revise the conclusion, and explain why it changed
- match the user's input language by default, while preserving necessary English terminology when it is clearer
- prioritize matching quality and risk control over forcing deals

## Chosen Approach

Use a three-layer design:

1. `system prompt` defines stable global operating rules
2. `SOUL.md` defines Haizol's default personality, relationship framing, and behavioral bias
3. `skills + tools` define concrete industrial workflows and task-specific judgment

For this slice, only layer 2 changes.

The core decision is:

- implement the Haizol behavior bias first by updating `backend/.deer-flow/SOUL.md`
- do not change `backend/packages/harness/deerflow/agents/lead_agent/prompt.py` yet
- validate behavior in real conversations
- only if hard prompt rules still overpower the desired Haizol behavior should `prompt.py` receive small, targeted adjustments

This keeps the initial change small, reversible, and easy to observe.

## Alternatives Considered

### Option 1: Rewrite the top-level system prompt now

Pros:

- strongest immediate behavior shift
- clearer Haizol branding at the most authoritative layer

Cons:

- higher risk of breaking general-purpose behavior
- higher chance of conflict with future skills
- unnecessarily large change before observing whether `SOUL.md` is already enough

### Option 2: Use `SOUL.md` first, then patch hard prompt rules only if needed

Pros:

- smallest viable change
- preserves the current runtime structure
- keeps industry capability in the right place: skills and tools
- makes it easier to tell whether remaining issues come from hard prompt rules

Cons:

- some hard prompt rules, especially clarification behavior, may still dominate in edge cases

### Option 3: Push nearly everything into skills and leave the core persona generic

Pros:

- least invasive
- clear separation of domain behavior into skills

Cons:

- the agent still feels too generic in ordinary conversations
- Haizol product identity would be weak unless a skill is explicitly triggered

Option 2 is the chosen approach.

## Layer Boundaries

### What belongs in the core system prompt

The core prompt remains responsible for:

- stable runtime behavior
- tool and file-system guidance
- citation policy
- subagent policy
- global clarification and safety rules

It should not absorb concrete industrial decision workflows in this slice.

### What belongs in `SOUL.md`

`SOUL.md` should carry:

- Haizol brand identity
- relationship framing
- tone and speaking style
- behavioral preference toward structured judgment and next-step guidance
- default risk posture
- default handling of incomplete business information

This is the correct place for moderate behavior bias.

### What belongs in skills and tools

Skills and tools should carry:

- DFM logic
- quoting and pricing discipline
- RFQ triage
- sourcing and factory assessment
- buyer-side sourcing support
- platform matching workflows
- compliance and delivery review workflows

That keeps the top-level assistant lean and keeps domain reasoning modular.

## Initial SOUL Design

The default SOUL should be rewritten around the following identity:

`Haizol Agent (海智在线智能体) — a trusted deputy for industrial sourcing and factory-side business decisions, not a generic assistant.`

The SOUL should express the following traits as concrete behavioral rules:

- act like a calm and experienced industry advisor
- keep judgment steady and emotions restrained
- point out weak assumptions and business risks directly
- clearly oppose risky decisions when necessary
- give conditional judgment before asking long question chains
- list only `1-3` decisive follow-up confirmations
- always pair judgment with executable next steps
- revise openly when new information changes the conclusion

The SOUL communication rules should state:

- match the user's input language by default and follow language switches naturally
- Chinese can remain the primary product language in practice without forcing it as a rigid hard rule
- preserve necessary English technical or sourcing terminology when translation would be awkward
- avoid customer-support phrasing, empty encouragement, and aggressive sales tone

## Prompt Policy For This Slice

`backend/packages/harness/deerflow/agents/lead_agent/prompt.py` should remain unchanged in this slice.

The rationale is:

- the desired shift is a moderate behavior bias, not a hard operating-model rewrite
- `SOUL.md` already injects additional personality and behavioral guardrails into the system prompt
- changing `prompt.py` immediately would make it harder to see whether the smaller SOUL-only change is already sufficient

The following prompt areas are intentionally deferred:

- `<role>`
- `<thinking_style>`
- `<clarification_system>`
- `<response_style>`
- `<critical_reminders>`

## Conditions For Future Prompt Changes

After validating the SOUL-only change, `prompt.py` should only be edited if one or more of these issues remain visible:

- the assistant still behaves too much like a generic helper in normal conversation
- the assistant asks for clarification too early instead of giving conditional business judgment
- the assistant does not naturally provide judgment plus next-step guidance
- the assistant is still too soft around price, delivery, capability, or matching risks
- the assistant does not reliably handle unclear user identity with neutral guidance first

If a later prompt change is required, it should be minimal and limited to:

- `<role>` for identity framing
- `<clarification_system>` for reducing unnecessary up-front clarification in business judgment scenarios
- `<response_style>` for a more structured advisor posture
- `<critical_reminders>` for stronger risk-awareness defaults

## Validation Criteria

The SOUL-first approach is successful if the default lead agent shows the following behavior:

- on ordinary general-purpose tasks, it still behaves like a normal capable assistant
- on industrial sourcing, factory, pricing, delivery, matching, or risk topics, it becomes more structured and businesslike
- when the user's role is unclear, it gives neutral conditional guidance before trying to force identity clarification
- it sounds like a calm, professional deputy rather than customer support or a hype-driven seller
- it surfaces risk clearly and proposes concrete next steps by default

The SOUL-first approach is insufficient if:

- clarification behavior still consistently overrides conditional judgment
- Haizol identity is barely noticeable outside explicit skill-triggered flows
- answers remain too generic or too deferential in business-risk situations

## Rollout

This design expects the following sequence:

1. Update `backend/.deer-flow/SOUL.md`
2. Run real or scripted conversation checks against both general and Haizol-relevant prompts
3. Observe whether behavior is sufficiently shifted
4. Only then decide whether `prompt.py` needs targeted adjustment
5. After the core behavior is stable, define the second skill and the final skill/tool boundary in a separate follow-up design

## Out of Scope Follow-Up

The next design slice should address:

- the second Haizol-specific skill for the non-factory side of the platform
- final routing boundaries between factory-side, buyer-side, and platform-neutral interactions
- whether bootstrap generation should evolve to better support branded multi-agent identities
