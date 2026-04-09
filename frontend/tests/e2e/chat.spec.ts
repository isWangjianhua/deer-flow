import { expect, test } from "@playwright/test";

test("chat page hydrates an existing conversation and streams a BFF reply", async ({
  page,
}) => {
  await page.route("**/api/models", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        models: [
          {
            name: "gpt-4.1-mini",
            provider: "openai",
            supports_thinking: true,
            supports_reasoning_effort: true,
          },
        ],
      }),
    });
  });

  await page.route("**/api/threads/**/suggestions", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ suggestions: [] }),
    });
  });

  await page.route("**/api/bff/conversations/conversation-1", async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        id: "conversation-1",
        title: "Existing chat",
        status: "active",
        created_at: "2026-04-10T00:00:00Z",
        updated_at: "2026-04-10T00:00:00Z",
        values: {
          title: "Existing chat",
          messages: [
            {
              id: "human-1",
              type: "human",
              content: [{ type: "text", text: "Earlier question" }],
              additional_kwargs: {},
            },
            {
              id: "ai-1",
              type: "ai",
              content: "Earlier answer",
              additional_kwargs: {},
              tool_calls: [],
              invalid_tool_calls: [],
            },
          ],
          artifacts: [],
          todos: [],
        },
      }),
    });
  });

  await page.route(
    "**/api/bff/conversations/conversation-1/messages/stream",
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: [
          'event: message.started\ndata: {"message_id":"assistant-2"}',
          'event: tool.started\ndata: {"tool_call_id":"tool-1","label":"Searching web"}',
          'event: tool.progress\ndata: {"tool_call_id":"tool-1","message":"Looking for sources"}',
          'event: tool.completed\ndata: {"tool_call_id":"tool-1"}',
          'event: message.delta\ndata: {"message_id":"assistant-2","delta":"Fresh answer"}',
          'event: message.completed\ndata: {"message_id":"assistant-2"}',
          "",
        ].join("\n\n"),
      });
    },
  );

  await page.goto("/workspace/chats/conversation-1");

  await expect(page.getByText("Earlier question")).toBeVisible();
  await expect(page.getByText("Earlier answer")).toBeVisible();
  await expect(page.getByText("Existing chat")).toBeVisible();

  await page.getByPlaceholder("How can I assist you today?").fill("New question");
  await page.getByRole("button", { name: "Submit" }).click();

  await expect(page.getByText("New question")).toBeVisible();
  await expect(page.getByText("Searching web")).toBeVisible();
  await expect(page.getByText("Fresh answer")).toBeVisible();
});
