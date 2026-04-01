import type { AssistantUiMessage } from "../lib/runtime/message-converter";
import { ToolCard } from "./tool-ui";

type ChatThreadProps = Readonly<{
  messages: AssistantUiMessage[];
}>;

function MessageBubble({ message }: { message: AssistantUiMessage }) {
  const reasoningParts = message.parts.filter((part) => part.type === "reasoning");
  const toolParts = message.parts.filter(
    (part) => part.type === "tool-call" || part.type === "tool-result",
  );
  const textParts = message.parts.filter((part) => part.type === "text");

  return (
    <article>
      <header>
        <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
      </header>

      {reasoningParts.length > 0 || toolParts.length > 0 ? (
        <details>
          <summary>Hidden steps</summary>

          {reasoningParts.map((part, index) => (
            <div key={`reasoning-${message.id}-${index}`}>
              <strong>思考</strong>
              <p>{part.text}</p>
            </div>
          ))}

          {toolParts.map((part, index) => {
            if (part.type === "tool-call") {
              return (
                <ToolCard
                  key={`tool-call-${part.toolCallId}-${index}`}
                  toolName={part.toolName}
                  args={part.args}
                />
              );
            }

            return (
              <ToolCard
                key={`tool-result-${part.toolCallId}-${index}`}
                toolName={part.toolName}
                content={part.content}
              />
            );
          })}
        </details>
      ) : null}

      {textParts.map((part, index) => (
        <p key={`text-${message.id}-${index}`}>{part.text}</p>
      ))}
    </article>
  );
}

export function ChatThread({ messages }: ChatThreadProps) {
  return (
    <section>
      {messages.map((message) => (
        <MessageBubble key={message.id} message={message} />
      ))}
    </section>
  );
}
