import {
  ToolCodeBlock,
  ToolEmptyState,
  ToolMetaRow,
  ToolStack,
} from "./common";
import { extractCommandText } from "@/lib/tool-ui";

type CommandToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function CommandToolUI({ args, content }: CommandToolProps) {
  const command = extractCommandText(args);

  return (
    <ToolStack>
      {command ? (
        <ToolMetaRow label="Command" value={command} />
      ) : (
        <ToolEmptyState>No command provided.</ToolEmptyState>
      )}
      {content ? (
        <ToolCodeBlock>{content}</ToolCodeBlock>
      ) : (
        <ToolEmptyState>Waiting for execution result…</ToolEmptyState>
      )}
    </ToolStack>
  );
}
