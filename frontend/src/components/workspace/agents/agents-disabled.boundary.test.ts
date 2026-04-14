import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace navigation hides the agents entry while agent chat is disabled", async () => {
  const source = await readFile(
    new URL("../workspace-nav-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    !source.includes('href="/workspace/agents"'),
    "expected workspace navigation to stop exposing the disabled agents area",
  );
});

void test("agent routes render the shared disabled state instead of raw thread pages", async () => {
  const galleryPage = await readFile(
    new URL("../../../app/workspace/agents/page.tsx", import.meta.url),
    "utf8",
  );
  const newAgentPage = await readFile(
    new URL("../../../app/workspace/agents/new/page.tsx", import.meta.url),
    "utf8",
  );
  const agentChatPage = await readFile(
    new URL(
      "../../../app/workspace/agents/[agent_name]/chats/[thread_id]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  for (const [name, source] of [
    ["gallery", galleryPage],
    ["new-agent", newAgentPage],
    ["agent-chat", agentChatPage],
  ] as const) {
    assert.ok(
      source.includes("AgentsDisabledState"),
      `expected ${name} route to use the shared disabled-state component`,
    );
  }
});
