type CommandToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function CommandToolUI({ args, content }: CommandToolProps) {
  const command =
    typeof args?.command === "string"
      ? args.command
      : typeof args?.cmd === "string"
        ? args.cmd
        : "";

  return (
    <div className="space-y-2 text-sm text-foreground">
      <div className="text-xs uppercase tracking-[0.3em] text-muted-foreground">
        Execute Command
      </div>
      {command ? (
        <pre className="rounded-lg border border-border/70 bg-background/60 p-2 text-xs leading-tight text-muted-foreground">
          {command}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">No command provided</p>
      )}
      {content ? (
        <pre className="rounded-lg border border-border/70 bg-background/70 p-2 text-xs leading-tight text-muted-foreground">
          {content}
        </pre>
      ) : (
        <p className="text-xs text-muted-foreground">Waiting for execution result…</p>
      )}
    </div>
  );
}
