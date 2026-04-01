"use client";

import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

type AuthMode = "login" | "register";

type AuthResponse = {
  id: string;
  username: string;
};

export default function LoginScreen() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setIsSubmitting(true);

    try {
      const response = await fetch(`/api/auth/${mode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username: username.trim(),
          password,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | AuthResponse
        | { detail?: string }
        | null;

      if (!response.ok) {
        setError(
          payload && "detail" in payload
            ? payload.detail ?? "Authentication failed."
            : "Authentication failed.",
        );
        return;
      }

      if (!payload || !("id" in payload)) {
        setError("Unexpected authentication response.");
        return;
      }

      router.replace("/workspace/chats/new");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_top,_#1f2937,_#020617_55%)] px-6">
      <div className="w-full max-w-md rounded-3xl border border-white/10 bg-black/40 p-8 text-white shadow-2xl backdrop-blur-xl">
        <div className="mb-8 space-y-2">
          <p className="text-sm uppercase tracking-[0.25em] text-white/50">
            DeerFlow
          </p>
          <h1 className="text-3xl font-semibold">
            {mode === "login" ? "登录" : "注册"}
          </h1>
          <p className="text-sm text-white/65">
            使用 Gateway 账号进入工作区。前端不会再直接访问 LangGraph。
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <label className="block space-y-2">
            <span className="text-sm text-white/75">用户名</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-white/30 focus:bg-white/8"
              disabled={isSubmitting}
              onChange={(event) => setUsername(event.target.value)}
              placeholder="输入用户名"
              required
              value={username}
            />
          </label>

          <label className="block space-y-2">
            <span className="text-sm text-white/75">密码</span>
            <input
              className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 outline-none transition focus:border-white/30 focus:bg-white/8"
              disabled={isSubmitting}
              minLength={8}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="至少 8 位"
              required
              type="password"
              value={password}
            />
          </label>

          {error ? (
            <p className="rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
              {error}
            </p>
          ) : null}

          <button
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 font-medium text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:bg-white/50"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "login" ? "登录" : "注册并进入"}
          </button>
        </form>

        <div className="mt-6 text-sm text-white/60">
          {mode === "login" ? "还没有账号？" : "已经有账号？"}
          <button
            className="ml-2 text-white underline underline-offset-4"
            disabled={isSubmitting}
            onClick={() => {
              setError("");
              setMode((current) =>
                current === "login" ? "register" : "login",
              );
            }}
            type="button"
          >
            {mode === "login" ? "去注册" : "去登录"}
          </button>
        </div>
      </div>
    </main>
  );
}
