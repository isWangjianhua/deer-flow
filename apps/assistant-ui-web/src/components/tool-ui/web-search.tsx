type WebSearchToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

type SearchResult = {
  title?: string;
  url?: string;
};

function parseSearchResults(content?: string): SearchResult[] {
  if (!content) return [];
  try {
    const parsed = JSON.parse(content) as { results?: SearchResult[] };
    return Array.isArray(parsed.results) ? parsed.results.slice(0, 5) : [];
  } catch {
    return [];
  }
}

export function WebSearchToolUI({ args, content }: WebSearchToolProps) {
  const query = typeof args?.query === "string" ? args.query : "";
  const results = parseSearchResults(content);

  return (
    <div className="space-y-3">
      {query ? (
        <p className="text-sm font-medium text-foreground">Query: {query}</p>
      ) : null}
      <div className="space-y-2">
        {results.length > 0 ? (
          results.map((result, index) => (
            <div key={`${result.url ?? result.title ?? "result"}-${index}`}>
              <p className="text-sm font-semibold text-foreground">
                {result.title ?? "Untitled result"}
              </p>
              {result.url ? (
                <a href={result.url} className="text-xs text-primary underline" target="_blank" rel="noreferrer">
                  {result.url}
                </a>
              ) : null}
            </div>
          ))
        ) : (
          <p className="text-xs text-muted-foreground">Waiting for search results…</p>
        )}
      </div>
    </div>
  );
}
