import type { BffChatEvent } from "./types";

export function parseBffStreamChunk(chunk: string): BffChatEvent[] {
  return chunk
    .trim()
    .split("\n\n")
    .filter(Boolean)
    .map((block) => {
      const lines = block.split("\n");
      const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
      const data = lines
        .filter((line) => line.startsWith("data: "))
        .map((line) => line.slice(6))
        .join("\n");

      return {
        type: event,
        data: JSON.parse(data),
      } as BffChatEvent;
    });
}

export function createBffStreamDecoder() {
  let buffer = "";

  return {
    push(chunk: string): BffChatEvent[] {
      buffer += chunk;

      const blocks = buffer.split("\n\n");
      buffer = blocks.pop() ?? "";

      return blocks.flatMap((block) => {
        const trimmed = block.trim();
        if (!trimmed) {
          return [];
        }
        return parseBffStreamChunk(`${trimmed}\n\n`);
      });
    },
    flush(): BffChatEvent[] {
      const remaining = buffer.trim();
      buffer = "";
      if (!remaining) {
        return [];
      }
      return parseBffStreamChunk(`${remaining}\n\n`);
    },
  };
}
