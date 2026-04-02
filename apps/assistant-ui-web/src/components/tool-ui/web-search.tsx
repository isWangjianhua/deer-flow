import {
  ToolEmptyState,
  ToolMetaRow,
  ToolStack,
} from "./common";
import { parseSearchResults, truncateToolText } from "@/lib/tool-ui";

type WebSearchToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function WebSearchToolUI({ args, content }: WebSearchToolProps) {
  const query = typeof args?.query === "string" ? args.query : "";
  const results = parseSearchResults(content);

  return (
    <ToolStack>
      {query ? <ToolMetaRow label="Query" value={query} /> : null}
      <div className="space-y-2">
        {results.length > 0 ? (
          results.map((result, index) => (
            <div
              className="space-y-1 rounded-xl border border-border/60 bg-background/60 px-3 py-2.5"
              key={`${result.url ?? result.title ?? "result"}-${index}`}
            >
              <p className="text-sm font-medium text-foreground">
                {result.title ?? "Untitled result"}
              </p>
              {result.url ? (
                <a
                  className="block text-xs text-primary underline underline-offset-2"
                  href={result.url}
                  rel="noreferrer"
                  target="_blank"
                >
                  {truncateToolText(result.url, 96)}
                </a>
              ) : null}
            </div>
          ))
        ) : (
          <ToolEmptyState>Waiting for search results…</ToolEmptyState>
        )}
      </div>
    </ToolStack>
  );
}
