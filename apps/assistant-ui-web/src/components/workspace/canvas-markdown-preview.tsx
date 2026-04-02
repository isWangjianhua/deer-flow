"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { assistantUiMarkdownComponents } from "@/components/assistant-ui/markdown-text";

type CanvasMarkdownPreviewProps = Readonly<{
  content: string;
}>;

export function CanvasMarkdownPreview({ content }: CanvasMarkdownPreviewProps) {
  return (
    <div className="aui-md h-full overflow-y-auto px-5 py-4">
      <ReactMarkdown components={assistantUiMarkdownComponents} remarkPlugins={[remarkGfm]}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
