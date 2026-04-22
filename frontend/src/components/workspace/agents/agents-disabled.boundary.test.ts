import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace navigation exposes the reopened agents area", async () => {
  const featureSource = await readFile(
    new URL("../../../core/agents/feature.ts", import.meta.url),
    "utf8",
  );
  const source = await readFile(
    new URL("../workspace-nav-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(featureSource.includes("return true;"));
  assert.ok(
    source.includes('href="/workspace/agents"'),
    "expected workspace navigation to expose the reopened agents area",
  );
});

void test("agent routes keep the shared feature flag guard but point at live implementations", async () => {
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
      "../../../app/workspace/agents/[agent_name]/chats/[conversation_id]/page.tsx",
      import.meta.url,
    ),
    "utf8",
  );

  assert.ok(galleryPage.includes("AgentGallery"));
  assert.ok(newAgentPage.includes("createAgentConversation"));
  assert.ok(agentChatPage.includes("useBffThreadStream"));
});
