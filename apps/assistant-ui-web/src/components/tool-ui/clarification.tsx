import {
  ToolEmptyState,
  ToolMetaRow,
  ToolStack,
} from "./common";
import { extractQuestionText } from "@/lib/tool-ui";

type ClarificationToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function ClarificationToolUI({ args, content }: ClarificationToolProps) {
  const question = extractQuestionText(args, content);

  return (
    <ToolStack>
      {question ? (
        <ToolMetaRow label="Question" value={question} />
      ) : (
        <ToolEmptyState>The agent requested more context from the user.</ToolEmptyState>
      )}
    </ToolStack>
  );
}
