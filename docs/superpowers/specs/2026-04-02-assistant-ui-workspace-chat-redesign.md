# 2026-04-02 Assistant-UI Workspace Chat Redesign

## Summary

Redesign the `apps/assistant-ui-web` workspace chat experience so it fully matches the assistant-ui + shadcn template language already used in that app, while fixing the current streaming, title, collapsible content, markdown, and right-canvas regressions.

This redesign addresses the current user-visible failures:

1. The page looks visually broken and inconsistent with assistant-ui.
2. Assistant responses do not feel truly streamed.
3. The thread title is not presented clearly.
4. Collapsed thinking and tool content is disorganized.
5. There is no right-side canvas for artifacts and file previews.
6. Markdown output is not rendered with a readable document-like presentation.

## Goals

- Rebuild the `apps/assistant-ui-web` workspace chat page around the assistant-ui thread layout already present in that app.
- Reuse the existing `apps/assistant-ui-web` runtime and assistant-ui primitives as much as practical.
- Make streaming updates feel continuous and stable.
- Separate assistant body content, event cards, and artifact canvas payloads so they never bleed into each other.
- Add a right-side canvas panel for artifact and file preview workflows.
- Render markdown in the restrained, document-like style expected from assistant-ui.
- Keep compatibility with existing DeerFlow backend message and artifact protocols.

## Non-Goals

- No backend protocol redesign.
- No unrelated refactor outside `apps/assistant-ui-web`.
- No visual re-theme of the entire product outside the workspace chat surface.
- No visual redesign that departs from assistant-ui's shadcn template language.

## References

- `apps/assistant-ui-web/src/components/thread-screen.tsx`
- `apps/assistant-ui-web/src/components/assistant-ui/thread.tsx`
- `apps/assistant-ui-web/src/components/assistant-ui-thread.tsx`
- `apps/assistant-ui-web/src/components/assistant-ui/markdown-text.tsx`
- `apps/assistant-ui-web/src/components/tool-ui/index.tsx`
- `apps/assistant-ui-web/src/lib/runtime/message-converter.ts`
- `apps/assistant-ui-web/src/lib/runtime/deerflow-runtime.ts`
- `apps/assistant-ui-web/src/lib/runtime/chat-stream.ts`
- assistant-ui Thread docs: `https://www.assistant-ui.com/docs/ui/thread`
- assistant-ui Thread primitives docs: `https://www.assistant-ui.com/docs/api-reference/primitives/thread`
- shadcn resizable docs: `https://ui.shadcn.com/docs/components/resizable`

## Current Problems and Root Causes

### 1. The app is using assistant-ui, but key rendering paths bypass its intended patterns

`apps/assistant-ui-web/src/components/thread-screen.tsx` and `apps/assistant-ui-web/src/components/assistant-ui/thread.tsx` already establish an assistant-ui-style shell. However, `apps/assistant-ui-web/src/components/assistant-ui-thread.tsx` overrides message rendering with a custom `MessageRenderer` that falls back to manual `details`, `div`, and `p` output. That custom layer breaks visual consistency with the assistant-ui shadcn template.

### 2. Streaming feels unstable

The live assistant message assembly in `apps/assistant-ui-web/src/components/assistant-ui-thread.tsx` appends parts opportunistically, but the custom renderer does not preserve strong presentation boundaries between body text, reasoning, and tool activity. The result feels less like a stable streaming thread and more like ad hoc content accumulation.

### 3. Title hierarchy is weak in practice

`apps/assistant-ui-web/src/components/thread-screen.tsx` has a header title slot, but the overall page hierarchy still feels incomplete because the main thread view and right-side workspace are not structured as a mature assistant-ui workspace. Fixing title visibility requires fixing the surrounding layout, not only the text node.

### 4. Collapsed content has mixed responsibilities

`apps/assistant-ui-web/src/lib/runtime/message-converter.ts` merges assistant parts aggressively, and `apps/assistant-ui-web/src/components/assistant-ui-thread.tsx` then renders reasoning, tool calls, tool results, and final body text through a simplified split. This causes two failures:

- live tool and reasoning activity is not shown clearly or consistently as it streams
- content that belongs inside an operational card can render outside the card as plain text below it

### 5. Artifact preview has no dedicated workspace

The current `apps/assistant-ui-web` thread screen is essentially single-column. There is no proper right-side canvas matching the expected assistant workspace model for artifacts and file previews.

### 6. Markdown lacks document-quality presentation

The assistant body uses markdown rendering, but the spacing, hierarchy, code treatment, table treatment, and overall reading rhythm do not match the restrained document-like feel the user expects.

## Proposed Approach

Use the existing `apps/assistant-ui-web` application as both the visual and structural baseline. Fix the experience by staying inside its assistant-ui/shadcn composition model rather than introducing a parallel custom UI system.

This means:

- keep the assistant-ui thread shell in `thread-screen.tsx` and `assistant-ui/thread.tsx`
- fix the custom runtime bridge and message renderer in `assistant-ui-thread.tsx`
- refine the message conversion boundaries in `message-converter.ts`
- add a proper right-side canvas using the existing shadcn resizable primitives already present in the app

## UX Design

### Overall Layout

The workspace chat page becomes a two-column application workspace:

- left: primary chat thread
- right: canvas panel for artifact and file preview

The left side uses a restrained assistant-ui-like structure:

- slim top bar
- clearly visible thread title
- central message thread viewport
- sticky composer at the bottom

The right panel is resizable and persists as the dedicated place for generated artifacts, files, and previews.

### Visual Direction

The page should match the restrained document-like feel of assistant-ui's shadcn template already used in this app:

