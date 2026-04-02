# 2026-04-02 Assistant-UI Workspace Chat Redesign

## Summary

Redesign the `frontend` workspace chat experience so it aligns closely with the mature interaction model already demonstrated in `apps/assistant-ui-web`, while preserving DeerFlow's existing thread streaming, artifact, and task data sources.

This redesign addresses the current user-visible failures:

1. The page looks visually broken and inconsistent with assistant-ui.
2. Assistant responses do not feel truly streamed.
3. The thread title is not presented clearly.
4. Collapsed thinking and tool content is disorganized.
5. There is no right-side canvas for artifacts and file previews.
6. Markdown output is not rendered with a readable document-like presentation.

## Goals

- Rebuild the workspace chat page around an assistant-ui-style thread layout.
- Reuse as much of the existing `frontend` chat/runtime implementation as practical.
- Make streaming updates feel continuous and stable.
- Separate assistant body content, event cards, and artifact canvas payloads so they never bleed into each other.
- Add a right-side canvas panel for artifact and file preview workflows.
- Render markdown in a restrained, document-like style similar to `apps/assistant-ui-web`.
- Keep compatibility with existing DeerFlow backend message and artifact protocols.

## Non-Goals

- No backend protocol redesign.
- No unrelated refactor of the whole frontend app.
- No visual re-theme of the entire product outside the workspace chat surface.
- No migration of the whole app to `@assistant-ui/react` primitives if that would require replacing working DeerFlow runtime logic wholesale.

## References

- `apps/assistant-ui-web/src/components/thread-screen.tsx`
- `apps/assistant-ui-web/src/components/assistant-ui/thread.tsx`
- `frontend/src/app/workspace/chats/[thread_id]/page.tsx`
- `frontend/src/components/workspace/messages/message-list.tsx`
- `frontend/src/components/workspace/messages/message-list-item.tsx`
- assistant-ui Thread docs: `https://www.assistant-ui.com/docs/ui/thread`
- assistant-ui Thread primitives docs: `https://www.assistant-ui.com/docs/api-reference/primitives/thread`
- shadcn resizable docs: `https://ui.shadcn.com/docs/components/resizable`

## Current Problems and Root Causes

### 1. Page structure diverges from assistant-ui

The current workspace page uses absolute-positioned header and composer regions layered over a centered message area. This causes the interface to feel assembled from incompatible patterns instead of following a coherent thread layout.

### 2. Streaming feels unstable

The current rendering path groups messages in a way that makes streamed assistant output feel delayed or visually discontinuous. Thinking, tool events, subtasks, and final assistant body content do not have a stable presentation model during streaming.

### 3. Title hierarchy is weak

The thread title exists in logic, but the page hierarchy does not present it as the primary thread identifier in a clean top bar.

### 4. Collapsed content has mixed responsibilities

Thinking, tool activity, tool results, and task progress are mixed through message grouping and conditional rendering. This causes two failures:

- live tool and reasoning activity is not shown clearly as it streams
- content that belongs inside a card can render outside the card as plain text below it

### 5. Artifact preview has no dedicated workspace

Artifacts and present-files output are partially shown in the main message stream, but there is no persistent right-side workspace for reviewing generated files and previews.

### 6. Markdown lacks document-quality presentation

The assistant body uses markdown rendering, but the spacing, hierarchy, code treatment, table treatment, and overall reading rhythm do not match the restrained document-like feel the user expects.

## Proposed Approach

Use `apps/assistant-ui-web` as the visual and structural baseline, but adapt it onto the existing DeerFlow `frontend` runtime instead of replacing the current runtime with the separate assistant-ui demo app.

This means:

- reuse the assistant-ui-web layout ideas
- reuse existing DeerFlow thread/message/artifact data flow
- replace the current workspace chat composition and message rendering boundaries
- add a proper right-side canvas using a mature split-pane layout

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

The page should match the restrained document-like feel of `apps/assistant-ui-web`:

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

To prevent mixed rendering, the chat UI should treat streamed output as three distinct presentation channels.

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

The right canvas is a required part of the redesign.

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

Prefer reusing these existing frontend systems:

- thread streaming hooks
- message parsing utilities
- artifact loader and preview helpers
- existing workspace sidebar and thread context

Avoid replacing working backend integration if the same effect can be achieved by changing view composition and message-to-UI transformation.

### New View Boundary

Introduce a clearer transformation layer between raw DeerFlow messages and rendered UI blocks:

- map raw messages to assistant body fragments
- map raw messages to event card state
- map raw messages to canvas payload state

This transformation layer should be tested directly so rendering bugs can be caught without relying only on browser testing.

### Layout Components

Expected component responsibilities:

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
- Prefer `apps/assistant-ui-web` as the reference for layout, spacing, and interaction decisions.
- Prefer existing `frontend` runtime/data flow over porting the entire assistant-ui-web demo implementation.

## Scope Check

This is appropriately scoped for a single implementation plan. It is one cohesive frontend redesign centered on the workspace chat surface, with tightly related behavior fixes rather than unrelated product changes.
