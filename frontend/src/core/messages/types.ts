import type { ToolCall } from "@langchain/core/messages";

export type MessageContentPart =
  | {
      type: "text";
      text: string;
      thinking?: string;
    }
  | {
      type: "image_url";
      image_url: string | { url: string };
    }
  | Record<string, unknown>;

export interface BaseAgentMessage {
  id?: string;
  type: string;
  content: string | MessageContentPart[];
  name?: string | null;
  additional_kwargs?: Record<string, unknown>;
  response_metadata?: Record<string, unknown>;
  tool_calls?: ToolCall[];
  invalid_tool_calls?: unknown[];
  usage_metadata?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  } | null;
}

export interface HumanAgentMessage extends BaseAgentMessage {
  type: "human";
}

export interface ToolAgentMessage extends BaseAgentMessage {
  type: "tool";
  tool_call_id?: string | null;
}

export interface AIAgentMessage extends BaseAgentMessage {
  type: "ai";
  tool_calls?: ToolCall[];
}

export type AgentMessage =
  | HumanAgentMessage
  | ToolAgentMessage
  | AIAgentMessage
  | BaseAgentMessage;

export interface AgentThreadLike<TValues> {
  thread_id: string;
  created_at?: string;
  updated_at?: string;
  status?: string;
  metadata?: Record<string, unknown>;
  interrupts?: Record<string, unknown>;
  values: TValues;
}

export type ToolCallLike = ToolCall;
