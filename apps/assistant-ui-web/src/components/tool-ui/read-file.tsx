type ReadFileToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function ReadFileToolUI({ args, content }: ReadFileToolProps) {
  const path = typeof args?.file_path === "string" ? args.file_path : typeof args?.path === "string" ? args.path : "";

  return (
    <div>
      <strong>读取文件</strong>
      {path ? <p>{path}</p> : null}
      {content ? <pre>{content}</pre> : <p>等待文件内容...</p>}
    </div>
  );
}
