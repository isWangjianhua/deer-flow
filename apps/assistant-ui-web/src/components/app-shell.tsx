import type { ReactNode } from "react";
import Link from "next/link";

import type { ThreadListItem } from "../lib/runtime/thread-list-runtime";

type AppShellProps = Readonly<{
  threads?: ThreadListItem[];
  activeThreadId?: string | null;
  children: ReactNode;
}>;

export function AppShell({ threads = [], activeThreadId, children }: AppShellProps) {
  return (
    <div>
      <aside>
        <h2>Conversations</h2>
        <p>
          <Link href="/workspace/new">New conversation</Link>
        </p>
        <ul>
          {threads.map((thread) => (
            <li key={thread.threadId}>
              <Link href={`/workspace/${thread.threadId}`}>
                {thread.title || thread.threadId}
                {thread.threadId === activeThreadId ? " (current)" : ""}
              </Link>
            </li>
          ))}
        </ul>
      </aside>
      <main>{children}</main>
    </div>
  );
}
