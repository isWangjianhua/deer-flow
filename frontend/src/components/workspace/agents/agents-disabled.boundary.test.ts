import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("workspace navigation exposes the agents entry", async () => {
  const source = await readFile(
    new URL("../workspace-nav-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes('href="/workspace/agents"'),
    "expected workspace navigation to expose the agents area again",
  );
});

void test("agent gallery route renders the shared gallery component", async () => {
  const galleryPage = await readFile(
    new URL("../../../app/workspace/agents/page.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    galleryPage.includes("AgentGallery"),
    "expected the agents page to render AgentGallery",
  );
  assert.ok(
    !galleryPage.includes("AgentsDisabledState"),
    "expected the agents page to stop rendering the disabled state",
  );
});
