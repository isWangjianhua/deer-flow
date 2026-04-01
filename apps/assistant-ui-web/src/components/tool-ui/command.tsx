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
    <div>
      <strong>执行命令</strong>
      {command ? <pre>{command}</pre> : null}
      {content ? <pre>{content}</pre> : <p>等待执行结果...</p>}
    </div>
  );
}
