import type { Message } from "@langchain/langgraph-sdk";

import type { Todo } from "@/core/todos";

export type BffConversation = {
  id: string;
  title: string | null;
  created_at: string;
  updated_at: string;
};

export type BffConversationList = BffConversation[];

export type DeleteConversationResult = {
  success: boolean;
  id: string;
};

export type CreateConversationResult = BffConversation;

export type BffConversationDetail = BffConversation & {
  status: string;
  values: {
    title?: string;
    messages?: Message[];
    artifacts?: string[];
    todos?: Todo[];
  };
};

export type BffChatEvent =
  | {
      type: "message.started";
      data: { message_id: string };
    }
  | {
      type: "message.delta";
      data: { message_id: string; delta: string };
    }
  | {
      type: "reasoning.delta";
      data: { message_id: string; delta: string };
    }
  | {
      type: "message.completed";
      data: { message_id: string };
    }
  | {
      type: "tool.started";
      data: {
        tool_call_id: string;
        label: string;
        name: string;
        args: Record<string, unknown>;
      };
    }
  | {
      type: "tool.progress";
      data: { tool_call_id: string; message: string };
    }
  | {
      type: "tool.completed";
      data: { tool_call_id: string };
    }
  | {
      type: "tool.failed";
      data: { tool_call_id: string; message: string };
    }
  | {
      type: "run.failed";
      data: { message: string; code: string };
    };

export type BffChatToolState = {
  id: string;
  label: string;
  name: string;
  args: Record<string, unknown>;
  status: "running" | "completed" | "failed";
  summary: string | null;
};

export type BffChatReasoningStepState = {
  type: "reasoning";
  content: string;
};

export type BffChatToolStepState = BffChatToolState & {
  type: "tool";
};

export type BffChatStepState =
  | BffChatReasoningStepState
  | BffChatToolStepState;

export type BffChatMessageState = {
  id: string;
  role: "assistant";
  content: string;
  reasoning_before_tools: string;
  reasoning_after_tools: string;
  status: "streaming" | "completed";
  tools: BffChatToolState[];
  steps: BffChatStepState[];
};

export type BffChatState = {
  messages: BffChatMessageState[];
};
