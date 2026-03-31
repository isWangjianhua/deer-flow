import { createContext, useContext } from "react";

import type { ThreadStreamLike } from "@/core/threads";

export interface ThreadContextType {
  thread: ThreadStreamLike;
  isMock?: boolean;
}

export const ThreadContext = createContext<ThreadContextType | undefined>(
  undefined,
);

export function useThread() {
  const context = useContext(ThreadContext);
  if (context === undefined) {
    throw new Error("useThread must be used within a ThreadContext");
  }
  return context;
}
