import type { AgentMessage as Message, AgentThreadLike } from "../messages/types";

import type { Todo } from "../todos";

export interface AgentThreadState extends Record<string, unknown> {
  title: string;
  messages: Message[];
  artifacts: string[];
  todos?: Todo[];
}

export interface AgentThread extends AgentThreadLike<AgentThreadState> {}

export interface ThreadStreamLike {
  messages: Message[];
  values: AgentThreadState;
  error?: Error;
  isLoading: boolean;
  isThreadLoading: boolean;
  stop: () => Promise<void>;
}

export interface AgentThreadContext extends Record<string, unknown> {
  thread_id: string;
  model_name: string | undefined;
  thinking_enabled: boolean;
  is_plan_mode: boolean;
  subagent_enabled: boolean;
  reasoning_effort?: "minimal" | "low" | "medium" | "high";
  agent_name?: string;
}
