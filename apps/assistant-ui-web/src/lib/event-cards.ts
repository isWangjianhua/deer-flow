function truncate(value: string, maxLength = 72): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}

function firstMeaningfulLine(value: string): string {
  return (
    value
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

export function getReasoningSummary(content: string): string {
  const summary = firstMeaningfulLine(content);
  return truncate(summary || "Reasoning in progress");
}

export function getToolDisplayName(toolName: string): string {
  return toolName
    .split("_")
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

export function getToolStatusLabel(content?: string): string {
  return content ? "Done" : "Running";
}

export function getToolSummary(
  toolName: string,
  args?: Record<string, unknown>,
  content?: string,
): string {
  const query = typeof args?.query === "string" ? args.query : "";
  const path =
    typeof args?.file_path === "string"
      ? args.file_path
      : typeof args?.path === "string"
        ? args.path
        : "";
  const command =
    typeof args?.command === "string"
      ? args.command
      : typeof args?.cmd === "string"
        ? args.cmd
        : "";
  const question = typeof args?.question === "string" ? args.question : "";

  switch (toolName) {
    case "web_search":
      return query ? `Query: ${truncate(query)}` : content ? "Search results available" : "Searching";
    case "read_file":
      return path ? `File: ${truncate(path)}` : content ? "File content available" : "Reading file";
    case "bash":
    case "run_command":
      return command
        ? `Command: ${truncate(command)}`
        : content
          ? "Command output available"
          : "Running command";
    case "ask_clarification":
      return question
        ? `Question: ${truncate(question)}`
        : content
          ? `Question: ${truncate(firstMeaningfulLine(content))}`
          : "Clarification requested";
    default:
      return content ? "Output available" : "Waiting for tool output";
  }
}
