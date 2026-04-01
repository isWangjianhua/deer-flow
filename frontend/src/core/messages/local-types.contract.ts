import type {
  AgentMessage,
  AgentThreadLike,
  ToolCallLike,
} from "./types";

const toolCall: ToolCallLike = {
  name: "search",
  args: { query: "hello" },
};

const message: AgentMessage = {
  id: "msg_1",
  type: "ai",
  content: "hello",
  tool_calls: [toolCall],
  additional_kwargs: {},
};

const thread: AgentThreadLike<{ title: string; messages: AgentMessage[] }> = {
  thread_id: "thread_1",
  created_at: "2026-04-01T00:00:00Z",
  updated_at: "2026-04-01T00:00:00Z",
  status: "idle",
  metadata: {},
  interrupts: {},
  values: {
    title: "hello",
    messages: [message],
  },
};

void thread;
