"use client";

import { createContext, useContext } from "react";
import type { GatewayModel } from "@/lib/models";
import type { DeerFlowRuntimeState } from "@/lib/runtime/deerflow-runtime";

export type ThreadContextValue = {
  models: GatewayModel[];
  selectedModel: string;
  setSelectedModel: (modelName: string) => void;
  runtimeState: DeerFlowRuntimeState | null;
};

const ThreadContext = createContext<ThreadContextValue>({
  models: [],
  selectedModel: "",
  setSelectedModel: () => {},
  runtimeState: null,
});

export const ThreadContextProvider = ThreadContext.Provider;
export const useThreadContext = () => useContext(ThreadContext);
