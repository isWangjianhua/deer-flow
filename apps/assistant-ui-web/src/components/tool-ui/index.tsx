import { ClarificationToolUI } from "./clarification";
import { CommandToolUI } from "./command";
import { ReadFileToolUI } from "./read-file";
import { WebSearchToolUI } from "./web-search";
import { WriteFileToolUI } from "./write-file";
import { EventCard } from "@/components/workspace/event-card";
import {
  getToolDisplayName,
  getToolStatusLabel,
  getToolSummary,
} from "@/lib/event-cards";

type ToolRendererProps = Readonly<{
  toolName: string;
  args?: Record<string, unknown>;
  content?: string;
}>;

export function ToolContent({ toolName, args, content }: ToolRendererProps) {
  switch (toolName) {
    case "web_search":
      return <WebSearchToolUI args={args} content={content} />;
    case "read_file":
      return <ReadFileToolUI args={args} content={content} />;
    case "write_file":
    case "str_replace":
      return <WriteFileToolUI args={args} />;
    case "bash":
    case "run_command":
      return <CommandToolUI args={args} content={content} />;
    case "ask_clarification":
      return <ClarificationToolUI args={args} content={content} />;
    default:
      return (
        <pre className="whitespace-pre-wrap">{content ?? JSON.stringify(args ?? {}, null, 2)}</pre>
      );
  }
}

export function ToolCard({ toolName, args, content }: ToolRendererProps) {
  return (
    <EventCard
      defaultOpen={!content}
      status={getToolStatusLabel(content)}
      summary={getToolSummary(toolName, args, content)}
      title={getToolDisplayName(toolName ?? "tool")}
    >
      <ToolContent args={args} content={content} toolName={toolName} />
    </EventCard>
  );
}
