type WebSearchToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

type SearchResult = {
  title?: string;
  url?: string;
  content?: string;
};

function parseSearchResults(content?: string): SearchResult[] {
  if (!content) {
    return [];
  }

  try {
    const parsed = JSON.parse(content) as { results?: SearchResult[] };
    return Array.isArray(parsed.results) ? parsed.results : [];
  } catch {
    return [];
  }
}

export function WebSearchToolUI({ args, content }: WebSearchToolProps) {
  const query = typeof args?.query === "string" ? args.query : "";
  const results = parseSearchResults(content);

  return (
    <div>
      <strong>搜索</strong>
      {query ? <p>{query}</p> : null}
      {results.length > 0 ? (
        <ul>
          {results.slice(0, 5).map((result, index) => (
            <li key={`${result.url ?? result.title ?? "result"}-${index}`}>
              <div>{result.title ?? "未命名结果"}</div>
              {result.url ? (
                <a href={result.url} rel="noreferrer" target="_blank">
                  {result.url}
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p>等待搜索结果...</p>
      )}
    </div>
  );
}
