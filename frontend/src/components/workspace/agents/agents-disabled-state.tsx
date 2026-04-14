import { BotIcon } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";

export function AgentsDisabledState() {
  return (
    <div className="flex size-full items-center justify-center px-6">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div className="bg-muted flex h-14 w-14 items-center justify-center rounded-full">
          <BotIcon className="text-muted-foreground h-7 w-7" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-semibold">智能体功能暂时下线</h1>
          <p className="text-muted-foreground text-sm leading-6">
            当前智能体聊天仍依赖旧的 thread 数据链路，无法满足现有账号隔离要求。
            在完成按用户隔离改造前，前端先关闭该入口，避免继续展示不属于当前账号的历史对话。
          </p>
        </div>
        <Button asChild>
          <Link href="/workspace/chats">返回对话</Link>
        </Button>
      </div>
    </div>
  );
}
