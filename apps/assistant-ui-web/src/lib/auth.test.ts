import { afterEach, describe, expect, it, vi } from "vitest";

import { getCurrentUser, login, waitForAuthenticatedUser } from "./auth";

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("auth", () => {
  it("waits for the authenticated session to become visible after login", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "user_1", username: "alice" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      )
      .mockResolvedValueOnce(new Response('{"detail":"Authentication required"}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "user_1", username: "alice" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as typeof fetch;

    await login("alice", "secret123");

    expect(globalThis.fetch).toHaveBeenCalledTimes(3);
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      2,
      "/api/auth/me",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      }),
    );
    expect(globalThis.fetch).toHaveBeenNthCalledWith(
      3,
      "/api/auth/me",
      expect.objectContaining({
        credentials: "include",
        cache: "no-store",
      }),
    );
  });

  it("throws when the authenticated session never becomes visible", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response('{"detail":"Authentication required"}', { status: 401 })) as typeof fetch;

    await expect(waitForAuthenticatedUser({ maxAttempts: 2, delayMs: 0 })).rejects.toThrow(
      "Authentication succeeded but the session cookie was not available yet.",
    );
  });

  it("returns the current user once the session is available", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response('{"detail":"Authentication required"}', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "user_2", username: "bob" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      ) as typeof fetch;

    const user = await waitForAuthenticatedUser({ maxAttempts: 2, delayMs: 0 });

    expect(user).toEqual({ id: "user_2", username: "bob" });
    expect(getCurrentUser).toBeTypeOf("function");
  });
});
