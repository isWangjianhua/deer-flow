"use client";

import { createContext, useContext, type ReactNode } from "react";

type CanvasContextValue = {
  canOpenCanvas: boolean;
  hasArtifact: (artifactPath: string) => boolean;
  isCanvasOpen: boolean;
  openCanvas: () => void;
  closeCanvas: () => void;
  openArtifact: (artifactPath: string) => void;
  selectArtifact: (artifactPath: string) => void;
};

const CanvasContext = createContext<CanvasContextValue | null>(null);

export function CanvasProvider({
  children,
  value,
}: Readonly<{
  children: ReactNode;
  value: CanvasContextValue;
}>) {
  return <CanvasContext.Provider value={value}>{children}</CanvasContext.Provider>;
}

export function useCanvas(): CanvasContextValue | null {
  return useContext(CanvasContext);
}
