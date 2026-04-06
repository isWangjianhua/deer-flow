export type ToolResultSummary =
  | { mode: "hidden" }
  | { mode: "pills"; items: Array<{ label: string; href?: string }> }
  | { mode: "text"; text: string };

function truncate(value: string, maxLength = 120) {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 1).trimEnd()}...`;
}

function firstMeaningfulLine(value: string) {
  return (
    value
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? ""
  );
}

function extractTitleFromMarkdown(markdown: string) {
  const match = markdown.match(/^#\s+(.+)$/m);
  return match ? match[1]?.trim() ?? "" : "";
}

function parseStructuredResult(result: unknown, content: string | undefined) {
  if (result && typeof result === "object") {
    return result;
  }

  const candidate = typeof result === "string" && result.trim() ? result : content;
  if (!candidate) {
    return undefined;
  }

  try {
    return JSON.parse(candidate) as unknown;
  } catch {
    return undefined;
  }
}

function summarizeWebSearch(structured: unknown, content: string | undefined): ToolResultSummary {
  const results = Array.isArray(structured)
    ? structured
    : Array.isArray((structured as { results?: unknown[] } | undefined)?.results)
      ? (structured as { results: unknown[] }).results
      : [];

  const titles = results
    .map((item) => {
      if (!item || typeof item !== "object") {
        return "";
      }
      const title = (item as { title?: unknown }).title;
      return typeof title === "string" ? title.trim() : "";
    })
    .filter((title) => title.length > 0)
    .slice(0, 5);

  if (titles.length > 0) {
    return {
      mode: "text",
      text: titles.join("\n"),
    };
  }

  const fallback = content
    ?.split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#") && !line.startsWith("["))
    .slice(0, 5)
    .map((line) => truncate(line))
    .join("\n");

  if (fallback) {
    return {
      mode: "text",
      text: fallback,
    };
  }

  return { mode: "hidden" };
}

function summarizeWebFetch(args: Record<string, unknown> | undefined, content: string | undefined): ToolResultSummary {
  const title = content ? extractTitleFromMarkdown(content) || firstMeaningfulLine(content) : "";
  if (title) {
    return {
      mode: "text",
      text: truncate(title),
    };
  }

  const url = typeof args?.url === "string" ? args.url : "";
  if (url) {
    return {
      mode: "text",
      text: truncate(url),
    };
  }

  return { mode: "hidden" };
}

export function summarizeToolResult(
  toolName: string,
  args: Record<string, unknown> | undefined,
  result: unknown,
  content: string | undefined,
  isRunning = false,
): ToolResultSummary {
  if (isRunning) {
    return { mode: "hidden" };
  }

  const structured = parseStructuredResult(result, content);

  if (toolName === "web_search") {
    return summarizeWebSearch(structured, content);
  }

  if (toolName === "web_fetch") {
    return summarizeWebFetch(args, content);
  }

  if (toolName === "ls" || toolName === "read_file" || toolName === "write_file" || toolName === "str_replace") {
    const path = typeof args?.path === "string" ? args.path : "";
    return path
      ? { mode: "pills", items: [{ label: path }] }
      : { mode: "hidden" };
  }

  if (toolName === "bash" || toolName === "run_command") {
    const command = typeof args?.command === "string" ? args.command : "";
    return command
      ? { mode: "pills", items: [{ label: command }] }
      : { mode: "hidden" };
  }

  return content
    ? {
        mode: "text",
        text: truncate(firstMeaningfulLine(content)),
      }
    : { mode: "hidden" };
}