- minimal chrome
- low border density
- sparse use of cards
- generous spacing
- message hierarchy driven by typography and layout, not decorative boxes

User messages may remain lightly bubbled. Assistant body content should read like an incrementally generated technical document rather than a boxed card.

### Thread Title

The top bar must always show the active thread title:

- existing threads show the resolved title
- new threads show a clear placeholder state such as "New Thread"

The title is the primary label in the header, not a secondary or hidden detail.

### Markdown Presentation

Assistant body markdown must be tuned for readable technical content:

- clear heading hierarchy
- readable paragraph spacing for Chinese and English mixed text
- strong code block contrast without heavy card chrome
- legible tables with overflow handling
- improved blockquote and list spacing
- clean link styling

The desired feel is "restrained document" rather than "marketing page" or "chat bubble dump".

## Message Model

To prevent mixed rendering, the `apps/assistant-ui-web` chat UI should treat streamed output as three distinct presentation channels.

### 1. Assistant Body

This channel contains only the user-facing assistant response body.

Rules:

- rendered as the main assistant markdown message
- grows continuously during streaming
- never contains tool event metadata or subtask status text
- never renders artifact preview UI inline as a substitute for the right canvas

### 2. Event Cards

This channel contains operational details:

- reasoning/thinking
- tool calls
- tool results
- subtask activity

Rules:

- each event is rendered in a consistent lightweight collapsible card
- the card updates in place while streaming
- content belonging to an event stays inside its card
- summaries remain visible even when collapsed
- cards are visually subordinate to the main assistant body

### 3. Canvas Payload

This channel contains anything intended for the right workspace panel:

- present-files outputs
- artifact previews
- file selections
- previewable generated content

Rules:

- payload updates the right panel state
- payload does not pollute assistant body markdown
- if no previewable content exists, the right panel shows a clean empty state

## Streaming Behavior

Streaming behavior is a core acceptance criterion.

### Assistant Body Streaming

- The final assistant response must appear as a stable, incrementally growing message block.
- The UI must not create the impression that content arrives only after completion.

### Event Card Streaming

- Reasoning and tool activity should appear as soon as they are available.
- Tool calls should show live status and then transition to result state.
- Subtask progress should be visible while the task is running.

### Boundary Guarantees

- Text that belongs to an event card must never render outside that card.
- Text that belongs to the assistant body must never be hidden inside an event card.

## Right Canvas

The right canvas is a required part of the redesign inside `apps/assistant-ui-web`.

### Behavior

- It appears as the second pane of the workspace.
- It supports artifact/file preview flows already present in DeerFlow.
- It reacts to generated files and present-files events.
- It maintains selection state where practical.
- It shows an empty state when no preview target exists.

### Layout

- Desktop: visible as a resizable right pane.
- Smaller screens: collapse the right canvas into a secondary panel or sheet while preserving access to the same preview content.

## Architecture

### Reuse Strategy

Prefer reusing these existing `apps/assistant-ui-web` systems:

- thread screen shell
- assistant-ui thread primitives
- DeerFlow runtime bridge
- stream event parser
- message conversion utilities
- existing shadcn sidebar/sheet/resizable primitives

Avoid replacing working backend integration if the same effect can be achieved by changing the runtime bridge, message-to-UI transformation, and thread workspace composition.

### New View Boundary

Introduce a clearer transformation layer between raw DeerFlow messages and rendered UI blocks:

- map raw messages to assistant body fragments
- map raw messages to event card state
- map raw messages to canvas payload state

This transformation layer should be tested directly so rendering bugs can be caught without relying only on browser testing.

### Layout Components

Expected component responsibilities inside `apps/assistant-ui-web`:

- page shell / split layout
- thread header
- thread viewport
- assistant body renderer
- event card renderer
- canvas panel

If existing files are too entangled, targeted extraction is allowed as part of the redesign.

## Error Handling

- Failed tool results remain in their event cards with an error state.
- Missing artifact preview data should fail gracefully to an empty or unavailable canvas state.
- Streaming interruptions should preserve already rendered body and event content.

## Testing Strategy

Implementation must follow TDD.

### Required Test Coverage

- message transformation keeps assistant body separate from event cards
- event card content remains inside the correct card
- streaming updates append to the correct UI bucket
- thread title displays for both new and existing threads
- canvas payload is produced when previewable artifacts/files are present
- markdown rendering preserves expected structure for headings, code blocks, and tables

### Verification

- targeted automated tests for message grouping/transformation
- targeted component tests for key rendering states where feasible
- manual UI verification of real streaming behavior in the browser

## Acceptance Criteria

The redesign is complete when all of the following are true:

1. The workspace chat page visually reads as an assistant-ui-style thread, not a layered custom layout.
2. The top bar clearly displays the thread title.
3. Assistant responses visibly stream into a stable body message.
4. Thinking, tool calls, tool results, and subtask progress update live in event cards.
5. Event text does not leak below or outside its card.
6. Markdown reads like a clean technical document, especially for headings, code blocks, tables, lists, and quotes.
7. A right-side canvas exists and displays artifact/file preview content.
8. Existing DeerFlow runtime behavior remains compatible with current backend contracts.

## Implementation Notes

- Use a git worktree before implementation.
- Subagent use is explicitly approved by the user for the implementation phase.
- Match assistant-ui's shadcn template structure and spacing closely.
- Do not introduce custom visual language that conflicts with assistant-ui.
- Treat `frontend/` only as a legacy reference if needed; it is not the primary implementation target.

## Scope Check

This is appropriately scoped for a single implementation plan. It is one cohesive frontend redesign centered on the workspace chat surface, with tightly related behavior fixes rather than unrelated product changes.
