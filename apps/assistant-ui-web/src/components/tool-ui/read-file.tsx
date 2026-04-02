type ReadFileToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function ReadFileToolUI({ args, content }: ReadFileToolProps) {
  const path = typeof args?.file_path === "string" ? args.file_path : typeof args?.path === "string" ? args.path : "";

  return (
    <div className="space-y-2 text-sm text-foreground">
      {path ? (
        <p className="font-medium">File: {path}</p>
      ) : (
        <p className="text-muted-foreground">No path provided</p>
      )}
      {content ? (
        <pre className="max-h-48 overflow-y-auto rounded-lg border border-border/70 bg-background/70 p-2 text-xs leading-tight text-muted-foreground">
          {content}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">Waiting for file content…</p>
      )}
    </div>
  );
}
