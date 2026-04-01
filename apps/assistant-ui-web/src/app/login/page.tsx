"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useEffect, useState } from "react";

import { getCurrentUser, login, register } from "@/lib/auth";

type AuthMode = "login" | "register";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const user = await getCurrentUser();
        if (!cancelled && user) {
          router.replace("/workspace");
          return;
        }
      } catch {
        // Ignore bootstrap auth failures; the form remains usable.
      } finally {
        if (!cancelled) {
          setPending(false);
        }
      }
    }

    void bootstrap();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === "login") {
        await login(username, password);
      } else {
        await register(username, password);
      }

      router.replace("/workspace");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  if (pending) {
    return <main>Loading...</main>;
  }

  return (
    <main>
      <h1>{mode === "login" ? "登录" : "注册"}</h1>
      <form onSubmit={onSubmit}>
        <label>
          用户名
          <input
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            minLength={3}
            maxLength={64}
            required
          />
        </label>
        <label>
          密码
          <input
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            minLength={6}
            maxLength={256}
            required
            type="password"
          />
        </label>
        {error ? <p>{error}</p> : null}
        <button disabled={submitting} type="submit">
          {submitting ? "处理中..." : mode === "login" ? "登录" : "注册"}
        </button>
      </form>
      <button
        onClick={() => setMode((current) => (current === "login" ? "register" : "login"))}
        type="button"
      >
        {mode === "login" ? "切换到注册" : "切换到登录"}
      </button>
    </main>
  );
}
