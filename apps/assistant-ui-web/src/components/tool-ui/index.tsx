import { ClarificationToolUI } from "./clarification";
import { CommandToolUI } from "./command";
import { ReadFileToolUI } from "./read-file";
import { WebSearchToolUI } from "./web-search";

type ToolRendererProps = Readonly<{
  toolName: string;
  args?: Record<string, unknown>;
  content?: string;
}>;

export function ToolCard({ toolName, args, content }: ToolRendererProps) {
  switch (toolName) {
    case "web_search":
      return <WebSearchToolUI args={args} content={content} />;
    case "read_file":
      return <ReadFileToolUI args={args} content={content} />;
    case "bash":
    case "run_command":
      return <CommandToolUI args={args} content={content} />;
    case "ask_clarification":
      return <ClarificationToolUI args={args} content={content} />;
    default:
      return (
        <div>
          <strong>{toolName}</strong>
          {args ? <pre>{JSON.stringify(args, null, 2)}</pre> : null}
          {content ? <pre>{content}</pre> : null}
        </div>
      );
  }
}
