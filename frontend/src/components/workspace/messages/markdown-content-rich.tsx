"use client";

import type { AnchorHTMLAttributes } from "react";
import { useMemo } from "react";

import {
  MessageResponse,
  type MessageResponseProps,
} from "@/components/ai-elements/message";
import { humanMessagePlugins, streamdownPlugins } from "@/core/streamdown";
import { cn } from "@/lib/utils";

import { CitationLink } from "../citations/citation-link";

type MarkdownRendererPlugins = readonly unknown[] | undefined;

export type RichMarkdownContentProps = {
  className?: string;
  components?: Record<string, unknown>;
  content: string;
  rehypePlugins?: MarkdownRendererPlugins;
  remarkPlugins?: MarkdownRendererPlugins;
  variant?: "assistant" | "human";
};

function isExternalUrl(href: string | undefined): boolean {
  return !!href && /^https?:\/\//.test(href);
}

export function RichMarkdownContent({
  className,
  components: componentsFromProps,
  content,
  rehypePlugins,
  remarkPlugins,
  variant = "assistant",
}: RichMarkdownContentProps) {
  const defaults =
    variant === "human" ? humanMessagePlugins : streamdownPlugins;
  const defaultRehypePlugins = defaults.rehypePlugins ?? [];
  const extraRehypePlugins = rehypePlugins ?? [];
  const components = useMemo(() => {
    return {
      a: (props: AnchorHTMLAttributes<HTMLAnchorElement>) => {
        if (typeof props.children === "string") {
          const match = /^citation:(.+)$/.exec(props.children);
          if (match) {
            const [, text] = match;
            return <CitationLink {...props}>{text}</CitationLink>;
          }
        }
        const { className, target, rel, ...rest } = props;
        const external = isExternalUrl(props.href);
        return (
          <a
            {...rest}
            className={cn(
              "text-primary decoration-primary/30 hover:decoration-primary/60 underline underline-offset-2 transition-colors",
              className,
            )}
            target={target ?? (external ? "_blank" : undefined)}
            rel={rel ?? (external ? "noopener noreferrer" : undefined)}
          />
        );
      },
      ...componentsFromProps,
    };
  }, [componentsFromProps]);

  return (
    <MessageResponse
      className={className}
      components={components as MessageResponseProps["components"]}
      rehypePlugins={
        [...defaultRehypePlugins, ...extraRehypePlugins] as MessageResponseProps["rehypePlugins"]
      }
      remarkPlugins={
        (remarkPlugins ?? defaults.remarkPlugins) as MessageResponseProps["remarkPlugins"]
      }
    >
      {content}
    </MessageResponse>
  );
}
