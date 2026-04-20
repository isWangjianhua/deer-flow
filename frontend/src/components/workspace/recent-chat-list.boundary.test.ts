import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

void test("agent workspace routes do not render the legacy raw thread recent list", async () => {
  const source = await readFile(
    new URL("./recent-chat-list.tsx", import.meta.url),
    "utf8",
  );

  assert.ok(
    source.includes('if (pathname.startsWith("/workspace/agents")) {\n    return null;\n  }'),
    "expected agent workspace routes to hide the legacy recent thread list until they use a user-scoped data source",
  );
  assert.ok(
    !source.includes("return <LegacyRecentChatList pathname={pathname} />;"),
    "expected agent workspace routes to avoid rendering the legacy raw thread recent list",
  );
  assert.ok(
    source.includes('pathname === "/workspace/account"'),
    "expected the account page to opt into the BFF recent chat list so the sidebar stays populated",
  );
  assert.ok(
    source.includes("renameConversation(") || source.includes("renameConversationMutation"),
    "expected the BFF recent chat list to wire a rename conversation action",
  );
  assert.ok(
    source.includes("deleteConversation(") || source.includes("deleteConversationMutation"),
    "expected the BFF recent chat list to wire a delete conversation action",
  );
  assert.ok(
    source.includes("handleDeleteConfirm") && source.includes("deleteDialogOpen"),
    "expected the BFF recent chat list to require confirmation before deleting a conversation",
  );
  assert.ok(
    source.includes('variant="destructive"') && source.includes("handleDeleteConfirm"),
    "expected the delete confirmation dialog to render the delete action as a destructive button",
  );
  assert.ok(
    source.includes("Pin") || source.includes("pinConversation") || source.includes("handlePinToggle"),
    "expected the BFF recent chat list to wire pin and unpin actions",
  );
  assert.ok(
    !source.includes("t.sidebar.pinnedChats") && !source.includes("renderConversationSection"),
    "expected the BFF recent chat list to keep pinned chats inside the same recent list rather than rendering a dedicated pinned section",
  );
  assert.ok(
    source.includes("conversation.is_pinned") && source.includes("<Pin"),
    "expected the BFF recent chat list to show a subtle inline pin icon for pinned conversations",
  );
});
