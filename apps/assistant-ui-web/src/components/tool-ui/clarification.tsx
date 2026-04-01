type ClarificationToolProps = Readonly<{
  args?: Record<string, unknown>;
  content?: string;
}>;

export function ClarificationToolUI({ args, content }: ClarificationToolProps) {
  const question =
    typeof args?.question === "string"
      ? args.question
      : typeof content === "string"
        ? content
        : "";

  return (
    <div>
      <strong>需要补充信息</strong>
      {question ? <p>{question}</p> : <p>代理请求用户补充更多上下文。</p>}
    </div>
  );
}
