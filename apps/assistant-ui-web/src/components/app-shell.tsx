import type { ReactNode } from "react";

import type { ThreadListItem } from "../lib/runtime/thread-list-runtime";

type AppShellProps = Readonly<{
  threads?: ThreadListItem[];
  children: ReactNode;
}>;

export function AppShell({ threads = [], children }: AppShellProps) {
  return (
    <div>
      <aside>
        <h2>Conversations</h2>
        <ul>
          {threads.map((thread) => (
            <li key={thread.threadId}>{thread.title || thread.threadId}</li>
          ))}
        </ul>
      </aside>
      <main>{children}</main>
    </div>
  );
}
