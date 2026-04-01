"use client";

import { type FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

import { login, register } from "../lib/auth";

type AuthMode = "login" | "register";

type AuthDialogProps = Readonly<{
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}>;

export function AuthDialog({ open, onOpenChange, onSuccess }: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) {
      setError(null);
      setPassword("");
    }
  }, [open]);

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

      onSuccess();
      onOpenChange(false);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Authentication failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="border-white/10 bg-[#171a22] p-0 text-white shadow-2xl shadow-black/40 sm:max-w-md">
        <DialogHeader className="sr-only">
          <DialogTitle>{mode === "login" ? "登录" : "注册"}</DialogTitle>
          <DialogDescription>使用网关登录后继续当前操作。</DialogDescription>
        </DialogHeader>
        <Card className="border-0 bg-transparent text-white shadow-none">
          <CardHeader className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/45">
              Continue to DeerFlow
            </p>
            <CardTitle className="font-[family-name:var(--font-serif)] text-4xl">
              {mode === "login" ? "登录" : "注册"}
            </CardTitle>
            <CardDescription className="text-white/55">
              发消息前需要登录。登录成功后会自动继续刚才的操作。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={onSubmit}>
              <label className="block space-y-2 text-sm text-white/70">
                <span>用户名</span>
                <Input
                  className="h-11 border-white/10 bg-white/6 text-white placeholder:text-white/35"
                  maxLength={64}
                  minLength={3}
                  onChange={(event) => setUsername(event.target.value)}
                  required
                  value={username}
                />
              </label>
              <label className="block space-y-2 text-sm text-white/70">
                <span>密码</span>
                <Input
                  className="h-11 border-white/10 bg-white/6 text-white placeholder:text-white/35"
                  maxLength={256}
                  minLength={6}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  type="password"
                  value={password}
                />
              </label>
              {error ? <p className="text-sm text-red-300">{error}</p> : null}
              <Button className="h-11 w-full rounded-xl" disabled={submitting} type="submit">
                {submitting ? "处理中..." : mode === "login" ? "登录" : "注册"}
              </Button>
            </form>
            <Button
              className="mt-4 w-full rounded-xl border-white/12 bg-transparent text-white/75 hover:bg-white/8 hover:text-white"
              onClick={() => setMode((current) => (current === "login" ? "register" : "login"))}
              type="button"
              variant="outline"
            >
              {mode === "login" ? "切换到注册" : "切换到登录"}
            </Button>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
}
