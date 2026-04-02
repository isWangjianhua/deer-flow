import {
  ToolCodeBlock,
  ToolEmptyState,
  ToolMetaRow,
  ToolStack,
} from "./common";
import { extractReadPath } from "@/lib/tool-ui";

type ReadFileToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function ReadFileToolUI({ args, content }: ReadFileToolProps) {
  const path = extractReadPath(args);

  return (
    <ToolStack>
      {path ? (
        <ToolMetaRow label="File" value={path} />
      ) : (
        <ToolEmptyState>No file path provided.</ToolEmptyState>
      )}
      {content ? (
        <ToolCodeBlock>{content}</ToolCodeBlock>
      ) : (
        <ToolEmptyState>Waiting for file content…</ToolEmptyState>
      )}
    </ToolStack>
  );
}
