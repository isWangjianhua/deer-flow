"use client";

import { lazy, Suspense } from "react";

import { cn } from "@/lib/utils";

import { needsRichMarkdownRendering } from "./markdown-content-heuristics";

const RichMarkdownContent = lazy(async () => {
  const richModule = await import("./markdown-content-rich");
  return { default: richModule.RichMarkdownContent };
});

export type MarkdownContentProps = {
  content: string;
  isLoading: boolean;
  className?: string;
  components?: Record<string, unknown>;
  rehypePlugins?: readonly unknown[];
  remarkPlugins?: readonly unknown[];
  variant?: "assistant" | "human";
};

/** Renders markdown content. */
export function MarkdownContent({
  content,
  className,
  components,
  rehypePlugins,
  remarkPlugins,
  variant = "assistant",
  isLoading,
}: MarkdownContentProps) {
  if (!content) return null;

  const useRichRenderer =
    isLoading ||
    needsRichMarkdownRendering(content) ||
    Boolean(remarkPlugins?.length) ||
    Boolean(rehypePlugins?.length);

  if (!useRichRenderer) {
    return (
      <div className={cn("whitespace-pre-wrap break-words", className)}>
        {content}
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div className={cn("whitespace-pre-wrap break-words", className)}>
          {content}
        </div>
      }
    >
      <RichMarkdownContent
        className={className}
        components={components}
        content={content}
        rehypePlugins={rehypePlugins}
        remarkPlugins={remarkPlugins}
        variant={variant}
      />
    </Suspense>
  );
}
