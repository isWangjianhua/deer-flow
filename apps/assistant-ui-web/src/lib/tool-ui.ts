type SearchResult = {
  title?: string;
  url?: string;
};

export function parseSearchResults(content?: string): SearchResult[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as { results?: SearchResult[] };
    return Array.isArray(parsed.results) ? parsed.results.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function extractReadPath(args?: Record<string, unknown>): string {
  return typeof args?.file_path === "string"
    ? args.file_path
    : typeof args?.path === "string"
      ? args.path
      : "";
}

export function extractCommandText(args?: Record<string, unknown>): string {
  return typeof args?.command === "string"
    ? args.command
    : typeof args?.cmd === "string"
      ? args.cmd
      : "";
}

export function extractQuestionText(
  args?: Record<string, unknown>,
  content?: string,
): string {
  return typeof args?.question === "string"
    ? args.question
    : typeof content === "string"
      ? content
      : "";
}

export function truncateToolText(value: string, maxLength = 88): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}…`;
}
