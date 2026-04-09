import assert from "node:assert/strict";
import test from "node:test";

const { createConversation, getConversation, listConversations } = await import(
  new URL("./api.ts", import.meta.url).href,
);

void test("creates a conversation through the BFF", async () => {
  const result = await createConversation(async (input, init) => {
    assert.equal(input, "/api/bff/conversations");
    assert.equal(init?.method, "POST");

    return new Response(
      JSON.stringify({
        id: "conversation-1",
        title: "New chat",
        created_at: "2026-04-10T00:00:00Z",
        updated_at: "2026-04-10T00:00:00Z",
      }),
      { status: 201, headers: { "content-type": "application/json" } },
    );
  });

  assert.equal(result.id, "conversation-1");
});

void test("lists conversations through the BFF", async () => {
  const result = await listConversations(async (input) => {
    assert.equal(input, "/api/bff/conversations");

    return new Response(
      JSON.stringify([
        {
          id: "conversation-1",
          title: "Existing chat",
          created_at: "2026-04-10T00:00:00Z",
          updated_at: "2026-04-10T00:00:00Z",
        },
      ]),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  assert.equal(result.length, 1);
  assert.equal(result[0]?.title, "Existing chat");
});

void test("loads a conversation detail through the BFF", async () => {
  const result = await getConversation("conversation-1", async (input) => {
    assert.equal(input, "/api/bff/conversations/conversation-1");

    return new Response(
      JSON.stringify({
        id: "conversation-1",
        title: "Existing chat",
        status: "active",
        created_at: "2026-04-10T00:00:00Z",
        updated_at: "2026-04-10T00:00:00Z",
        values: {
          title: "Existing chat",
          messages: [],
          artifacts: [],
          todos: [],
        },
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  });

  assert.equal(result.id, "conversation-1");
  assert.equal(result.values.title, "Existing chat");
});

void test("posts a user message to the BFF stream endpoint", async () => {
  const { streamMessage } = await import(new URL("./api.ts", import.meta.url).href);

  let capturedBody = "";
  const abortController = new AbortController();
  const stream = await streamMessage(
    {
      conversationId: "conversation-1",
      message: "Hello",
      signal: abortController.signal,
    },
    async (input, init) => {
      assert.equal(
        input,
        "/api/bff/conversations/conversation-1/messages/stream",
      );
      assert.equal(init?.method, "POST");
      capturedBody = String(init?.body);
      assert.equal(init?.signal, abortController.signal);

      return new Response(
        'event: message.completed\ndata: {"message_id":"assistant-1"}\n\n',
        {
          status: 200,
        },
      );
    },
  );

  assert.ok(stream);
  assert.match(capturedBody, /"message":"Hello"/);
});
